from pathlib import Path
import time

from fastapi.testclient import TestClient

from app.main import app


def wait_for_task(client: TestClient, task_id: str):
    final_task = None
    for _ in range(40):
        final_task = client.get(f"/api/tasks/{task_id}").json()
        if final_task["status"] != "running":
            return final_task
        time.sleep(0.05)
    return final_task


def test_model_check(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)
    project = client.post(
        "/api/projects",
        json={
            "name": "demo",
            "project_type": "wan22",
            "musubi_tuner_path": "/srv/musubi-tuner",
            "python_bin": "python",
        },
    ).json()

    check_response = client.post(
        f"/api/projects/{project['id']}/models/check",
        json={
            "dit_path": str(tmp_path / "missing-dit.safetensors"),
            "dit_high_noise_path": str(tmp_path / "missing-dit-high.safetensors"),
            "vae_path": str(tmp_path / "missing-vae.safetensors"),
            "t5_path": str(tmp_path / "missing-t5.pth"),
        },
    )
    assert check_response.status_code == 200
    data = check_response.json()
    assert data["dit_path"]["exists"] is False
    assert data["vae_path"]["exists"] is False
    assert data["t5_path"]["exists"] is False
    assert data["dit_high_noise_path"]["exists"] is False


def test_model_download(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)
    project = client.post(
        "/api/projects",
        json={
            "name": "demo",
            "project_type": "wan22",
            "musubi_tuner_path": "/srv/musubi-tuner",
            "python_bin": "python",
        },
    ).json()

    from app.api import models as models_api

    def fake_download(**kwargs):
        time.sleep(0.05)
        target = Path(kwargs["local_dir"]) / kwargs["filename"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("ok", encoding="utf-8")
        return str(target)

    monkeypatch.setattr(models_api, "download_file", fake_download)

    download_response = client.post(
        f"/api/projects/{project['id']}/models/download",
        json={
            "source_type": "official",
            "source_id": "wan22_dit_lownoise_i2v",
            "repo_id": "",
            "filename": "split_files/diffusion_models/wan2.2_i2v_low_noise_fp16.safetensors",
            "target_dir": str(tmp_path / "downloads"),
        },
    )
    assert download_response.status_code == 201
    task = download_response.json()
    assert task["task_type"] == "download_model"
    assert task["status"] == "running"

    final_task = wait_for_task(client, task["id"])
    assert final_task is not None
    assert final_task["status"] == "succeeded"
    logs = client.get(f"/api/tasks/{task['id']}/logs").json()
    assert "download started" in logs["content"].lower()


def test_download_all_runs_as_one_task(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)
    project = client.post(
        "/api/projects",
        json={
            "name": "demo",
            "project_type": "wan22",
            "musubi_tuner_path": "/srv/musubi-tuner",
            "python_bin": "python",
        },
    ).json()

    from app.api import models as models_api

    def fake_download(**kwargs):
        time.sleep(0.02)
        target = Path(kwargs["local_dir"]) / kwargs["filename"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(kwargs["repo_id"], encoding="utf-8")
        return str(target)

    monkeypatch.setattr(models_api, "download_file", fake_download)

    response = client.post(
        f"/api/projects/{project['id']}/models/download-all",
        json={
            "assets": {
                "dit_low": {
                    "source_type": "official",
                    "source_id": "wan22_dit_lownoise_i2v",
                    "repo_id": "",
                    "filename": "split_files/diffusion_models/wan2.2_i2v_low_noise_fp16.safetensors",
                    "target_dir": str(tmp_path / "downloads"),
                },
                "vae": {
                    "source_type": "official",
                    "source_id": "wan22_vae",
                    "repo_id": "",
                    "filename": "split_files/vae/wan_2.1_vae.safetensors",
                    "target_dir": str(tmp_path / "downloads"),
                },
                "t5": {
                    "source_type": "official",
                    "source_id": "wan22_t5",
                    "repo_id": "",
                    "filename": "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
                    "target_dir": str(tmp_path / "downloads"),
                },
            }
        },
    )
    assert response.status_code == 201
    task = response.json()
    assert task["task_type"] == "download_all_models"

    final_task = wait_for_task(client, task["id"])
    assert final_task is not None
    assert final_task["status"] == "succeeded"
    assert set(final_task["result"]["completed_assets"].keys()) == {"dit_low", "vae", "t5"}
    logs = client.get(f"/api/tasks/{task['id']}/logs").json()["content"].lower()
    assert "starting asset: dit_low" in logs
    assert "starting asset: vae" in logs
    assert "starting asset: t5" in logs
