# `frontend/src-tauri/` — the Rust shell

Tauri v2 wraps the React UI in a native window, spawns the Python backend as a
sidecar, and exposes a system tray.

## Files

| File / dir | Responsibility |
| --- | --- |
| `Cargo.toml` | Rust crate metadata. Pulls in `tauri`, `tauri-plugin-shell`, `tauri-plugin-notification`. |
| `Cargo.lock` | Pinned crate versions. Commit it. |
| `build.rs` | Tauri build script (generates the platform manifest, icon set, etc). |
| `tauri.conf.json` | The Tauri config: window size, icons, allowlist, dev/build URLs, sidecar declarations. |
| `src/main.rs` | Rust entry — calls into `lib.rs::run`. |
| `src/lib.rs` | Tray, menu, sidecar spawn, lifecycle hooks. |
| `capabilities/default.json` | Tauri 2 permission grants for the renderer (which plugins/commands the JS side may invoke). |
| `gen/` | Generated assets (do not hand-edit). |
| `icons/` | Multi-size PNG / ICO / ICNS icons used by Windows / macOS / Linux. Regenerate with `python -m backend.tools.make_icons --force`. |
| `target/` | Cargo build output — gitignored. |

## Sidecar

`tauri.conf.json` declares the Python backend (`backend/main.py`) as a
sidecar so closing the window also stops the backend. In dev, `run-dev.ps1`
handles this manually — Tauri only owns the sidecar in a release build.

## When does this code run?

- **Dev**: `npm run tauri dev` (or our `run-dev.ps1`) launches Vite + Cargo
  + the Python backend, all in parallel.
- **Release**: `npm run tauri build` produces a single Windows `.msi` /
  `.exe` that bundles the React assets, the Rust shell, and the Python
  PyInstaller bundle.

## Modifying tray / menus

Edit `src/lib.rs`, then `cargo build` (or just rerun `tauri dev`). Tray
clicks are wired with the `tauri::tray` API.
