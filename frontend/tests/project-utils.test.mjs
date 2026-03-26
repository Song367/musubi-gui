import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProjectStatePayload,
  getProjectArch,
  mergeProjectSection,
} from '../static/project-utils.js';

test('getProjectArch resolves the architecture from project type', () => {
  assert.equal(getProjectArch({ project_type: 'wan22' }), 'wan22');
  assert.equal(getProjectArch({ project_type: 'zimage' }), 'zimage');
});

test('mergeProjectSection overlays saved fields on top of defaults', () => {
  const merged = mergeProjectSection(
    {
      model: { output_dir: '/outputs/default', output_name: 'default-name' },
      dataset: { image_dirs: ['/datasets/default'] },
      training: { mode: 'lora' },
      ui: { gpu_mode: 'all' },
    },
    {
      model: { output_name: 'demo-run' },
      training: { mode: 'full_finetune' },
    }
  );

  assert.deepEqual(merged.model, {
    output_dir: '/outputs/default',
    output_name: 'demo-run',
  });
  assert.deepEqual(merged.training, { mode: 'full_finetune' });
  assert.deepEqual(merged.ui, { gpu_mode: 'all' });
});

test('buildProjectStatePayload updates only the active architecture section', () => {
  const payload = buildProjectStatePayload({
    projectId: 'demo',
    projectType: 'zimage',
    name: 'demo',
    musubi_tuner_path: '/srv/musubi',
    python_bin: '/srv/python',
    section: {
      model: { dit_path: '/models/dit.safetensors' },
      dataset: { image_dirs: ['/data/images'] },
      training: { mode: 'lora' },
      ui: { gpu_mode: 'single' },
    },
  });

  assert.deepEqual(payload, {
    name: 'demo',
    musubi_tuner_path: '/srv/musubi',
    python_bin: '/srv/python',
    zimage: {
      model: { dit_path: '/models/dit.safetensors' },
      dataset: { image_dirs: ['/data/images'] },
      training: { mode: 'lora' },
      ui: { gpu_mode: 'single' },
    },
  });
});
