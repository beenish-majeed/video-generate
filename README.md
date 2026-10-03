# Avatar Pipeline Video Generation Backend

Production-grade AI Video Generation Pipeline that synthesizes talking-head avatar videos from uploaded user photo and voice assets using Text-to-Speech (CosyVoice2-0.5B / Piper TTS), Wav2Lip lip-sync neural animation, WebVTT subtitle generation, and FFmpeg video assembly.

## Features & Architecture

* **Photo & Voice Upload Validation**: Binary header and container decoding verification (`wave`, `soundfile`, PIL) rejecting corrupt or non-media files.
* **API Key Security**: Strict authentication enforced by default; application startup fails if `API_KEY` is omitted unless `ALLOW_INSECURE_DEV=true` is explicitly set for local dev.
* **Explicit Duration Options**: Preset selection (`5s`, `30s`, `2m`, `5m`, `10m`) with server policy enforcement (`MIN_DURATION_SECONDS` = 1.0s, `MAX_DURATION_POLICY_SECONDS` = 900.0s).
* **Script Speech Validation**: Automatic script word-count validation against requested video duration (at ~150 WPM), rejecting insufficient scripts with user-actionable HTTP 422 errors.
* **RAM & Storage Optimization**: Direct frame streaming to `cv2.VideoWriter` (cut frame RAM per segment to ~2.76 MB), LRU `BoundedJobCache` (max 100 items), and post-job intermediate file cleanup (`audio/`, `videos/`, `*_merged.wav`).
* **Startup Job Recovery**: Interrupted jobs from server restarts are automatically detected on startup and marked `FAILED`.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy configuration
cp .env.example .env

# 3. Start API server
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

## Known Limitations

1. **In-Process Job Execution**: Jobs execute using an in-process python `ThreadPoolExecutor` within the FastAPI web process rather than a persistent background task queue (e.g., Celery + Redis).
2. **GPU Concurrency Lock**: PyTorch model inference and face alignment execute sequentially under an process-level mutex lock (`threading.Lock()`), processing one job segment at a time per GPU instance.
3. **Script Length Requirement**: The user must provide a script long enough for the selected video duration (speech duration estimated at 150 WPM must be at least 80% of the requested target duration).
4. **Completed Video Storage Policy**: While intermediate segment files are automatically deleted after job completion, final output artifacts (`final_video.mp4`, `subtitles.vtt`, `manifest.json`) and uploaded assets remain stored in `./storage/` until manually archived or purged.
