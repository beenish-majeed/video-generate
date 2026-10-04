# Avatar Pipeline Video Generation Backend

Production-ready AI video generation pipeline for creating talking-head avatar videos from user photos and voice assets.

### Features

* **Media Validation:** Verifies uploaded images and audio using PIL, `wave`, and `soundfile`.
* **API Security:** Requires `API_KEY` by default; insecure mode requires explicit `ALLOW_INSECURE_DEV=true`.
* **Duration Presets:** Supports `5s`, `30s`, `2m`, `5m`, and `10m`, with server-side duration limits.
* **Script Validation:** Validates script length against the requested duration at ~150 WPM.
* **Memory Optimization:** Streams frames directly to OpenCV, uses an LRU job cache, and cleans intermediate files after completion.
* **Job Recovery:** Interrupted jobs are automatically marked `FAILED` after server restart.

### Pipeline

Photo + Voice → TTS → Wav2Lip → Subtitles → FFmpeg → Final Video

### Quick Start

```bash
pip install -r requirements.txt
cp .env.example .env
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

### Known Limitations

* Jobs run in-process using `ThreadPoolExecutor`; no persistent queue such as Celery/Redis.
* GPU inference is serialized with a process-level lock.
* Scripts must contain enough speech for at least 80% of the requested duration.
* Final videos, subtitles, manifests, and uploaded assets remain in `./storage/` until manually purged.