/* ── Wan 2.2 Training Console — app.js ──────────────────────────────── */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  projectId: null,
  activeTaskId: null,
  pollInterval: null,
  taskType: 'i2v',        // 'i2v' | 't2v'
  modelMode: 'dual',      // 'dual' | 'low' | 'high'
};

// ── DOM helpers ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const val = id => $(id)?.value?.trim() ?? '';
const checked = id => $(id)?.checked ?? false;
const setStatus = (id, msg, cls = '') => {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-line' + (cls ? ` ${cls}` : '');
};

// ── API helpers ────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail ?? msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ── Project ────────────────────────────────────────────────────────────────
async function createProject() {
  const name = val('project-name');
  const musubi = val('musubi-path');
  const python = val('python-bin');
  if (!name || !musubi || !python) {
    setStatus('project-status', 'Fill in all project fields.', 'error'); return;
  }
  try {
    const proj = await api('POST', '/api/projects', { name, musubi_tuner_path: musubi, python_bin: python });
    state.projectId = proj.id;
    setStatus('project-status', `✓ Project "${proj.name}" created (${proj.id})`, 'ok');
    updateSummary();
  } catch (e) {
    setStatus('project-status', `Error: ${e.message}`, 'error');
  }
}

async function loadProjects() {
  try {
    const projects = await api('GET', '/api/projects');
    if (!projects.length) { setStatus('project-status', 'No existing projects found.'); return; }
    // Use the most recently created (by id sort)
    const proj = projects[projects.length - 1];
    state.projectId = proj.id;
    $('project-name').value = proj.name;
    $('musubi-path').value = proj.musubi_tuner_path;
    $('python-bin').value = proj.python_bin;
    setStatus('project-status', `✓ Loaded project "${proj.name}" (${proj.id})`, 'ok');
    updateSummary();
  } catch (e) {
    setStatus('project-status', `Error: ${e.message}`, 'error');
  }
}

// ── Task Type / Mode ───────────────────────────────────────────────────────
function applyTaskType(type) {
  state.taskType = type;
  document.querySelectorAll('#task-type-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.task === type);
  });
  // Update default flow shift
  const shift = type === 'i2v' ? '5.0' : '12.0';
  $('discrete-flow-shift').value = shift;
  // Update dit-label
  $('dit-label').textContent = state.modelMode === 'dual' ? '(Low Noise)' : `(${state.modelMode === 'low' ? 'Low' : 'High'} Noise)`;
  // Update i2v-mode checkbox
  $('i2v-mode').checked = type === 'i2v';
  updateTimestepDefaults();
  updateSummary();
}

function applyModelMode(mode) {
  state.modelMode = mode;
  const isDual = mode === 'dual';
  const isHigh = mode === 'high';

  $('dit-high-noise-field').classList.toggle('hidden', !isDual);
  $('timestep-range-fields').classList.toggle('hidden', isDual);
  $('timestep-boundary-fields').classList.toggle('hidden', !isDual);

  const ditLabel = isDual ? '(Low Noise)' : (isHigh ? '(High Noise)' : '(Low Noise)');
  $('dit-label').textContent = ditLabel;

  updateTimestepDefaults();
  updateSummary();
}

function updateTimestepDefaults() {
  const { taskType, modelMode } = state;
  if (modelMode === 'low') {
    $('min-timestep').value = 0;
    $('max-timestep').value = taskType === 'i2v' ? 900 : 875;
  } else if (modelMode === 'high') {
    $('min-timestep').value = taskType === 'i2v' ? 900 : 875;
    $('max-timestep').value = 1000;
  } else {
    $('min-timestep').value = 0;
    $('max-timestep').value = 1000;
    $('timestep-boundary').value = taskType === 'i2v' ? -1 : -1;
  }
}

// ── Summary ────────────────────────────────────────────────────────────────
function updateSummary() {
  const taskLabel = state.taskType === 'i2v' ? 'i2v-A14B' : 't2v-A14B';
  const modeLabel = { dual: 'Dual Model', low: 'Low Noise', high: 'High Noise' }[state.modelMode] ?? state.modelMode;
  $('sum-task').textContent = taskLabel;
  $('sum-mode').textContent = modeLabel;
  $('sum-epochs').textContent = val('max-train-epochs') || '16';
  $('sum-lr').textContent = val('learning-rate') || '2e-4';

  const dot = $('global-status-dot');
  const txt = $('global-status-text');
  if (state.activeTaskId) {
    dot.className = 'status-dot running';
    txt.textContent = 'Running';
  } else {
    dot.className = 'status-dot';
    txt.textContent = 'Idle';
  }
}

