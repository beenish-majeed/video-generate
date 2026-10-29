import logging
import sqlite3
from pathlib import Path
from typing import Any, Optional

from src.models.schemas import JobRecord, JobState, utcnow
from src.services.job_cache import NON_TERMINAL_STATES

logger = logging.getLogger(__name__)


def recover_interrupted_jobs(
    db_path: Optional[Path] = None,
    cache: Optional[Any] = None,
) -> int:
    """
    On service startup, scan SQLite database for jobs that were active
    when the server stopped or crashed, and mark them as FAILED.
    """
    if db_path is None:
        from src.config import settings
        db_path = settings.storage_dir / "jobs.db"

    if cache is None:
        try:
            from src.services.jobs import JOBS
            cache = JOBS
        except ImportError:
            cache = None

    interrupted_count = 0
    try:
        now_iso = utcnow().isoformat()
        with sqlite3.connect(db_path, timeout=30.0) as conn:
            cursor = conn.execute(
                "SELECT job_id, data FROM jobs WHERE state NOT IN (?, ?, ?)",
                (JobState.COMPLETED.value, JobState.FAILED.value, JobState.CANCELLED.value),
            )
            rows = cursor.fetchall()
            for row in rows:
                if not row or not row[0]:
                    continue
                jid, raw_data = row[0], row[1]
                try:
                    job = JobRecord.model_validate_json(raw_data)
                    if job.state in NON_TERMINAL_STATES:
                        job.state = JobState.FAILED
                        job.error = "Job was interrupted by a server restart."
                        job.updated_at = utcnow()
                        if cache is not None:
                            cache[job.job_id] = job
                        conn.execute(
                            "UPDATE jobs SET state = ?, data = ?, updated_at = ? WHERE job_id = ?",
                            (job.state.value, job.model_dump_json(), job.updated_at.isoformat(), job.job_id),
                        )
                        interrupted_count += 1
                except Exception:
                    conn.execute(
                        "UPDATE jobs SET state = ?, updated_at = ? WHERE job_id = ?",
                        (JobState.FAILED.value, now_iso, jid),
                    )
                    if cache is not None and jid in cache:
                        del cache[jid]
                    interrupted_count += 1
            conn.commit()
    except Exception as exc:
        logger.error(f"Error during startup job recovery: {exc}")
    return interrupted_count
