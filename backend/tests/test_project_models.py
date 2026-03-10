from app.models.project import ProjectConfig


def test_project_config_requires_paths():
    config = ProjectConfig(
        name="demo",
        musubi_tuner_path="/srv/musubi-tuner",
        python_bin="/srv/musubi-tuner/.venv/bin/python",
        workspace_root="/srv/musubi-tuner-ui/backend/data/projects/demo",
    )

    assert config.name == "demo"
    assert config.training.mode == "lora"
