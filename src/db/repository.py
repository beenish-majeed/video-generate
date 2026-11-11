import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from src.db.database import get_db_connection
from src.db.models import AssetEntity, AuditLogEntity, ConsentEntity, JobEntity
from src.models.schemas import JobRecord, JobState, utcnow

logger = logging.getLogger(__name__)

NON_TERMINAL_STATES = {
    JobState.RECEIVED.value,
    JobState.CONSENT_PENDING.value,
    JobState.CONSENT_VERIFIED.value,
    JobState.COMPILING_PROMPT.value,
    JobState.PLANNING_TIMELINE.value,
    JobState.PREPARING_IDENTITY.value,
    JobState.SYNTHESIZING_AUDIO.value,
    JobState.SCHEDULING_SEGMENTS.value,
    JobState.GENERATING_SEGMENTS.value,
    JobState.QA_CHECKING.value,
    JobState.ASSEMBLING.value,
}

TERMINAL_STATES = {
    JobState.COMPLETED.value,
    JobState.FAILED.value,
    JobState.CANCELLED.value,
}


class JobRepository:
    """
    Thread-safe repository for persisting and querying video generation jobs in SQLite.
    """

    @staticmethod
    def save(job: JobRecord) -> None:
        job.updated_at = utcnow()
        data_json = job.model_dump_json()
        visual_mode = getattr(job.request, "visual_mode", "talking_head")

        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO jobs (job_id, state, visual_mode, data, data_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    state = excluded.state,
                    visual_mode = excluded.visual_mode,
                    data = excluded.data,
                    data_json = excluded.data_json,
                    updated_at = excluded.updated_at
                """,
                (
                    job.job_id,
                    job.state.value if isinstance(job.state, JobState) else str(job.state),
                    visual_mode,
                    data_json,
                    data_json,
                    job.created_at.isoformat(),
                    job.updated_at.isoformat(),
                ),
            )

    @staticmethod
    def get(job_id: str) -> Optional[JobRecord]:
        with get_db_connection() as conn:
            row = conn.execute(
                "SELECT coalesce(data_json, data) AS data_str FROM jobs WHERE job_id = ?",
                (job_id,),
            ).fetchone()
            if not row or not row["data_str"]:
                return None
            try:
                return JobRecord.model_validate_json(row["data_str"])
            except Exception as exc:
                logger.error(f"Failed to deserialize job {job_id}: {exc}")
                return None

    @staticmethod
    def delete(job_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
            return cursor.rowcount > 0

    @staticmethod
    def count_active_jobs() -> int:
        placeholders = ",".join("?" for _ in NON_TERMINAL_STATES)
        with get_db_connection() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS active_count FROM jobs WHERE state IN ({placeholders})",
                list(NON_TERMINAL_STATES),
            ).fetchone()
            return int(row["active_count"]) if row else 0

    @staticmethod
    def get_interrupted_jobs() -> List[JobRecord]:
        placeholders = ",".join("?" for _ in NON_TERMINAL_STATES)
        with get_db_connection() as conn:
            rows = conn.execute(
                f"SELECT coalesce(data_json, data) AS data_str FROM jobs WHERE state IN ({placeholders}) ORDER BY created_at ASC",
                list(NON_TERMINAL_STATES),
            ).fetchall()
            jobs = []
            for row in rows:
                try:
                    if row["data_str"]:
                        jobs.append(JobRecord.model_validate_json(row["data_str"]))
                except Exception as exc:
                    logger.error(f"Failed to deserialize interrupted job: {exc}")
            return jobs

    @staticmethod
    def list_recent(limit: int = 50, offset: int = 0) -> List[JobRecord]:
        with get_db_connection() as conn:
            rows = conn.execute(
                "SELECT coalesce(data_json, data) AS data_str FROM jobs ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            jobs = []
            for row in rows:
                try:
                    if row["data_str"]:
                        jobs.append(JobRecord.model_validate_json(row["data_str"]))
                except Exception as exc:
                    logger.error(f"Failed to deserialize job: {exc}")
            return jobs


class AssetRepository:
    """
    Repository for tracked media assets (photos, voices, music, clips).
    """

    @staticmethod
    def save(
        asset_id: str,
        kind: str,
        filename: Optional[str],
        path: str,
        size_bytes: int,
        sha256: str,
        duration_seconds: Optional[float] = None,
        session_id: Optional[str] = None,
    ) -> AssetEntity:
        now_iso = utcnow().isoformat()
        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO assets (asset_id, kind, filename, path, size_bytes, sha256, duration_seconds, created_at, session_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(asset_id) DO UPDATE SET
                    kind = excluded.kind,
                    filename = excluded.filename,
                    path = excluded.path,
                    size_bytes = excluded.size_bytes,
                    sha256 = excluded.sha256,
                    duration_seconds = excluded.duration_seconds,
                    session_id = coalesce(excluded.session_id, assets.session_id)
                """,
                (
                    asset_id,
                    kind,
                    filename,
                    path,
                    size_bytes,
                    sha256,
                    duration_seconds,
                    now_iso,
                    session_id,
                ),
            )
        return AssetEntity(
            asset_id=asset_id,
            kind=kind,
            filename=filename,
            path=path,
            size_bytes=size_bytes,
            sha256=sha256,
            duration_seconds=duration_seconds,
            created_at=now_iso,
            session_id=session_id,
        )

    @staticmethod
    def get(asset_id: str) -> Optional[AssetEntity]:
        with get_db_connection() as conn:
            row = conn.execute(
                "SELECT * FROM assets WHERE asset_id = ?",
                (asset_id,),
            ).fetchone()
            if not row:
                return None
            keys = row.keys()
            sess_val = row["session_id"] if "session_id" in keys else None
            return AssetEntity(
                asset_id=row["asset_id"],
                kind=row["kind"],
                filename=row["filename"],
                path=row["path"],
                size_bytes=row["size_bytes"],
                sha256=row["sha256"],
                duration_seconds=row["duration_seconds"],
                created_at=row["created_at"],
                session_id=sess_val,
            )

    @staticmethod
    def delete(asset_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.execute("DELETE FROM assets WHERE asset_id = ?", (asset_id,))
            return cursor.rowcount > 0

    @staticmethod
    def list_all(kind: Optional[str] = None, limit: int = 100) -> List[AssetEntity]:
        with get_db_connection() as conn:
            if kind:
                rows = conn.execute(
                    "SELECT * FROM assets WHERE kind = ? ORDER BY created_at DESC LIMIT ?",
                    (kind, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM assets ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()

            return [
                AssetEntity(
                    asset_id=r["asset_id"],
                    kind=r["kind"],
                    filename=r["filename"],
                    path=r["path"],
                    size_bytes=r["size_bytes"],
                    sha256=r["sha256"],
                    duration_seconds=r["duration_seconds"],
                    created_at=r["created_at"],
                )
                for r in rows
            ]


class ConsentRepository:
    """
    Repository for compliance and deepfake consent records.
    """

    @staticmethod
    def record_consent(
        job_id: str,
        authorized: bool,
        statement: str = "",
        clips_rights_attested: bool = False,
        ai_generated_accepted: bool = False,
        ai_label_accepted: bool = False,
    ) -> int:
        now_iso = utcnow().isoformat()
        with get_db_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO consents (
                    job_id, authorized, statement, clips_rights_attested,
                    ai_generated_accepted, ai_label_accepted, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    1 if authorized else 0,
                    statement,
                    1 if clips_rights_attested else 0,
                    1 if ai_generated_accepted else 0,
                    1 if ai_label_accepted else 0,
                    now_iso,
                ),
            )
            return cursor.lastrowid or 0

    @staticmethod
    def get_by_job_id(job_id: str) -> Optional[ConsentEntity]:
        with get_db_connection() as conn:
            row = conn.execute(
                "SELECT * FROM consents WHERE job_id = ? ORDER BY id DESC LIMIT 1",
                (job_id,),
            ).fetchone()
            if not row:
                return None
            return ConsentEntity(
                id=row["id"],
                job_id=row["job_id"],
                authorized=bool(row["authorized"]),
                statement=row["statement"],
                clips_rights_attested=bool(row["clips_rights_attested"]),
                ai_generated_accepted=bool(row["ai_generated_accepted"]),
                ai_label_accepted=bool(row["ai_label_accepted"]),
                created_at=row["created_at"],
            )


class AuditRepository:
    """
    Repository for security and compliance audit logging.
    """

    @staticmethod
    def log(
        action: str,
        resource_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        details: Optional[str] = None,
    ) -> int:
        now_iso = utcnow().isoformat()
        with get_db_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO audit_logs (action, resource_id, client_ip, details, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (action, resource_id, client_ip, details, now_iso),
            )
            return cursor.lastrowid or 0

    @staticmethod
    def list_recent(limit: int = 50) -> List[AuditLogEntity]:
        with get_db_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [
                AuditLogEntity(
                    id=r["id"],
                    action=r["action"],
                    resource_id=r["resource_id"],
                    client_ip=r["client_ip"],
                    details=r["details"],
                    created_at=r["created_at"],
                )
                for r in rows
            ]
