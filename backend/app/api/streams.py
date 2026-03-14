from __future__ import annotations

from pathlib import Path
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import get_tasks_root
from app.runners.task_runner import refresh_task_status
from app.services.task_store import TaskStore
from app.api.tasks import read_log_text

router = APIRouter(tags=["streams"])


def sse_message(content: str) -> str:
    lines = content.splitlines() or [""]
    return "".join(f"data: {line}\n" for line in lines) + "\n"


@router.get("/api/tasks/{task_id}/stream")
def stream_logs(task_id: str):
    store = TaskStore(get_tasks_root())
    metadata_dir = store.task_dir(task_id)
    if not metadata_dir.exists():
        raise HTTPException(status_code=404, detail='Task not found')
    task = store.load(task_id)
    path = Path(task.log_path)

    def iterator():
        emitted = ''
        while True:
            content = read_log_text(path)
            if content != emitted:
                chunk = content[len(emitted):] if content.startswith(emitted) else content
                emitted = content
                yield sse_message(chunk)

            task_state = refresh_task_status(metadata_dir)
            if task_state.status != 'running' and content == emitted:
                break
            time.sleep(0.05)

    return StreamingResponse(iterator(), media_type='text/event-stream')
