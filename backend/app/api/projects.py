from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_projects_root
from app.models.project import ProjectConfig
from app.services.dataset_config_writer import render_video_dataset_config, render_dataset_config
from app.services.dataset_merger import build_merged_dataset
from app.services.project_store import ProjectStore

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str
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
    model: dict = {}
    dataset: dict = {}
    training: dict = {}
    ui: dict = {}


@router.post("", status_code=201)
def create_project(payload: CreateProjectRequest):
    store = ProjectStore(get_projects_root())
    return store.create_project(
        name=payload.name,
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
        projects.append(ProjectConfig.model_validate_json(item.read_text(encoding='utf-8')))
    return projects


@router.post("/{project_id}/dataset-config")
def generate_dataset_config(project_id: str, payload: DatasetConfigRequest):
    """Image-only dataset config (legacy)."""
    store = ProjectStore(get_projects_root())
    project = store.get_project(project_id)
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
        'dataset': {
            'image_dirs': image_dirs,
            'resolution': payload.resolution,
            'batch_size': payload.batch_size,
        }
    })
    return {"path": str(path), "merged_dir": str(merged_dir), "image_count": image_count, "content": text}


@router.post("/{project_id}/dataset-config/video")
def generate_video_dataset_config(project_id: str, payload: DatasetVideoConfigRequest):
    """Video dataset config for Wan 2.2 training."""
    store = ProjectStore(get_projects_root())
    project = store.get_project(project_id)

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
        'dataset': {
            'video_dirs': video_dirs,
            'resolution': payload.resolution,
            'batch_size': payload.batch_size,
            'target_frames': payload.target_frames,
            'frame_extraction': payload.frame_extraction,
            'fps': payload.fps,
        }
    })
    return {"path": str(path), "video_dir": video_dir, "content": text}
