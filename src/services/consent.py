from pathlib import Path
from uuid import uuid4

from src.models.schemas import ConsentRecord, ConsentRequest
from src.utils.hash import sha256_file


def verify_consent(
    consent: ConsentRequest,
    photo_path: Path,
    voice_path: Path,
    job_id: str,
    is_preset_path: bool = False,
) -> ConsentRecord:
    if not consent.authorized:
        raise ValueError("Authorization is required before generation.")

    use_ai_consent = is_preset_path or bool(consent.ai_generated_accepted or consent.ai_label_accepted)

    if not use_ai_consent:
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

    return ConsentRecord(
        consent_id=f"consent_{uuid4().hex[:12]}",
        job_id=job_id,
        authorized=True,
        statement=consent.statement,
        photo_sha256=sha256_file(photo_path),
        voice_sha256=sha256_file(voice_path),
    )