from pathlib import Path


def test_backend_entrypoint_exists():
    assert Path("backend/app/main.py").exists() or Path("app/main.py").exists()
