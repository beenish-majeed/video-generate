import sys
import time
import pytest
import psutil

from src.utils.subprocess_runner import (
    SubprocessTimeoutError,
    kill_process_tree,
    run_subprocess,
)


def test_subprocess_fast_command_succeeds():
    cmd = [sys.executable, "-c", "print('safe_output_123')"]
    res = run_subprocess(cmd, timeout=5.0)
    assert res.returncode == 0
    assert "safe_output_123" in res.stdout


def test_subprocess_timeout_kills_process_tree():
    # Harmless sleep command that would block for 10 seconds
    cmd = [sys.executable, "-c", "import time; time.sleep(10)"]

    t0 = time.time()
    with pytest.raises(SubprocessTimeoutError, match="timed out after 0.5s and was terminated"):
        run_subprocess(cmd, timeout=0.5)
    elapsed = time.time() - t0

    # Ensure it terminated promptly around ~0.5s, not after 10s
    assert elapsed < 3.0


def test_kill_process_tree_safely():
    # Spawns a child process and ensures kill_process_tree kills it
    import subprocess
    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(10)"])
    assert proc.poll() is None
    kill_process_tree(proc.pid)
    time.sleep(0.2)
    assert proc.poll() is not None or not psutil.pid_exists(proc.pid)