// ── Dataset directories ────────────────────────────────────────────────────
function addVideoDir(path = '') {
  const list = $('video-dir-list');
  const item = document.createElement('div');
  item.className = 'dir-item';
  item.innerHTML = `
    <input type="text" placeholder="/path/to/videos" value="${path}" />
    <button class="remove-btn" title="Remove">✕</button>`;
  item.querySelector('.remove-btn').addEventListener('click', () => item.remove());
  list.appendChild(item);
}

function getVideoDirs() {
  return [...$('video-dir-list').querySelectorAll('input')]
    .map(i => i.value.trim())
    .filter(Boolean);
}

// ── Dataset Config ─────────────────────────────────────────────────────────
async function generateDatasetConfig() {
  if (!state.projectId) { setStatus('dataset-status', 'Create a project first.', 'error'); return; }
  const dirs = getVideoDirs();
  if (!dirs.length) { setStatus('dataset-status', 'Add at least one video directory.', 'error'); return; }

  const payload = {
    video_dirs: dirs,
    resolution: [parseInt(val('res-width')), parseInt(val('res-height'))],
    batch_size: parseInt(val('batch-size')) || 1,
    target_frames: parseInt(val('target-frames')) || 81,
    frame_extraction: val('frame-extraction') || 'head',
    fps: parseInt(val('dataset-fps')) || 16,
  };
  try {
    const res = await api('POST', `/api/projects/${state.projectId}/dataset-config/video`, payload);
    $('dataset-preview').textContent = res.content;
    setStatus('dataset-status', `✓ Config written to ${res.path}`, 'ok');
  } catch (e) {
    setStatus('dataset-status', `Error: ${e.message}`, 'error');
  }
}

// ── Model Check ────────────────────────────────────────────────────────────
async function checkModels() {
  if (!state.projectId) { setStatus('model-status', 'Create a project first.', 'error'); return; }
  const payload = {
    dit_path: val('dit-path'),
    dit_high_noise_path: state.modelMode === 'dual' ? val('dit-high-noise-path') : '',
    vae_path: val('vae-path'),
    t5_path: val('t5-path'),
  };
  try {
    const res = await api('POST', `/api/projects/${state.projectId}/models/check`, payload);
    const container = $('model-check-results');
    container.innerHTML = '';
    for (const [key, info] of Object.entries(res)) {
      const row = document.createElement('div');
      row.className = 'model-check-row';
      const icon = info.exists ? '✓' : '✗';
      const cls  = info.exists ? 'ok' : 'miss';
      const label = key.replace(/_/g, ' ');
      row.innerHTML = `<span class="check-icon ${cls}">${icon}</span><span>${label}: <span class="text-mono">${info.path}</span></span>`;
      container.appendChild(row);
    }
    const allOk = Object.values(res).every(v => v.exists);
    setStatus('model-status', allOk ? '✓ All model paths found.' : '⚠ Some paths missing.', allOk ? 'ok' : 'error');
  } catch (e) {
    setStatus('model-status', `Error: ${e.message}`, 'error');
  }
}

// ── Task Launching ─────────────────────────────────────────────────────────
function requireProject() {
  if (!state.projectId) { alert('Create or load a project first.'); return false; }
  return true;
}

async function cacheLatents() {
  if (!requireProject()) return;
  markStep(1, 'active');
  setStatus('run-status', 'Launching latent cache…', 'info');
  const payload = {
    vae_path: val('vae-path'),
    i2v: checked('i2v-mode'),
    vae_cache_cpu: checked('vae-cache-cpu'),
    clip_path: 'wan2.1_is_handled_by_backend',
    gpu_index: val('gpu-index'),
  };
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/wan/prepare/latents`, payload);
    startPolling(task.task_id, 'Caching latents…');
    markStep(1, 'done');
  } catch (e) {
    setStatus('run-status', `Error: ${e.message}`, 'error');
    markStep(1, '');
  }
}

async function cacheTextEncoder() {
  if (!requireProject()) return;
  markStep(2, 'active');
  setStatus('run-status', 'Launching text encoder cache…', 'info');
  const payload = {
    t5_path: val('t5-path'),
    batch_size: parseInt(val('te-batch-size')) || 16,
    fp8_t5: checked('fp8-t5'),
    gpu_index: val('gpu-index'),
  };
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/wan/prepare/text-encoder`, payload);
    startPolling(task.task_id, 'Caching text encoder…');
    markStep(2, 'done');
  } catch (e) {
    setStatus('run-status', `Error: ${e.message}`, 'error');
    markStep(2, '');
  }
}

