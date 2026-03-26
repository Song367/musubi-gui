from __future__ import annotations

import os
from pathlib import Path


def _accelerate_bin(python_bin: str) -> str:
    """Derive the accelerate executable from the python bin path."""
    bin_dir = Path(python_bin).parent
    # Windows: Scripts/accelerate.exe ; Linux: bin/accelerate
    for candidate in (bin_dir / 'accelerate.exe', bin_dir / 'accelerate'):
        if candidate.exists():
            return str(candidate)
    # Fall back to just 'accelerate' on PATH
    return 'accelerate'


def _append_flag(command: list[str], enabled: bool, flag: str) -> None:
    if enabled:
        command.append(flag)


# ---------------------------------------------------------------------------
# Wan 2.2 — Latent Cache
# ---------------------------------------------------------------------------

def build_wan_cache_latents_command(
    *,
    python_bin: str,
    musubi_tuner_path: str,
    dataset_config: str,
    vae_path: str,
    i2v: bool = False,
    vae_cache_cpu: bool = False,
    clip_path: str = '',
) -> list[str]:
    script = f'{musubi_tuner_path}/src/musubi_tuner/wan_cache_latents.py'
    command = [
        python_bin,
        script,
        '--dataset_config', dataset_config,
        '--vae', vae_path,
    ]
    _append_flag(command, i2v, '--i2v')
    _append_flag(command, vae_cache_cpu, '--vae_cache_cpu')
    if clip_path:
        command.extend(['--clip', clip_path])
    return command


# ---------------------------------------------------------------------------
# Wan 2.2 — Text Encoder Cache
# ---------------------------------------------------------------------------

def build_wan_cache_text_encoder_command(
    *,
    python_bin: str,
    musubi_tuner_path: str,
    dataset_config: str,
    t5_path: str,
    batch_size: int = 16,
    fp8_t5: bool = False,
) -> list[str]:
    script = f'{musubi_tuner_path}/src/musubi_tuner/wan_cache_text_encoder_outputs.py'
    command = [
        python_bin,
        script,
        '--dataset_config', dataset_config,
        '--t5', t5_path,
        '--batch_size', str(batch_size),
    ]
    _append_flag(command, fp8_t5, '--fp8_t5')
    return command


# ---------------------------------------------------------------------------
# Wan 2.2 — LoRA Training (via accelerate launch)
# ---------------------------------------------------------------------------

def build_wan_train_command(
    *,
    python_bin: str,
    musubi_tuner_path: str,
    dataset_config: str,
    task: str,                          # e.g. 't2v-A14B', 'i2v-A14B'
    dit_path: str,                      # low-noise DiT (or only DiT for single-model)
    vae_path: str,
    t5_path: str,
    output_dir: str,
    output_name: str,
    # Optional dual-model paths
    dit_high_noise_path: str = '',
    # Training hyperparams
    mixed_precision: str = 'bf16',
    learning_rate: float = 2e-4,
    optimizer_type: str = 'adamw8bit',
    lr_scheduler: str = 'constant_with_warmup',
    lr_warmup_steps: int = 10,
    max_train_epochs: int = 16,
    save_every_n_epochs: int = 1,
    seed: int = 42,
    network_dim: int = 32,
    network_alpha: int = 32,
    # Timestep options
    timestep_sampling: str = 'shift',
    discrete_flow_shift: float = 5.0,
    min_timestep: int = 0,
    max_timestep: int = 1000,
    timestep_boundary: float = -1.0,    # negative = use default
    preserve_distribution_shape: bool = False,
    # Memory options
    gradient_checkpointing: bool = True,
    fp8_base: bool = False,
    blocks_to_swap: int = 0,
    offload_inactive_dit: bool = False,
    sdpa: bool = True,
    persistent_data_loader_workers: bool = True,
    # Sampling during training
    vae_path_sample: str = '',
    t5_path_sample: str = '',
    sample_prompts: str = '',
    sample_every_n_epochs: int = 0,
) -> list[str]:
    accelerate = _accelerate_bin(python_bin)
    script = f'{musubi_tuner_path}/src/musubi_tuner/wan_train_network.py'

    command = [
        accelerate, 'launch',
        '--num_cpu_threads_per_process', '1',
        '--mixed_precision', mixed_precision,
        script,
        '--task', task,
        '--dit', dit_path,
        '--vae', vae_path,
        '--t5', t5_path,
        '--dataset_config', dataset_config,
        '--mixed_precision', mixed_precision,
        '--network_module', 'networks.lora_wan',
        '--network_dim', str(network_dim),
        '--network_alpha', str(network_alpha),
        '--optimizer_type', optimizer_type,
        '--learning_rate', str(learning_rate),
        '--lr_scheduler', lr_scheduler,
        '--lr_warmup_steps', str(lr_warmup_steps),
        '--max_train_epochs', str(max_train_epochs),
        '--save_every_n_epochs', str(save_every_n_epochs),
        '--seed', str(seed),
        '--output_dir', output_dir,
        '--output_name', output_name,
        '--timestep_sampling', timestep_sampling,
        '--discrete_flow_shift', str(discrete_flow_shift),
        '--max_data_loader_n_workers', '2',
    ]

    # Dual-model training
    if dit_high_noise_path:
        command.extend(['--dit_high_noise', dit_high_noise_path])
        if timestep_boundary >= 0:
            command.extend(['--timestep_boundary', str(timestep_boundary)])
    else:
        # Single-model: apply timestep range if non-default
        if min_timestep > 0:
            command.extend(['--min_timestep', str(min_timestep)])
        if max_timestep < 1000:
            command.extend(['--max_timestep', str(max_timestep)])
        _append_flag(command, preserve_distribution_shape, '--preserve_distribution_shape')

    # Memory
    _append_flag(command, gradient_checkpointing, '--gradient_checkpointing')
    _append_flag(command, fp8_base, '--fp8_base')
    _append_flag(command, offload_inactive_dit, '--offload_inactive_dit')
    _append_flag(command, sdpa, '--sdpa')
    _append_flag(command, persistent_data_loader_workers, '--persistent_data_loader_workers')

    if blocks_to_swap > 0:
        command.extend(['--blocks_to_swap', str(blocks_to_swap)])

    # Sampling during training
    if sample_prompts:
        if vae_path_sample:
            command.extend(['--vae', vae_path_sample])
        if t5_path_sample:
            command.extend(['--t5', t5_path_sample])
        command.extend(['--sample_prompts', sample_prompts])
        if sample_every_n_epochs > 0:
            command.extend(['--sample_every_n_epochs', str(sample_every_n_epochs)])

    return command


