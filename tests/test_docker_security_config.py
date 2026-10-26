from pathlib import Path


def test_dockerignore_excludes_secrets_models_and_storage():
    dockerignore = Path(".dockerignore")
    assert dockerignore.exists(), ".dockerignore file must exist"
    content = dockerignore.read_text(encoding="utf-8")
    lines = [l.strip() for l in content.splitlines() if l.strip() and not l.startswith("#")]

    required_exclusions = [
        ".env",
        ".git",
        "storage",
        "models",
        "node_modules",
        "dist",
        "scratch",
        "screenshots",
        "tests",
    ]
    for required in required_exclusions:
        assert any(
            required in line for line in lines
        ), f".dockerignore must exclude '{required}'"


def test_dockerfile_runs_as_non_root():
    dockerfile = Path("Dockerfile")
    assert dockerfile.exists(), "Dockerfile must exist"
    content = dockerfile.read_text(encoding="utf-8")

    assert "USER appuser" in content, "Dockerfile must switch to a non-root user"
    assert "addgroup" in content and "adduser" in content, "Dockerfile must create a dedicated non-root user and group"
    assert "chown -R appuser" in content, "Dockerfile must set ownership to the non-root user"


def test_docker_compose_binds_to_localhost_only():
    compose = Path("docker-compose.yml")
    assert compose.exists(), "docker-compose.yml must exist"
    content = compose.read_text(encoding="utf-8")

    assert "127.0.0.1:8000:8000" in content, "docker-compose.yml must bind port 8000 to 127.0.0.1"
    assert '"8000:8000"' not in content, "docker-compose.yml must not bind publicly to 0.0.0.0:8000"
