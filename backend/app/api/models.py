from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_logs_root, get_tasks_root
from app.runners.task_runner import launch_callable_task

router = APIRouter(tags=['models'])

# Wan 2.2 official sources (Comfy-Org repackaged)
OFFICIAL_SOURCES = [
    {
        "id": "wan22_dit_lownoise_i2v",
        "label": "Wan 2.2 I2V DiT — Low Noise",
        "repo_id": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    },
    {
        "id": "wan22_dit_highnoise_i2v",
        "label": "Wan 2.2 I2V DiT — High Noise",
        "repo_id": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    },
    {
        "id": "wan22_dit_lownoise_t2v",
        "label": "Wan 2.2 T2V DiT — Low Noise",
        "repo_id": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    },
    {
        "id": "wan22_dit_highnoise_t2v",
        "label": "Wan 2.2 T2V DiT — High Noise",
        "repo_id": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    },
    {
        "id": "wan22_vae",
        "label": "Wan 2.1 VAE (shared with 2.2)",
        "repo_id": "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
    },
    {
        "id": "wan22_t5",
        "label": "T5 UMT5-XXL (shared with 2.2)",
        "repo_id": "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
    },
    # Z-Image
    {
        "id": "zimage_dit",
        "label": "Z-Image DiT Base",
        "repo_id": "Comfy-Org/z_image",
    },
    {
        "id": "zimage_vae",
        "label": "Z-Image VAE",
        "repo_id": "Comfy-Org/z_image",
    },
    {
        "id": "zimage_text_encoder",
        "label": "Z-Image Qwen3 Text Encoder",
        "repo_id": "Comfy-Org/z_image",
    },
]

# Default filenames for each source
DEFAULT_FILENAMES: dict[str, str] = {
    "wan22_dit_lownoise_i2v":  "split_files/diffusion_models/wan2.2_i2v_low_noise_fp16.safetensors",
    "wan22_dit_highnoise_i2v": "split_files/diffusion_models/wan2.2_i2v_high_noise_fp16.safetensors",
    "wan22_dit_lownoise_t2v":  "split_files/diffusion_models/wan2.2_t2v_low_noise_fp16.safetensors",
    "wan22_dit_highnoise_t2v": "split_files/diffusion_models/wan2.2_t2v_high_noise_fp16.safetensors",
    "wan22_vae":  "split_files/vae/wan_2.1_vae.safetensors",
    "wan22_t5":   "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    # Z-Image
    "zimage_dit": "split_files/diffusion_models/z_image_bf16.safetensors",
    "zimage_vae": "split_files/vae/ae.safetensors",
    "zimage_text_encoder": "split_files/text_encoders/qwen_3_4b.safetensors",
}


def download_file(*, repo_id: str, filename: str, local_dir: str) -> str:
    from huggingface_hub import hf_hub_download
    return hf_hub_download(repo_id=repo_id, filename=filename, local_dir=local_dir, local_dir_use_symlinks=False)


class ModelCheckRequest(BaseModel):
    dit_path: str
    dit_high_noise_path: str = ''
    vae_path: str
    t5_path: str


class ModelDownloadRequest(BaseModel):
    source_type: str
    source_id: str = ""
    repo_id: str = ""
    asset: str = ""
    filename: str
    target_dir: str


class ModelBatchDownloadRequest(BaseModel):
    assets: dict[str, ModelDownloadRequest]


@router.get('/api/models/sources')
def get_model_sources():
    return OFFICIAL_SOURCES


@router.get('/api/models/sources/defaults')
def get_model_source_defaults():
    return DEFAULT_FILENAMES


@router.post('/api/projects/{project_id}/models/check')
def check_models(project_id: str, payload: ModelCheckRequest):
    result = {
        'dit_path': {'path': payload.dit_path, 'exists': Path(payload.dit_path).exists()},
        'vae_path': {'path': payload.vae_path, 'exists': Path(payload.vae_path).exists()},
        't5_path': {'path': payload.t5_path, 'exists': Path(payload.t5_path).exists()},
    }
    if payload.dit_high_noise_path:
        result['dit_high_noise_path'] = {
            'path': payload.dit_high_noise_path,
            'exists': Path(payload.dit_high_noise_path).exists(),
        }
    return result