async function startTraining() {
  if (!requireProject()) return;
  markStep(3, 'active');
  setStatus('run-status', 'Launching training…', 'info');

  const taskLabel = state.taskType === 'i2v' ? 'i2v-A14B' : 't2v-A14B';
  const isDual = state.modelMode === 'dual';

  const payload = {
    task: taskLabel,
    dit_path: val('dit-path'),
    dit_high_noise_path: isDual ? val('dit-high-noise-path') : '',
    vae_path: val('vae-path'),
    t5_path: val('t5-path'),
    output_dir: val('output-dir'),
    output_name: val('output-name'),
    mixed_precision: val('mixed-precision'),
    learning_rate: parseFloat(val('learning-rate')) || 2e-4,
    optimizer_type: val('optimizer-type'),
    lr_scheduler: val('lr-scheduler'),
    lr_warmup_steps: parseInt(val('lr-warmup-steps')) || 10,
    max_train_epochs: parseInt(val('max-train-epochs')) || 16,
    save_every_n_epochs: parseInt(val('save-every-n-epochs')) || 1,
    seed: parseInt(val('seed')) || 42,
    network_dim: parseInt(val('network-dim')) || 32,
    network_alpha: parseInt(val('network-alpha')) || 32,
    timestep_sampling: val('timestep-sampling'),
    discrete_flow_shift: parseFloat(val('discrete-flow-shift')) || 5.0,
    min_timestep: parseInt(val('min-timestep')) || 0,
    max_timestep: parseInt(val('max-timestep')) || 1000,
    timestep_boundary: isDual ? parseFloat(val('timestep-boundary')) : -1,
    preserve_distribution_shape: !isDual && checked('preserve-dist-shape'),
    gradient_checkpointing: checked('gradient-checkpointing'),
    fp8_base: checked('fp8-base'),
    blocks_to_swap: parseInt(val('blocks-to-swap')) || 0,
    offload_inactive_dit: checked('offload-inactive-dit'),
    sdpa: checked('sdpa'),
    persistent_data_loader_workers: checked('persistent-workers'),
    gpu_index: val('gpu-index'),
  };

  try {
    const task = await api('POST', `/api/projects/${state.projectId}/wan/train`, payload);
    startPolling(task.task_id, 'Training…');
  } catch (e) {
    setStatus('run-status', `Error: ${e.message}`, 'error');
    markStep(3, '');
  }
}

async function stopTask() {
  if (!state.activeTaskId) return;
  try {
    await api('POST', `/api/tasks/${state.activeTaskId}/stop`);
    setStatus('run-status', 'Stop signal sent.', 'info');
  } catch (e) {
    setStatus('run-status', `Stop error: ${e.message}`, 'error');
  }
}

// ── Task Polling ───────────────────────────────────────────────────────────
function startPolling(taskId, label = 'Running…') {
  stopPolling();
  state.activeTaskId = taskId;
  $('task-id-line').textContent = `Task: ${taskId}`;
  setLogBadge('running');
  updateSummary();
  setStatus('run-status', label, 'info');
  state.pollInterval = setInterval(() => pollTask(taskId), 2000);
  pollTask(taskId);
}

function stopPolling() {
  if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; }
}

async function pollTask(taskId) {
  try {
    const task = await api('GET', `/api/tasks/${taskId}`);
    // Fetch logs
    const logs = await api('GET', `/api/tasks/${taskId}/logs`);
    $('log-output').textContent = logs.content || '(no output yet)';
    $('log-output').scrollTop = $('log-output').scrollHeight;

    if (task.status === 'running') {
      setLogBadge('running');
    } else if (task.status === 'done') {
      setLogBadge('done');
      setStatus('run-status', '✓ Task completed.', 'ok');
      stopPolling();
      state.activeTaskId = null;
      updateSummary();
    } else if (task.status === 'error' || task.status === 'failed') {
      setLogBadge('error');
      setStatus('run-status', 'Task failed. Check logs.', 'error');
      stopPolling();
      state.activeTaskId = null;
      updateSummary();
    }
  } catch {}
}

