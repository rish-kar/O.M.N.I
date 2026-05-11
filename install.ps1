# OMNI Windows bootstrap.
# Detects and installs prerequisites, sets up venv + frontend, pulls models.
# Idempotent - safe to re-run.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogPath = Join-Path $Root "logs\install.log"
New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null

# ---------- pretty output ----------
function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host ("  " + $msg) -ForegroundColor Cyan
    Write-Host ("  " + ("-" * $msg.Length)) -ForegroundColor DarkCyan
}
function Write-OK([string]$msg)    { Write-Host ("    [OK] " + $msg) -ForegroundColor Green }
function Write-Info([string]$msg)  { Write-Host ("    [..] " + $msg) -ForegroundColor DarkGray }
function Write-Warn2([string]$msg) { Write-Host ("    [!!] " + $msg) -ForegroundColor Yellow }
function Write-Err([string]$msg)   { Write-Host ("   [FAIL] " + $msg) -ForegroundColor Red }
function Assert-Exit([string]$what) {
    if ($LASTEXITCODE -ne 0) { Write-Err "$what (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
}

# ---------- env helpers ----------
function Refresh-Path {
    # Re-read PATH from registry (machine + user). Don't accumulate against
    # current $env:Path - that grows exponentially on repeated calls.
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @()
    if ($machine) { $parts += $machine }
    if ($user)    { $parts += $user }
    $env:Path = ($parts -join ";")
}

function Has-Cmd([string]$name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Find-Path([string[]]$candidates) {
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    return $null
}

function Has-Winget {
    return (Has-Cmd winget)
}

function Winget-Install([string]$id, [string]$display) {
    if (-not (Has-Winget)) {
        Write-Err "winget unavailable. Install $display manually, then re-run."
        return $false
    }
    Write-Info "winget install $id"
    winget install --id $id -e --accept-package-agreements --accept-source-agreements --silent | Tee-Object -FilePath $LogPath -Append | Out-Null
    Refresh-Path
    return ($LASTEXITCODE -eq 0)
}

# ---------- banner ----------
$banner = @"

   ___           __  __     _   _    ___
  / _ \   ___   |  \/  |   | \ | |  |_ _|
 | | | | / __|  | |\/| |   |  \| |   | |
 | |_| || (__   | |  | |  _| |\  |   | |
  \___/  \___|  |_|  |_| (_)_| \_|  |___|

  Offline Machine Navigation Intelligence
  Local Windows desktop AI agent for job applications

"@
Write-Host $banner -ForegroundColor Cyan
Write-Host ("  Project: " + $Root) -ForegroundColor DarkGray
Write-Host ("  Log:     " + $LogPath) -ForegroundColor DarkGray

# ====================================================================
# 1. Pre-flight: detect prerequisites
# ====================================================================
Write-Step "1. Detecting prerequisites"

$Need = @{
    python = $true
    node   = $true
    rust   = $true
    ollama = $true
}

# Python >= 3.11
$pythonExe = $null
foreach ($cmd in @("py -3", "python", "python3")) {
    try {
        $v = & cmd /c "$cmd --version" 2>$null
        if ($v -match "Python\s+(\d+)\.(\d+)") {
            $maj = [int]$Matches[1]; $min = [int]$Matches[2]
            if ($maj -ge 3 -and $min -ge 11) {
                $pythonExe = $cmd
                Write-OK "Python $maj.$min ($cmd)"
                $Need.python = $false
                break
            }
        }
    } catch {}
}
if ($Need.python) { Write-Warn2 "Python >= 3.11 not found" }

# Node.js LTS (>= 20)
if (Has-Cmd node) {
    $nv = (node --version) -replace 'v',''
    $major = [int]($nv -split '\.')[0]
    if ($major -ge 18) {
        Write-OK "Node $nv"
        $Need.node = $false
    } else {
        Write-Warn2 "Node $nv too old (need 18+)"
    }
} else {
    Write-Warn2 "Node.js not found"
}

# Rust / Cargo
$cargoCandidates = @(
    (Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"),
    "C:\Users\$env:USERNAME\.cargo\bin\cargo.exe"
)
$cargoExe = if (Has-Cmd cargo) { (Get-Command cargo).Source } else { Find-Path $cargoCandidates }
if ($cargoExe) {
    $cargoVer = (& $cargoExe --version) 2>$null
    Write-OK "Rust $cargoVer"
    $Need.rust = $false
    # Make sure cargo bin is on PATH for this session
    $cargoBin = Split-Path $cargoExe
    if ($env:Path -notlike "*$cargoBin*") { $env:Path = "$cargoBin;$env:Path" }
} else {
    Write-Warn2 "Rust toolchain not found"
}

# Ollama
$ollamaCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path ${env:ProgramFiles} "Ollama\ollama.exe")
)
$ollamaExe = if (Has-Cmd ollama) { (Get-Command ollama).Source } else { Find-Path $ollamaCandidates }
if ($ollamaExe) {
    Write-OK "Ollama at $ollamaExe"
    $Need.ollama = $false
    $ollamaBin = Split-Path $ollamaExe
    if ($env:Path -notlike "*$ollamaBin*") { $env:Path = "$ollamaBin;$env:Path" }
} else {
    Write-Warn2 "Ollama not found"
}

# ====================================================================
# 2. Auto-install missing prerequisites (winget)
# ====================================================================
$missing = @($Need.GetEnumerator() | Where-Object { $_.Value } | ForEach-Object { $_.Key })
if ($missing.Count -gt 0) {
    Write-Step "2. Installing missing prerequisites: $($missing -join ', ')"
    if (-not (Has-Winget)) {
        Write-Err "winget is required to auto-install. Install App Installer from the Microsoft Store, or install these manually:"
        if ($Need.python) { Write-Host "      - Python 3.12: https://www.python.org/downloads/" -ForegroundColor Yellow }
        if ($Need.node)   { Write-Host "      - Node.js LTS: https://nodejs.org/" -ForegroundColor Yellow }
        if ($Need.rust)   { Write-Host "      - Rust: https://rustup.rs/" -ForegroundColor Yellow }
        if ($Need.ollama) { Write-Host "      - Ollama: https://ollama.com/download/windows" -ForegroundColor Yellow }
        exit 1
    }

    if ($Need.python) {
        Write-Info "Installing Python 3.12..."
        if (Winget-Install "Python.Python.3.12" "Python") { Write-OK "Python installed" } else { Write-Err "Python install failed"; exit 1 }
    }
    if ($Need.node) {
        Write-Info "Installing Node.js LTS..."
        if (Winget-Install "OpenJS.NodeJS.LTS" "Node.js") { Write-OK "Node installed" } else { Write-Err "Node install failed"; exit 1 }
    }
    if ($Need.rust) {
        Write-Info "Installing Rust (rustup)..."
        if (Winget-Install "Rustlang.Rustup" "Rust") {
            Refresh-Path
            $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
            if (Test-Path $cargoBin) { $env:Path = "$cargoBin;$env:Path" }
            Write-OK "Rust installed"
        } else { Write-Err "Rust install failed"; exit 1 }
    }
    if ($Need.ollama) {
        Write-Info "Installing Ollama..."
        if (Winget-Install "Ollama.Ollama" "Ollama") {
            Refresh-Path
            $ollamaBin = Join-Path $env:LOCALAPPDATA "Programs\Ollama"
            if (Test-Path $ollamaBin) { $env:Path = "$ollamaBin;$env:Path" }
            Write-OK "Ollama installed"
        } else { Write-Warn2 "Ollama install failed - you can install manually later" }
    }
} else {
    Write-Step "2. All prerequisites present"
}

# ====================================================================
# 3. Python venv
# ====================================================================
Write-Step "3. Python virtual environment"
$venv = Join-Path $Root ".venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
    Write-Info "Creating venv..."
    if (Has-Cmd py) { & py -3 -m venv $venv } else { & python -m venv $venv }
    Assert-Exit "venv creation"
    Write-OK "venv created at .venv"
} else {
    Write-OK "venv already exists"
}
$py  = Join-Path $venv "Scripts\python.exe"
$pip = Join-Path $venv "Scripts\pip.exe"
$pyVer = & $py -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"
Write-Info "venv Python $pyVer"

# ====================================================================
# 4. Python deps (core + optional voice)
# ====================================================================
Write-Step "4. Python dependencies"
& $py -m pip install --upgrade pip --quiet
Assert-Exit "pip upgrade"
Write-Info "Installing core deps (this may take a few minutes)..."
& $pip install --prefer-binary --quiet -r (Join-Path $Root "backend\requirements.txt")
Assert-Exit "core deps"
Write-OK "Core deps installed"

Write-Info "Installing optional voice deps (best-effort)..."
& $pip install --prefer-binary --quiet -r (Join-Path $Root "backend\requirements-voice.txt") 2>$null
if ($LASTEXITCODE -eq 0) { Write-OK "Voice deps installed" }
else { Write-Warn2 "Voice deps unavailable for Python $pyVer - voice mode will be disabled" }

Write-Info "Generating app icons..."
& $py -m backend.tools.make_icons 2>&1 | Tee-Object -FilePath $LogPath -Append | Out-Null
if ($LASTEXITCODE -eq 0) { Write-OK "Icons ready" }
else { Write-Warn2 "Icon generation failed - tauri build may complain about missing icons" }

# ====================================================================
# 5. Playwright Chromium
# ====================================================================
Write-Step "5. Playwright browser"
& $py -m playwright install chromium 2>&1 | Tee-Object -FilePath $LogPath -Append | Out-Null
if ($LASTEXITCODE -eq 0) { Write-OK "Chromium installed" }
else { Write-Warn2 "Playwright install failed - retry with: $py -m playwright install chromium" }

# ====================================================================
# 6. Frontend (npm)
# ====================================================================
Write-Step "6. Frontend dependencies"
Push-Location (Join-Path $Root "frontend")
try {
    if (Test-Path "node_modules") {
        Write-Info "node_modules present - npm install (may be quick)..."
    } else {
        Write-Info "First-time npm install..."
    }
    npm install --silent --no-audit --no-fund 2>&1 | Tee-Object -FilePath $LogPath -Append | Out-Null
    Assert-Exit "npm install"
    Write-OK "Frontend deps installed"
} finally {
    Pop-Location
}

# ====================================================================
# 7. Default Piper voice
#    Downloads a single English voice so the UI doesn't ship empty.
#    Skipped silently if the files are already present or if the
#    download endpoint can't be reached.
# ====================================================================
Write-Step "7. Default voice (Piper)"
$voicesDir = Join-Path $Root "data\voices"
New-Item -ItemType Directory -Force -Path $voicesDir | Out-Null
$voiceId   = "en_US-lessac-medium"
$voiceOnnx = Join-Path $voicesDir "$voiceId.onnx"
$voiceJson = Join-Path $voicesDir "$voiceId.onnx.json"
if ((Test-Path $voiceOnnx) -and (Test-Path $voiceJson)) {
    Write-OK "Voice already installed: $voiceId"
} else {
    $base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium"
    try {
        Write-Info "Downloading $voiceId.onnx (~63 MB)..."
        Invoke-WebRequest -Uri "$base/$voiceId.onnx" -OutFile $voiceOnnx -UseBasicParsing
        Write-Info "Downloading $voiceId.onnx.json..."
        Invoke-WebRequest -Uri "$base/$voiceId.onnx.json" -OutFile $voiceJson -UseBasicParsing
        Write-OK "Voice ready: $voiceId"
    } catch {
        Write-Warn2 "Could not download default voice ($_). Voice mode will work once you drop a Piper voice in data/voices/."
    }
}

# ====================================================================
# 8. Ollama models
# ====================================================================
Write-Step "8. Local AI models (Ollama)"
if (-not $ollamaExe) {
    $cmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($cmd) { $ollamaExe = $cmd.Source }
}
if (-not $ollamaExe) {
    $ollamaExe = Find-Path @(
        (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
        (Join-Path ${env:ProgramFiles} "Ollama\ollama.exe")
    )
}
if (-not $ollamaExe) {
    Write-Warn2 "Ollama not found - skipping model pull. Install from https://ollama.com/download/windows"
} else {
    # Make sure ollama service is running (Windows installer registers it)
    $models = @(
        "qwen2.5:7b-instruct-q4_K_M",
        "qwen2.5:14b-instruct-q4_K_M",
        "nomic-embed-text"
    )
    foreach ($m in $models) {
        Write-Info "pull $m (progress shown below)"
        & $ollamaExe pull $m
        if ($LASTEXITCODE -eq 0) { Write-OK $m } else { Write-Warn2 "skipped $m" }
    }
    Write-Info "(vision model qwen2.5vl:7b is large - run 'ollama pull qwen2.5vl:7b' when ready)"
}

# ====================================================================
# Done
# ====================================================================
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "  OMNI is ready." -ForegroundColor Green
Write-Host "  Run:  .\run-dev.ps1" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
