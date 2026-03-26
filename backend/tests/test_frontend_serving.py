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


def test_frontend_uses_detected_gpu_selector_markup():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    assert 'id="wan-gpu-mode"' in body
    assert 'id="wan-gpu-select"' in body
    assert 'id="wan-gpu-custom"' in body
    assert 'id="zi-gpu-mode"' in body
    assert 'id="zi-gpu-select"' in body
    assert 'id="zi-gpu-custom"' in body
    assert 'id="gpu-index"' not in body
    assert 'id="zi-gpu-index"' not in body


def test_frontend_uses_distinct_stop_buttons_for_wan_and_zimage():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    assert body.count('id="stop-task"') == 1
    assert 'id="zi-stop-task"' in body


def test_frontend_exposes_project_picker_and_type_selector():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    assert 'id="project-picker"' in body
    assert 'id="new-project-button"' in body
    assert 'id="project-type"' in body


def test_frontend_uses_compatible_zimage_text_encoder_default():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    assert "/models/zimage/split_files/text_encoders/qwen_3_4b.safetensors" in body
    assert "qwen_3_4b_fp8_mixed.safetensors" not in body
