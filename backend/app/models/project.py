from __future__ import annotations

from pydantic import BaseModel, Field


class ModelPaths(BaseModel):
    dit_path: str = ""
    vae_path: str = ""
    text_encoder_path: str = ""
    output_dir: str = ""
    output_name: str = ""


class DatasetSettings(BaseModel):
    image_dir: str = ""
    caption_extension: str = ".txt"
    resolution: tuple[int, int] = (1024, 1024)
    batch_size: int = 1
    enable_bucket: bool = True
    bucket_no_upscale: bool = False


class TrainingSettings(BaseModel):
    mode: str = "lora"
    mixed_precision: str = "bf16"
    gradient_checkpointing: bool = True
    persistent_data_loader_workers: bool = True
    max_train_epochs: int = 16
    seed: int = 42
    gpu_index: str = ""
    lora_learning_rate: float = 1e-4
    network_dim: int = 32
    network_alpha: int = 32
    lora_optimizer_type: str = "adamw8bit"
    lora_lr_scheduler: str = "constant_with_warmup"
    lora_lr_warmup_steps: int = 10
    lora_save_every_n_epochs: int = 1
    full_learning_rate: float = 1e-6
    full_optimizer_type: str = "adafactor"
    full_lr_scheduler: str = "constant_with_warmup"
    full_lr_warmup_steps: int = 10
    full_save_every_n_epochs: int = 1
    fused_backward_pass: bool = True
    full_bf16: bool = False
    blocks_to_swap: int = 0
    sdpa: bool = True
    learning_rate: float = 1e-4
    optimizer_type: str = "adamw8bit"
    lr_scheduler: str = "constant_with_warmup"
    lr_warmup_steps: int = 10
    save_every_n_epochs: int = 1


class UISettings(BaseModel):
    hardware_preset: str = "rtx3090"
    asset_source_type: str = "official"
    dit_source_id: str = "zimage_comfy"
    dit_manual_repo_id: str = ""
    dit_filename: str = "split_files/diffusion_models/z_image_bf16.safetensors"
    dit_target_dir: str = "E:/models/zimage"
    vae_source_id: str = "zimage_comfy"
    vae_manual_repo_id: str = ""
    vae_filename: str = "split_files/vae/ae.safetensors"
    vae_target_dir: str = "E:/models/zimage"
    text_encoder_source_id: str = "zimage_comfy"
    text_encoder_manual_repo_id: str = ""
    text_encoder_filename: str = "split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors"
    text_encoder_target_dir: str = "E:/models/zimage"


class ProjectConfig(BaseModel):
    id: str | None = None
    name: str
    musubi_tuner_path: str
    python_bin: str
    workspace_root: str
    model: ModelPaths = Field(default_factory=ModelPaths)
    dataset: DatasetSettings = Field(default_factory=DatasetSettings)
    training: TrainingSettings = Field(default_factory=TrainingSettings)
    ui: UISettings = Field(default_factory=UISettings)
