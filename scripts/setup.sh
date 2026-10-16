#!/usr/bin/env bash
# ==============================================================================
# AvatarStudio Setup Script (Linux / macOS / WSL)
# Creates virtualenv, installs dependencies, downloads models, checks tools.
# Re-runnable: detects existing resources and only acts when needed.
# ==============================================================================

set -e

# Terminal colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "\n${CYAN}============================================================${NC}"
echo -e "${CYAN} AvatarStudio - Automated Local Environment Setup${NC}"
echo -e "${CYAN}============================================================${NC}\n"

# 1. Check Python
PYTHON_BIN=""
if command -v python3 &>/dev/null; then
    PYTHON_BIN="python3"
elif command -v python &>/dev/null; then
    PYTHON_BIN="python"
else
    echo -e "${RED}[ERROR] Python 3.10+ is required but was not found in PATH.${NC}"
    echo -e "${YELLOW}Please install Python from https://www.python.org/downloads/${NC}"
    exit 1
fi

PY_VER=$($PYTHON_BIN --version 2>&1)
echo -e "${GREEN}[OK] Using Python: ${PY_VER} ($(command -v $PYTHON_BIN))${NC}"

# 2. Virtual Environment (.venv)
VENV_DIR=".venv"
VENV_PYTHON="${VENV_DIR}/bin/python"

if [ -f "$VENV_PYTHON" ]; then
    echo -e "${GREEN}[OK] Virtual environment already exists at: ${VENV_DIR}${NC}"
else
    echo -e "${YELLOW}[...] Creating virtual environment in ${VENV_DIR}...${NC}"
    $PYTHON_BIN -m venv "$VENV_DIR"
    if [ ! -f "$VENV_PYTHON" ]; then
        echo -e "${RED}[ERROR] Failed to create virtual environment.${NC}"
        exit 1
    fi
    echo -e "${GREEN}[OK] Created virtual environment at: ${VENV_DIR}${NC}"
fi

# 3. Upgrade pip & Install requirements
echo -e "\n${YELLOW}[...] Checking and installing Python requirements from requirements.txt...${NC}"
"$VENV_PYTHON" -m pip install --upgrade pip --quiet || true
"$VENV_PYTHON" -m pip install -r requirements.txt --quiet || {
    echo -e "${YELLOW}[Warning] Some packages encountered warnings during install. Proceeding...${NC}"
}
echo -e "${GREEN}[OK] Python dependencies checked.${NC}"

# 4. Check FFmpeg and FFprobe
echo -e "\n${YELLOW}[...] Checking FFmpeg and FFprobe...${NC}"
if command -v ffmpeg &>/dev/null; then
    FF_VER=$(ffmpeg -version 2>&1 | head -n 1)
    echo -e "${GREEN}[OK] FFmpeg found: ${FF_VER}${NC}"
else
    echo -e "${RED}[Warning] ffmpeg not found in PATH. Video compositing requires FFmpeg.${NC}"
    echo -e "${YELLOW}          Install via: sudo apt install ffmpeg (Ubuntu/Debian) or brew install ffmpeg (macOS)${NC}"
fi

if command -v ffprobe &>/dev/null; then
    FFP_VER=$(ffprobe -version 2>&1 | head -n 1)
    echo -e "${GREEN}[OK] FFprobe found: ${FFP_VER}${NC}"
else
    echo -e "${RED}[Warning] ffprobe not found in PATH. Media verification requires FFprobe.${NC}"
fi

# 5. Download & Verify Local Offline Models
echo -e "\n${YELLOW}[...] Verifying local offline models...${NC}"
"$VENV_PYTHON" scripts/download_models.py

# 6. Check Ollama & Print Instructions
echo -e "\n${CYAN}============================================================${NC}"
echo -e "${CYAN} Ollama Local LLM Engine Status${NC}"
echo -e "${CYAN}============================================================${NC}"

if curl -s -m 2 http://127.0.0.1:11434/api/tags &>/dev/null; then
    echo -e "${GREEN}[OK] Ollama server is running locally at http://127.0.0.1:11434${NC}"
else
    echo -e "${YELLOW}[Note] Ollama is not running (or not installed).${NC}"
fi

echo -e "\nWhat Ollama needs for neural script writing:"
echo -e "  1. Download & Install Ollama: ${CYAN}https://ollama.com${NC}"
echo -e "  2. Pull the recommended local 3B model in terminal:"
echo -e "       ${MAGENTA}ollama pull llama3.2:3b${NC}"
echo -e "\n  * No API keys or subscriptions required - 100% free and local."
echo -e "  * If Ollama is not running, AvatarStudio automatically falls"
echo -e "    back to the built-in rule-based template script writer."

echo -e "\n${CYAN}============================================================${NC}"
echo -e "${GREEN} Setup complete! Ready to start:${NC}"
echo -e "   Backend:  source .venv/bin/activate && uvicorn src.main:app --port 8000"
echo -e "   Frontend: cd frontend && npm run dev"
echo -e "${CYAN}============================================================${NC}\n"
