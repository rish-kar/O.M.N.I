use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

struct BackendProc(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend = BackendProc(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .manage(backend)
        .setup(|app| {
            // Build tray menu
            let show = MenuItem::with_id(app, "show", "Open OMNI", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
            let resume = MenuItem::with_id(app, "resume", "Resume", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Emergency stop", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pause, &resume, &stop, &quit])?;

            let _tray = TrayIconBuilder::with_id("omni-tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("OMNI - local job agent")
                .on_menu_event(|app, event| {
                    let id = event.id().0.as_str();
                    match id {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "pause" => { let _ = post(app, "/session/pause"); }
                        "resume" => { let _ = post(app, "/session/resume"); }
                        "stop" => { let _ = post(app, "/session/stop"); }
                        "quit" => { app.exit(0); }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Spawn Python backend sidecar (best-effort)
            spawn_backend(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            minimise_to_tray,
            backend_status,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of quit (tray-aware close)
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running OMNI");
}

fn spawn_backend(app: &mut tauri::App) -> tauri::Result<()> {
    let state = app.state::<BackendProc>();
    let mut guard = state.0.lock().unwrap();
    if guard.is_some() {
        return Ok(());
    }
    // Skip if a backend is already listening (e.g. run-dev.ps1 started one).
    if std::net::TcpStream::connect_timeout(
        &"127.0.0.1:8765".parse().unwrap(),
        std::time::Duration::from_millis(200),
    ).is_ok() {
        log::info!("backend already running on :8765, skipping spawn");
        return Ok(());
    }

    // Locate project root: ../.. from frontend/src-tauri/ in dev,
    // or alongside the binary in production after bundling.
    let cwd = std::env::current_dir().unwrap_or_default();
    let project_roots = [
        cwd.join("..").join(".."),
        cwd.join(".."),
        cwd.clone(),
    ];
    let mut project_root = None;
    for r in project_roots.iter() {
        if r.join("backend").join("main.py").exists() {
            project_root = Some(r.clone());
            break;
        }
    }
    let Some(root) = project_root else {
        log::warn!("backend dir not found; start it manually with `python -m backend.main`");
        return Ok(());
    };

    // Prefer venv python if present; otherwise fall back to system python.
    let venv_py = root.join(".venv").join("Scripts").join("python.exe");
    let py: std::ffi::OsString = if venv_py.exists() {
        venv_py.into_os_string()
    } else {
        which_python().into()
    };

    match Command::new(&py)
        .args(["-m", "backend.main"])
        .current_dir(&root)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            log::info!("backend spawned with {:?}", py);
            *guard = Some(child);
        }
        Err(e) => log::warn!("failed to spawn backend with {:?}: {e}", py),
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn which_python() -> &'static str { "python" }
#[cfg(not(target_os = "windows"))]
fn which_python() -> &'static str { "python3" }

fn post(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let url = format!("http://127.0.0.1:8765{path}");
    std::thread::spawn(move || {
        let _ = ureq_post(&url);
    });
    let _ = app;
    Ok(())
}

fn ureq_post(url: &str) -> Result<(), String> {
    // Minimal blocking HTTP POST without adding a heavy dep:
    // Use std::net::TcpStream-based hand-rolled request.
    use std::io::{Read, Write};
    use std::net::TcpStream;
    let parsed = url.trim_start_matches("http://");
    let (host_port, path) = match parsed.find('/') {
        Some(i) => (&parsed[..i], &parsed[i..]),
        None => (parsed, "/"),
    };
    let mut stream = TcpStream::connect(host_port).map_err(|e| e.to_string())?;
    let req = format!(
        "POST {path} HTTP/1.1\r\nHost: {host_port}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    Ok(())
}

#[tauri::command]
fn minimise_to_tray(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn backend_status() -> serde_json::Value {
    serde_json::json!({ "endpoint": "http://127.0.0.1:8765" })
}
