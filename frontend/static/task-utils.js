export function getTaskId(task) {
  if (!task || typeof task !== 'object') return '';
  return task.id || task.task_id || '';
}

export function normalizeTaskStatus(status) {
  if (status === 'succeeded') return 'done';
  if (status === 'failed') return 'error';
  return status || 'unknown';
}
