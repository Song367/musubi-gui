from __future__ import annotations

import os
import signal
import subprocess
from pathlib import Path

from app.models.task import TaskRecord
from app.services.task_store import TaskStore

RUNNING_PROCESSES: dict[str, subprocess.Popen] = {}


def launch_task(
    command: list[str],
    log_path: Path,
    metadata_dir: Path,
    project_id: str,
    task_type: str,
    extra_env: dict[str, str] | None = None,
) -> TaskRecord:
    metadata_dir.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    child_env = os.environ.copy()
    if extra_env:
        child_env.update(extra_env)
    with log_path.open('w', encoding='utf-8') as handle:
        process = subprocess.Popen(
            command,
            stdout=handle,
            stderr=subprocess.STDOUT,
            text=True,
            env=child_env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
        )
    task = TaskRecord(
        id=metadata_dir.name,
        project_id=project_id,
        task_type=task_type,
        status='running',
        command=command,
        log_path=str(log_path),
        pid=process.pid,
    )
    RUNNING_PROCESSES[task.id] = process
    TaskStore(metadata_dir.parent).save(task)
    return task


def refresh_task_status(metadata_dir: Path) -> TaskRecord:
    store = TaskStore(metadata_dir.parent)
    task = store.load(metadata_dir.name)
    process = RUNNING_PROCESSES.get(task.id)
    if process is None:
        return task

    exit_code = process.poll()
    if exit_code is None:
        try:
            exit_code = process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            return task

    task.exit_code = exit_code
    task.status = 'succeeded' if exit_code == 0 else 'failed'
    store.save(task)
    RUNNING_PROCESSES.pop(task.id, None)
    return task


def stop_task(metadata_dir: Path) -> TaskRecord:
    store = TaskStore(metadata_dir.parent)
    task = store.load(metadata_dir.name)
    process = RUNNING_PROCESSES.get(task.id)
    if process is not None:
        try:
            process.terminate()
        except OSError:
            pass
    elif task.pid:
        try:
            os.kill(task.pid, signal.SIGTERM)
        except OSError:
            pass
    task.status = 'stopped'
    store.save(task)
    RUNNING_PROCESSES.pop(task.id, None)
    return task
