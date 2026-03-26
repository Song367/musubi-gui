from app.models.project import ProjectConfig


def test_project_config_requires_project_type_and_isolated_sections():
    config = ProjectConfig(
        name="demo",
        project_type="zimage",
        musubi_tuner_path="/srv/musubi-tuner",
        python_bin="/srv/musubi-tuner/.venv/bin/python",
        workspace_root="/srv/musubi-tuner-ui/backend/data/projects/demo",
    )

    assert config.name == "demo"
    assert config.project_type == "zimage"
    assert config.wan22.model == {}
    assert config.zimage.training == {}
