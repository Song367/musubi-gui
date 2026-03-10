from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_projects_root
from app.models.project import ProjectConfig
from app.services.dataset_config_writer import render_dataset_config
from app.services.project_store import ProjectStore

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str
    musubi_tuner_path: str
    python_bin: str


class DatasetConfigRequest(BaseModel):
    image_dir: str
    resolution: tuple[int, int]
    batch_size: int


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
    store = ProjectStore(get_projects_root())
    project = store.get_project(project_id)
    text = render_dataset_config(
        image_dir=payload.image_dir,
        resolution=payload.resolution,
        batch_size=payload.batch_size,
    )
    path = Path(project.workspace_root) / 'dataset_config.toml'
    path.write_text(text, encoding='utf-8')
    return {"path": str(path), "content": text}
