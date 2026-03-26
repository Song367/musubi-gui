import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatGpuChoiceLabel,
  getGpuPressureState,
  orderGpuDevices,
} from '../static/gpu-utils.js';

test('formatGpuChoiceLabel includes utilization and memory pressure', () => {
  const label = formatGpuChoiceLabel({
    index: 3,
    name: 'NVIDIA RTX 4090',
    utilization: 64,
    memory_used: 18432,
    memory_total: 24576,
  });

  assert.equal(
    label,
    'GPU 3 | NVIDIA RTX 4090 | 64% util | 18.0/24.0 GB (75%)'
  );
});

test('formatGpuChoiceLabel tolerates alternate gpu metric keys', () => {
  const label = formatGpuChoiceLabel({
    index: '1',
    name: 'RTX 3090',
    utilization_gpu: 12,
    memory_used_mb: 4096,
    memory_total_mb: 24576,
  });

  assert.equal(
    label,
    'GPU 1 | RTX 3090 | 12% util | 4.0/24.0 GB (17%)'
  );
});

test('getGpuPressureState marks hot gpus by utilization or memory pressure', () => {
  assert.deepEqual(
    getGpuPressureState({
      index: 0,
      name: 'RTX 4090',
      utilization: 91,
      memory_used: 10240,
      memory_total: 24576,
    }),
    { tone: 'hot', label: 'HOT', memoryPercent: 42, utilization: 91 }
  );

  assert.deepEqual(
    getGpuPressureState({
      index: 1,
      name: 'RTX 3090',
      utilization_gpu: 55,
      memory_used_mb: 19456,
      memory_total_mb: 24576,
    }),
    { tone: 'warn', label: 'BUSY', memoryPercent: 79, utilization: 55 }
  );

  assert.deepEqual(
    getGpuPressureState({
      index: 2,
      name: 'RTX 3090',
      utilization: 14,
      memory_used: 2048,
      memory_total: 24576,
    }),
    { tone: 'ok', label: 'READY', memoryPercent: 8, utilization: 14 }
  );
});

test('orderGpuDevices sorts by availability when no previous order exists', () => {
  const ordered = orderGpuDevices([
    { index: 2, name: 'GPU 2', utilization: 92, memory_used: 1024, memory_total: 24576 },
    { index: 1, name: 'GPU 1', utilization: 18, memory_used: 4096, memory_total: 24576 },
    { index: 0, name: 'GPU 0', utilization: 22, memory_used: 2048, memory_total: 24576 },
    { index: 3, name: 'GPU 3', utilization: 55, memory_used: 20480, memory_total: 24576 },
  ]);

  assert.deepEqual(
    ordered.map(gpu => gpu.index),
    [0, 1, 3, 2]
  );
});

test('orderGpuDevices preserves previous order for the same gpu set', () => {
  const ordered = orderGpuDevices(
    [
      { index: 0, name: 'GPU 0', utilization: 88, memory_used: 22000, memory_total: 24576 },
      { index: 1, name: 'GPU 1', utilization: 12, memory_used: 2048, memory_total: 24576 },
      { index: 2, name: 'GPU 2', utilization: 15, memory_used: 3072, memory_total: 24576 },
    ],
    ['2', '0', '1']
  );

  assert.deepEqual(
    ordered.map(gpu => gpu.index),
    [2, 0, 1]
  );
});