def resolve_repo_id(payload: ModelDownloadRequest) -> str:
    repo_id = payload.repo_id
    if payload.source_type == 'official':
        match = next((item for item in OFFICIAL_SOURCES if item['id'] == payload.source_id), None)
        if match is None:
            raise HTTPException(status_code=404, detail='Official model source not found')
        repo_id = match['repo_id']
    if not repo_id:
        raise HTTPException(status_code=400, detail='repo_id is required')
    return repo_id


def log_line(handle, message: str) -> None:
    timestamp = datetime.now(timezone.utc).astimezone().strftime('%Y-%m-%d %H:%M:%S')
    handle.write(f'[{timestamp}] {message}\n')
    handle.flush()


def build_download_task(*, project_id: str, task_type: str, command: list[str], target):
    task_id = uuid.uuid4().hex[:12]
    metadata_dir = get_tasks_root() / task_id
    log_path = get_logs_root() / f'{task_id}.log'
    return launch_callable_task(
        task_id=task_id,
        project_id=project_id,
        task_type=task_type,
        log_path=log_path,
        metadata_dir=metadata_dir,
        command=command,
        target=target,
    )


@router.post('/api/projects/{project_id}/models/download', status_code=201)
def download_model(project_id: str, payload: ModelDownloadRequest):
    repo_id = resolve_repo_id(payload)

    def run_download(handle):
        log_line(handle, 'Download task created.')
        log_line(handle, f'Asset: {payload.asset or "manual"}')
        log_line(handle, f'Resolved repo_id: {repo_id}')
        log_line(handle, f'Filename: {payload.filename}')
        log_line(handle, f'Target dir: {payload.target_dir}')
        Path(payload.target_dir).mkdir(parents=True, exist_ok=True)
        log_line(handle, 'Download started.')
        saved_path = download_file(repo_id=repo_id, filename=payload.filename, local_dir=payload.target_dir)
        normalized = Path(saved_path).as_posix()
        log_line(handle, f'Download finished: {normalized}')
        return {'asset': payload.asset, 'repo_id': repo_id, 'saved_path': normalized}

    return build_download_task(
        project_id=project_id,
        task_type='download_model',
        command=['internal:download_model', payload.asset or 'manual', repo_id, payload.filename],
        target=run_download,
    )


@router.post('/api/projects/{project_id}/models/download-all', status_code=201)
def download_all_models(project_id: str, payload: ModelBatchDownloadRequest):
    resolved_assets = {
        asset_name: {'repo_id': resolve_repo_id(asset_payload), 'payload': asset_payload}
        for asset_name, asset_payload in payload.assets.items()
    }

    def run_batch(handle):
        log_line(handle, 'Batch download task created.')
        completed_assets: dict[str, dict[str, str]] = {}
        for asset_name, asset_config in resolved_assets.items():
            asset_payload = asset_config['payload']
            repo_id = asset_config['repo_id']
            log_line(handle, f'Starting asset: {asset_name}')
            Path(asset_payload.target_dir).mkdir(parents=True, exist_ok=True)
            saved_path = download_file(repo_id=repo_id, filename=asset_payload.filename, local_dir=asset_payload.target_dir)
            normalized = Path(saved_path).as_posix()
            completed_assets[asset_name] = {'repo_id': repo_id, 'saved_path': normalized}
            log_line(handle, f'Finished asset: {asset_name} -> {normalized}')
        return {'completed_assets': completed_assets}

    command = ['internal:download_all_models', *payload.assets.keys()]
    return build_download_task(
        project_id=project_id,
        task_type='download_all_models',
        command=command,
        target=run_batch,
    )
