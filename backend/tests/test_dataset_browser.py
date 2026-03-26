from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def _write_dataset_sample(root: Path, stem: str, image_extension: str, caption: str) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / f"{stem}{image_extension}").write_bytes(b"fake-image")
    (root / f"{stem}.txt").write_text(caption, encoding="utf-8")


def test_lists_available_zimage_datasets_and_previews_samples(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("MUSUBI_UI_DATASETS_ROOT", str(tmp_path / "datasets"))
    client = TestClient(app)

    alpha_dir = tmp_path / "datasets" / "alpha"
    beta_dir = tmp_path / "datasets" / "beta"
    _write_dataset_sample(alpha_dir, "hero", ".png", "alpha prompt")
    _write_dataset_sample(beta_dir, "scene", ".jpg", "beta prompt")

    project = client.post(
        "/api/projects",
        json={
            "name": "zimage-datasets",
            "project_type": "zimage",
            "musubi_tuner_path": "/musubi-tuner",
            "python_bin": "/usr/local/bin/python",
        },
    ).json()

    list_response = client.get(f"/api/projects/{project['id']}/datasets")

    assert list_response.status_code == 200
    datasets = list_response.json()["datasets"]
    assert [item["name"] for item in datasets] == ["alpha", "beta"]
    assert datasets[0]["path"].endswith("/alpha")

    preview_response = client.get(f"/api/projects/{project['id']}/datasets/alpha/samples")

    assert preview_response.status_code == 200
    payload = preview_response.json()
    assert payload["dataset"]["name"] == "alpha"
    assert payload["samples"][0]["name"] == "hero"
    assert payload["samples"][0]["caption"] == "alpha prompt"
    assert payload["samples"][0]["image_url"].endswith("/api/projects/" + project["id"] + "/datasets/alpha/files/hero.png")


def test_returns_merged_dataset_preview_after_config_generation(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("MUSUBI_UI_DATASETS_ROOT", str(tmp_path / "datasets"))
    client = TestClient(app)

    alpha_dir = tmp_path / "datasets" / "alpha"
    beta_dir = tmp_path / "datasets" / "beta"
    _write_dataset_sample(alpha_dir, "hero", ".png", "alpha prompt")
    _write_dataset_sample(beta_dir, "scene", ".jpg", "beta prompt")

    project = client.post(
        "/api/projects",
        json={
            "name": "zimage-merged",
            "project_type": "zimage",
            "musubi_tuner_path": "/musubi-tuner",
            "python_bin": "/usr/local/bin/python",
        },
    ).json()

    generate_response = client.post(
        f"/api/projects/{project['id']}/dataset-config",
        json={
            "image_dirs": [str(alpha_dir), str(beta_dir)],
            "resolution": [1024, 1024],
            "batch_size": 1,
        },
    )

    assert generate_response.status_code == 200

    merged_response = client.get(f"/api/projects/{project['id']}/datasets/merged/samples")

    assert merged_response.status_code == 200
    merged = merged_response.json()
    assert merged["dataset"]["name"] == "merged"
    assert len(merged["samples"]) == 2
    assert merged["samples"][0]["source_dataset"] in {"alpha", "beta"}
    assert merged["samples"][0]["caption"] in {"alpha prompt", "beta prompt"}


def test_serves_preview_image_files_from_dataset_roots(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("MUSUBI_UI_DATASETS_ROOT", str(tmp_path / "datasets"))
    client = TestClient(app)

    alpha_dir = tmp_path / "datasets" / "alpha"
    alpha_dir.mkdir(parents=True, exist_ok=True)
    image_path = alpha_dir / "hero.png"
    image_path.write_bytes(b"\x89PNG\r\n\x1a\nsample")
    (alpha_dir / "hero.txt").write_text("alpha prompt", encoding="utf-8")

    project = client.post(
        "/api/projects",
        json={
            "name": "zimage-image",
            "project_type": "zimage",
            "musubi_tuner_path": "/musubi-tuner",
            "python_bin": "/usr/local/bin/python",
        },
    ).json()

    response = client.get(f"/api/projects/{project['id']}/datasets/alpha/files/hero.png")

    assert response.status_code == 200
    assert response.content.startswith(b"\x89PNG")
