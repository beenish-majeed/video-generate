# AvatarStudio

A local-first video generation project built with FastAPI and React. It turns text prompts, scripts, photos, and audio clips into MP4 videos using FFmpeg camera motion (Ken Burns slideshows), procedural background music, WebVTT subtitles, and optional local talking-head lip sync.

---

## What Works Locally vs. What Is Optional

### Runs locally on CPU (free, no API keys)
- **Template script generation:** Built-in rule-based script writer in `src/services/template_script_writer.py` (or a local Ollama server at `http://127.0.0.1:11434` if installed).
- **Text-to-video (`visual_mode: "text_to_video"`):** Generates gradient/text scene cards with Pillow and stitches them into an H.264 MP4 with FFmpeg pan-and-zoom camera motion, burned-in WebVTT subtitles, an AI disclosure badge, and procedural ambient background music (`calm`, `warm`, `bright`) ducked under speech.
- **Picture-to-video (`visual_mode: "picture_to_video"`):** Uses an uploaded image together with either uploaded/recorded audio (`audio_mode: "original_audio"`) or local TTS.
- **Browser audio recording:** Records microphone audio in the React frontend and encodes it client-side to 16-bit PCM WAV before uploading.

### Requires local model downloads
- **Local Piper TTS:** Requires voice model weights under `src/models/piper/`. If those weights are not present, the backend falls back to `assets/voices/default_voice.wav` (a 2-second sample clip).
- **Talking-head lip sync (Wav2Lip):** Requires `src/models/wav2lip/wav2lip.pth` and a clear frontal face in the photo. When the checkpoint or a frontal face is missing, Picture-to-Video falls back to FFmpeg Ken Burns camera motion over the still image and records the reason in `visual_mode_reason`.
- **AI Scene Clips (`notebooks/ai_clips_colab.ipynb`):** Companion Colab notebook for generating diffusion clips externally on a GPU and importing them locally; GPU diffusion in that notebook is not verified locally.

### Optional cloud providers (off by default, paid, not tested)
- `GoogleVeoVideoProvider`, `FalAIVideoProvider`, and `FileAIClient` exist as optional adapters in `src/services/video_provider.py` and `src/clients/file_ai.py`.
- By default, `VIDEO_PROVIDER=slideshow` in `.env.example` and `src/core/config.py`, so **cloud video providers are disabled and zero outbound network calls are made** unless you explicitly enable another provider and supply paid API keys (`GEMINI_API_KEY` / `GOOGLE_API_KEY`, `FAL_KEY`, `FILE_AI_API_KEY`).
- End-to-end cloud video generation with live paid accounts has **not** been tested.

---

## Honest Limitations

- **Output quality:** Local CPU output is a Ken Burns slideshow over gradient cards/photos, or a 2D Wav2Lip mouth crop when `wav2lip.pth` is installed. It is **not** full-motion neural video generation like Google Veo or OpenAI Sora.
- **CPU speed:** Slideshows render quickly on CPU (~5–15 seconds for a 30-second video). Running Wav2Lip on CPU is slow (~2–4x video duration) and impractical for long videos without a CUDA GPU.
- **Voice Synthesis vs. Voice Cloning:** Offline speech synthesis uses local Piper voices (or `assets/voices/default_voice.wav` if Piper models are missing). Uploaded user audio is used directly as the audio track in original-audio mode; uploaded voices are not cloned onto typed scripts.
- **Single-worker process limit (`--workers 1`):** Background jobs run in an in-process `ThreadPoolExecutor`, and job lookups, caching, and rate limiters are stored in process memory alongside SQLite. You must start Uvicorn with `--workers 1`; running multiple worker processes breaks job tracking and rate limiting. Restarting the server interrupts running jobs, which are marked `FAILED` on next startup.
- **Single-tenant design:** Access uses a shared `API_KEY` and per-visitor signed HMAC cookies (`SESSION_SECRET`). There is no multi-user account system or automatic cleanup daemon deleting old jobs from `storage/`.
- **Trusted proxies (`TRUSTED_PROXIES`):** Only list explicit reverse proxy IP addresses (such as `127.0.0.1` or a specific load-balancer IP) in `TRUSTED_PROXIES`. Do **not** add entire private CIDR blocks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) unless every machine in that subnet is a trusted proxy, or clients on the network can spoof `X-Forwarded-For`.
- **OneDrive and cloud-synced folders:** If the repository lives inside a synced folder such as `OneDrive`, media written to `storage/` may sync to the cloud and Windows/OneDrive file locks can cause `EPERM` errors on `node_modules/.vite`. Keep working copies in a non-synced folder when possible.

---

## 5-Step Setup

### 1. Prerequisites
Install:
- Python 3.10+ (tested locally on Python 3.14, CI runs Python 3.11)
- Node.js 18+ and npm (frontend tested with Node 20 LTS)
- `ffmpeg` and `ffprobe` on your system `PATH`

### 2. Install backend dependencies
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```
*(Optional helper scripts `scripts/setup.ps1` and `scripts/setup.sh` also exist to set up the venv and download local model weights.)*

### 3. Configure environment variables
Copy `.env.example` to `.env`:
```powershell
copy .env.example .env
```
For local offline use, leave `VIDEO_PROVIDER=slideshow` and leave cloud API keys empty. Keep the server bound to `127.0.0.1`.

### 4. Start the backend (single worker)
```powershell
uvicorn src.main:app --host 127.0.0.1 --port 8000 --workers 1
```

### 5. Start the frontend
In a separate terminal:
```powershell
cd frontend
npm install
npm run dev
```
Open `http://127.0.0.1:3000`. Make sure `frontend/.env` sets `API_KEY` to match the backend `.env` (for local loopback requests only, the Vite dev proxy attaches `X-API-Key`).

---

## API Overview

- `GET /health` — basic server health check (`{"ok": true}`)
- `GET /v1/capabilities` — hardware, local model, music preset, and provider status
- `GET /v1/durations` — allowed duration presets and speech pacing (`words_per_minute`)
- `POST /v1/scripts/generate` — generate narration script for a prompt and duration
- `POST /v1/assets/upload` — upload `photo`, `voice`, `image`, `audio`, `music`, or `clip` files
- `POST /v1/jobs` — create a `text_to_video` or `picture_to_video` job (requires consent fields)
- `GET /v1/jobs/{job_id}` — inspect job status and `visual_mode_reason`
- `GET /v1/jobs/{job_id}/download` — download finished `final_video.mp4`
- `DELETE /v1/jobs/{job_id}` — delete a completed, failed, or cancelled job

---

## Licenses

This project uses packages with copyleft and non-commercial restrictions:
- `piper-tts` is **GPL-3.0-or-later** (see root [LICENSE](LICENSE)).
- **Wav2Lip** and **InsightFace** model weights are strictly for **non-commercial research use**.

Review [LICENSES.md](LICENSES.md) before distributing or deploying the project.
