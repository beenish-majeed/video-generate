from pathlib import Path
from typing import Optional
from uuid import uuid4

from src.models.schemas import ConsentRecord, ConsentRequest
from src.utils.hash import sha256_file


def verify_consent(
    consent: ConsentRequest,
    photo_path: Optional[Path] = None,
    voice_path: Optional[Path] = None,
    job_id: str = "",
    is_preset_path: bool = False,
    clip_paths: Optional[list[Path]] = None,
) -> ConsentRecord:
    if not consent.authorized:
        raise ValueError("Authorization is required before generation.")

    is_clips_mode = bool(clip_paths)
    use_ai_consent = is_preset_path or is_clips_mode or bool(consent.ai_generated_accepted or consent.ai_label_accepted)

    if is_clips_mode:
        if not consent.clips_rights_attested:
            raise ValueError("Confirmation of clip rights is required for uploaded clips.")
        if not (consent.ai_generated_accepted or consent.ai_label_accepted):
            raise ValueError("Confirmation of AI-generated content acceptance is required.")

        statement = consent.statement.strip().lower()
        if len(statement) < 20:
            raise ValueError("Consent statement is too short.")

        allowed_tokens = [
            "own",
            "permission",
            "authorize",
            "authorized",
            "consent",
            "have the right",
            "ai-generated",
            "ai generated",
            "label",
            "synthetic",
            "generated",
            "acknowledge",
            "accept",
            "clips",
            "clip",
        ]
        if not any(token in statement for token in allowed_tokens):
            raise ValueError("Consent statement must confirm ownership, clip rights, or AI-generated content acceptance.")

    elif not use_ai_consent:
        if not consent.face_rights_attested:
            raise ValueError("Face rights attestation is required.")

        if not consent.voice_rights_attested:
            raise ValueError("Voice rights attestation is required.")

        statement = consent.statement.strip().lower()

        if len(statement) < 20:
            raise ValueError("Consent statement is too short.")

        allowed_tokens = [
            "own",
            "permission",
            "authorize",
            "authorized",
            "consent",
            "have the right",
        ]

        if not any(token in statement for token in allowed_tokens):
            raise ValueError(
                "Consent statement must confirm ownership or explicit permission."
            )
    else:
        # Prompt path / AI path: accepts AI-generated content & label
        if not (consent.ai_generated_accepted or consent.ai_label_accepted):
            raise ValueError(
                "Acceptance that the video is AI-generated and carries the AI label is required."
            )

        statement = consent.statement.strip().lower()

        if len(statement) < 20:
            raise ValueError("Consent statement is too short.")

        allowed_tokens = [
            "ai-generated",
            "ai generated",
            "ai label",
            "label",
            "synthetic",
            "generated",
            "acknowledge",
            "accept",
            "consent",
            "authorize",
        ]

        if not any(token in statement for token in allowed_tokens):
            raise ValueError(
                "Consent statement must confirm acceptance of AI-generated content or label."
            )

    photo_hash = sha256_file(photo_path) if photo_path and Path(photo_path).exists() else "none"
    voice_hash = sha256_file(voice_path) if voice_path and Path(voice_path).exists() else "none"
    clips_hashes = [sha256_file(p) for p in clip_paths] if clip_paths else []

    return ConsentRecord(
        consent_id=f"consent_{uuid4().hex}",
        job_id=job_id,
        authorized=True,
        consent_version=getattr(consent, "consent_version", "v1.0") or "v1.0",
        photo_sha256=photo_hash,
        voice_sha256=voice_hash,
        clips_sha256=clips_hashes,
    )
