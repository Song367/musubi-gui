from __future__ import annotations

import os
import signal
import subprocess
import threading
import traceback
from pathlib import Path
from typing import Any, Callable, TextIO

from app.models.task import TaskRecord
from app.services.task_store import TaskStore

RUNNING_PROCESSES: dict[str, subprocess.Popen] = {}
RUNNING_THREADS: dict[str, threading.Thread] = {}


CallableTask = Callable[[TextIO], dict[str, Any] | None]


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


def launch_callable_task(
    *,
    task_id: str,
    project_id: str,
    task_type: str,
    log_path: Path,
    metadata_dir: Path,
    command: list[str],
    target: CallableTask,
) -> TaskRecord:
    metadata_dir.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    store = TaskStore(metadata_dir.parent)
    task = TaskRecord(
        id=task_id,
        project_id=project_id,
        task_type=task_type,
        status='running',
        command=command,
        log_path=str(log_path),
    )
    store.save(task)

    def runner() -> None:
        with log_path.open('w', encoding='utf-8') as handle:
            try:
                result = target(handle)
                handle.write('Task succeeded.\n')
                handle.flush()
                completed = store.load(task_id)
                completed.status = 'succeeded'
                completed.exit_code = 0
                completed.result = result
                completed.error_message = None
                store.save(completed)
            except Exception as exc:  # pragma: no cover - defensive path exercised in later tests
                handle.write(f'Task failed: {exc}\n')
                handle.write(traceback.format_exc())
                handle.flush()
                failed = store.load(task_id)
                failed.status = 'failed'
                failed.exit_code = 1
                failed.error_message = str(exc)
                store.save(failed)
            finally:
                RUNNING_THREADS.pop(task_id, None)

    thread = threading.Thread(target=runner, name=f'task-{task_id}', daemon=True)
    RUNNING_THREADS[task_id] = thread
    thread.start()
    return task


def refresh_task_status(metadata_dir: Path) -> TaskRecord:
    store = TaskStore(metadata_dir.parent)
    task = store.load(metadata_dir.name)
    process = RUNNING_PROCESSES.get(task.id)
    if process is not None:
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

    thread = RUNNING_THREADS.get(task.id)
    if thread is not None and thread.is_alive():
        return task
    if thread is not None and not thread.is_alive():
        RUNNING_THREADS.pop(task.id, None)
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
    RUNNING_THREADS.pop(task.id, None)
    return task
