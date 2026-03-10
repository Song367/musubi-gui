from __future__ import annotations

from pydantic import BaseModel


class TaskRecord(BaseModel):
    id: str
    project_id: str
    task_type: str
    status: str
    command: list[str]
    log_path: str
    pid: int | None = None
    exit_code: int | None = None
