from __future__ import annotations

import json
from pathlib import Path

from app.models.task import TaskRecord


class TaskStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, task: TaskRecord) -> TaskRecord:
        task_dir = self.root / task.id
        task_dir.mkdir(parents=True, exist_ok=True)
        (task_dir / 'task.json').write_text(task.model_dump_json(indent=2), encoding='utf-8')
        return task

    def load(self, task_id: str) -> TaskRecord:
        task_file = self.root / task_id / 'task.json'
        data = json.loads(task_file.read_text(encoding='utf-8'))
        return TaskRecord.model_validate(data)

    def task_dir(self, task_id: str) -> Path:
        return self.root / task_id
