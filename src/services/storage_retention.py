import logging
from pathlib import Path
import shutil
import time
from typing import Dict, Set

from src.config import settings
from src.models.schemas import JobState
from src.services.jobs import (
    DB_PATH,
    JOBS,
    NON_TERMINAL_STATES,
    delete_job_record,
    get_job,
    list_all_jobs,
    safe_rmtree,
)
from src.services.store import ASSETS_DIR, JOBS_DIR

logger = logging.getLogger(__name__)


def get_active_assets_and_jobs() -> tuple[Set[str], Set[str]]:
    """
    Finds all job IDs currently running or queued, and collects all asset IDs
    and file paths actively referenced by them. These must NEVER be pruned.
    """
    active_job_ids: Set[str] = set()
    active_asset_ids: Set[str] = set()

    all_jobs = list_all_jobs()
    for job in all_jobs:
        if job.state in NON_TERMINAL_STATES:
            active_job_ids.add(job.job_id)
            req = job.request
            if req:
                if req.photo_asset_id:
                    active_asset_ids.add(req.photo_asset_id)
                if req.voice_asset_id:
                    active_asset_ids.add(req.voice_asset_id)
                if req.music_asset_id:
                    active_asset_ids.add(req.music_asset_id)
                if req.uploaded_audio_asset_id:
                    active_asset_ids.add(req.uploaded_audio_asset_id)
                if req.uploaded_image_asset_ids:
                    active_asset_ids.update(req.uploaded_image_asset_ids)

    return active_job_ids, active_asset_ids


def get_dir_size_bytes(directory: Path) -> int:
    """Calculate total byte size of all files in directory tree."""
    if not directory.exists():
        return 0
    total = 0
    for p in directory.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except Exception:
                pass
    return total


def clean_expired_storage() -> dict:
    """
    Retention cleanup:
    1. Removes unreferenced assets older than asset_retention_hours (default 72h).
    2. Removes terminal jobs older than job_retention_hours (default 48h).
    3. Never touches files or directories used by running/queued jobs.
    4. Enforces total_storage_max_bytes cap by removing oldest terminal jobs first.
    """
    now = time.time()
    active_jobs, active_assets = get_active_assets_and_jobs()

    deleted_assets = 0
    deleted_jobs = 0
    freed_bytes = 0

    asset_ttl_seconds = settings.asset_retention_hours * 3600.0
    job_ttl_seconds = settings.job_retention_hours * 3600.0

    # 1. Prune expired unreferenced assets
    if ASSETS_DIR.exists():
        for asset_file in list(ASSETS_DIR.iterdir()):
            if not asset_file.is_file():
                continue
            stem = asset_file.stem
            if stem in active_assets:
                continue

            try:
                mtime = asset_file.stat().st_mtime
                if now - mtime > asset_ttl_seconds:
                    size = asset_file.stat().st_size
                    asset_file.unlink()
                    deleted_assets += 1
                    freed_bytes += size
                    logger.info(f"Retention: deleted expired asset '{asset_file.name}'")
            except Exception as exc:
                logger.warning(f"Error checking/deleting asset '{asset_file}': {exc}")

    # 2. Prune expired terminal job directories and database entries
    if JOBS_DIR.exists():
        for job_folder in list(JOBS_DIR.iterdir()):
            if not job_folder.is_dir():
                continue
            jid = job_folder.name
            if jid in active_jobs:
                continue

            job = get_job(jid)
            if job and job.state in NON_TERMINAL_STATES:
                continue

            try:
                # Determine job age from updated_at or directory mtime
                folder_mtime = job_folder.stat().st_mtime
                if job and job.updated_at:
                    job_age_seconds = now - job.updated_at.timestamp()
                else:
                    job_age_seconds = now - folder_mtime

                if job_age_seconds > job_ttl_seconds:
                    size = get_dir_size_bytes(job_folder)
                    delete_job_record(jid)
                    safe_rmtree(job_folder)
                    deleted_jobs += 1
                    freed_bytes += size
                    logger.info(f"Retention: deleted expired job directory '{jid}'")
            except Exception as exc:
                logger.warning(f"Error cleaning job folder '{job_folder}': {exc}")

    # 3. Enforce total storage cap if storage exceeds limit
    current_storage = get_dir_size_bytes(settings.storage_dir)
    if current_storage > settings.total_storage_max_bytes:
        logger.warning(
            f"Storage size ({current_storage} bytes) exceeds cap ({settings.total_storage_max_bytes} bytes). "
            f"Evicting oldest terminal jobs."
        )
        remaining_terminal_jobs = [
            j for j in list_all_jobs()
            if j.job_id not in active_jobs and j.state not in NON_TERMINAL_STATES
        ]
        remaining_terminal_jobs.sort(key=lambda j: j.updated_at.timestamp() if j.updated_at else 0)

        for job in remaining_terminal_jobs:
            if current_storage <= settings.total_storage_max_bytes:
                break
            job_path = JOBS_DIR / job.job_id
            size = get_dir_size_bytes(job_path)
            delete_job_record(job.job_id)
            safe_rmtree(job_path)
            deleted_jobs += 1
            freed_bytes += size
            current_storage -= size

    return {
        "deleted_assets": deleted_assets,
        "deleted_jobs": deleted_jobs,
        "freed_bytes": freed_bytes,
    }
