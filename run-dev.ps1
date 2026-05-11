# OMNI dev launcher. Runs the Python backend and Tauri shell side-by-side.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Info([string]$msg) { Write-Host "  [..] $msg" -ForegroundColor DarkGray }
function Write-OK([string]$msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Err([string]$msg)  { Write-Host "  [!!] $msg" -ForegroundColor Red }

# Sanity: venv
$py = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Err "venv missing. Run .\install.ps1 first."
    exit 1
}

# Sanity: cargo (Rust). Tauri dev calls cargo; if it's not on PATH, fix the session.
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $cargoExe = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
    if (Test-Path $cargoExe) {
        $env:Path = (Split-Path $cargoExe) + ";" + $env:Path
        Write-Info "added .cargo\bin to session PATH"
    } else {
        Write-Err "Rust/cargo not found. Run .\install.ps1 (it installs Rust via winget)."
        exit 1
    }
}

# LLVM linker + Windows SDK libs (required since MSVC Build Tools are not installed)
$llvmBin = "C:\Program Files\LLVM\bin"
$sdkLib  = "C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0"
$sdkBin  = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64"
if (Test-Path $llvmBin) {
    $env:Path = "$llvmBin;$sdkBin;" + $env:Path
    $env:LIB  = "$sdkLib\um\x64;$sdkLib\ucrt\x64"
    $env:CARGO_TARGET_DIR = "C:\omni-target"
    Write-Info "LLVM linker + Windows SDK configured"
}

# Sanity: npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm not found. Install Node.js LTS or run .\install.ps1."
    exit 1
}

Write-Info "Starting backend on 127.0.0.1:8765..."
$backend = Start-Process -PassThru -FilePath $py -ArgumentList "-m", "backend.main" `
    -WorkingDirectory $Root -WindowStyle Hidden
Write-OK ("backend pid " + $backend.Id)

Start-Sleep -Seconds 2

Write-Info "Launching Tauri shell..."
Push-Location (Join-Path $Root "frontend")
try {
    npm run tauri dev
} finally {
    Pop-Location
    if ($backend -and -not $backend.HasExited) {
        Write-Info "Stopping backend..."
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    }
}
