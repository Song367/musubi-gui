import time
import uuid

from fastapi.testclient import TestClient

from app.config import get_logs_root, get_tasks_root
from app.main import app
from app.runners.task_runner import launch_callable_task


def test_stream_endpoint_is_registered():
    paths = {route.path for route in app.routes}
    assert "/api/tasks/{task_id}/stream" in paths


def test_stream_endpoint_tails_task_log(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSUBI_UI_DATA_ROOT", str(tmp_path))
    client = TestClient(app)

    task_id = uuid.uuid4().hex[:12]

    def writer(handle):
        handle.write("line 1\n")
        handle.flush()
        time.sleep(0.1)
        handle.write("line 2\n")
        handle.flush()
        return {"ok": True}

    launch_callable_task(
        task_id=task_id,
        project_id="project-1",
        task_type="download_model",
        log_path=get_logs_root() / f"{task_id}.log",
        metadata_dir=get_tasks_root() / task_id,
        command=["internal:test-stream"],
        target=writer,
    )

    with client.stream("GET", f"/api/tasks/{task_id}/stream") as response:
        body = "".join(chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk for chunk in response.iter_text())

    assert response.status_code == 200
    assert "line 1" in body
    assert "line 2" in body
