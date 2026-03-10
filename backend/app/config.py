from __future__ import annotations

import os
from pathlib import Path


def get_data_root() -> Path:
    override = os.environ.get("MUSUBI_UI_DATA_ROOT")
    if override:
        return Path(override)
    return Path(__file__).resolve().parent.parent / "data"


def get_projects_root() -> Path:
    return get_data_root() / "projects"


def get_tasks_root() -> Path:
    return get_data_root() / "tasks"


def get_logs_root() -> Path:
    return get_data_root() / "logs"
