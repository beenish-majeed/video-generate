from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class JobEntity:
    job_id: str
    state: str
    visual_mode: Optional[str]
    data_json: str
    created_at: str
    updated_at: str


@dataclass
class AssetEntity:
    asset_id: str
    kind: str
    filename: Optional[str]
    path: str
    size_bytes: int
    sha256: str
    duration_seconds: Optional[float]
    created_at: str


@dataclass
class ConsentEntity:
    id: Optional[int]
    job_id: str
    authorized: bool
    statement: str
    clips_rights_attested: bool
    ai_generated_accepted: bool
    ai_label_accepted: bool
    created_at: str


@dataclass
class AuditLogEntity:
    id: Optional[int]
    action: str
    resource_id: Optional[str]
    client_ip: Optional[str]
    details: Optional[str]
    created_at: str
