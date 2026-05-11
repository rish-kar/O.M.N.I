# Run only the Python backend (useful for testing without the Tauri shell).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "venv missing. Run .\install.ps1 first." -ForegroundColor Red
    exit 1
}
& $py -m backend.main
