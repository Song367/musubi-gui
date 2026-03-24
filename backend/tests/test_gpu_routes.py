from fastapi.testclient import TestClient

from app.main import app


def test_gpu_route_returns_gpu_entries(monkeypatch):
    from app.api import system as system_api

    monkeypatch.setattr(
        system_api,
        "list_gpus",
        lambda: [
            {"index": 0, "name": "RTX 3090", "memory_used_mb": 4096, "memory_total_mb": 24576, "utilization_gpu": 12},
            {"index": 1, "name": "RTX 3090", "memory_used_mb": 8192, "memory_total_mb": 24576, "utilization_gpu": 67},
        ],
    )

    client = TestClient(app)
    response = client.get("/api/system/gpus")

    assert response.status_code == 200
    assert response.json()[0]["index"] == 0
    assert response.json()[1]["name"] == "RTX 3090"


def test_model_sources_route_returns_wan22_sources():
    client = TestClient(app)
    response = client.get("/api/models/sources")

    assert response.status_code == 200
    names = {item["id"] for item in response.json()}
    assert "wan22_dit_lownoise_i2v" in names
    assert "wan22_dit_highnoise_i2v" in names
    assert "wan22_vae" in names
    assert "wan22_t5" in names
