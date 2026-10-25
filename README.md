# AvatarStudio - Free & Offline Video Generation Pipeline

An offline-first, 100% free video creation suite that transforms ideas, scripts, and photos into polished videos with camera moves, subtitles, offline TTS, and talking-head lip sync.

---

## 100% Free & Local Runtime Statement

* **Zero API Keys & Subscriptions:** No OpenAI, Anthropic, ElevenLabs, or cloud APIs required.
* **100% Offline at Runtime:** Once setup is complete and models are cached, all generation (scripts, TTS, lip sync, transitions, subtitling) runs entirely on your local machine with no outbound network calls.
* **Single-Tenant Architecture:** AvatarStudio is designed strictly as a single-tenant local studio. It does not provide per-user data isolation or multi-tenant permissions. The application must not be exposed to untrusted users as-is.
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

> **Model Integrity & Trust-On-First-Use:** Downloaded model weights (Piper ONNX, Wav2Lip checkpoint) are cryptographically validated against pinned SHA-256 digests in `models.sha256`. The pinned hashes represent a trust-on-first-use baseline from known-good reference weights. Any tampered or corrupted weights are deleted and rejected at download and load time.

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
Activate the virtual environment and start the FastAPI service. By default, the service binds securely to `127.0.0.1` (localhost):
```bash
# Windows
.venv\Scripts\uvicorn src.main:app --host 127.0.0.1 --port 8000

# Linux / macOS
source .venv/bin/activate && uvicorn src.main:app --host 127.0.0.1 --port 8000
```
> **Network Bind Notice:** The backend defaults to `127.0.0.1` to prevent unauthorized exposure over local networks (LAN). To bind to other interfaces (e.g. `--host 0.0.0.0`), you must run behind a secure, authenticating reverse proxy with TLS and never expose raw backend ports directly to untrusted networks.

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
5. **Background Music Engine:**
   * Offline mixed and ducked background audio with sidechain compression, loudness normalization, and peak limiting.

---

## Background Music & Ambient Presets (Mixed & Ducked)

AvatarStudio supports adding background music to your generated videos across all generation modes (Text-to-Video, My Photos & Audio, and Talking-Head Avatar). You can either upload your own soundtrack or select from built-in procedural ambient presets.

### Specifications, Formats & Limits
* **Uploaded Audio Formats:** `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`.
* **File Size Limit:** Up to 30 MB.
* **Duration Limits:** Between 5 seconds and 20 minutes (validated by full audio decoding).
* **Rights & Licensing Reminder:** The user must possess all necessary rights, licenses, and permissions for any background music uploaded.
* **Ambient Presets (Offline & License-Free):** Built-in deterministic ambient music synthesized with Python and mathematical waveform synthesis (numpy / scipy). Zero external media dependencies, 100% free for all uses. Available moods:
  - `"calm"`: Ambient Calm (soothing C-major / F-major sine pad with velvety filtering)
  - `"warm"`: Ambient Warm (resonant G-major / E-minor chords with acoustic warmth)
  - `"bright"`: Ambient Bright (luminous D-major / A-major harmonics with gentle shimmer)
* **Audio Output Quality:** Broadcast-quality stereo 44.1 kHz AAC (`-ar 44100 -ac 2`) with peak limiting (`alimiter=limit=0.95`, never clips), A/V synchronization under 100 ms, and video duration preserved.

### Graceful Fallback Behavior
If an uploaded music file cannot be decoded or mixing fails, the pipeline **never aborts or fails the video generation job**. Instead, it gracefully continues video assembly without music, logs a warning, and sets `music_applied: false` and `music_error` with the exact diagnostic reason in the job record and `manifest.json`.

