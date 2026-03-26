export function readGpuMetric(gpu, primaryKey, fallbackKey) {
  const value = gpu?.[primaryKey] ?? gpu?.[fallbackKey] ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatGpuGiBFromMb(megabytes) {
  return `${(readGpuMetric({ value: megabytes }, 'value') / 1024).toFixed(1)} GB`;
}

export function getGpuPressureState(gpu) {
  const utilization = readGpuMetric(gpu, 'utilization', 'utilization_gpu');
  const memoryUsed = readGpuMetric(gpu, 'memory_used', 'memory_used_mb');
  const memoryTotal = readGpuMetric(gpu, 'memory_total', 'memory_total_mb');
  const memoryPercent = memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0;

  if (utilization >= 85 || memoryPercent >= 90) {
    return { tone: 'hot', label: 'HOT', memoryPercent, utilization };
  }
  if (utilization >= 65 || memoryPercent >= 75) {
    return { tone: 'warn', label: 'BUSY', memoryPercent, utilization };
  }
  return { tone: 'ok', label: 'READY', memoryPercent, utilization };
}

function gpuToneRank(tone) {
  if (tone === 'ok') return 0;
  if (tone === 'warn') return 1;
  return 2;
}

function normalizeGpuIndex(index) {
  return String(index);
}

export function orderGpuDevices(gpus, previousOrder = []) {
  const devices = Array.isArray(gpus) ? [...gpus] : [];
  const deviceIds = devices.map(gpu => normalizeGpuIndex(gpu.index));
  const previousIds = Array.isArray(previousOrder) ? previousOrder.map(normalizeGpuIndex) : [];
  const hasStableOrder = previousIds.length === deviceIds.length
    && previousIds.every(id => deviceIds.includes(id));

  if (hasStableOrder) {
    const byId = new Map(devices.map(gpu => [normalizeGpuIndex(gpu.index), gpu]));
    return previousIds.map(id => byId.get(id)).filter(Boolean);
  }

  return devices.sort((left, right) => {
    const leftPressure = getGpuPressureState(left);
    const rightPressure = getGpuPressureState(right);

    const toneDelta = gpuToneRank(leftPressure.tone) - gpuToneRank(rightPressure.tone);
    if (toneDelta !== 0) return toneDelta;

    const memoryDelta = leftPressure.memoryPercent - rightPressure.memoryPercent;
    if (memoryDelta !== 0) return memoryDelta;

    const utilizationDelta = leftPressure.utilization - rightPressure.utilization;
    if (utilizationDelta !== 0) return utilizationDelta;

    return Number(normalizeGpuIndex(left.index)) - Number(normalizeGpuIndex(right.index));
  });
}

export function formatGpuChoiceLabel(gpu) {
  const { memoryPercent, utilization } = getGpuPressureState(gpu);
  const memoryUsed = readGpuMetric(gpu, 'memory_used', 'memory_used_mb');
  const memoryTotal = readGpuMetric(gpu, 'memory_total', 'memory_total_mb');
  const memoryUsedGiB = (memoryUsed / 1024).toFixed(1);
  const memoryTotalGiB = (memoryTotal / 1024).toFixed(1);

  return [
    `GPU ${gpu.index}`,
    gpu.name || 'Unknown GPU',
    `${utilization}% util`,
    `${memoryUsedGiB}/${memoryTotalGiB} GB (${memoryPercent}%)`,
  ].join(' | ');
}
