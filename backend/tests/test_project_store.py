from pathlib import Path

from app.services.project_store import ProjectStore


def test_create_and_reload_project(tmp_path):
    store = ProjectStore(tmp_path)

    project = store.create_project(
        name="demo",
        musubi_tuner_path="/srv/musubi-tuner",
        python_bin="/srv/venv/bin/python",
    )

    loaded = store.get_project(project.id)
    assert loaded.name == "demo"
    assert loaded.musubi_tuner_path == "/srv/musubi-tuner"
    assert loaded.model.output_dir == str(Path(loaded.workspace_root) / "outputs")
    assert loaded.ui.dit_target_dir == str(Path(loaded.workspace_root) / "models")
    assert loaded.ui.vae_target_dir == str(Path(loaded.workspace_root) / "models")
    assert loaded.ui.text_encoder_target_dir == str(Path(loaded.workspace_root) / "models")


def test_update_project_state_persists_nested_fields(tmp_path):
    store = ProjectStore(tmp_path)
    project = store.create_project(
        name="demo",
        musubi_tuner_path="/srv/musubi-tuner",
        python_bin="/srv/venv/bin/python",
    )

    updated = store.update_project_state(
        project.id,
        {
            "model": {"dit_path": "/models/dit.safetensors", "output_name": "run-a"},
            "dataset": {"image_dir": "/data/images", "batch_size": 2},
            "training": {"mode": "full_finetune", "seed": 123, "gpu_index": "1"},
            "ui": {"hardware_preset": "h100"},
        },
    )

    assert updated.model.dit_path == "/models/dit.safetensors"
    assert updated.dataset.batch_size == 2
    assert updated.training.gpu_index == "1"
    assert updated.ui.hardware_preset == "h100"