### How Mixing & Audio Processing Works
* **Looped with Crossfade:** If the music file is shorter than the final video duration, it is looped automatically with a smooth ~1.0-second crossfade (`acrossfade`) so transitions have no audible clicks or seams. If longer, it is trimmed to the video duration.
* **Fade In & Fade Out:** Background music smoothly fades in for 1.5 seconds at the start, and fades out for 2.5 seconds at the end (`afade`).
* **Loudness Normalization & Volume Scaling:** Music loudness is normalized using standard broadcast loudness normalization (`loudnorm=I=-24:LRA=7:TP=-2.0`) before applying your custom `music_volume` scale factor (default: `0.25`, range: `0.0` to `1.0`).
* **Sidechain Speech Ducking:** When `music_ducking: true` (default), an FFmpeg `sidechaincompress` filter monitors speech presence in real-time (threshold: 0.03, attack: 20 ms, release: 400 ms, ratio: 10). The music volume automatically attenuates by at least 6 dB whenever speech is active and recovers cleanly during silence, keeping narration crisp and on top.
* **Zero Clipping:** Music and speech are mixed without downward normalization (`amix=normalize=0`) and passed through a peak limiter (`alimiter=limit=0.95`) ensuring output audio never clips (< 0 dBFS).
* **Video Stream Copy:** During final assembly, the video stream is directly copied (`-c:v copy`) without re-encoding, preserving video fidelity and rendering within milliseconds.
* **Speech-Only Subtitles:** Subtitles generated or burned into the video remain strictly speech-only; background music is never captioned.

### API & Curl Examples

#### 1. Check System Capabilities
```bash
curl -X GET http://localhost:8000/v1/capabilities \
  -H "X-API-Key: YOUR_API_KEY"
```
Response includes:
```json
{
  "background_music": true,
  "music_presets": ["calm", "warm", "bright"]
}
```

#### 2. List Ambient Music Presets
```bash
curl -X GET http://localhost:8000/v1/music-presets \
  -H "X-API-Key: YOUR_API_KEY"
```
Response:
```json
[
  {"id": "calm", "name": "Ambient Calm"},
  {"id": "warm", "name": "Ambient Warm"},
  {"id": "bright", "name": "Ambient Bright"}
]
```

#### 3. Upload Custom Background Music
```bash
curl -X POST http://localhost:8000/v1/assets/upload \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "kind=music" \
  -F "file=@/path/to/soundtrack.mp3"
```
Response:
```json
{
  "asset_id": "music_a1b2c3d4e5f6",
  "kind": "music",
  "path": "storage/assets/music_a1b2c3d4e5f6.mp3",
  "sha256": "3a7b...",
  "duration_seconds": 124.5
}
```

#### 4. Create Video Job with Ambient Preset (or Uploaded Music)
Use `music_preset_id` for built-in ambient music, or `music_asset_id` for uploaded music (providing both returns 422):
```bash
curl -X POST http://localhost:8000/v1/jobs \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar_preset_id": "avatar_default",
    "voice_preset_id": "voice_piper_lessac",
    "script": "Welcome to our product tour. Today we will walk through the key features and benefits of this release.",
    "prompt": "30 second presentation video",
    "target_duration_seconds": 30.0,
    "music_preset_id": "calm",
    "music_volume": 0.25,
    "music_ducking": true,
    "consent": {
      "authorized": true,
      "statement": "I authorize this video generation and own all rights.",
      "face_rights_attested": true,
      "voice_rights_attested": true
    }
  }'
```

---

## Limitations

* **Camera Moves vs. Generative Video:** Visual scenes are created using high-quality Ken Burns motion, pans, and crossfades over imagery; this is not generative full-motion video diffusion (like Sora or Runway).
* **Face Requirements for Lip Sync:** Wav2Lip requires a clear, frontal face. If multiple faces or no faces are detected, the pipeline gracefully defaults to a Ken Burns slideshow.
* **Local Concurrency:** Generation jobs run locally on your system using an in-process worker pool. For high-throughput multi-user setups, an external queue (e.g. Celery / Redis) would be required.
* **Storage:** Rendered media, uploaded clips, and audio files reside in `./storage/` until cleaned up or deleted.