from pathlib import Path

from app.services.project_store import ProjectStore


def test_create_and_reload_project(tmp_path):
    store = ProjectStore(tmp_path)

    project = store.create_project(
        name="demo",
        project_type="wan22",
        musubi_tuner_path="/srv/musubi-tuner",
        python_bin="/srv/venv/bin/python",
    )

    loaded = store.get_project(project.id)
    assert loaded.name == "demo"
    assert loaded.project_type == "wan22"
    assert loaded.musubi_tuner_path == "/srv/musubi-tuner"
    assert loaded.wan22.model["output_dir"] == str(Path(loaded.workspace_root) / "outputs")
    assert loaded.wan22.ui["dit_target_dir"] == str(Path(loaded.workspace_root) / "models")
    assert loaded.zimage.model == {}


def test_update_project_state_persists_type_specific_fields(tmp_path):
    store = ProjectStore(tmp_path)
    project = store.create_project(
        name="demo",
        project_type="zimage",
        musubi_tuner_path="/srv/musubi-tuner",
        python_bin="/srv/venv/bin/python",
    )

    updated = store.update_project_state(
        project.id,
        {
            "zimage": {
                "model": {"dit_path": "/models/dit.safetensors", "output_name": "run-a"},
                "dataset": {
                    "image_dir": "/workspace/merged_dataset",
                    "image_dirs": ["/data/images-a", "/data/images-b"],
                    "batch_size": 2,
                },
                "training": {"mode": "full_finetune", "seed": 123, "gpu_index": "1"},
                "ui": {"hardware_preset": "h100"},
            },
        },
    )

    assert updated.zimage.model["dit_path"] == "/models/dit.safetensors"
    assert updated.zimage.dataset["image_dir"] == "/workspace/merged_dataset"
    assert updated.zimage.dataset["image_dirs"] == ["/data/images-a", "/data/images-b"]
    assert updated.zimage.dataset["batch_size"] == 2
    assert updated.zimage.training["gpu_index"] == "1"
    assert updated.zimage.ui["hardware_preset"] == "h100"
    assert updated.wan22.model == {}
