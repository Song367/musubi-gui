from __future__ import annotations

import json
import uuid
from pathlib import Path

from app.models.project import ProjectConfig


class ProjectStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _project_file(self, project_id: str) -> Path:
        return self.root / project_id / 'project.json'

    def create_project(self, name: str, musubi_tuner_path: str, python_bin: str) -> ProjectConfig:
        project_id = uuid.uuid4().hex[:12]
        project_dir = self.root / project_id
        models_dir = project_dir / 'models'
        outputs_dir = project_dir / 'outputs'
        project_dir.mkdir(parents=True, exist_ok=True)
        models_dir.mkdir(parents=True, exist_ok=True)
        outputs_dir.mkdir(parents=True, exist_ok=True)
        config = ProjectConfig(
            id=project_id,
            name=name,
            musubi_tuner_path=musubi_tuner_path,
            python_bin=python_bin,
            workspace_root=str(project_dir),
            model={
                'output_dir': str(outputs_dir),
            },
            ui={
                'dit_target_dir': str(models_dir),
                'vae_target_dir': str(models_dir),
                'text_encoder_target_dir': str(models_dir),
            },
        )
        self._project_file(project_id).write_text(config.model_dump_json(indent=2), encoding='utf-8')
        return config

    def get_project(self, project_id: str) -> ProjectConfig:
        data = json.loads(self._project_file(project_id).read_text(encoding='utf-8'))
        return ProjectConfig.model_validate(data)

    def update_project_state(self, project_id: str, patch: dict) -> ProjectConfig:
        current = self.get_project(project_id)
        merged = current.model_dump()
        for key, value in patch.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key].update(value)
            else:
                merged[key] = value
        updated = ProjectConfig.model_validate(merged)
        self._project_file(project_id).write_text(updated.model_dump_json(indent=2), encoding='utf-8')
        return updated
