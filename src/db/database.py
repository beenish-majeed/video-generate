import sqlite3
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Generator
from src.core.config import settings

logger = logging.getLogger(__name__)


def get_db_path() -> Path:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings.db_path


_initialized_databases: set[str] = set()


@contextmanager
def get_db_connection(target_path: Optional[Path] = None) -> Generator[sqlite3.Connection, None, None]:
    """
    Context manager providing a thread-safe, WAL-enabled SQLite connection.
    Enforces foreign keys, busy timeout, automatic schema init, and automatic commit/rollback.
    """
    db_path = target_path or get_db_path()
    path_key = str(db_path.resolve())

    # Ensure schema is initialized at least once per database file
    if path_key not in _initialized_databases:
        _init_schema_for_path(db_path)
        _initialized_databases.add(path_key)

    conn = sqlite3.connect(
        str(db_path),
        timeout=30.0,
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA busy_timeout=30000;")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_schema_for_path(db_path: Path) -> None:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=30.0)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        _execute_schema_ddl(conn)
        conn.commit()
    finally:
        conn.close()


def _execute_schema_ddl(conn: sqlite3.Connection) -> None:
    # 1. Jobs Table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            state TEXT NOT NULL,
            visual_mode TEXT,
            data TEXT,
            data_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at DESC);")

    # Column migrations if table pre-existed with older schema
    job_cols = {row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
    if "data_json" not in job_cols:
        conn.execute("ALTER TABLE jobs ADD COLUMN data_json TEXT;")
    if "data" not in job_cols:
        conn.execute("ALTER TABLE jobs ADD COLUMN data TEXT;")
    if "visual_mode" not in job_cols:
        conn.execute("ALTER TABLE jobs ADD COLUMN visual_mode TEXT;")

    # 2. Assets Table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS assets (
            asset_id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            filename TEXT,
            path TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            sha256 TEXT NOT NULL,
            duration_seconds REAL,
            created_at TEXT NOT NULL,
            session_id TEXT
        );
    """)
    asset_cols = {row[1] for row in conn.execute("PRAGMA table_info(assets)").fetchall()}
    if "session_id" not in asset_cols:
        conn.execute("ALTER TABLE assets ADD COLUMN session_id TEXT;")

    conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(created_at);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_session ON assets(session_id);")

    # 3. Consents Table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT,
            authorized INTEGER NOT NULL,
            statement TEXT NOT NULL,
            clips_rights_attested INTEGER DEFAULT 0,
            ai_generated_accepted INTEGER DEFAULT 0,
            ai_label_accepted INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
        );
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_consents_job ON consents(job_id);")

    # 4. Audit Log Table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            resource_id TEXT,
            client_ip TEXT,
            details TEXT,
            created_at TEXT NOT NULL
        );
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);")


def init_database(db_path: Optional[Path] = None) -> None:
    """
    Idempotent schema initialization for the Video Studio database.
    Creates tables and performance indexes for jobs, assets, consent records, and audit logs.
    """
    target = db_path or get_db_path()
    _init_schema_for_path(target)
    logger.info(f"Database initialized successfully at {target}")
