from fastapi.testclient import TestClient

from app.main import app


def test_root_serves_redesigned_console_shell():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    assert "Training Workspace" in body
    assert "GPU Device" in body
    assert "Refresh GPUs" in body
    assert "Asset Downloads" in body
    assert "Apply Official Templates" in body
    assert "Download All Base Assets" in body
    assert "DiT Asset" in body
    assert "VAE Asset" in body
    assert "Text Encoder Asset" in body
    assert "Check Installed Paths" in body
    assert "Download DiT" in body
    assert "Download VAE" in body
    assert "Download Text Encoder" in body
    assert "RTX 3090 (24GB)" in body
    assert "H100 (80GB)" in body
    assert 'type="checkbox"' in body


def test_frontend_supports_multiple_dataset_directories():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    assert "Add Dataset" in body
    assert "dataset-dir-list" in body

