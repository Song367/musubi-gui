from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=['models'])

OFFICIAL_SOURCES = [
    {"id": "zimage_base_official", "label": "Z-Image Base (Official)", "repo_id": "Tongyi-MAI/Z-Image"},
    {"id": "zimage_comfy", "label": "Z-Image ComfyUI Weights", "repo_id": "Comfy-Org/z_image"},
    {"id": "zimage_deturbo", "label": "Z-Image De-Turbo", "repo_id": "ostris/Z-Image-De-Turbo"},
    {"id": "zimage_turbo_adapter", "label": "Z-Image Turbo Training Adapter", "repo_id": "ostris/zimage_turbo_training_adapter"},
]


def download_file(*, repo_id: str, filename: str, local_dir: str) -> str:
    from huggingface_hub import hf_hub_download

    return hf_hub_download(repo_id=repo_id, filename=filename, local_dir=local_dir, local_dir_use_symlinks=False)


class ModelCheckRequest(BaseModel):
    dit_path: str
    vae_path: str
    text_encoder_path: str


class ModelDownloadRequest(BaseModel):
    source_type: str
    source_id: str = ""
    repo_id: str = ""
    filename: str
    target_dir: str


@router.get('/api/models/sources')
def get_model_sources():
    return OFFICIAL_SOURCES


@router.post('/api/projects/{project_id}/models/check')
def check_models(project_id: str, payload: ModelCheckRequest):
    return {
        'dit_path': {'path': payload.dit_path, 'exists': Path(payload.dit_path).exists()},
        'vae_path': {'path': payload.vae_path, 'exists': Path(payload.vae_path).exists()},
        'text_encoder_path': {'path': payload.text_encoder_path, 'exists': Path(payload.text_encoder_path).exists()},
    }


@router.post('/api/projects/{project_id}/models/download')
def download_model(project_id: str, payload: ModelDownloadRequest):
    repo_id = payload.repo_id
    if payload.source_type == 'official':
        match = next((item for item in OFFICIAL_SOURCES if item['id'] == payload.source_id), None)
        if match is None:
            raise HTTPException(status_code=404, detail='Official model source not found')
        repo_id = match['repo_id']
    if not repo_id:
        raise HTTPException(status_code=400, detail='repo_id is required')
    saved_path = download_file(repo_id=repo_id, filename=payload.filename, local_dir=payload.target_dir)
    return {'repo_id': repo_id, 'saved_path': Path(saved_path).as_posix()}