async function manualRefreshTask() {
  if (!state.activeTaskId) {
    setStatus('run-status', 'No active task to refresh.'); return;
  }
  await pollTask(state.activeTaskId);
}

function setLogBadge(status) {
  const badge = $('log-badge');
  badge.className = `log-badge ${status}`;
  badge.textContent = { running: 'Running', done: 'Done', error: 'Error', '': 'Idle' }[status] ?? status;

  const dot = $('global-status-dot');
  const txt = $('global-status-text');
  if (status === 'running') { dot.className = 'status-dot running'; txt.textContent = 'Running'; }
  else if (status === 'done') { dot.className = 'status-dot done'; txt.textContent = 'Done'; }
  else if (status === 'error') { dot.className = 'status-dot error'; txt.textContent = 'Error'; }
  else { dot.className = 'status-dot'; txt.textContent = 'Idle'; }
}

// ── Step indicator helpers ─────────────────────────────────────────────────
function markStep(num, st) {
  const el = $(`step${num}-num`);
  if (!el) return;
  el.parentElement.classList.remove('active', 'done');
  if (st === 'active') el.parentElement.classList.add('active');
  else if (st === 'done') el.parentElement.classList.add('done');
}

const WAN22_PANELS  = ['#wan22-section-sidebar', '#wan22-top-row-cols', '#wan22-training-panel', '#wan22-run-row'];
const ZIMAGE_PANELS = ['#zimage-top-row', '#zimage-training-panel', '#zimage-run-row'];

function applyArch(arch) {
  state.arch = arch;
  document.querySelectorAll('#arch-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.arch === arch);
  });

  const isWan = arch === 'wan22';
  const isZi = arch === 'zimage';
  const isTasks = arch === 'tasks';

  const labels = {
    'wan22': 'Wan 2.2',
    'zimage': 'Z-Image',
    'tasks': 'Task Queue'
  };
  const badge = document.querySelector('.topbar-badge');
  if (badge) badge.textContent = labels[arch] || 'Wan 2.2';

  // Wan 2.2 main area panels
  const wanPanels = ['wan22-top-row-cols', 'wan22-training-panel', 'wan22-run-row'];
  const ziPanels  = ['zimage-top-row', 'zimage-training-panel', 'zimage-run-row'];
  const tasksPanels = ['tasks-content'];

  // Sidebar Task Type section (only relevant for Wan 2.2)
  const taskTypeSection = $('wan22-section-sidebar');
  if (taskTypeSection) taskTypeSection.classList.toggle('hidden', !isWan);

  const globalSidebar = $('global-sidebar');
  if (globalSidebar) globalSidebar.style.display = isTasks ? 'none' : '';
  const appLayout = document.querySelector('.app-layout');
  if (appLayout) appLayout.classList.toggle('tasks-mode', isTasks);

  wanPanels.forEach(id => $(id)?.classList.toggle('hidden', !isWan));
  ziPanels .forEach(id => $(id)?.classList.toggle('hidden',  !isZi));
  tasksPanels.forEach(id => $(id)?.classList.toggle('hidden', !isTasks));

  if (isTasks) {
    loadTaskQueue();
  }
}

// ── Z-Image Dataset dirs ───────────────────────────────────────────────────
function addImageDir(path = '') {
  const list = $('zi-image-dir-list');
  const item = document.createElement('div');
  item.className = 'dir-item';
  item.innerHTML = `<input type="text" placeholder="/path/to/images" value="${path}" />
    <button class="remove-btn" title="Remove">✕</button>`;
  item.querySelector('.remove-btn').addEventListener('click', () => item.remove());
  list.appendChild(item);
}

function getImageDirs() {
  return [...$('zi-image-dir-list').querySelectorAll('input')]
    .map(i => i.value.trim())
    .filter(Boolean);
}

