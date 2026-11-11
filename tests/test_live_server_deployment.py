import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.error
import http.client
import pytest

from src.core.config import settings

API_KEY = "live_prod_test_key_987654321"


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def live_server():
    """
    Launch a real Uvicorn server in a separate OS process,
    test live HTTP/TCP socket behavior, and cleanly terminate on teardown.
    """
    port = get_free_port()
    env = os.environ.copy()
    env["API_KEY"] = API_KEY
    env["ALLOW_INSECURE_DEV"] = "false"
    env["TRUSTED_PROXIES"] = json.dumps(["127.0.0.1", "::1"])

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "src.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]

    log_file = open(settings.storage_dir / "uvicorn_live_test.log", "w", encoding="utf-8")

    proc = subprocess.Popen(
        cmd,
        env=env,
        stdout=log_file,
        stderr=log_file,
    )

    base_url = f"http://127.0.0.1:{port}"

    # Wait for server to become responsive
    start = time.time()
    ready = False
    while time.time() - start < 15.0:
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=1.0) as resp:
                if resp.status == 200:
                    ready = True
                    break
        except Exception:
            time.sleep(0.3)

    if not ready:
        proc.kill()
        log_file.close()
        log_content = (settings.storage_dir / "uvicorn_live_test.log").read_text(encoding="utf-8")
        raise RuntimeError(f"Live server failed to start within 15s. logs: {log_content[-2000:]}")

    yield {"base_url": base_url, "port": port, "proc": proc, "env": env}

    # Teardown: terminate process cleanly
    proc.terminate()
    try:
        proc.wait(timeout=5.0)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    try:
        log_file.close()
    except Exception:
        pass


def test_live_https_reverse_proxy_cookie_attributes(live_server):
    """
    Verify live HTTP server handles reverse-proxy HTTPS headers and enforces
    Secure; HttpOnly; SameSite=Lax over real TCP connections.
    """
    base_url = live_server["base_url"]

    # 1. Plain HTTP without proxy headers -> Secure flag NOT set (development/LAN safe)
    req_plain = urllib.request.Request(f"{base_url}/health")
    with urllib.request.urlopen(req_plain, timeout=3.0) as resp_plain:
        set_cookie_plain = resp_plain.headers.get("Set-Cookie", "")
        assert settings.session_cookie_name in set_cookie_plain
        assert "httponly" in set_cookie_plain.lower()
        assert "samesite=lax" in set_cookie_plain.lower()
        assert "secure" not in set_cookie_plain.lower()

    # 2. X-Forwarded-Proto: https -> Secure flag MUST be present
    req_proxy = urllib.request.Request(f"{base_url}/health")
    req_proxy.add_header("X-Forwarded-Proto", "https")
    with urllib.request.urlopen(req_proxy, timeout=3.0) as resp_proxy:
        set_cookie_proxy = resp_proxy.headers.get("Set-Cookie", "")
        assert settings.session_cookie_name in set_cookie_proxy
        assert "secure" in set_cookie_proxy.lower(), "Secure flag missing behind HTTPS reverse proxy!"
        assert "httponly" in set_cookie_proxy.lower()
        assert "samesite=lax" in set_cookie_proxy.lower()

    # 3. RFC 7239 standard Forwarded: proto=https
    req_fwd = urllib.request.Request(f"{base_url}/health")
    req_fwd.add_header("Forwarded", "proto=https;for=203.0.113.50")
    with urllib.request.urlopen(req_fwd, timeout=3.0) as resp_fwd:
        set_cookie_fwd = resp_fwd.headers.get("Set-Cookie", "")
        assert "secure" in set_cookie_fwd.lower(), "Secure flag missing with Forwarded proto=https!"


