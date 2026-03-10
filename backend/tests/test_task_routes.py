from fastapi.testclient import TestClient

from app.main import app


def test_project_and_task_routes(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)

    create_response = client.post(
        "/api/projects",
        json={
            "name": "demo",
            "musubi_tuner_path": "/srv/musubi-tuner",
            "python_bin": "python",
        },
    )
    assert create_response.status_code == 201
    project_id = create_response.json()["id"]

    save_response = client.put(
        f"/api/projects/{project_id}/state",
        json={
            "model": {"dit_path": "/models/dit.safetensors"},
            "training": {"gpu_index": "0"},
            "ui": {"hardware_preset": "rtx3090"},
        },
    )
    assert save_response.status_code == 200
    assert save_response.json()["training"]["gpu_index"] == "0"

    dataset_response = client.post(
        f"/api/projects/{project_id}/dataset-config",
        json={
            "image_dir": "/data/images",
            "resolution": [1024, 1024],
            "batch_size": 1,
        },
    )
    assert dataset_response.status_code == 200

    latent_response = client.post(
        f"/api/projects/{project_id}/prepare/latents",
        json={
            "vae_path": "/models/vae.safetensors",
            "text_encoder_path": "/models/text_encoder",
            "gpu_index": "0",
        },
    )
    assert latent_response.status_code == 201
    assert latent_response.json()["task_type"] == "cache_latents"

    train_response = client.post(
        f"/api/projects/{project_id}/train",
        json={
            "mode": "full_finetune",
            "dit_path": "/models/dit.safetensors",
            "vae_path": "/models/vae.safetensors",
            "text_encoder_path": "/models/text_encoder",
            "output_dir": "/outputs",
            "output_name": "demo",
            "gpu_index": "0",
        },
    )
    assert train_response.status_code == 201
    assert train_response.json()["task_type"] == "train_full"
