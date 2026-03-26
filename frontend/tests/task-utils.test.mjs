import test from 'node:test';
import assert from 'node:assert/strict';

import { getTaskId, normalizeTaskStatus } from '../static/task-utils.js';

test('getTaskId prefers backend task id field', () => {
  assert.equal(
    getTaskId({ id: 'abc123', task_id: 'legacy456' }),
    'abc123'
  );
});

test('getTaskId falls back to legacy task_id field', () => {
  assert.equal(
    getTaskId({ task_id: 'legacy456' }),
    'legacy456'
  );
});

test('normalizeTaskStatus maps backend terminal states for the UI', () => {
  assert.equal(normalizeTaskStatus('running'), 'running');
  assert.equal(normalizeTaskStatus('succeeded'), 'done');
  assert.equal(normalizeTaskStatus('failed'), 'error');
  assert.equal(normalizeTaskStatus('stopped'), 'stopped');
});