def test_live_session_isolation_and_idor_defense(live_server):
    """
    Verify real live User A vs User B session isolation over live HTTP socket.
    """
    base_url = live_server["base_url"]
    headers_auth = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

    # 1. Visitor A arrives and gets session cookie
    req_a_health = urllib.request.Request(f"{base_url}/health")
    with urllib.request.urlopen(req_a_health, timeout=3.0) as resp_a:
        cookie_header_a = resp_a.headers.get("Set-Cookie", "")
        cookie_a = cookie_header_a.split(";")[0]

    # Visitor A creates a Mode 1 job
    req_create = urllib.request.Request(
        f"{base_url}/v1/jobs",
        data=json.dumps({
            "visual_mode": "text_to_video",
            "prompt": "Live production verification documentary",
            "consent": {
                "authorized": True,
                "statement": "I consent to the generation of this AI video and accept the AI label.",
                "ai_generated_accepted": True,
                "ai_label_accepted": True,
            },
        }).encode("utf-8"),
        headers={**headers_auth, "Cookie": cookie_a},
        method="POST",
    )
    with urllib.request.urlopen(req_create, timeout=5.0) as resp_create:
        assert resp_create.status == 202
        body_a = json.loads(resp_create.read().decode("utf-8"))
        job_id_a = body_a["job_id"]

    # Visitor A lists jobs and sees job_id_a
    req_list_a = urllib.request.Request(
        f"{base_url}/v1/jobs",
        headers={**headers_auth, "Cookie": cookie_a},
    )
    with urllib.request.urlopen(req_list_a, timeout=3.0) as resp_list_a:
        assert resp_list_a.status == 200
        jobs_a = json.loads(resp_list_a.read().decode("utf-8"))
        assert any(j["job_id"] == job_id_a for j in jobs_a)

    # 2. Visitor B arrives with independent session
    req_b_health = urllib.request.Request(f"{base_url}/health")
    with urllib.request.urlopen(req_b_health, timeout=3.0) as resp_b:
        cookie_header_b = resp_b.headers.get("Set-Cookie", "")
        cookie_b = cookie_header_b.split(";")[0]
        assert cookie_b != cookie_a

    # Visitor B lists jobs -> MUST NOT see Visitor A's job
    req_list_b = urllib.request.Request(
        f"{base_url}/v1/jobs",
        headers={**headers_auth, "Cookie": cookie_b},
    )
    with urllib.request.urlopen(req_list_b, timeout=3.0) as resp_list_b:
        assert resp_list_b.status == 200
        jobs_b = json.loads(resp_list_b.read().decode("utf-8"))
        assert not any(j["job_id"] == job_id_a for j in jobs_b), "Visitor B must see empty workspace, not A's job!"

    # Visitor B attempts to read Visitor A's job -> 403 Forbidden
    req_read_b = urllib.request.Request(
        f"{base_url}/v1/jobs/{job_id_a}",
        headers={**headers_auth, "Cookie": cookie_b},
    )
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        urllib.request.urlopen(req_read_b, timeout=3.0)
    assert exc_info.value.code == 403

    # Visitor B attempts to download Visitor A's job -> 403 Forbidden
    req_dl_b = urllib.request.Request(
        f"{base_url}/v1/jobs/{job_id_a}/download",
        headers={**headers_auth, "Cookie": cookie_b},
    )
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        urllib.request.urlopen(req_dl_b, timeout=3.0)
    assert exc_info.value.code == 403


def test_live_session_secret_persistence_across_process_restart(live_server):
    """
    Verify session secret file persists across server process restarts and
    clients do NOT lose active sessions when the server is restarted.
    """
    port = live_server["port"]
    base_url = live_server["base_url"]
    env = live_server["env"]

    # 1. Get initial session cookie from running server
    req_1 = urllib.request.Request(f"{base_url}/health")
    with urllib.request.urlopen(req_1, timeout=3.0) as resp_1:
        cookie_1 = resp_1.headers.get("Set-Cookie", "").split(";")[0]

    # Verify .session_secret exists on disk
    secret_path = settings.storage_dir / ".session_secret"
    assert secret_path.exists()
    secret_val = secret_path.read_text().strip()
    assert len(secret_val) >= 32

    # 2. Terminate the server process
    live_server["proc"].terminate()
    live_server["proc"].wait(timeout=5.0)

    # 3. Relaunch a new server process on the same port with the same storage
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "src.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]
    relaunch_log = open(settings.storage_dir / "uvicorn_relaunch_test.log", "w", encoding="utf-8")
    new_proc = subprocess.Popen(
        cmd,
        env=env,
        stdout=relaunch_log,
        stderr=relaunch_log,
    )
    live_server["proc"] = new_proc

    # Wait for new server process to become responsive
    start = time.time()
    ready = False
    while time.time() - start < 15.0:
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=1.0) as resp:
                if resp.status == 200:
                    ready = True
                    break
        except Exception:
            time.sleep(0.3)
    assert ready, "New server process failed to restart!"

    # 4. Client sends the prior session cookie to the new server process
    req_reconnect = urllib.request.Request(
        f"{base_url}/v1/jobs",
        headers={"X-API-Key": API_KEY, "Cookie": cookie_1},
    )
    with urllib.request.urlopen(req_reconnect, timeout=3.0) as resp_reconnect:
        assert resp_reconnect.status == 200
        # If the session was rotated due to secret loss, a new Set-Cookie would be returned.
        # Verify no Set-Cookie header was issued (session was recognized as authentic).
        assert "Set-Cookie" not in resp_reconnect.headers, "Session was unexpectedly rotated after server restart!"


