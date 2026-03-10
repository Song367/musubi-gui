from app.services.command_builder import build_cache_command, build_train_command


def test_full_finetune_command_targets_zimage_train():
    cmd = build_train_command(
        mode="full_finetune",
        python_bin="/srv/venv/bin/python",
        musubi_tuner_path="/srv/musubi-tuner",
        dataset_config="/srv/project/dataset_config.toml",
        dit_path="/models/dit.safetensors",
        vae_path="/models/vae.safetensors",
        text_encoder_path="/models/text_encoder",
        output_dir="/outputs",
        output_name="demo",
        mixed_precision="bf16",
        learning_rate=1e-6,
        optimizer_type="adafactor",
        lr_scheduler="constant_with_warmup",
        lr_warmup_steps=10,
        max_train_epochs=16,
        save_every_n_epochs=1,
        gradient_checkpointing=True,
        persistent_data_loader_workers=True,
        network_dim=32,
        network_alpha=32,
        fused_backward_pass=True,
        full_bf16=True,
        blocks_to_swap=4,
        sdpa=True,
        seed=42,
    )

    joined = " ".join(cmd)
    assert "zimage_train.py" in joined
    assert "--learning_rate" in joined
    assert "--optimizer_type" in joined
    assert "--fused_backward_pass" in joined
    assert "--full_bf16" in joined
    assert "--blocks_to_swap" in joined


def test_lora_command_contains_network_options():
    cmd = build_train_command(
        mode="lora",
        python_bin="python",
        musubi_tuner_path="/srv/musubi-tuner",
        dataset_config="/srv/project/dataset_config.toml",
        dit_path="/models/dit.safetensors",
        vae_path="/models/vae.safetensors",
        text_encoder_path="/models/text_encoder",
        output_dir="/outputs",
        output_name="demo",
        mixed_precision="bf16",
        learning_rate=1e-4,
        optimizer_type="adamw8bit",
        lr_scheduler="constant_with_warmup",
        lr_warmup_steps=10,
        max_train_epochs=12,
        save_every_n_epochs=1,
        gradient_checkpointing=True,
        persistent_data_loader_workers=True,
        network_dim=32,
        network_alpha=32,
        fused_backward_pass=False,
        full_bf16=False,
        blocks_to_swap=0,
        sdpa=False,
        seed=42,
    )

    joined = " ".join(cmd)
    assert "zimage_train_network.py" in joined
    assert "--network_dim" in joined
    assert "--network_alpha" in joined
    assert "--gradient_checkpointing" in joined


def test_latent_cache_command_targets_cache_script():
    cmd = build_cache_command(
        cache_type="latents",
        python_bin="python",
        musubi_tuner_path="/srv/musubi-tuner",
        dataset_config="/srv/project/dataset_config.toml",
        vae_path="/models/vae.safetensors",
        text_encoder_path="/models/text_encoder",
    )

    assert "zimage_cache_latents.py" in " ".join(cmd)