// ── Z-Image Dataset Config ─────────────────────────────────────────────────
async function ziGenerateDatasetConfig() {
  if (!state.projectId) { setStatus('zi-dataset-status', 'Create a project first.', 'error'); return; }
  const dirs = getImageDirs();
  if (!dirs.length) { setStatus('zi-dataset-status', 'Add at least one image directory.', 'error'); return; }
  const payload = {
    image_dirs: dirs,
    resolution: [parseInt(val('zi-res-width')), parseInt(val('zi-res-height'))],
    batch_size: parseInt(val('zi-batch-size')) || 1,
  };
  try {
    const res = await api('POST', `/api/projects/${state.projectId}/dataset-config`, payload);
    $('zi-dataset-preview').textContent = res.content;
    setStatus('zi-dataset-status', `✓ Config written to ${res.path}`, 'ok');
  } catch (e) {
    setStatus('zi-dataset-status', `Error: ${e.message}`, 'error');
  }
}

// ── Z-Image Model Check ────────────────────────────────────────────────────
async function ziCheckModels() {
  if (!state.projectId) { setStatus('zi-model-status', 'Create a project first.', 'error'); return; }
  const payload = {
    dit_path: val('zi-dit-path'),
    vae_path: val('zi-vae-path'),
    t5_path:  val('zi-text-encoder-path'),   // reuse t5 field for text encoder
  };
  try {
    const res = await api('POST', `/api/projects/${state.projectId}/models/check`, payload);
    const container = $('zi-model-check-results');
    container.innerHTML = '';
    for (const [key, info] of Object.entries(res)) {
      const row = document.createElement('div');
      row.className = 'model-check-row';
      const icon = info.exists ? '✓' : '✗';
      const cls  = info.exists ? 'ok' : 'miss';
      row.innerHTML = `<span class="check-icon ${cls}">${icon}</span><span>${key.replace(/_/g,' ')}: <span class="text-mono">${info.path}</span></span>`;
      container.appendChild(row);
    }
    const allOk = Object.values(res).every(v => v.exists);
    setStatus('zi-model-status', allOk ? '✓ All paths found.' : '⚠ Some paths missing.', allOk ? 'ok' : 'error');
  } catch (e) {
    setStatus('zi-model-status', `Error: ${e.message}`, 'error');
  }
}

// ── Z-Image Task Polling ───────────────────────────────────────────────────
function ziMarkStep(num, st) {
  const el = $(`zi-step${num}-num`);
  if (!el) return;
  el.parentElement.classList.remove('active', 'done');
  if (st === 'active') el.parentElement.classList.add('active');
  else if (st === 'done') el.parentElement.classList.add('done');
}

function ziSetLogBadge(status) {
  const badge = $('zi-log-badge');
  if (!badge) return;
  badge.className = `log-badge ${status}`;
  badge.textContent = { running: 'Running', done: 'Done', error: 'Error', '': 'Idle' }[status] ?? status;
}

async function ziPollTask(taskId) {
  try {
    const task = await api('GET', `/api/tasks/${taskId}`);
    const logs = await api('GET', `/api/tasks/${taskId}/logs`);
    $('zi-log-output').textContent = logs.content || '(no output yet)';
    $('zi-log-output').scrollTop = $('zi-log-output').scrollHeight;

    if (task.status === 'running') {
      ziSetLogBadge('running');
    } else if (task.status === 'done') {
      ziSetLogBadge('done');
      setStatus('zi-run-status', '✓ Task completed.', 'ok');
      stopPolling();
      state.activeTaskId = null;
      updateSummary();
    } else if (task.status === 'error' || task.status === 'failed') {
      ziSetLogBadge('error');
      setStatus('zi-run-status', 'Task failed. Check logs.', 'error');
      stopPolling();
      state.activeTaskId = null;
      updateSummary();
    }
  } catch {}
}

function ziStartPolling(taskId, label = 'Running…') {
  stopPolling();
  state.activeTaskId = taskId;
  ziSetLogBadge('running');
  setStatus('zi-run-status', label, 'info');
  updateSummary();
  state.pollInterval = setInterval(() => ziPollTask(taskId), 2000);
  ziPollTask(taskId);
}