def test_live_picture_to_video_mode_and_asset_isolation(live_server):
    """
    Verify Mode 2 (picture_to_video) asset upload, session binding, and cross-visitor
    protection over live HTTP socket.
    """
    import httpx
    import io
    from PIL import Image

    base_url = live_server["base_url"]

    # 1. Visitor A arrives and uploads photo
    b = io.BytesIO()
    img = Image.new("RGB", (100, 100), color="blue")
    img.save(b, format="PNG")
    png_bytes = b.getvalue()

    client_a = httpx.Client(base_url=base_url, headers={"X-API-Key": API_KEY})
    resp_a_health = client_a.get("/health")
    assert resp_a_health.status_code == 200

    resp_up = client_a.post(
        "/v1/assets/upload",
        data={"kind": "photo"},
        files={"file": ("sample.png", png_bytes, "image/png")},
    )
    assert resp_up.status_code == 200
    asset_id_a = resp_up.json()["asset_id"]

    # 2. Visitor B arrives with independent session
    client_b = httpx.Client(base_url=base_url, headers={"X-API-Key": API_KEY})
    resp_b_health = client_b.get("/health")
    assert resp_b_health.status_code == 200

    # Visitor B tries to create Mode 2 job referencing Visitor A's photo asset -> 403 Forbidden
    resp_job_b = client_b.post(
        "/v1/jobs",
        json={
            "visual_mode": "picture_to_video",
            "photo_asset_id": asset_id_a,
            "consent": {
                "authorized": True,
                "statement": "I consent to the generation of this AI video and accept the AI label.",
                "face_rights_attested": True,
                "voice_rights_attested": True,
                "ai_generated_accepted": True,
                "ai_label_accepted": True,
            },
        },
    )
    assert resp_job_b.status_code == 403
    assert "Access denied" in resp_job_b.json()["detail"]

    # 3. Visitor A creates Mode 2 job referencing their own photo asset -> 202 Accepted
    resp_job_a = client_a.post(
        "/v1/jobs",
        json={
            "visual_mode": "picture_to_video",
            "photo_asset_id": asset_id_a,
            "consent": {
                "authorized": True,
                "statement": "I consent to the generation of this AI video and accept the AI label.",
                "face_rights_attested": True,
                "voice_rights_attested": True,
                "ai_generated_accepted": True,
                "ai_label_accepted": True,
            },
        },
    )
    assert resp_job_a.status_code == 202
    job_payload = resp_job_a.json()
    assert "job_id" in job_payload
    assert job_payload["request"]["visual_mode"] == "picture_to_video"


def test_live_public_exposure_defense(live_server):
    """
    Verify sensitive files (.session_secret, jobs.db, .env) cannot be downloaded over real HTTP.
    """
    base_url = live_server["base_url"]
    headers_auth = {"X-API-Key": API_KEY}

    for path in ["/.session_secret", "/jobs.db", "/.env", "/storage/.session_secret"]:
        req = urllib.request.Request(f"{base_url}{path}", headers=headers_auth)
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req, timeout=3.0)
        assert exc_info.value.code in (404, 405), f"Path {path} should return 404/405 Not Found"

