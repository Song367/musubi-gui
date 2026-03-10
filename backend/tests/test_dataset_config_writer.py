from pathlib import Path

from app.services.dataset_config_writer import render_dataset_config


def test_render_dataset_config_contains_image_dir():
    text = render_dataset_config(
        image_dir="/data/project/training",
        resolution=(1024, 1024),
        batch_size=1,
    )

    assert "/data/project/training" in text
    assert "resolution" in text
    assert "batch_size = 1" in text
    assert "image_directory = \"/data/project/training\"" in text
    assert "subsets" not in text
