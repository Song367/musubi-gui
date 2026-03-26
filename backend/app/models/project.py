from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


ProjectType = Literal["wan22", "zimage"]


class ProjectSection(BaseModel):
    model: dict[str, Any] = Field(default_factory=dict)
    dataset: dict[str, Any] = Field(default_factory=dict)
    training: dict[str, Any] = Field(default_factory=dict)
    ui: dict[str, Any] = Field(default_factory=dict)


class ProjectConfig(BaseModel):
    id: str | None = None
    name: str
    project_type: ProjectType
    musubi_tuner_path: str
    python_bin: str
    workspace_root: str
    wan22: ProjectSection = Field(default_factory=ProjectSection)
    zimage: ProjectSection = Field(default_factory=ProjectSection)
