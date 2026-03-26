from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pydantic import ValidationError

from app.config import get_datasets_root, get_projects_root
from app.models.project import ProjectConfig, ProjectType
from app.services.dataset_config_writer import render_video_dataset_config, render_dataset_config
from app.services.dataset_browser import (
    build_dataset_samples,
    find_dataset_dir,
    list_available_datasets,
    resolve_preview_file,
)
from app.services.dataset_merger import build_merged_dataset
from app.services.project_store import ProjectStore

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str
    project_type: ProjectType
    musubi_tuner_path: str
    python_bin: str


class DatasetConfigRequest(BaseModel):
    """Image-only dataset config (legacy compat)."""
    image_dir: str = ""
    image_dirs: list[str] = Field(default_factory=list)
    resolution: tuple[int, int]
    batch_size: int


class DatasetVideoConfigRequest(BaseModel):
    """Video dataset config for Wan 2.2."""
    video_dirs: list[str] = Field(default_factory=list)
    resolution: tuple[int, int]
    batch_size: int
    target_frames: int = 81
    frame_extraction: str = 'head'
    fps: int = 16
    num_repeats: int = 1


class ProjectStateRequest(BaseModel):
    name: str | None = None
    musubi_tuner_path: str | None = None
    python_bin: str | None = None
    wan22: dict = Field(default_factory=dict)
    zimage: dict = Field(default_factory=dict)


def _get_zimage_project(project_id: str):
    store = ProjectStore(get_projects_root())
    project = store.get_project(project_id)
    if project.project_type != 'zimage':
        raise HTTPException(status_code=400, detail='Selected project is not a Z-Image project')
    return store, project


@router.post("", status_code=201)
def create_project(payload: CreateProjectRequest):
    store = ProjectStore(get_projects_root())
    return store.create_project(
        name=payload.name,
        project_type=payload.project_type,
        musubi_tuner_path=payload.musubi_tuner_path,
        python_bin=payload.python_bin,
    )


