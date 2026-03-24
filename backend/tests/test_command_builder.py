from __future__ import annotations

import pytest
from app.services.command_builder import (
    build_wan_cache_latents_command,
    build_wan_cache_text_encoder_command,
    build_wan_train_command,
)

PYTHON = '/usr/bin/python'
MUSUBI = '/opt/musubi-tuner'
DATASET = '/data/dataset_config.toml'


# ── build_wan_cache_latents_command ────────────────────────────────────────
class TestBuildWanCacheLatentsCommand:
    def test_t2v_basic(self):
        cmd = build_wan_cache_latents_command(
            python_bin=PYTHON,
            musubi_tuner_path=MUSUBI,
            dataset_config=DATASET,
            vae_path='/models/vae.safetensors',
        )
        assert PYTHON in cmd
        assert 'wan_cache_latents.py' in ' '.join(cmd)
        assert '--vae' in cmd
        assert '--i2v' not in cmd

    def test_i2v_flag(self):
        cmd = build_wan_cache_latents_command(
            python_bin=PYTHON,
            musubi_tuner_path=MUSUBI,
            dataset_config=DATASET,
            vae_path='/models/vae.safetensors',
            i2v=True,
        )
        assert '--i2v' in cmd

    def test_vae_cache_cpu_flag(self):
        cmd = build_wan_cache_latents_command(
            python_bin=PYTHON,
            musubi_tuner_path=MUSUBI,
            dataset_config=DATASET,
            vae_path='/models/vae.safetensors',
            vae_cache_cpu=True,
        )
        assert '--vae_cache_cpu' in cmd

    def test_clip_path_included(self):
        cmd = build_wan_cache_latents_command(
            python_bin=PYTHON,
            musubi_tuner_path=MUSUBI,
            dataset_config=DATASET,
            vae_path='/models/vae.safetensors',
            clip_path='/models/clip.pth',
        )
        assert '--clip' in cmd
        idx = cmd.index('--clip')
        assert cmd[idx + 1] == '/models/clip.pth'

    def test_clip_not_included_when_empty(self):
        cmd = build_wan_cache_latents_command(
            python_bin=PYTHON,
            musubi_tuner_path=MUSUBI,
            dataset_config=DATASET,
            vae_path='/models/vae.safetensors',
        )
        assert '--clip' not in cmd


# ── build_wan_cache_text_encoder_command ──────────────────────────────────
class TestBuildWanCacheTextEncoderCommand:
    def test_basic(self):
        cmd = build_wan_cache_text_encoder_command(
            python_bin=PYTHON,
            musubi_tuner_path=MUSUBI,
            dataset_config=DATASET,
            t5_path='/models/t5.pth',
        )
        assert 'wan_cache_text_encoder_outputs.py' in ' '.join(cmd)
        assert '--t5' in cmd
        assert '--batch_size' in cmd

    def test_fp8_t5_flag(self):
        cmd = build_wan_cache_text_encoder_command(
            python_bin=PYTHON,
            musubi_tuner_path=MUSUBI,
            dataset_config=DATASET,
            t5_path='/models/t5.pth',
            fp8_t5=True,
        )
        assert '--fp8_t5' in cmd

    def test_batch_size_value(self):
        cmd = build_wan_cache_text_encoder_command(
            python_bin=PYTHON,
            musubi_tuner_path=MUSUBI,
            dataset_config=DATASET,
            t5_path='/models/t5.pth',
            batch_size=8,
        )
        idx = cmd.index('--batch_size')
        assert cmd[idx + 1] == '8'


# ── build_wan_train_command ────────────────────────────────────────────────
class TestBuildWanTrainCommand:
    BASE = dict(
        python_bin=PYTHON,
        musubi_tuner_path=MUSUBI,
        dataset_config=DATASET,
        task='i2v-A14B',
        dit_path='/models/dit_low.safetensors',
        vae_path='/models/vae.safetensors',
        t5_path='/models/t5.pth',
        output_dir='/outputs',
        output_name='my_lora',
    )

    def test_accelerate_launch(self):
        cmd = build_wan_train_command(**self.BASE)
        joined = ' '.join(cmd)
        assert 'accelerate' in cmd[0]
        assert 'launch' in cmd

    def test_network_module(self):
        cmd = build_wan_train_command(**self.BASE)
        assert '--network_module' in cmd
        idx = cmd.index('--network_module')
        assert cmd[idx + 1] == 'networks.lora_wan'

    def test_task_value(self):
        cmd = build_wan_train_command(**self.BASE)
        idx = cmd.index('--task')
        assert cmd[idx + 1] == 'i2v-A14B'

    def test_t2v_task_value(self):
        cmd = build_wan_train_command(**{**self.BASE, 'task': 't2v-A14B'})
        idx = cmd.index('--task')
        assert cmd[idx + 1] == 't2v-A14B'

    def test_dual_model_dit_high_noise(self):
        cmd = build_wan_train_command(**self.BASE, dit_high_noise_path='/models/dit_high.safetensors')
        assert '--dit_high_noise' in cmd
        idx = cmd.index('--dit_high_noise')
        assert cmd[idx + 1] == '/models/dit_high.safetensors'

    def test_single_model_no_dit_high_noise(self):
        cmd = build_wan_train_command(**self.BASE)
        assert '--dit_high_noise' not in cmd

    def test_timestep_range_single_model(self):
        cmd = build_wan_train_command(**self.BASE, min_timestep=0, max_timestep=900)
        assert '--max_timestep' in cmd
        idx = cmd.index('--max_timestep')
        assert cmd[idx + 1] == '900'

    def test_timestep_range_not_set_for_dual(self):
        cmd = build_wan_train_command(**self.BASE, dit_high_noise_path='/models/dit_high.safetensors')
        assert '--min_timestep' not in cmd
        assert '--max_timestep' not in cmd

    def test_fp8_base_flag(self):
        cmd = build_wan_train_command(**self.BASE, fp8_base=True)
        assert '--fp8_base' in cmd

    def test_gradient_checkpointing(self):
        cmd = build_wan_train_command(**self.BASE, gradient_checkpointing=True)
        assert '--gradient_checkpointing' in cmd

    def test_blocks_to_swap(self):
        cmd = build_wan_train_command(**self.BASE, blocks_to_swap=20)
        assert '--blocks_to_swap' in cmd
        idx = cmd.index('--blocks_to_swap')
        assert cmd[idx + 1] == '20'

    def test_blocks_to_swap_zero_omitted(self):
        cmd = build_wan_train_command(**self.BASE, blocks_to_swap=0)
        assert '--blocks_to_swap' not in cmd
