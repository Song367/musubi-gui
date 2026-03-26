from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_project_and_wan_task_routes(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)

    # Create project
    create_response = client.post(
        "/api/projects",
        json={
            "name": "demo",
            "project_type": "wan22",
            "musubi_tuner_path": "python",
            "python_bin": "python",
        },
    )
    assert create_response.status_code == 201
    project_id = create_response.json()["id"]

    # Save state
    save_response = client.put(
        f"/api/projects/{project_id}/state",
        json={
            "wan22": {
                "model": {"dit_path": "/models/dit.safetensors"},
                "dataset": {"video_dirs": ["/data/videos"]},
                "training": {"gpu_index": "0"},
                "ui": {},
            },
        },
    )
    assert save_response.status_code == 200
    assert save_response.json()["wan22"]["training"]["gpu_index"] == "0"

    # Generate video dataset config
    video_dir = tmp_path / "videos"
    video_dir.mkdir()
    dataset_response = client.post(
        f"/api/projects/{project_id}/dataset-config/video",
        json={
            "video_dirs": [str(video_dir)],
            "resolution": [832, 480],
            "batch_size": 1,
            "target_frames": 81,
            "frame_extraction": "head",
            "fps": 16,
        },
    )
    assert dataset_response.status_code == 200
    dataset_payload = dataset_response.json()
    assert "video_directory" in dataset_payload["content"]
    assert "target_frames" in dataset_payload["content"]

    # Cache latents (Wan endpoint)
    latent_response = client.post(
        f"/api/projects/{project_id}/wan/prepare/latents",
        json={
            "vae_path": "/models/vae.safetensors",
            "i2v": True,
            "vae_cache_cpu": False,
        },
    )
    assert latent_response.status_code == 201
    assert latent_response.json()["task_type"] == "wan_cache_latents"

    # Cache text encoder (Wan endpoint)
    te_response = client.post(
        f"/api/projects/{project_id}/wan/prepare/text-encoder",
        json={
            "t5_path": "/models/t5.pth",
            "batch_size": 8,
        },
    )
    assert te_response.status_code == 201
    assert te_response.json()["task_type"] == "wan_cache_text_encoder"

    # Train (Wan endpoint)
    train_response = client.post(
        f"/api/projects/{project_id}/wan/train",
        json={
            "task": "i2v-A14B",
            "dit_path": "/models/dit_low.safetensors",
            "dit_high_noise_path": "/models/dit_high.safetensors",
            "vae_path": "/models/vae.safetensors",
            "t5_path": "/models/t5.pth",
            "output_dir": "/outputs",
            "output_name": "demo",
        },
    )
    assert train_response.status_code == 201
    assert train_response.json()["task_type"] == "wan_train_lora"


def test_list_projects_skips_legacy_project_files(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)

    valid_response = client.post(
        "/api/projects",
        json={
            "name": "valid-zimage",
            "project_type": "zimage",
            "musubi_tuner_path": "/srv/musubi",
            "python_bin": "/srv/python",
        },
    )
    assert valid_response.status_code == 201
    valid_project = valid_response.json()

    legacy_dir = tmp_path / "projects" / "legacy12345678"
    legacy_dir.mkdir(parents=True)
    (legacy_dir / "project.json").write_text(
        '{"id":"legacy12345678","name":"legacy","musubi_tuner_path":"/old","python_bin":"/old/python","workspace_root":"/tmp/legacy"}',
        encoding="utf-8",
    )

    response = client.get("/api/projects")

    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [valid_project["id"]]


def test_zimage_task_launch_injects_musubi_src_into_pythonpath(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)

    create_response = client.post(
        "/api/projects",
        json={
            "name": "zimage-demo",
            "project_type": "zimage",
            "musubi_tuner_path": "/musubi-tuner",
            "python_bin": "/usr/local/bin/python",
        },
    )
    assert create_response.status_code == 201
    project = create_response.json()
    project_id = project["id"]

    dataset_config = Path(project["workspace_root"]) / "dataset_config.toml"
    dataset_config.write_text("[general]\nresolution = [1024, 1024]\n", encoding="utf-8")

    captured = {}

    def fake_launch_task(command, log_path, metadata_dir, project_id, task_type, extra_env=None):
        captured["command"] = command
        captured["project_id"] = project_id
        captured["task_type"] = task_type
        captured["extra_env"] = extra_env or {}
        return {
            "id": "task123",
            "project_id": project_id,
            "task_type": task_type,
            "status": "running",
            "command": command,
            "log_path": str(log_path),
            "pid": 1234,
        }

    monkeypatch.setattr("app.api.tasks.launch_task", fake_launch_task)

    response = client.post(
        f"/api/projects/{project_id}/zimage/prepare/latents",
        json={
            "vae_path": "/models/ae.safetensors",
            "gpu_index": "3",
        },
    )

    assert response.status_code == 201
    assert captured["task_type"] == "zimage_cache_latents"
    assert captured["extra_env"]["CUDA_VISIBLE_DEVICES"] == "3"
    assert captured["extra_env"]["PYTHONPATH"] == "/musubi-tuner/src"
