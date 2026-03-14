from __future__ import annotations

from typing import Any

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
    result: dict[str, Any] | None = None
    error_message: str | None = None
