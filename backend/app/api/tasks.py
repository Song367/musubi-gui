from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_logs_root, get_projects_root, get_tasks_root
from app.runners.task_runner import launch_task, refresh_task_status, stop_task
from app.services.command_builder import build_cache_command, build_train_command
from app.services.project_store import ProjectStore
from app.services.task_store import TaskStore

router = APIRouter(tags=["tasks"])


def read_log_text(path: Path) -> str:
    if not path.exists():
        return ""
    for encoding in ("utf-8", "cp936", "gbk", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


class PrepareRequest(BaseModel):
    vae_path: str
    text_encoder_path: str
    gpu_index: str = ''


class TrainRequest(BaseModel):
    mode: str
    dit_path: str
    vae_path: str
    text_encoder_path: str
    output_dir: str
    output_name: str
    mixed_precision: str = 'bf16'
    learning_rate: float = 1e-4
    optimizer_type: str = 'adamw8bit'
    lr_scheduler: str = 'constant_with_warmup'
    lr_warmup_steps: int = 10
    max_train_epochs: int = 16
    save_every_n_epochs: int = 1
    gradient_checkpointing: bool = True
    persistent_data_loader_workers: bool = True
    network_dim: int = 32
    network_alpha: int = 32
    fused_backward_pass: bool = False
    full_bf16: bool = False
    blocks_to_swap: int = 0
    sdpa: bool = False
    seed: int = 42
    gpu_index: str = ''


def _dataset_config_for(project_id: str):
    project = ProjectStore(get_projects_root()).get_project(project_id)
    dataset_config = Path(project.workspace_root) / 'dataset_config.toml'
    if not dataset_config.exists():
        raise HTTPException(status_code=400, detail='dataset_config.toml is required')
    return project, dataset_config


def _launch(project_id: str, task_type: str, command: list[str], gpu_index: str = ''):
    task_id = uuid.uuid4().hex[:12]
    metadata_dir = get_tasks_root() / task_id
    log_path = get_logs_root() / f'{task_id}.log'
    extra_env = {'CUDA_VISIBLE_DEVICES': gpu_index} if gpu_index else None
    return launch_task(command, log_path, metadata_dir, project_id=project_id, task_type=task_type, extra_env=extra_env)


@router.post("/api/projects/{project_id}/prepare/latents", status_code=201)
def prepare_latents(project_id: str, payload: PrepareRequest):
    project, dataset_config = _dataset_config_for(project_id)
    command = build_cache_command(
        cache_type='latents',
        python_bin=project.python_bin,
        musubi_tuner_path=project.musubi_tuner_path,
        dataset_config=str(dataset_config),
        vae_path=payload.vae_path,
        text_encoder_path=payload.text_encoder_path,
    )
    return _launch(project_id, 'cache_latents', command, gpu_index=payload.gpu_index)


@router.post("/api/projects/{project_id}/prepare/text-encoder", status_code=201)
def prepare_text_encoder(project_id: str, payload: PrepareRequest):
    project, dataset_config = _dataset_config_for(project_id)
    command = build_cache_command(
        cache_type='text_encoder',
        python_bin=project.python_bin,
        musubi_tuner_path=project.musubi_tuner_path,
        dataset_config=str(dataset_config),
        vae_path=payload.vae_path,
        text_encoder_path=payload.text_encoder_path,
    )
    return _launch(project_id, 'cache_text_encoder', command, gpu_index=payload.gpu_index)


@router.post("/api/projects/{project_id}/train", status_code=201)
def train_project(project_id: str, payload: TrainRequest):
    project, dataset_config = _dataset_config_for(project_id)
    command = build_train_command(
        mode=payload.mode,
        python_bin=project.python_bin,
        musubi_tuner_path=project.musubi_tuner_path,
        dataset_config=str(dataset_config),
        dit_path=payload.dit_path,
        vae_path=payload.vae_path,
        text_encoder_path=payload.text_encoder_path,
        output_dir=payload.output_dir,
        output_name=payload.output_name,
        mixed_precision=payload.mixed_precision,
        learning_rate=payload.learning_rate,
        optimizer_type=payload.optimizer_type,
        lr_scheduler=payload.lr_scheduler,
        lr_warmup_steps=payload.lr_warmup_steps,
        max_train_epochs=payload.max_train_epochs,
        save_every_n_epochs=payload.save_every_n_epochs,
        gradient_checkpointing=payload.gradient_checkpointing,
        persistent_data_loader_workers=payload.persistent_data_loader_workers,
        network_dim=payload.network_dim,
        network_alpha=payload.network_alpha,
        fused_backward_pass=payload.fused_backward_pass,
        full_bf16=payload.full_bf16,
        blocks_to_swap=payload.blocks_to_swap,
        sdpa=payload.sdpa,
        seed=payload.seed,
    )
    task_type = 'train_full' if payload.mode == 'full_finetune' else 'train_lora'
    return _launch(project_id, task_type, command, gpu_index=payload.gpu_index)


@router.get("/api/tasks/{task_id}")
def get_task(task_id: str):
    metadata_dir = get_tasks_root() / task_id
    if not metadata_dir.exists():
        raise HTTPException(status_code=404, detail='Task not found')
    return refresh_task_status(metadata_dir)


@router.get("/api/tasks/{task_id}/logs")
def get_task_logs(task_id: str):
    task = TaskStore(get_tasks_root()).load(task_id)
    path = Path(task.log_path)
    return {"task_id": task_id, "content": read_log_text(path)}


@router.post("/api/tasks/{task_id}/stop")
def stop_task_route(task_id: str):
    metadata_dir = get_tasks_root() / task_id
    if not metadata_dir.exists():
        raise HTTPException(status_code=404, detail='Task not found')
    return stop_task(metadata_dir)
