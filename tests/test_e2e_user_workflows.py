import io
import struct
import wave
from pathlib import Path
from PIL import Image
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.services.jobs import run_job, get_job
from src.models.schemas import JobState

client = TestClient(app, raise_server_exceptions=False)


def get_headers():
    return {"X-API-Key": settings.api_key or "test_key"}


def create_test_wav_bytes(duration: float = 1.0) -> bytes:
    sr = 22050
    n = int(sr * duration)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(struct.pack(f"<{n}h", *([500] * n)))
    return buf.getvalue()


def create_test_png_bytes() -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (100, 100), color="blue")
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_e2e_full_lifecycle_success(monkeypatch):
    headers = get_headers()

    # 1. Generate Script
    script_resp = client.post(
        "/v1/scripts/generate",
        headers=headers,
        json={
            "prompt": "Memories of summer vacation with family",
            "duration_preset": "30s",
            "tone": "friendly",
            "language": "en",
        },
    )
    assert script_resp.status_code == 200, script_resp.text
    script_data = script_resp.json()
    assert "script" in script_data
    assert len(script_data["script"]) > 10

    # 2. Upload photo asset
    png_bytes = create_test_png_bytes()
    photo_resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "photo"},
        files={"file": ("photo.png", png_bytes, "image/png")},
    )
    assert photo_resp.status_code == 200, photo_resp.text
    photo_asset_id = photo_resp.json()["asset_id"]
    assert photo_asset_id.startswith("photo_")

    # 3. Upload voice asset
    wav_bytes = create_test_wav_bytes(1.5)
    voice_resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "voice"},
        files={"file": ("voice.wav", wav_bytes, "audio/wav")},
    )
    assert voice_resp.status_code == 200, voice_resp.text
    voice_asset_id = voice_resp.json()["asset_id"]
    assert voice_asset_id.startswith("voice_")

    # 4. Upload music asset (must be >= 5.0 seconds)
    music_wav_bytes = create_test_wav_bytes(6.0)
    music_resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "music"},
        files={"file": ("bgm.wav", music_wav_bytes, "audio/wav")},
    )
    assert music_resp.status_code == 200, music_resp.text
    music_asset_id = music_resp.json()["asset_id"]
    assert music_asset_id.startswith("music_")

    # 5. Get music presets
    presets_resp = client.get("/v1/music-presets", headers=headers)
    assert presets_resp.status_code == 200
    presets_data = presets_resp.json()
    assert isinstance(presets_data, list)
    assert any(p["id"] == "calm" for p in presets_data)

    # 6. Estimate Job
    est_resp = client.post(
        "/v1/jobs/estimate",
        headers=headers,
        json={
            "target_duration_seconds": 30.0,
            "has_music": True,
            "visual_mode": "slideshow",
        },
    )
    assert est_resp.status_code == 200
    est_data = est_resp.json()
    assert est_data["target_duration_seconds"] == 30.0
    assert est_data["estimated_render_seconds"] > 0

    # 7. Create Job (slideshow mode for pure offline FFmpeg rendering)
    job_payload = {
        "prompt": "5 second video",
        "script": "I hold peaceful and happy memories of our wonderful family summer trip deep in my heart.",
        "photo_asset_id": photo_asset_id,
        "voice_asset_id": voice_asset_id,
        "music_asset_id": music_asset_id,
        "music_volume": 0.25,
        "music_ducking": True,
        "visual_mode": "slideshow",
        "consent": {
            "authorized": True,
            "statement": "I own explicit rights and authorize this generation.",
            "face_rights_attested": True,
            "voice_rights_attested": True,
        },
    }
    create_job_resp = client.post("/v1/jobs", headers=headers, json=job_payload)
    assert create_job_resp.status_code == 202, create_job_resp.text
    job_data = create_job_resp.json()
    job_id = job_data["job_id"]
    assert job_id.startswith("job_")
    assert job_data["state"] in [
        JobState.RECEIVED,
        JobState.CONSENT_VERIFIED,
        JobState.PLANNING_TIMELINE,
        JobState.COMPLETED,
    ]

    # 8. Wait for background worker to complete the job
    import time
    for _ in range(60):
        rec = get_job(job_id)
        if rec and rec.state in [JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED]:
            break
        time.sleep(0.5)

    # 9. Poll Job State
    poll_resp = client.get(f"/v1/jobs/{job_id}", headers=headers)
    assert poll_resp.status_code == 200
    final_job = poll_resp.json()
    assert final_job["state"] == JobState.COMPLETED
    assert final_job["output_path"] is not None

    # 10. Download Video & Verify Security Headers
    download_resp = client.get(f"/v1/jobs/{job_id}/download", headers=headers)
    assert download_resp.status_code == 200
    assert download_resp.headers["content-type"] == "video/mp4"
    assert download_resp.headers.get("x-content-type-options") == "nosniff"
    assert "attachment" in download_resp.headers.get("content-disposition", "")
    assert len(download_resp.content) > 0

    # 11. Delete Job & Cleanup
    delete_resp = client.delete(f"/v1/jobs/{job_id}", headers=headers)
    assert delete_resp.status_code == 200
    assert delete_resp.json().get("deleted") is True

    # Verify Job is gone from DB and cache
    post_delete_resp = client.get(f"/v1/jobs/{job_id}", headers=headers)
    assert post_delete_resp.status_code == 404


