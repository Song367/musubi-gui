from __future__ import annotations

import os
from pathlib import Path
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_logs_root, get_projects_root, get_tasks_root
from app.runners.task_runner import launch_task, refresh_task_status, stop_task
from app.services.command_builder import (
    build_wan_cache_latents_command,
    build_wan_cache_text_encoder_command,
    build_wan_train_command,
)
from app.services.project_store import ProjectStore
from app.services.task_store import TaskStore

router = APIRouter(tags=["tasks"])


@router.get("/api/tasks")
def list_tasks():
    from typing import Any
    store = TaskStore(get_tasks_root())
    tasks: list[dict[str, Any]] = []
    if store.root.exists():
        for task_dir in store.root.iterdir():
            if task_dir.is_dir() and (task_dir / 'task.json').exists():
                try:
                    task = store.load(task_dir.name)
                    tasks.append(task.model_dump())
                except Exception:
                    pass
    tasks.sort(key=lambda t: get_tasks_root().joinpath(t['id']).stat().st_mtime, reverse=True)
    return {"tasks": tasks}


def read_log_text(path: Path) -> str:
    if not path.exists():
        return ""
    for encoding in ("utf-8", "cp936", "gbk", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


def _build_task_env(musubi_tuner_path: str, gpu_index: str = '') -> dict[str, str] | None:
    extra_env: dict[str, str] = {}
    musubi_src = (Path(musubi_tuner_path) / 'src').as_posix()
    pythonpath_parts = [part for part in os.environ.get('PYTHONPATH', '').split(os.pathsep) if part]
    if musubi_src not in pythonpath_parts:
        pythonpath_parts.insert(0, musubi_src)
    if pythonpath_parts:
        extra_env['PYTHONPATH'] = os.pathsep.join(pythonpath_parts)
    if gpu_index:
        extra_env['CUDA_VISIBLE_DEVICES'] = gpu_index
    return extra_env or None


def _launch(project_id: str, task_type: str, command: list[str], musubi_tuner_path: str, gpu_index: str = ''):
    task_id = uuid.uuid4().hex[:12]
    metadata_dir = get_tasks_root() / task_id
    log_path = get_logs_root() / f'{task_id}.log'
    extra_env = _build_task_env(musubi_tuner_path, gpu_index=gpu_index)
    return launch_task(command, log_path, metadata_dir, project_id=project_id, task_type=task_type, extra_env=extra_env)


def _get_project_and_dataset(project_id: str):
    project = ProjectStore(get_projects_root()).get_project(project_id)
    dataset_config = Path(project.workspace_root) / 'dataset_config.toml'
    if not dataset_config.exists():
        raise HTTPException(status_code=400, detail='dataset_config.toml is required')
    return project, dataset_config


# ---------------------------------------------------------------------------
# Wan 2.2 — Cache Latents
# ---------------------------------------------------------------------------

class WanLatentCacheRequest(BaseModel):
    vae_path: str
    i2v: bool = False
    vae_cache_cpu: bool = False
    clip_path: str = ''
    gpu_index: str = ''


@router.post("/api/projects/{project_id}/wan/prepare/latents", status_code=201)
def wan_prepare_latents(project_id: str, payload: WanLatentCacheRequest):
    project, dataset_config = _get_project_and_dataset(project_id)
    command = build_wan_cache_latents_command(
        python_bin=project.python_bin,
        musubi_tuner_path=project.musubi_tuner_path,
        dataset_config=str(dataset_config),
        vae_path=payload.vae_path,
        i2v=payload.i2v,
        vae_cache_cpu=payload.vae_cache_cpu,
        clip_path=payload.clip_path,
    )
    return _launch(project_id, 'wan_cache_latents', command, musubi_tuner_path=project.musubi_tuner_path, gpu_index=payload.gpu_index)


# ---------------------------------------------------------------------------
# Wan 2.2 — Cache Text Encoder
# ---------------------------------------------------------------------------

class WanTextCacheRequest(BaseModel):
    t5_path: str
    batch_size: int = 16
    fp8_t5: bool = False
    gpu_index: str = ''


@router.post("/api/projects/{project_id}/wan/prepare/text-encoder", status_code=201)
def wan_prepare_text_encoder(project_id: str, payload: WanTextCacheRequest):
    project, dataset_config = _get_project_and_dataset(project_id)
    command = build_wan_cache_text_encoder_command(
        python_bin=project.python_bin,
        musubi_tuner_path=project.musubi_tuner_path,
        dataset_config=str(dataset_config),
        t5_path=payload.t5_path,
        batch_size=payload.batch_size,
        fp8_t5=payload.fp8_t5,
    )
    return _launch(project_id, 'wan_cache_text_encoder', command, musubi_tuner_path=project.musubi_tuner_path, gpu_index=payload.gpu_index)


# ---------------------------------------------------------------------------
# Wan 2.2 — LoRA Training
# ---------------------------------------------------------------------------

class WanTrainRequest(BaseModel):
    task: str = 'i2v-A14B'
    dit_path: str
    dit_high_noise_path: str = ''
    vae_path: str
    t5_path: str
    output_dir: str
    output_name: str
    mixed_precision: str = 'bf16'
    learning_rate: float = 2e-4
    optimizer_type: str = 'adamw8bit'
    lr_scheduler: str = 'constant_with_warmup'
    lr_warmup_steps: int = 10
    max_train_epochs: int = 16
    save_every_n_epochs: int = 1
    seed: int = 42
    network_dim: int = 32
    network_alpha: int = 32
    timestep_sampling: str = 'shift'
    discrete_flow_shift: float = 5.0
    min_timestep: int = 0
    max_timestep: int = 1000
    timestep_boundary: float = -1.0
    preserve_distribution_shape: bool = False
    gradient_checkpointing: bool = True
    fp8_base: bool = True
    blocks_to_swap: int = 0
    offload_inactive_dit: bool = False
    sdpa: bool = True
    persistent_data_loader_workers: bool = True
    gpu_index: str = ''


@router.post("/api/projects/{project_id}/wan/train", status_code=201)
def wan_train(project_id: str, payload: WanTrainRequest):
    project, dataset_config = _get_project_and_dataset(project_id)
    command = build_wan_train_command(
        python_bin=project.python_bin,
        musubi_tuner_path=project.musubi_tuner_path,
        dataset_config=str(dataset_config),
        task=payload.task,
        dit_path=payload.dit_path,
        dit_high_noise_path=payload.dit_high_noise_path,
        vae_path=payload.vae_path,
        t5_path=payload.t5_path,
        output_dir=payload.output_dir,
        output_name=payload.output_name,
        mixed_precision=payload.mixed_precision,
        learning_rate=payload.learning_rate,
        optimizer_type=payload.optimizer_type,
        lr_scheduler=payload.lr_scheduler,
        lr_warmup_steps=payload.lr_warmup_steps,
        max_train_epochs=payload.max_train_epochs,
        save_every_n_epochs=payload.save_every_n_epochs,
        seed=payload.seed,
        network_dim=payload.network_dim,
        network_alpha=payload.network_alpha,
        timestep_sampling=payload.timestep_sampling,
        discrete_flow_shift=payload.discrete_flow_shift,
        min_timestep=payload.min_timestep,
        max_timestep=payload.max_timestep,
        timestep_boundary=payload.timestep_boundary,
        preserve_distribution_shape=payload.preserve_distribution_shape,
        gradient_checkpointing=payload.gradient_checkpointing,
        fp8_base=payload.fp8_base,
        blocks_to_swap=payload.blocks_to_swap,
        offload_inactive_dit=payload.offload_inactive_dit,
        sdpa=payload.sdpa,
        persistent_data_loader_workers=payload.persistent_data_loader_workers,
    )
    return _launch(project_id, 'wan_train_lora', command, musubi_tuner_path=project.musubi_tuner_path, gpu_index=payload.gpu_index)


# ---------------------------------------------------------------------------
# Task status / logs / stop  (unchanged)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Z-Image — Endpoints (image-based LoRA / full finetune)
# ---------------------------------------------------------------------------
from app.services.command_builder import build_zimage_cache_command, build_zimage_train_command  # noqa: E402


class ZImageCacheRequest(BaseModel):
    vae_path: str
    text_encoder_path: str = ''
    gpu_index: str = ''


class ZImageTrainRequest(BaseModel):
    mode: str = 'lora'
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
    max_train_epochs: int = 12
    save_every_n_epochs: int = 1
    gradient_checkpointing: bool = True
    persistent_data_loader_workers: bool = True
    network_dim: int = 32
    network_alpha: int = 32
    timestep_sampling: str = 'shift'
    weighting_scheme: str = 'none'
    discrete_flow_shift: float = 2.0
    optimizer_args: str = ''
    max_grad_norm: float = 0.0
    fused_backward_pass: bool = False
    full_bf16: bool = False
    blocks_to_swap: int = 0
    sdpa: bool = True
    seed: int = 42
    gpu_index: str = ''


@router.post("/api/projects/{project_id}/zimage/prepare/latents", status_code=201)
def zimage_prepare_latents(project_id: str, payload: ZImageCacheRequest):
    project, dataset_config = _get_project_and_dataset(project_id)
    command = build_zimage_cache_command(
        cache_type='latents',
        python_bin=project.python_bin,
        musubi_tuner_path=project.musubi_tuner_path,
        dataset_config=str(dataset_config),
        vae_path=payload.vae_path,
    )
    return _launch(project_id, 'zimage_cache_latents', command, musubi_tuner_path=project.musubi_tuner_path, gpu_index=payload.gpu_index)


@router.post("/api/projects/{project_id}/zimage/prepare/text-encoder", status_code=201)
def zimage_prepare_text_encoder(project_id: str, payload: ZImageCacheRequest):
    project, dataset_config = _get_project_and_dataset(project_id)
    command = build_zimage_cache_command(
        cache_type='text_encoder',
        python_bin=project.python_bin,
        musubi_tuner_path=project.musubi_tuner_path,
        dataset_config=str(dataset_config),
        vae_path=payload.vae_path,
        text_encoder_path=payload.text_encoder_path,
    )
    return _launch(project_id, 'zimage_cache_text_encoder', command, musubi_tuner_path=project.musubi_tuner_path, gpu_index=payload.gpu_index)


@router.post("/api/projects/{project_id}/zimage/train", status_code=201)
def zimage_train(project_id: str, payload: ZImageTrainRequest):
    project, dataset_config = _get_project_and_dataset(project_id)
    # The current UI only exposes SDPA. Legacy projects may have saved sdpa=false,
    # but musubi requires one attention backend for Z-Image training to start.
    sdpa_enabled = True if not payload.sdpa else payload.sdpa
    command = build_zimage_train_command(
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
        timestep_sampling=payload.timestep_sampling,
        weighting_scheme=payload.weighting_scheme,
        discrete_flow_shift=payload.discrete_flow_shift,
        optimizer_args=payload.optimizer_args,
        max_grad_norm=payload.max_grad_norm,
        fused_backward_pass=payload.fused_backward_pass,
        full_bf16=payload.full_bf16,
        blocks_to_swap=payload.blocks_to_swap,
        sdpa=sdpa_enabled,
        seed=payload.seed,
    )
    task_type = 'zimage_train_full' if payload.mode == 'full_finetune' else 'zimage_train_lora'
    return _launch(project_id, task_type, command, musubi_tuner_path=project.musubi_tuner_path, gpu_index=payload.gpu_index)