// ── Z-Image Task Launchers ─────────────────────────────────────────────────
async function ziCacheLatents() {
  if (!requireProject()) return;
  ziMarkStep(1, 'active');
  setStatus('zi-run-status', 'Launching Z-Image latent cache…', 'info');
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/zimage/prepare/latents`, {
      vae_path: val('zi-vae-path'),
    });
    ziStartPolling(task.task_id, 'Caching latents…');
    ziMarkStep(1, 'done');
  } catch (e) {
    setStatus('zi-run-status', `Error: ${e.message}`, 'error');
    ziMarkStep(1, '');
  }
}

async function ziCacheTextEncoder() {
  if (!requireProject()) return;
  ziMarkStep(2, 'active');
  setStatus('zi-run-status', 'Launching Z-Image text encoder cache…', 'info');
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/zimage/prepare/text-encoder`, {
      vae_path: val('zi-vae-path'),
      text_encoder_path: val('zi-text-encoder-path'),
    });
    ziStartPolling(task.task_id, 'Caching text encoder…');
    ziMarkStep(2, 'done');
  } catch (e) {
    setStatus('zi-run-status', `Error: ${e.message}`, 'error');
    ziMarkStep(2, '');
  }
}

async function ziStartTraining() {
  if (!requireProject()) return;
  ziMarkStep(3, 'active');
  setStatus('zi-run-status', 'Launching Z-Image training…', 'info');
  const payload = {
    mode: val('zi-train-mode') || 'lora',
    dit_path: val('zi-dit-path'),
    vae_path: val('zi-vae-path'),
    text_encoder_path: val('zi-text-encoder-path'),
    output_dir: val('output-dir'),
    output_name: val('output-name'),
    learning_rate: parseFloat(val('zi-learning-rate')) || 1e-4,
    optimizer_type: val('zi-optimizer'),
    lr_scheduler: val('zi-lr-scheduler'),
    lr_warmup_steps: parseInt(val('zi-warmup-steps')) || 10,
    max_train_epochs: parseInt(val('zi-epochs')) || 12,
    save_every_n_epochs: parseInt(val('zi-save-every')) || 1,
    network_dim: parseInt(val('zi-network-dim')) || 32,
    network_alpha: parseInt(val('zi-network-alpha')) || 32,
    timestep_sampling: val('zi-timestep-sampling') || 'shift',
    weighting_scheme: val('zi-weighting-scheme') || 'none',
    discrete_flow_shift: parseFloat(val('zi-discrete-flow-shift')) || 2.0,
    blocks_to_swap: parseInt(val('zi-blocks-to-swap')) || 0,
    optimizer_args: val('zi-optimizer-args'),
    max_grad_norm: parseFloat(val('zi-max-grad-norm')) || 0.0,
    gradient_checkpointing: checked('zi-gradient-checkpointing'),
    sdpa: checked('zi-sdpa'),
    fused_backward_pass: checked('zi-fused-backward'),
    full_bf16: checked('zi-full-bf16'),
    gpu_index: val('zi-gpu-index'),
  };
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/zimage/train`, payload);
    ziStartPolling(task.task_id, 'Training…');
  } catch (e) {
    setStatus('zi-run-status', `Error: ${e.message}`, 'error');
    ziMarkStep(3, '');
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
  state.arch = 'wan22';

  // Wan 2.2 buttons
  $('create-project').addEventListener('click', createProject);
  $('load-projects').addEventListener('click', loadProjects);
  $('check-models').addEventListener('click', checkModels);
  $('generate-dataset').addEventListener('click', generateDatasetConfig);
  $('add-video-dir').addEventListener('click', () => addVideoDir());
  $('cache-latents').addEventListener('click', cacheLatents);
  $('cache-text-encoder').addEventListener('click', cacheTextEncoder);
  $('start-training').addEventListener('click', startTraining);
  $('stop-task').addEventListener('click', stopTask);
  $('refresh-task').addEventListener('click', manualRefreshTask);
  $('download-all-assets').addEventListener('click', downloadAllAssets);

  // Z-Image buttons
  $('zi-check-models').addEventListener('click', ziCheckModels);
  $('zi-download-all-assets').addEventListener('click', ziDownloadAllAssets);
  $('zi-generate-dataset').addEventListener('click', ziGenerateDatasetConfig);
  $('zi-add-image-dir').addEventListener('click', () => addImageDir());
  $('zi-cache-latents').addEventListener('click', ziCacheLatents);
  $('zi-cache-text-encoder').addEventListener('click', ziCacheTextEncoder);
  $('zi-start-training').addEventListener('click', ziStartTraining);
  $('zi-refresh-task').addEventListener('click', () => { if (state.activeTaskId) ziPollTask(state.activeTaskId); });

  // Z-Image Mode Defaults
  $('zi-train-mode')?.addEventListener('change', e => {
    if (e.target.value === 'full_finetune') {
      $('zi-learning-rate').value = '0.000001';
      $('zi-optimizer').value = 'adafactor';
    } else {
      $('zi-learning-rate').value = '0.0001';
      $('zi-optimizer').value = 'adamw8bit';
    }
  });

  // Architecture toggle
  document.querySelectorAll('#arch-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => applyArch(btn.dataset.arch));
  });

  // Task type tabs (Wan 2.2)
  document.querySelectorAll('#task-type-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTaskType(btn.dataset.task));
  });

  // Model mode
  $('train-model-mode').addEventListener('change', e => applyModelMode(e.target.value));

  // Resolution presets
  document.querySelectorAll('.res-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      $('res-width').value  = btn.dataset.w;
      $('res-height').value = btn.dataset.h;
    });
  });

  // Summary live-update
  ['max-train-epochs','learning-rate'].forEach(id => {
    $(id)?.addEventListener('input', updateSummary);
  });

  // Default dirs
  addVideoDir('/datasets/wan22');
  addImageDir('/datasets/zimage');

  // Apply initial mode
  applyModelMode('dual');
  applyTaskType('i2v');
  applyArch('wan22');

  updateSummary();
}

// ── Download All Assets ────────────────────────────────────────────────────
async function downloadAllAssets() {
  if (!state.projectId) { setStatus('model-status', 'Create a project first.', 'error'); return; }
  const targetDir = '/models/wan22';
  const taskType = state.taskType;

  const ditLowId  = `wan22_dit_lownoise_${taskType}`;
  const ditHighId = `wan22_dit_highnoise_${taskType}`;

  // Get defaults
  let defaults = {};
  try { defaults = await api('GET', '/api/models/sources/defaults'); } catch {}

  const assets = {
    vae: { source_type: 'official', source_id: 'wan22_vae', asset: 'vae',
            filename: defaults['wan22_vae'] || 'split_files/vae/wan_2.1_vae.safetensors',
            target_dir: targetDir },
    t5:  { source_type: 'official', source_id: 'wan22_t5',  asset: 't5',
            filename: defaults['wan22_t5']  || 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
            target_dir: targetDir },
    dit_low:  { source_type: 'official', source_id: ditLowId,  asset: 'dit_low',
                filename: defaults[ditLowId]  || `split_files/diffusion_models/wan2.2_${taskType}_low_noise_fp16.safetensors`,
                target_dir: targetDir },
    dit_high: { source_type: 'official', source_id: ditHighId, asset: 'dit_high',
                filename: defaults[ditHighId] || `split_files/diffusion_models/wan2.2_${taskType}_high_noise_fp16.safetensors`,
                target_dir: targetDir },
  };

  try {
    setStatus('model-status', 'Starting batch model download…', 'info');
    const task = await api('POST', `/api/projects/${state.projectId}/models/download-all`, { assets });
    startPolling(task.task_id, 'Downloading models…');
    setStatus('model-status', `Download task launched: ${task.task_id}`, 'info');
  } catch (e) {
    setStatus('model-status', `Download error: ${e.message}`, 'error');
  }
}

// ── Z-Image Download All Assets ───────────────────────────────────────────
async function ziDownloadAllAssets() {
  if (!state.projectId) { setStatus('zi-model-status', 'Create a project first.', 'error'); return; }
  const targetDir = '/models/zimage';

  let defaults = {};
  try { defaults = await api('GET', '/api/models/sources/defaults'); } catch {}

  const assets = {
    dit: { source_type: 'official', source_id: 'zimage_dit', asset: 'dit',
           filename: defaults['zimage_dit'] || 'split_files/diffusion_models/z_image_bf16.safetensors',
           target_dir: targetDir },
    vae: { source_type: 'official', source_id: 'zimage_vae', asset: 'vae',
           filename: defaults['zimage_vae'] || 'split_files/vae/ae.safetensors',
           target_dir: targetDir },
    te:  { source_type: 'official', source_id: 'zimage_text_encoder', asset: 'text_encoder',
           filename: defaults['zimage_text_encoder'] || 'split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors',
           target_dir: targetDir },
  };

  try {
    setStatus('zi-model-status', 'Starting batch model download…', 'info');
    const task = await api('POST', `/api/projects/${state.projectId}/models/download-all`, { assets });
    ziStartPolling(task.task_id, 'Downloading models…');
    setStatus('zi-model-status', `Download task launched: ${task.task_id}`, 'info');
  } catch (e) {
    setStatus('zi-model-status', `Download error: ${e.message}`, 'error');
  }
}

// ── GPU Polling ────────────────────────────────────────────────────────────
async function pollGPUStatus() {
  try {
    const res = await api('GET', '/api/gpu/status');
    const textEl = $('gpu-text');
    const dash = $('tasks-gpu-dashboard');
    
    if (res.error && res.gpus.length === 0) {
      if (textEl) textEl.textContent = 'Error or No GPU';
      if (dash && state.arch === 'tasks') dash.innerHTML = `<div style="padding:16px; color:var(--danger)">Error: ${res.error}</div>`;
      return;
    }
    
    if (textEl) {
      const metrics = res.gpus.map(g => `[${g.index}] ${g.utilization}% | ${g.memory_used}MB`);
      textEl.textContent = metrics.join('  ·  ');
    }
    
    if (dash && state.arch === 'tasks') {
      dash.innerHTML = res.gpus.map(g => {
        const memPct = Math.round((g.memory_used / Math.max(1, g.memory_total)) * 100);
        return `
          <div style="flex:1; min-width:260px; background:var(--bg-base); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px;">
            <div style="font-weight:600; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:1.1rem;">GPU ${g.index}</span>
              <span style="font-size:0.8rem; color:var(--text-muted); background:var(--bg-card); padding:2px 8px; border-radius:12px;">${g.name}</span>
            </div>
            <div style="margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:6px; color:var(--text-secondary);">
                <span>Core Utilization</span>
                <span style="color:var(--text-primary); font-weight:500;">${g.utilization}%</span>
              </div>
              <div style="width:100%; height:6px; background:var(--bg-card); border-radius:4px; overflow:hidden;">
                <div style="width:${g.utilization}%; height:100%; background:${g.utilization > 85 ? 'var(--danger)' : 'var(--accent)'}; transition:width 0.3s;"></div>
              </div>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:6px; color:var(--text-secondary);">
                <span>VRAM Usage</span>
                <span style="color:var(--text-primary); font-weight:500;">${g.memory_used} / ${g.memory_total} MB</span>
              </div>
              <div style="width:100%; height:6px; background:var(--bg-card); border-radius:4px; overflow:hidden;">
                <div style="width:${memPct}%; height:100%; background:${memPct > 85 ? 'var(--danger)' : 'var(--teal)'}; transition:width 0.3s;"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (e) {
    const textEl = $('gpu-text');
    if (textEl) textEl.textContent = 'Offline';
    const dash = $('tasks-gpu-dashboard');
    if (dash && state.arch === 'tasks') dash.innerHTML = `<div style="padding:16px; color:var(--danger)">Offline</div>`;
  }
}