def test_e2e_job_cancellation_flow():
    headers = get_headers()
    png_bytes = create_test_png_bytes()
    photo_resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "photo"},
        files={"file": ("photo.png", png_bytes, "image/png")},
    )
    photo_id = photo_resp.json()["asset_id"]

    wav_bytes = create_test_wav_bytes(1.0)
    voice_resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "voice"},
        files={"file": ("voice.wav", wav_bytes, "audio/wav")},
    )
    voice_id = voice_resp.json()["asset_id"]

    job_payload = {
        "prompt": "5 second video",
        "script": "Testing cancellation flow.",
        "photo_asset_id": photo_id,
        "voice_asset_id": voice_id,
        "consent": {
            "authorized": True,
            "statement": "I authorize this test.",
            "face_rights_attested": True,
            "voice_rights_attested": True,
        },
    }
    create_resp = client.post("/v1/jobs", headers=headers, json=job_payload)
    assert create_resp.status_code == 202, create_resp.text
    job_id = create_resp.json()["job_id"]

    # Cancel the job
    cancel_resp = client.post(f"/v1/jobs/{job_id}/cancel", headers=headers)
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["state"] == JobState.CANCELLED

    # Delete the cancelled job
    del_resp = client.delete(f"/v1/jobs/{job_id}", headers=headers)
    assert del_resp.status_code == 200


def test_e2e_rejections_and_security_boundaries():
    headers = get_headers()

    # Reject disguised BMP
    bmp_buf = io.BytesIO()
    Image.new("RGB", (50, 50), color="red").save(bmp_buf, format="BMP")
    resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "photo"},
        files={"file": ("fake.png", bmp_buf.getvalue(), "image/png")},
    )
    assert resp.status_code == 400
    assert "Disallowed underlying image format" in resp.text

    # Upload valid assets to test server-side consent validation rejection
    png_bytes = create_test_png_bytes()
    photo_resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "photo"},
        files={"file": ("photo.png", png_bytes, "image/png")},
    )
    photo_id = photo_resp.json()["asset_id"]

    wav_bytes = create_test_wav_bytes(1.0)
    voice_resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "voice"},
        files={"file": ("voice.wav", wav_bytes, "audio/wav")},
    )
    voice_id = voice_resp.json()["asset_id"]

    # Reject job without consent
    job_unauth = {
        "prompt": "5 second video",
        "script": "Unauthorized video.",
        "photo_asset_id": photo_id,
        "voice_asset_id": voice_id,
        "consent": {"authorized": False},
    }
    unauth_resp = client.post("/v1/jobs", headers=headers, json=job_unauth)
    assert unauth_resp.status_code == 400
    assert "Authorization is required before generation." in unauth_resp.text

    # Reject path traversal download
    traversal_resp = client.get("/v1/jobs/job_..%2F..%2Fetc%2Fpasswd/download", headers=headers)
    assert traversal_resp.status_code in [400, 404]