@router.put("/{project_id}/state")
def update_project_state(project_id: str, payload: ProjectStateRequest):
    store = ProjectStore(get_projects_root())
    try:
        return store.update_project_state(project_id, payload.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@router.get("/{project_id}")
def get_project(project_id: str):
    store = ProjectStore(get_projects_root())
    try:
        return store.get_project(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@router.get("")
def list_projects():
    root = get_projects_root()
    projects = []
    for item in root.glob('*/project.json'):
        try:
            projects.append(ProjectConfig.model_validate_json(item.read_text(encoding='utf-8')))
        except (OSError, ValidationError, ValueError):
            continue
    return projects


@router.get("/{project_id}/datasets")
def list_zimage_datasets(project_id: str):
    _store, _project = _get_zimage_project(project_id)
    return {"datasets": list_available_datasets(get_datasets_root())}


@router.get("/{project_id}/datasets/merged/samples")
def get_merged_dataset_samples(project_id: str):
    _store, project = _get_zimage_project(project_id)
    merged_dir = Path(project.workspace_root) / 'merged_dataset'
    image_dirs = project.zimage.dataset.get('image_dirs', [])
    dataset_names = project.zimage.dataset.get('dataset_names') or [Path(path).name for path in image_dirs]
    dataset_by_index = {
        f"{index:02d}": dataset_name
        for index, dataset_name in enumerate(dataset_names, start=1)
    }

    if not merged_dir.exists():
        return {"dataset": {"name": "merged", "path": merged_dir.as_posix()}, "samples": []}

    samples = build_dataset_samples(
        dataset_dir=merged_dir,
        project_id=project_id,
        image_url_prefix='datasets/merged/files',
    )
    for sample in samples:
        parts = sample["image_name"].split("_", 2)
        if len(parts) == 3:
            sample["source_dataset"] = dataset_by_index.get(parts[0], "")
    return {"dataset": {"name": "merged", "path": merged_dir.as_posix()}, "samples": samples}


@router.get("/{project_id}/datasets/merged/files/{filename:path}")
def get_merged_dataset_preview_image(project_id: str, filename: str):
    _store, project = _get_zimage_project(project_id)
    merged_dir = (Path(project.workspace_root) / 'merged_dataset').resolve()
    try:
        file_path = resolve_preview_file(merged_dir, filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Preview image not found') from exc
    return FileResponse(file_path)


@router.get("/{project_id}/datasets/{dataset_name}/samples")
def get_dataset_samples(project_id: str, dataset_name: str):
    _store, _project = _get_zimage_project(project_id)
    try:
        dataset_dir = find_dataset_dir(get_datasets_root(), dataset_name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Dataset not found') from exc
    samples = build_dataset_samples(
        dataset_dir=dataset_dir,
        project_id=project_id,
        image_url_prefix=f'datasets/{dataset_name}/files',
        source_dataset=dataset_name,
    )
    return {"dataset": {"name": dataset_name, "path": dataset_dir.as_posix()}, "samples": samples}


@router.get("/{project_id}/datasets/{dataset_name}/files/{filename:path}")
def get_dataset_preview_image(project_id: str, dataset_name: str, filename: str):
    _store, _project = _get_zimage_project(project_id)
    try:
        dataset_dir = find_dataset_dir(get_datasets_root(), dataset_name)
        file_path = resolve_preview_file(dataset_dir, filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Preview image not found') from exc
    return FileResponse(file_path)


@router.post("/{project_id}/dataset-config")
def generate_dataset_config(project_id: str, payload: DatasetConfigRequest):
    """Image-only dataset config (legacy)."""
    store, project = _get_zimage_project(project_id)
    image_dirs = [path for path in payload.image_dirs if str(path).strip()]
    if not image_dirs and payload.image_dir.strip():
        image_dirs = [payload.image_dir.strip()]
    if not image_dirs:
        raise HTTPException(status_code=400, detail='At least one dataset directory is required')

    merged_dir = Path(project.workspace_root) / 'merged_dataset'
    try:
        merged_dir, image_count = build_merged_dataset(image_dirs=image_dirs, output_dir=merged_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    text = render_dataset_config(
        image_dir=str(merged_dir),
        resolution=payload.resolution,
        batch_size=payload.batch_size,
    )
    path = Path(project.workspace_root) / 'dataset_config.toml'
    path.write_text(text, encoding='utf-8')
    store.update_project_state(project_id, {
        'zimage': {
            'dataset': {
                'image_dirs': image_dirs,
                'dataset_names': [Path(path).name for path in image_dirs],
                'resolution': payload.resolution,
                'batch_size': payload.batch_size,
            },
        }
    })
    return {"path": str(path), "merged_dir": str(merged_dir), "image_count": image_count, "content": text}


@router.post("/{project_id}/dataset-config/video")
def generate_video_dataset_config(project_id: str, payload: DatasetVideoConfigRequest):
    """Video dataset config for Wan 2.2 training."""
    store = ProjectStore(get_projects_root())
    project = store.get_project(project_id)
    if project.project_type != 'wan22':
        raise HTTPException(status_code=400, detail='Selected project is not a Wan 2.2 project')

    video_dirs = [d for d in payload.video_dirs if d.strip()]
    if not video_dirs:
        raise HTTPException(status_code=400, detail='At least one video directory is required')

    # Use first directory if only one; otherwise would need a merger (not implemented for video)
    video_dir = video_dirs[0]

    text = render_video_dataset_config(
        video_dir=video_dir,
        resolution=payload.resolution,
        batch_size=payload.batch_size,
        target_frames=payload.target_frames,
        frame_extraction=payload.frame_extraction,
        fps=payload.fps,
        num_repeats=payload.num_repeats,
    )
    path = Path(project.workspace_root) / 'dataset_config.toml'
    path.write_text(text, encoding='utf-8')
    store.update_project_state(project_id, {
        'wan22': {
            'dataset': {
                'video_dirs': video_dirs,
                'resolution': payload.resolution,
                'batch_size': payload.batch_size,
                'target_frames': payload.target_frames,
                'frame_extraction': payload.frame_extraction,
                'fps': payload.fps,
            },
        }
    })
    return {"path": str(path), "video_dir": video_dir, "content": text}
