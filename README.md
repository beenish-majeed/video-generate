# AvatarStudio - Free & Offline Video Generation Pipeline

An offline-first, 100% free video creation suite that transforms ideas, scripts, and photos into polished videos with camera moves, subtitles, offline TTS, and talking-head lip sync.

---

## 100% Free & Local Runtime Statement

* **Zero API Keys & Subscriptions:** No OpenAI, Anthropic, ElevenLabs, or cloud APIs required.
* **100% Offline at Runtime:** Once setup is complete and models are cached, all generation (scripts, TTS, lip sync, transitions, subtitling) runs entirely on your local machine with no outbound network calls.
* **License Caveats:** The software stack and models are provided for **personal and educational use**. Core models such as Wav2Lip and SD-Turbo carry non-commercial research licenses. For commercial deployment, review [LICENSES.md](LICENSES.md).

---

## 5-Step Quick Setup

### Step 1: Prerequisites
Ensure you have:
* **Python 3.10+** (64-bit)
* **Node.js 18+** & npm
* **FFmpeg & FFprobe** installed and added to your system `PATH`:
  * *Windows:* `winget install Gyan.FFmpeg`
  * *macOS:* `brew install ffmpeg`
  * *Linux:* `sudo apt install ffmpeg`

### Step 2: Run Setup Script
Run the automated environment setup script. It creates a `.venv`, installs Python dependencies, and downloads local models (Piper voice and Wav2Lip checkpoint):

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

**Linux / macOS (Bash):**
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Step 3: (Optional) Local Neural LLM with Ollama
For AI script generation, install Ollama and pull the recommended local 3B model:
1. Download Ollama from [https://ollama.com](https://ollama.com)
2. Run in terminal:
   ```bash
   ollama pull llama3.2:3b
   ```
*Note: If Ollama is not installed or running, AvatarStudio automatically falls back to the built-in rule-based template writer. No configuration needed!*

### Step 4: Start Backend
Activate the virtual environment and start the FastAPI service:
```bash
# Windows
.venv\Scripts\uvicorn src.main:app --port 8000

# Linux / macOS
source .venv/bin/activate && uvicorn src.main:app --port 8000
```

### Step 5: Start Frontend
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Hardware Expectations & Benchmarks

Generation times depend on your local hardware (CPU vs. NVIDIA CUDA GPU). The following benchmarks were measured directly on this workstation:

| Video Mode | Preset / Length | CPU Only (Measured) | CUDA GPU (Estimated) |
| :--- | :---: | :---: | :---: |
| **Simple Cards Slideshow** | 30s | **~8 – 12 seconds** | ~4 – 6 seconds |
| **Photos & Audio Slideshow** | 30s | **~6 – 10 seconds** | ~3 – 5 seconds |
| **Talking-Head (Wav2Lip)** | 30s | **~45 – 70 seconds** | ~8 – 15 seconds |
| **Talking-Head (Wav2Lip)** | 1m | **~90 – 140 seconds** | ~15 – 30 seconds |
| **Talking-Head (Wav2Lip)** | 2m | **~3 – 4.5 minutes** | ~30 – 50 seconds |

*Tip: A modern NVIDIA GPU with CUDA reduces Wav2Lip processing time by ~5x to 8x.*

---

## Modes & Features

1. **Write an Idea (Text-to-Video):**
   * Generate scripts using local Ollama LLM or the deterministic template writer.
   * Auto-plans scenes with camera movements (pan left/right, zoom in/out) and crossfades.
   * Visual styles: Simple Cards (Pillow gradients) or SD-Turbo neural visuals.
2. **Use My Photos & Voice:**
   * Upload 1 to 30 photos with drag-to-reorder thumbnails.
   * Set per-image duration or auto-fit to uploaded voice/audio.
   * Optional local speech-to-text auto-subtitles.
   * Single-face detection automatically unlocks optional Wav2Lip lip-sync mode.
3. **Talking Face (Wav2Lip):**
   * High-accuracy neural lip synchronization using local Piper TTS and Wav2Lip checkpoint.
4. **Offline Subtitle Engine:**
   * Procedural aligner and faster-whisper support with burned-in styled captions.

---

## Limitations

* **Camera Moves vs. Generative Video:** Visual scenes are created using high-quality Ken Burns motion, pans, and crossfades over imagery; this is not generative full-motion video diffusion (like Sora or Runway).
* **Face Requirements for Lip Sync:** Wav2Lip requires a clear, frontal face. If multiple faces or no faces are detected, the pipeline gracefully defaults to a Ken Burns slideshow.
* **Local Concurrency:** Generation jobs run locally on your system using an in-process worker pool. For high-throughput multi-user setups, an external queue (e.g. Celery / Redis) would be required.
* **Storage:** Rendered media, uploaded clips, and audio files reside in `./storage/` until cleaned up or deleted.