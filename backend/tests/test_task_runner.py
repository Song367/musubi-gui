from pathlib import Path

from app.runners.task_runner import launch_task, refresh_task_status


def test_launch_task_writes_log_and_status(tmp_path):
    metadata_dir = tmp_path / "task"
    log_path = tmp_path / "run.log"

    task = launch_task(
        command=["python", "-c", "print('hello')"],
        log_path=log_path,
        metadata_dir=metadata_dir,
        project_id="demo",
        task_type="smoke",
    )
    task = refresh_task_status(metadata_dir)

    assert task.status == "succeeded"
    assert log_path.exists()
    assert "hello" in log_path.read_text(encoding="utf-8")


def test_launch_task_honors_custom_env(tmp_path):
    metadata_dir = tmp_path / "task_env"
    log_path = tmp_path / "env.log"

    task = launch_task(
        command=["python", "-c", "import os; print(os.environ.get('CUDA_VISIBLE_DEVICES', 'missing'))"],
        log_path=log_path,
        metadata_dir=metadata_dir,
        project_id="demo",
        task_type="env",
        extra_env={"CUDA_VISIBLE_DEVICES": "2"},
    )
    task = refresh_task_status(metadata_dir)

    assert task.status == "succeeded"
    assert "2" in log_path.read_text(encoding="utf-8")
