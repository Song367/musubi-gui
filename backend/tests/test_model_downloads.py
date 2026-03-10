from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_model_check_and_download(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)
    project = client.post(
        "/api/projects",
        json={
            "name": "demo",
            "musubi_tuner_path": "/srv/musubi-tuner",
            "python_bin": "python",
        },
    ).json()

    check_response = client.post(
        f"/api/projects/{project['id']}/models/check",
        json={
            "dit_path": str(tmp_path / "missing-dit.safetensors"),
            "vae_path": str(tmp_path / "missing-vae.safetensors"),
            "text_encoder_path": str(tmp_path / "missing-te"),
        },
    )
    assert check_response.status_code == 200
    assert check_response.json()["dit_path"]["exists"] is False

    from app.api import models as models_api

    def fake_download(**kwargs):
        target = Path(kwargs["local_dir"]) / kwargs["filename"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("ok", encoding="utf-8")
        return str(target)

    monkeypatch.setattr(models_api, "download_file", fake_download)

    download_response = client.post(
        f"/api/projects/{project['id']}/models/download",
        json={
            "source_type": "official",
            "source_id": "zimage_base_official",
            "repo_id": "",
            "filename": "dit/model.safetensors",
            "target_dir": str(tmp_path / "downloads"),
        },
    )
    assert download_response.status_code == 200
    assert download_response.json()["saved_path"].endswith("dit/model.safetensors")