# ---------------------------------------------------------------------------
# Z-Image — Cache (image-based)
# ---------------------------------------------------------------------------

def build_zimage_cache_command(
    *,
    cache_type: str,       # 'latents' | 'text_encoder'
    python_bin: str,
    musubi_tuner_path: str,
    dataset_config: str,
    vae_path: str = '',
    text_encoder_path: str = '',
) -> list[str]:
    if cache_type == 'latents':
        return [
            python_bin,
            f'{musubi_tuner_path}/src/musubi_tuner/zimage_cache_latents.py',
            '--dataset_config', dataset_config,
            '--vae', vae_path,
        ]
    return [
        python_bin,
        f'{musubi_tuner_path}/src/musubi_tuner/zimage_cache_text_encoder_outputs.py',
        '--dataset_config', dataset_config,
        '--text_encoder', text_encoder_path,
        '--batch_size', '1',
    ]


def build_zimage_train_command(
    *,
    mode: str,              # 'lora' | 'full_finetune'
    python_bin: str,
    musubi_tuner_path: str,
    dataset_config: str,
    dit_path: str,
    vae_path: str,
    text_encoder_path: str,
    output_dir: str,
    output_name: str,
    mixed_precision: str = 'bf16',
    learning_rate: float = 1e-4,
    optimizer_type: str = 'adamw8bit',
    lr_scheduler: str = 'constant_with_warmup',
    lr_warmup_steps: int = 10,
    max_train_epochs: int = 16,
    save_every_n_epochs: int = 1,
    gradient_checkpointing: bool = True,
    persistent_data_loader_workers: bool = True,
    network_dim: int = 32,
    network_alpha: int = 32,
    timestep_sampling: str = 'shift',
    weighting_scheme: str = 'none',
    discrete_flow_shift: float = 2.0,
    optimizer_args: str = '',
    max_grad_norm: float = 0.0,
    fused_backward_pass: bool = False,
    full_bf16: bool = False,
    blocks_to_swap: int = 0,
    sdpa: bool = True,
    sage_attn: bool = False,
    seed: int = 42,
) -> list[str]:
    # Z-Image training requires one attention backend. Prefer SageAttention
    # when explicitly selected; otherwise fall back to SDPA for compatibility.
    if sage_attn:
        sdpa = False
    elif not sdpa:
        sdpa = True
    script_name = 'zimage_train.py' if mode == 'full_finetune' else 'zimage_train_network.py'
    command = [
        python_bin,
        f'{musubi_tuner_path}/src/musubi_tuner/{script_name}',
        '--dit', dit_path,
        '--vae', vae_path,
        '--text_encoder', text_encoder_path,
        '--dataset_config', dataset_config,
        '--mixed_precision', mixed_precision,
        '--optimizer_type', optimizer_type,
        '--learning_rate', str(learning_rate),
        '--lr_scheduler', lr_scheduler,
        '--lr_warmup_steps', str(lr_warmup_steps),
        '--max_train_epochs', str(max_train_epochs),
        '--save_every_n_epochs', str(save_every_n_epochs),
        '--seed', str(seed),
        '--output_dir', output_dir,
        '--output_name', output_name,
        '--timestep_sampling', timestep_sampling,
        '--weighting_scheme', weighting_scheme,
        '--discrete_flow_shift', str(discrete_flow_shift),
    ]

    if max_grad_norm > 0:
        command.extend(['--max_grad_norm', str(max_grad_norm)])
    elif mode == 'full_finetune':
        command.extend(['--max_grad_norm', '0'])

    if optimizer_args:
        command.extend(['--optimizer_args'] + optimizer_args.split())
    _append_flag(command, gradient_checkpointing, '--gradient_checkpointing')
    _append_flag(command, persistent_data_loader_workers, '--persistent_data_loader_workers')
    _append_flag(command, sdpa, '--sdpa')
    _append_flag(command, sage_attn, '--sage-attn')
    if blocks_to_swap > 0:
        command.extend(['--blocks_to_swap', str(blocks_to_swap)])
    if mode == 'full_finetune':
        _append_flag(command, fused_backward_pass, '--fused_backward_pass')
        _append_flag(command, full_bf16, '--full_bf16')
    else:
        command.extend([
            '--network_module', 'networks.lora_zimage',
            '--network_dim', str(network_dim),
            '--network_alpha', str(network_alpha),
        ])
    return command
