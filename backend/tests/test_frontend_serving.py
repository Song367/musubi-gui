from fastapi.testclient import TestClient

from app.main import app


def test_root_serves_wan22_console():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    assert "Wan 2.2" in body
    assert "DiT" in body or "dit" in body
    assert "VAE" in body or "vae" in body
    assert "T5" in body or "t5" in body
    assert "Cache Latents" in body
    assert "Start Training" in body


def test_frontend_supports_multiple_video_directories():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    assert "add-video-dir" in body
    assert "video-dir-list" in body
