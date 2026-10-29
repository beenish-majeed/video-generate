from pathlib import Path
import yaml
import pytest


def test_root_license_file_exists():
    license_file = Path("LICENSE")
    assert license_file.exists(), "Root LICENSE file must exist"
    text = license_file.read_text(encoding="utf-8")
    assert "GNU GENERAL PUBLIC LICENSE" in text
    assert "Wav2Lip" in text
    assert "InsightFace" in text


def test_github_actions_ci_workflow_valid():
    ci_file = Path(".github/workflows/ci.yml")
    assert ci_file.exists(), "CI workflow file .github/workflows/ci.yml must exist"
    content = ci_file.read_text(encoding="utf-8")
    data = yaml.safe_load(content)
    assert "jobs" in data
    assert "backend-test" in data["jobs"]
    assert "frontend-check" in data["jobs"]


def test_readme_documents_onedrive_and_voice_cloning():
    readme = Path("README.md").read_text(encoding="utf-8")
    assert "OneDrive" in readme
    assert "Voice Synthesis vs. Voice Cloning" in readme