setInterval(pollGPUStatus, 3000);
pollGPUStatus();

// ── Task Queue ─────────────────────────────────────────────────────────────
async function loadTaskQueue() {
  const tbody = $('task-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="padding:12px; text-align:center;" class="text-muted">Loading...</td></tr>';
  try {
    const res = await api('GET', '/api/tasks');
    tbody.innerHTML = '';
    if (!res.tasks || res.tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="padding:12px; text-align:center;" class="text-muted">No tasks found.</td></tr>';
      return;
    }
    for (const t of res.tasks) {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border)';
      
      let statusColor = 'var(--text-muted)';
      if (t.status === 'succeeded') statusColor = 'var(--accent)';
      if (t.status === 'failed') statusColor = '#ef4444';
      if (t.status === 'running') statusColor = 'var(--teal)';

      tr.innerHTML = `
        <td style="padding:12px 8px; font-size:0.85em; color:var(--text-muted);">---</td>
        <td style="padding:12px 8px; font-family:monospace; font-size:0.85em;">${t.id.substring(0,12)}</td>
        <td style="padding:12px 8px;">${t.task_type}</td>
        <td style="padding:12px 8px; color:${statusColor}; font-weight:500;">${t.status}</td>
        <td style="padding:12px 8px;">
          <a href="/api/tasks/${t.id}/logs" target="_blank" style="color:var(--accent); text-decoration:none; font-size:0.85rem;">Logs</a>
        </td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding:12px; color:#ef4444;">Error: ${e.message}</td></tr>`;
  }
}

$('refresh-tasks-btn')?.addEventListener('click', loadTaskQueue);

document.addEventListener('DOMContentLoaded', init);
