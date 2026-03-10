from __future__ import annotations


def build_cache_command(
    cache_type: str,
    python_bin: str,
    musubi_tuner_path: str,
    dataset_config: str,
    vae_path: str,
    text_encoder_path: str,
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


def _append_flag(command: list[str], enabled: bool, flag: str) -> None:
    if enabled:
        command.append(flag)


def build_train_command(
    mode: str,
    python_bin: str,
    musubi_tuner_path: str,
    dataset_config: str,
    dit_path: str,
    vae_path: str,
    text_encoder_path: str,
    output_dir: str,
    output_name: str,
    mixed_precision: str,
    learning_rate: float,
    optimizer_type: str,
    lr_scheduler: str,
    lr_warmup_steps: int,
    max_train_epochs: int,
    save_every_n_epochs: int,
    gradient_checkpointing: bool,
    persistent_data_loader_workers: bool,
    network_dim: int,
    network_alpha: int,
    fused_backward_pass: bool,
    full_bf16: bool,
    blocks_to_swap: int,
    sdpa: bool,
    seed: int,
) -> list[str]:
    script_name = 'zimage_train.py' if mode == 'full_finetune' else 'zimage_train_network.py'
    script_path = f'{musubi_tuner_path}/src/musubi_tuner/{script_name}'
    command = [
        python_bin,
        script_path,
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
    ]

    _append_flag(command, gradient_checkpointing, '--gradient_checkpointing')
    _append_flag(command, persistent_data_loader_workers, '--persistent_data_loader_workers')
    _append_flag(command, sdpa, '--sdpa')

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
