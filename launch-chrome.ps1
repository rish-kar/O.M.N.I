# Launch your existing Chrome with CDP enabled so OMNI can attach to it.
# Run this BEFORE clicking "Connect Chrome" in OMNI if you want OMNI to drive
# your already-logged-in browser (LinkedIn, ChatGPT, Glassdoor, etc).
#
# Uses your normal Chrome profile - your logins, cookies, and tabs are preserved.

$ErrorActionPreference = "Stop"

# Find Chrome
$chromeCandidates = @(
    (Join-Path ${env:ProgramFiles} "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
)
$chrome = $null
foreach ($c in $chromeCandidates) { if (Test-Path $c) { $chrome = $c; break } }
if (-not $chrome) {
    Write-Host "Chrome not found in standard locations." -ForegroundColor Red
    exit 1
}

# Use a separate user-data-dir for the CDP session so it doesn't fight with a
# regular Chrome window. Sign into your accounts once here; the profile is
# remembered between runs.
$profileDir = Join-Path $env:LOCALAPPDATA "OMNI\chrome-profile"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

Write-Host ""
Write-Host "  Launching Chrome with CDP on port 9222..." -ForegroundColor Cyan
Write-Host "  Profile: $profileDir" -ForegroundColor DarkGray
Write-Host "  Sign in to LinkedIn / ChatGPT / etc once. The profile persists." -ForegroundColor DarkGray
Write-Host ""

& $chrome `
    --remote-debugging-port=9222 `
    --user-data-dir="$profileDir" `
    --no-first-run `
    --no-default-browser-check
