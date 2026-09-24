from fastapi import FastAPI

from src.config import settings

app = FastAPI(title="Avatar Pipeline Backend", version="0.1.0")

settings.storage_dir.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health():
    return {
        "ok": True,
        "mock_mode": settings.mock_mode,
        "storage_dir": str(settings.storage_dir),
    }