# ==============================================================================
# AvatarStudio Setup Script (Windows PowerShell)
# Creates virtualenv, installs dependencies, downloads models, checks tools.
# Re-runnable: detects existing resources and only acts when needed.
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " AvatarStudio - Automated Local Environment Setup" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# 1. Check Python
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $pythonCmd) {
    Write-Host "[ERROR] Python 3.10+ is required but was not found in PATH." -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/downloads/ and check 'Add to PATH'." -ForegroundColor Yellow
    Exit 1
}

$pyVer = & $pythonCmd.Source --version 2>&1
Write-Host "[OK] Using Python: $pyVer ($($pythonCmd.Source))" -ForegroundColor Green

# 2. Virtual Environment (.venv)
$venvDir = Join-Path (Get-Location) ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"

if (Test-Path $venvPython) {
    Write-Host "[OK] Virtual environment already exists at: $venvDir" -ForegroundColor Green
} else {
    Write-Host "[...] Creating virtual environment in .venv..." -ForegroundColor Yellow
    & $pythonCmd.Source -m venv .venv
    if (-not (Test-Path $venvPython)) {
        Write-Host "[ERROR] Failed to create virtual environment." -ForegroundColor Red
        Exit 1
    }
    Write-Host "[OK] Created virtual environment at: $venvDir" -ForegroundColor Green
}

# 3. Upgrade pip & Install requirements
Write-Host "`n[...] Checking and installing Python requirements from requirements.txt..." -ForegroundColor Yellow
& $venvPython -m pip install --upgrade pip --quiet
& $venvPython -m pip install -r requirements.txt --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Python dependencies are installed and up to date." -ForegroundColor Green
} else {
    Write-Host "[Warning] Some packages encountered warnings during install. Proceeding..." -ForegroundColor Yellow
}

# 4. Check FFmpeg and FFprobe
Write-Host "`n[...] Checking FFmpeg and FFprobe..." -ForegroundColor Yellow
$ffmpegCmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffprobeCmd = Get-Command ffprobe -ErrorAction SilentlyContinue

if ($ffmpegCmd) {
    $ffVer = (& ffmpeg -version 2>&1 | Select-Object -First 1)
    Write-Host "[OK] FFmpeg found: $ffVer" -ForegroundColor Green
} else {
    Write-Host "[Warning] ffmpeg not found in PATH. Video compositing requires FFmpeg." -ForegroundColor Red
    Write-Host "          Install via: winget install Gyan.FFmpeg or download from https://gyan.dev/ffmpeg/builds/" -ForegroundColor Yellow
}

if ($ffprobeCmd) {
    $ffpVer = (& ffprobe -version 2>&1 | Select-Object -First 1)
    Write-Host "[OK] FFprobe found: $ffpVer" -ForegroundColor Green
} else {
    Write-Host "[Warning] ffprobe not found in PATH. Media verification requires FFprobe." -ForegroundColor Red
}

# 5. Download & Verify Local Offline Models
Write-Host "`n[...] Verifying local offline models..." -ForegroundColor Yellow
& $venvPython scripts/download_models.py

# 6. Check Ollama & Print Instructions
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " Ollama Local LLM Engine Status" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ollamaOnline = $false
try {
    $req = [System.Net.WebRequest]::Create("http://127.0.0.1:11434/api/tags")
    $req.Timeout = 1500
    $resp = $req.GetResponse()
    if ($resp.StatusCode -eq 200) {
        $ollamaOnline = $true
    }
    $resp.Close()
} catch {
    $ollamaOnline = $false
}

if ($ollamaOnline) {
    Write-Host "[OK] Ollama server is running locally at http://127.0.0.1:11434" -ForegroundColor Green
} else {
    Write-Host "[Note] Ollama is not running (or not installed)." -ForegroundColor Yellow
}

Write-Host "`nWhat Ollama needs for neural script writing:" -ForegroundColor White
Write-Host "  1. Download & Install Ollama: https://ollama.com" -ForegroundColor Cyan
Write-Host "  2. Pull the recommended local 3B model in terminal:" -ForegroundColor Cyan
Write-Host "       ollama pull llama3.2:3b" -ForegroundColor Magenta
Write-Host "`n  * No API keys or subscriptions required - 100% free and local." -ForegroundColor Gray
Write-Host "  * If Ollama is not running, AvatarStudio automatically falls" -ForegroundColor Gray
Write-Host "    back to the built-in rule-based template script writer." -ForegroundColor Gray

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " Setup complete! Ready to start:" -ForegroundColor Green
Write-Host "   Backend:  .venv\Scripts\uvicorn src.main:app --port 8000" -ForegroundColor White
Write-Host "   Frontend: cd frontend; npm run dev" -ForegroundColor White
Write-Host "============================================================`n" -ForegroundColor Cyan
