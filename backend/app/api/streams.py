from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import get_tasks_root
from app.services.task_store import TaskStore

router = APIRouter(tags=["streams"])


@router.get("/api/tasks/{task_id}/stream")
def stream_logs(task_id: str):
    task = TaskStore(get_tasks_root()).load(task_id)
    path = Path(task.log_path)

    def iterator():
        content = path.read_text(encoding='utf-8') if path.exists() else ''
        yield f"data: {content}\n\n"

    return StreamingResponse(iterator(), media_type='text/event-stream')
