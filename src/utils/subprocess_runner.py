import logging
from pathlib import Path
import subprocess
import sys
import psutil

from src.config import settings

logger = logging.getLogger(__name__)


class SubprocessTimeoutError(RuntimeError):
    """Raised when a subprocess exceeds its allotted timeout and is terminated."""
    pass


def kill_process_tree(pid: int) -> None:
    """Recursively kill a process and all of its child processes."""
    try:
        parent = psutil.Process(pid)
        children = parent.children(recursive=True)
        for child in children:
            try:
                child.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        parent.kill()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    except Exception as exc:
        logger.warning(f"psutil could not terminate process {pid}: {exc}")
        if sys.platform == "win32":
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True,
                    timeout=5,
                )
            except Exception:
                pass


def run_subprocess(
    cmd: list[str],
    timeout: float | None = None,
    check: bool = False,
    input: str | bytes | None = None,
    capture_output: bool = True,
    text: bool = True,
    cwd: str | Path | None = None,
    env: dict | None = None,
) -> subprocess.CompletedProcess:
    """
    Execute a subprocess command with mandatory timeout and process-tree termination on hang.
    """
    if timeout is None:
        bin_name = Path(cmd[0]).name.lower() if cmd else ""
        if "ffprobe" in bin_name:
            timeout = settings.subprocess_ffprobe_timeout_seconds
        elif "piper" in bin_name:
            timeout = settings.subprocess_piper_timeout_seconds
        elif any(arg in cmd for arg in ["-filter_complex", "-crf", "libx264"]):
            timeout = settings.subprocess_render_timeout_seconds
        else:
            timeout = settings.subprocess_default_timeout_seconds

    stdin_mode = subprocess.PIPE if input is not None else None
    stdout_mode = subprocess.PIPE if capture_output else None
    stderr_mode = subprocess.PIPE if capture_output else None

    use_text = text if isinstance(input, (str, type(None))) else False
    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=stdin_mode,
            stdout=stdout_mode,
            stderr=stderr_mode,
            text=use_text,
            cwd=str(cwd) if cwd else None,
            env=env,
        )
        stdout, stderr = proc.communicate(input=input, timeout=timeout)
        retcode = proc.poll() or 0

        res = subprocess.CompletedProcess(
            args=cmd,
            returncode=retcode,
            stdout=stdout,
            stderr=stderr,
        )
        if check and retcode != 0:
            err_msg = stderr if isinstance(stderr, str) else (stderr.decode("utf-8", errors="ignore") if stderr else "")
            raise subprocess.CalledProcessError(retcode, cmd, output=stdout, stderr=stderr)
        return res

    except subprocess.TimeoutExpired as exc:
        if proc is not None:
            logger.error(f"Command timed out after {timeout:.1f}s, killing process tree: {' '.join(str(c) for c in cmd)}")
            kill_process_tree(proc.pid)
            try:
                proc.communicate(timeout=2)
            except Exception:
                pass
        raise SubprocessTimeoutError(
            f"Subprocess '{cmd[0]}' timed out after {timeout:.1f}s and was terminated."
        ) from exc
    except Exception:
        if proc is not None and proc.poll() is None:
            kill_process_tree(proc.pid)
        raise
