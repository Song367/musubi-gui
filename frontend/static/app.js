/* 鈹€鈹€ Wan 2.2 Training Console 鈥?app.js 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

import { formatGpuChoiceLabel, getGpuPressureState, orderGpuDevices } from './gpu-utils.js';
import { buildProjectStatePayload, getProjectArch, mergeProjectSection } from './project-utils.js';
import { getTaskId, normalizeTaskStatus } from './task-utils.js';

'use strict';

// 鈹€鈹€ State 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const state = {
  projectId: null,
  activeTaskId: null,
  pollInterval: null,
  taskType: 'i2v',        // 'i2v' | 't2v'
  modelMode: 'dual',      // 'dual' | 'low' | 'high'
  arch: 'wan22',
  projectType: '',
  projects: [],
  projectDefaults: null,
  projectSections: { wan22: null, zimage: null },
  hydratingProject: false,
  saveTimer: null,
  availableDatasets: [],
  selectedDatasetNames: [],
  gpuDevices: [],
  gpuOrder: [],
  gpuSelections: {
    wan: { mode: 'all', single: '', custom: [] },
    zi: { mode: 'all', single: '', custom: [] },
  },
};

const PROJECT_TYPE_LABELS = {
  wan22: 'Wan 2.2',
  zimage: 'Z-Image',
};

// 鈹€鈹€ DOM helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const $ = id => document.getElementById(id);
const val = id => $(id)?.value?.trim() ?? '';
const checked = id => $(id)?.checked ?? false;
const setStatus = (id, msg, cls = '') => {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-line' + (cls ? ` ${cls}` : '');
};

function getZImageAttentionFlags(source = null) {
  const training = source || {};
  const sageAttn = source ? Boolean(training.sage_attn) : checked('zi-sage-attn');
  const sdpa = source
    ? (sageAttn ? false : training.sdpa !== false)
    : !sageAttn;
  return { sdpa, sage_attn: sageAttn };
}

function applyZImageAttentionFlags(source = null) {
  const flags = getZImageAttentionFlags(source);
  setCheckbox('zi-sdpa', flags.sdpa);
  setCheckbox('zi-sage-attn', flags.sage_attn);
}

function syncZImageWorkerControls() {
  const workerInput = $('zi-data-loader-workers');
  const persistentEl = $('zi-persistent-workers');
  if (!workerInput || !persistentEl) return;
  const workerCount = Math.max(0, parseInt(workerInput.value, 10) || 0);
  workerInput.value = String(workerCount);
  persistentEl.disabled = workerCount === 0;
  if (workerCount === 0) {
    persistentEl.checked = false;
  }
}

function getGpuSelection(prefix) {
  return state.gpuSelections[prefix];
}

function getAvailableGpuIds() {
  return state.gpuDevices.map(gpu => String(gpu.index));
}

function setGpuSelectorMessage(prefix, message) {
  const el = $(`${prefix}-gpu-status`);
  if (!el) return;
  el.textContent = message;
}

function describeGpuChoice(gpu) {
  const pressure = getGpuPressureState(gpu);
  return `${pressure.label} | ${formatGpuChoiceLabel(gpu)}`;
}

function applyGpuToneClass(el, tone) {
  if (!el) return;
  el.classList.remove('gpu-tone-ok', 'gpu-tone-warn', 'gpu-tone-hot');
  if (tone) {
    el.classList.add(`gpu-tone-${tone}`);
  }
}

function sanitizeGpuSelection(prefix) {
  const selection = getGpuSelection(prefix);
  const availableIds = getAvailableGpuIds();
  const availableSet = new Set(availableIds);

  if (!availableIds.length) {
    selection.mode = 'all';
    selection.single = '';
    selection.custom = [];
    return;
  }

  if (!['all', 'single', 'custom'].includes(selection.mode)) {
    selection.mode = 'all';
  }
  if (!availableSet.has(selection.single)) {
    selection.single = availableIds[0];
  }
  selection.custom = selection.custom.filter(id => availableSet.has(id));
  if (!selection.custom.length) {
    selection.custom = [availableIds[0]];
  }
}

function renderGpuSelector(prefix, errorMessage = '') {
  const modeEl = $(`${prefix}-gpu-mode`);
  const selectEl = $(`${prefix}-gpu-select`);
  const customEl = $(`${prefix}-gpu-custom`);
  const customListEl = $(`${prefix}-gpu-custom-list`);
  if (!modeEl || !selectEl || !customEl || !customListEl) return;

  const selection = getGpuSelection(prefix);
  const availableIds = getAvailableGpuIds();
  const hasDevices = availableIds.length > 0;

  if (modeEl.options[1]) modeEl.options[1].disabled = !hasDevices;
  if (modeEl.options[2]) modeEl.options[2].disabled = !hasDevices;
  if (!hasDevices) {
    selection.mode = 'all';
  }
  modeEl.value = selection.mode;

  if (hasDevices) {
    selectEl.innerHTML = state.gpuDevices.map(gpu => (
      `<option value="${gpu.index}">${describeGpuChoice(gpu)}</option>`
    )).join('');
    selectEl.value = selection.single || availableIds[0];

    customListEl.innerHTML = state.gpuDevices.map(gpu => {
      const gpuId = String(gpu.index);
      const isChecked = selection.custom.includes(gpuId) ? ' checked' : '';
      const pressure = getGpuPressureState(gpu);
      return `
        <label class="toggle-item gpu-tone-${pressure.tone}">
          <input type="checkbox" value="${gpuId}"${isChecked} />
          <span class="toggle-check"></span>
          <span class="toggle-label">${describeGpuChoice(gpu)}</span>
        </label>`;
    }).join('');

    customListEl.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', () => {
        const selectedIds = [...customListEl.querySelectorAll('input[type="checkbox"]:checked')]
          .map(box => box.value);
        selection.custom = selectedIds.length ? selectedIds : [input.value];
        renderGpuSelector(prefix, errorMessage);
        scheduleProjectSave(true);
      });
    });
  } else {
    selectEl.innerHTML = '<option value="">No GPUs detected</option>';
    selectEl.value = '';
    customListEl.innerHTML = '';
  }

  const isSingleMode = selection.mode === 'single' && hasDevices;
  const isCustomMode = selection.mode === 'custom' && hasDevices;
  selectEl.classList.toggle('hidden', !isSingleMode);
  selectEl.disabled = !isSingleMode;
  customEl.classList.toggle('hidden', !isCustomMode);
  applyGpuToneClass(selectEl, null);

  if (!hasDevices) {
    setGpuSelectorMessage(prefix, errorMessage || 'GPU detection unavailable. Falling back to all visible GPUs.');
    return;
  }
  if (selection.mode === 'all') {
    setGpuSelectorMessage(prefix, `Using all ${availableIds.length} detected GPU${availableIds.length === 1 ? '' : 's'}.`);
    return;
  }
  if (selection.mode === 'single') {
    const gpu = state.gpuDevices.find(item => String(item.index) === selection.single);
    if (gpu) {
      const pressure = getGpuPressureState(gpu);
      applyGpuToneClass(selectEl, pressure.tone);
      setGpuSelectorMessage(prefix, `Using GPU ${gpu.index} (${gpu.name}) - ${pressure.label.toLowerCase()} load.`);
    } else {
      setGpuSelectorMessage(prefix, 'Using a single detected GPU.');
    }
    return;
  }
  setGpuSelectorMessage(prefix, `Using custom GPU set: ${selection.custom.join(', ')}.`);
}

function setupGpuSelector(prefix) {
  const modeEl = $(`${prefix}-gpu-mode`);
  const selectEl = $(`${prefix}-gpu-select`);
  if (!modeEl || !selectEl) return;

  modeEl.addEventListener('change', () => {
    const selection = getGpuSelection(prefix);
    selection.mode = modeEl.value;
    sanitizeGpuSelection(prefix);
    renderGpuSelector(prefix);
    scheduleProjectSave(true);
  });

  selectEl.addEventListener('change', () => {
    const selection = getGpuSelection(prefix);
    selection.single = selectEl.value;
    renderGpuSelector(prefix);
    scheduleProjectSave(true);
  });

  sanitizeGpuSelection(prefix);
  renderGpuSelector(prefix);
}

function syncGpuSelectors(gpus, errorMessage = '') {
  const normalized = Array.isArray(gpus) ? gpus.map(gpu => ({ ...gpu, index: String(gpu.index) })) : [];
  state.gpuDevices = orderGpuDevices(normalized, state.gpuOrder);
  state.gpuOrder = state.gpuDevices.map(gpu => String(gpu.index));
  ['wan', 'zi'].forEach(prefix => {
    sanitizeGpuSelection(prefix);
    renderGpuSelector(prefix, errorMessage);
  });
}

function getSelectedGpuValue(prefix) {
  const selection = getGpuSelection(prefix);
  if (!selection || !state.gpuDevices.length || selection.mode === 'all') {
    return '';
  }
  if (selection.mode === 'single') {
    return selection.single || '';
  }
  return selection.custom.join(',');
}

function handleTerminalTaskState(status, kind) {
  const isZi = kind === 'zi';
  const badgeFn = isZi ? ziSetLogBadge : setLogBadge;
  const statusId = isZi ? 'zi-run-status' : 'run-status';

  if (status === 'done') {
    badgeFn('done');
    setStatus(statusId, '鉁?Task completed.', 'ok');
  } else if (status === 'stopped') {
    badgeFn('');
    setStatus(statusId, 'Task stopped.', 'info');
  } else {
    badgeFn('error');
    setStatus(statusId, 'Task failed. Check logs.', 'error');
  }

  stopPolling();
  state.activeTaskId = null;
  updateSummary();
}

function setValue(id, value = '') {
  const el = $(id);
  if (!el) return;
  el.value = value ?? '';
}

function setCheckbox(id, value) {
  const el = $(id);
  if (!el) return;
  el.checked = Boolean(value);
}

function cloneSection(section) {
  return JSON.parse(JSON.stringify(section));
}

function getSelectedDatasetNames() {
  const picker = $('zi-dataset-picker');
  if (!picker) return [...state.selectedDatasetNames];
  return [...picker.selectedOptions].map(option => option.value);
}

function setSelectedDatasetNames(names = []) {
  state.selectedDatasetNames = [...new Set((names || []).filter(Boolean))];
  const picker = $('zi-dataset-picker');
  if (picker) {
    [...picker.options].forEach(option => {
      option.selected = state.selectedDatasetNames.includes(option.value);
    });
  }
  syncDatasetPreviewSelector();
}

function getSelectedDatasetDirs() {
  const selected = getSelectedDatasetNames();
  return selected
    .map(name => state.availableDatasets.find(dataset => dataset.name === name)?.path || '')
    .filter(Boolean);
}

function updateDatasetSummary({ selectedDatasetCount = 0, selectedImageCount = 0, mergedImageCount = 0 } = {}) {
  const selectedDatasetCountEl = $('zi-selected-dataset-count');
  const selectedImageCountEl = $('zi-selected-image-count');
  const mergedImageCountEl = $('zi-merged-image-count');
  if (selectedDatasetCountEl) selectedDatasetCountEl.textContent = String(selectedDatasetCount);
  if (selectedImageCountEl) selectedImageCountEl.textContent = String(selectedImageCount);
  if (mergedImageCountEl) mergedImageCountEl.textContent = String(mergedImageCount);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderDatasetSamples(containerId, samples = [], emptyMessage = 'No samples available yet.') {
  const container = $(containerId);
  if (!container) return;
  if (!samples.length) {
    container.innerHTML = `<div class="dataset-preview-empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  container.innerHTML = samples.map(sample => `
    <article class="dataset-sample-card">
      <img class="dataset-sample-image" src="${sample.image_url}" alt="${escapeHtml(sample.name)}" loading="lazy" />
      <div class="dataset-sample-meta">
        ${sample.source_dataset ? `<div class="dataset-sample-source">${escapeHtml(sample.source_dataset)}</div>` : ''}
        <div class="dataset-sample-name">${escapeHtml(sample.image_name || sample.name)}</div>
        <div class="dataset-sample-caption">${escapeHtml(sample.caption || '(no prompt text found)')}</div>
      </div>
    </article>
  `).join('');
}

function syncDatasetPreviewSelector() {
  const select = $('zi-preview-dataset-select');
  if (!select) return;
  const previous = select.value;
  const selected = getSelectedDatasetNames();
  select.innerHTML = '<option value="">Select a dataset</option>';
  selected.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  if (selected.includes(previous)) {
    select.value = previous;
  } else if (selected.length) {
    select.value = selected[0];
  }
}

function selectPrimaryDatasetPreview() {
  const select = $('zi-preview-dataset-select');
  if (!select) return '';
  const selected = getSelectedDatasetNames();
  const target = selected[0] || '';
  select.value = target;
  return target;
}

function setProjectStatus(message, cls = '') {
  setStatus('project-status', message, cls);
}

function formatProjectTypeLabel(projectType) {
  return PROJECT_TYPE_LABELS[projectType] || projectType || 'Unknown';
}

function updateProjectPickerOptions(projects) {
  state.projects = projects;
  const picker = $('project-picker');
  if (!picker) return;

  picker.innerHTML = '<option value="">Select a project</option>';
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = `${project.name} (${formatProjectTypeLabel(project.project_type)})`;
    picker.appendChild(option);
  });

  if (state.projectId) {
    picker.value = state.projectId;
  }
}

function updateProjectPickerLabel() {
  const picker = $('project-picker');
  if (!picker || !state.projectId) return;
  const option = [...picker.options].find(item => item.value === state.projectId);
  if (option) {
    option.textContent = `${val('project-name')} (${formatProjectTypeLabel(state.projectType)})`;
  }
}

function setProjectTypeFieldLocked(locked) {
  const field = $('project-type');
  if (!field) return;
  field.disabled = Boolean(locked);
}

function updateProjectActionButton() {
  const button = $('new-project-button');
  if (!button) return;
  button.textContent = state.projectId ? 'New Project' : 'Create Project';
}

function initializeProjectDraft(projectType = null) {
  if (!state.projectDefaults) return;
  if (state.arch !== 'tasks') {
    syncCurrentSectionToCache();
  }
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }

  const nextType = projectType || val('project-type') || (state.arch !== 'tasks' ? state.arch : 'wan22');
  state.projectId = null;
  state.projectType = nextType;
  state.projectSections = {
    wan22: cloneSection(state.projectDefaults.wan22),
    zimage: cloneSection(state.projectDefaults.zimage),
  };

  const picker = $('project-picker');
  if (picker) {
    picker.value = '';
  }
  setValue('project-type', nextType);
  setValue('project-name', '');
  setProjectTypeFieldLocked(false);
  updateProjectActionButton();
  applyArch(nextType);
  hydrateSectionForArch(nextType);
  loadZImageDatasets();
  setProjectStatus('New project draft. Fill the fields and click Create Project.', 'info');
  updateSummary();
}

function serializeGpuUi(prefix) {
  const selection = getGpuSelection(prefix);
  return {
    gpu_mode: selection.mode,
    gpu_single: selection.single,
    gpu_custom: [...selection.custom],
  };
}

function hydrateGpuUi(prefix, ui = {}) {
  const selection = getGpuSelection(prefix);
  selection.mode = ui.gpu_mode || 'all';
  selection.single = ui.gpu_single || '';
  selection.custom = Array.isArray(ui.gpu_custom) ? [...ui.gpu_custom] : [];
  sanitizeGpuSelection(prefix);
  renderGpuSelector(prefix);
}

function setDirList(listId, paths, addFn) {
  const list = $(listId);
  if (!list) return;
  list.innerHTML = '';
  const items = Array.isArray(paths) && paths.length ? paths : [''];
  items.forEach(path => addFn(path));
}

function serializeWanSection() {
  return {
    model: {
      vae_path: val('vae-path'),
      t5_path: val('t5-path'),
      dit_path: val('dit-path'),
      dit_high_noise_path: val('dit-high-noise-path'),
      output_dir: val('output-dir'),
      output_name: val('output-name'),
    },
    dataset: {
      video_dirs: getVideoDirs(),
      resolution: [parseInt(val('res-width')) || 832, parseInt(val('res-height')) || 480],
      batch_size: parseInt(val('batch-size')) || 1,
      target_frames: parseInt(val('target-frames')) || 81,
      frame_extraction: val('frame-extraction') || 'head',
      fps: parseInt(val('dataset-fps')) || 16,
    },
    training: {
      learning_rate: parseFloat(val('learning-rate')) || 2e-4,
      network_dim: parseInt(val('network-dim')) || 32,
      network_alpha: parseInt(val('network-alpha')) || 32,
      max_train_epochs: parseInt(val('max-train-epochs')) || 16,
      optimizer_type: val('optimizer-type') || 'adamw8bit',
      lr_scheduler: val('lr-scheduler') || 'constant_with_warmup',
      lr_warmup_steps: parseInt(val('lr-warmup-steps')) || 10,
      save_every_n_epochs: parseInt(val('save-every-n-epochs')) || 1,
      timestep_sampling: val('timestep-sampling') || 'shift',
      discrete_flow_shift: parseFloat(val('discrete-flow-shift')) || 5.0,
      seed: parseInt(val('seed')) || 42,
      min_timestep: parseInt(val('min-timestep')) || 0,
      max_timestep: parseInt(val('max-timestep')) || 1000,
      timestep_boundary: parseFloat(val('timestep-boundary')) || -1,
      mixed_precision: val('mixed-precision') || 'bf16',
      blocks_to_swap: parseInt(val('blocks-to-swap')) || 0,
      te_batch_size: parseInt(val('te-batch-size')) || 16,
      gradient_checkpointing: checked('gradient-checkpointing'),
      fp8_base: checked('fp8-base'),
      offload_inactive_dit: checked('offload-inactive-dit'),
      sdpa: checked('sdpa'),
      preserve_distribution_shape: checked('preserve-dist-shape'),
      persistent_data_loader_workers: checked('persistent-workers'),
      i2v: checked('i2v-mode'),
      vae_cache_cpu: checked('vae-cache-cpu'),
      fp8_t5: checked('fp8-t5'),
      gpu_index: getSelectedGpuValue('wan'),
    },
    ui: {
      task_type: state.taskType,
      model_mode: state.modelMode,
      ...serializeGpuUi('wan'),
    },
  };
}

function serializeZImageSection() {
  return {
    model: {
      dit_path: val('zi-dit-path'),
      vae_path: val('zi-vae-path'),
      text_encoder_path: val('zi-text-encoder-path'),
      output_dir: val('output-dir'),
      output_name: val('output-name'),
    },
    dataset: {
      image_dirs: getSelectedDatasetDirs(),
      dataset_names: getSelectedDatasetNames(),
      resolution: [parseInt(val('zi-res-width')) || 1024, parseInt(val('zi-res-height')) || 1024],
      batch_size: parseInt(val('zi-batch-size')) || 1,
    },
    training: {
      mode: val('zi-train-mode') || 'lora',
      learning_rate: parseFloat(val('zi-learning-rate')) || 1e-4,
      network_dim: parseInt(val('zi-network-dim')) || 32,
      network_alpha: parseInt(val('zi-network-alpha')) || 32,
      optimizer_type: val('zi-optimizer') || 'adamw8bit',
      lr_scheduler: val('zi-lr-scheduler') || 'constant_with_warmup',
      lr_warmup_steps: parseInt(val('zi-warmup-steps')) || 10,
      save_every_n_epochs: parseInt(val('zi-save-every')) || 1,
      max_train_epochs: parseInt(val('zi-epochs')) || 12,
      max_data_loader_n_workers: Math.max(0, parseInt(val('zi-data-loader-workers')) || 0),
      timestep_sampling: val('zi-timestep-sampling') || 'shift',
      weighting_scheme: val('zi-weighting-scheme') || 'none',
      discrete_flow_shift: parseFloat(val('zi-discrete-flow-shift')) || 2.0,
      blocks_to_swap: parseInt(val('zi-blocks-to-swap')) || 0,
      optimizer_args: val('zi-optimizer-args'),
      max_grad_norm: parseFloat(val('zi-max-grad-norm')) || 0,
      gradient_checkpointing: checked('zi-gradient-checkpointing'),
      persistent_data_loader_workers: checked('zi-persistent-workers'),
      ...getZImageAttentionFlags(),
      fused_backward_pass: checked('zi-fused-backward'),
      full_bf16: checked('zi-full-bf16'),
      gpu_index: getSelectedGpuValue('zi'),
    },
    ui: serializeGpuUi('zi'),
  };
}

function hydrateWanSection(section) {
  setValue('vae-path', section.model.vae_path);
  setValue('t5-path', section.model.t5_path);
  setValue('dit-path', section.model.dit_path);
  setValue('dit-high-noise-path', section.model.dit_high_noise_path);
  setValue('output-dir', section.model.output_dir);
  setValue('output-name', section.model.output_name);
  setDirList('video-dir-list', section.dataset.video_dirs, addVideoDir);
  setValue('res-width', section.dataset.resolution?.[0]);
  setValue('res-height', section.dataset.resolution?.[1]);
  setValue('batch-size', section.dataset.batch_size);
  setValue('target-frames', section.dataset.target_frames);
  setValue('frame-extraction', section.dataset.frame_extraction);
  setValue('dataset-fps', section.dataset.fps);

  state.taskType = section.ui.task_type || 'i2v';
  state.modelMode = section.ui.model_mode || 'dual';
  applyModelMode(state.modelMode);
  applyTaskType(state.taskType);

  setValue('learning-rate', section.training.learning_rate);
  setValue('network-dim', section.training.network_dim);
  setValue('network-alpha', section.training.network_alpha);
  setValue('max-train-epochs', section.training.max_train_epochs);
  setValue('optimizer-type', section.training.optimizer_type);
  setValue('lr-scheduler', section.training.lr_scheduler);
  setValue('lr-warmup-steps', section.training.lr_warmup_steps);
  setValue('save-every-n-epochs', section.training.save_every_n_epochs);
  setValue('timestep-sampling', section.training.timestep_sampling);
  setValue('discrete-flow-shift', section.training.discrete_flow_shift);
  setValue('seed', section.training.seed);
  setValue('min-timestep', section.training.min_timestep);
  setValue('max-timestep', section.training.max_timestep);
  setValue('timestep-boundary', section.training.timestep_boundary);
  setValue('mixed-precision', section.training.mixed_precision);
  setValue('blocks-to-swap', section.training.blocks_to_swap);
  setValue('te-batch-size', section.training.te_batch_size);
  setCheckbox('gradient-checkpointing', section.training.gradient_checkpointing);
  setCheckbox('fp8-base', section.training.fp8_base);
  setCheckbox('offload-inactive-dit', section.training.offload_inactive_dit);
  setCheckbox('sdpa', section.training.sdpa);
  setCheckbox('preserve-dist-shape', section.training.preserve_distribution_shape);
  setCheckbox('persistent-workers', section.training.persistent_data_loader_workers);
  setCheckbox('i2v-mode', section.training.i2v);
  setCheckbox('vae-cache-cpu', section.training.vae_cache_cpu);
  setCheckbox('fp8-t5', section.training.fp8_t5);
  hydrateGpuUi('wan', section.ui);
  updateSummary();
}

function hydrateZImageSection(section) {
  setValue('zi-dit-path', section.model.dit_path);
  setValue('zi-vae-path', section.model.vae_path);
  setValue('zi-text-encoder-path', section.model.text_encoder_path);
  setValue('output-dir', section.model.output_dir);
  setValue('output-name', section.model.output_name);
  setSelectedDatasetNames(section.dataset.dataset_names || (section.dataset.image_dirs || []).map(path => path.split('/').filter(Boolean).at(-1)));
  setValue('zi-res-width', section.dataset.resolution?.[0]);
  setValue('zi-res-height', section.dataset.resolution?.[1]);
  setValue('zi-batch-size', section.dataset.batch_size);
  setValue('zi-train-mode', section.training.mode);
  setValue('zi-learning-rate', section.training.learning_rate);
  setValue('zi-network-dim', section.training.network_dim);
  setValue('zi-network-alpha', section.training.network_alpha);
  setValue('zi-optimizer', section.training.optimizer_type);
  setValue('zi-lr-scheduler', section.training.lr_scheduler);
  setValue('zi-warmup-steps', section.training.lr_warmup_steps);
  setValue('zi-save-every', section.training.save_every_n_epochs);
  setValue('zi-epochs', section.training.max_train_epochs);
  setValue('zi-data-loader-workers', section.training.max_data_loader_n_workers ?? 2);
  setValue('zi-timestep-sampling', section.training.timestep_sampling);
  setValue('zi-weighting-scheme', section.training.weighting_scheme);
  setValue('zi-discrete-flow-shift', section.training.discrete_flow_shift);
  setValue('zi-blocks-to-swap', section.training.blocks_to_swap);
  setValue('zi-optimizer-args', section.training.optimizer_args);
  setValue('zi-max-grad-norm', section.training.max_grad_norm);
  setCheckbox('zi-gradient-checkpointing', section.training.gradient_checkpointing);
  setCheckbox('zi-persistent-workers', section.training.persistent_data_loader_workers !== false);
  applyZImageAttentionFlags(section.training);
  setCheckbox('zi-fused-backward', section.training.fused_backward_pass);
  setCheckbox('zi-full-bf16', section.training.full_bf16);
  hydrateGpuUi('zi', section.ui);
  syncZImageWorkerControls();
  loadSelectedDatasetPreview();
  loadMergedDatasetPreview();
  updateSummary();
}

function serializeSectionForArch(arch) {
  return arch === 'wan22' ? serializeWanSection() : serializeZImageSection();
}

function hydrateSectionForArch(arch) {
  const section = state.projectSections[arch] || cloneSection(state.projectDefaults[arch]);
  if (arch === 'wan22') {
    hydrateWanSection(section);
  } else {
    hydrateZImageSection(section);
  }
}

function syncCurrentSectionToCache() {
  if (!state.projectDefaults || state.arch === 'tasks') return;
  state.projectSections[state.arch] = serializeSectionForArch(state.arch);
}

async function saveProjectStateNow() {
  if (!state.projectId || state.hydratingProject) return;
  syncCurrentSectionToCache();
  const payload = buildProjectStatePayload({
    projectType: state.projectType,
    name: val('project-name'),
    musubi_tuner_path: val('musubi-path'),
    python_bin: val('python-bin'),
    section: state.projectSections[state.projectType],
  });

  setProjectStatus('Saving project...', 'info');
  try {
    await api('PUT', `/api/projects/${state.projectId}/state`, payload);
    updateProjectPickerLabel();
    setProjectStatus(`Saved project "${val('project-name')}"`, 'ok');
  } catch (e) {
    setProjectStatus(`Save error: ${e.message}`, 'error');
  }
}

function scheduleProjectSave(immediate = false) {
  if (!state.projectId || state.hydratingProject) return;
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    saveProjectStateNow();
  }, immediate ? 0 : 700);
}

function canUseArch(arch) {
  if (arch === 'tasks' || !state.projectType) return true;
  return arch === state.projectType;
}

function requestArchSwitch(arch) {
  if (!canUseArch(arch)) {
    const label = state.projectType === 'wan22' ? 'Wan 2.2' : 'Z-Image';
    setProjectStatus(`Current project is ${label} only. Create or select a matching project.`, 'error');
    return;
  }
  if (state.arch !== arch) {
    syncCurrentSectionToCache();
  }
  applyArch(arch);
  if (arch !== 'tasks') {
    hydrateSectionForArch(arch);
  }
}

function applyLoadedProject(project) {
  state.hydratingProject = true;
  state.projectId = project.id;
  state.projectType = getProjectArch(project);
  setValue('project-name', project.name);
  setValue('project-type', project.project_type);
  setValue('musubi-path', project.musubi_tuner_path);
  setValue('python-bin', project.python_bin);
  $('project-picker').value = project.id;

  state.projectSections = {
    wan22: mergeProjectSection(cloneSection(state.projectDefaults.wan22), project.wan22),
    zimage: mergeProjectSection(cloneSection(state.projectDefaults.zimage), project.zimage),
  };

  setProjectTypeFieldLocked(true);
  updateProjectActionButton();
  applyArch(state.projectType);
  hydrateSectionForArch(state.projectType);
  state.hydratingProject = false;
  loadZImageDatasets();
  setProjectStatus(`Loaded project "${project.name}" (${project.id})`, 'ok');
  updateSummary();
}

async function refreshProjects(autoload = true) {
  try {
    const projects = await api('GET', '/api/projects');
    updateProjectPickerOptions(projects);
    if (!projects.length) {
      state.projectId = null;
      state.projectType = val('project-type') || state.projectType || 'wan22';
      setProjectTypeFieldLocked(false);
      updateProjectActionButton();
      setProjectStatus('No projects found. Create a new one.', 'info');
      return;
    }
    if (autoload) {
      const hasCurrentProject = state.projectId && projects.some(project => project.id === state.projectId);
      const targetId = hasCurrentProject ? state.projectId : projects[projects.length - 1].id;
      await loadProjectById(targetId);
    }
  } catch (e) {
    setProjectStatus(`Error: ${e.message}`, 'error');
  }
}

async function loadProjectById(projectId) {
  if (!projectId) {
    initializeProjectDraft();
    return;
  }
  if (state.saveTimer && state.projectId && state.projectId !== projectId) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    await saveProjectStateNow();
  } else if (state.projectId && state.projectId !== projectId) {
    syncCurrentSectionToCache();
  }
  const project = await api('GET', `/api/projects/${projectId}`);
  applyLoadedProject(project);
}

function isProjectAutoSaveTarget(target) {
  if (!target || state.hydratingProject) return false;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
    return false;
  }
  if (target.id === 'project-picker') return false;
  if (target.id === 'zi-preview-dataset-select') return false;
  if (target.id === 'project-type' && state.projectId) return false;
  return true;
}

// 鈹€鈹€ API helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€ Project 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function createProject() {
  const name = val('project-name');
  const projectType = val('project-type') || state.projectType || 'wan22';
  const musubi = val('musubi-path');
  const python = val('python-bin');
  if (!name || !projectType || !musubi || !python) {
    setStatus('project-status', 'Fill in project name, type, Musubi path, and Python executable.', 'error'); return;
  }
  syncCurrentSectionToCache();
  const draftSections = {
    wan22: cloneSection(state.projectSections.wan22 || state.projectDefaults.wan22),
    zimage: cloneSection(state.projectSections.zimage || state.projectDefaults.zimage),
  };
  try {
    const proj = await api('POST', '/api/projects', {
      name,
      project_type: projectType,
      musubi_tuner_path: musubi,
      python_bin: python,
    });
    await refreshProjects(false);
    const createdProject = {
      ...proj,
      wan22: mergeProjectSection(cloneSection(state.projectDefaults.wan22), proj.wan22),
      zimage: mergeProjectSection(cloneSection(state.projectDefaults.zimage), proj.zimage),
    };
    createdProject[projectType] = mergeProjectSection(createdProject[projectType], draftSections[projectType]);
    applyLoadedProject(createdProject);
    await saveProjectStateNow();
    setStatus('project-status', `Created project "${proj.name}" (${proj.id})`, 'ok');
  } catch (e) {
    setStatus('project-status', `Error: ${e.message}`, 'error');
  }
}

async function handleProjectAction() {
  if (state.projectId) {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
      await saveProjectStateNow();
    }
    initializeProjectDraft(state.arch !== 'tasks' ? state.arch : state.projectType || 'wan22');
    return;
  }
  await createProject();
}

// 鈹€鈹€ Task Type / Mode 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€ Summary 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€ Dataset directories 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function addVideoDir(path = '') {
  const list = $('video-dir-list');
  const item = document.createElement('div');
  item.className = 'dir-item';
  item.innerHTML = `
    <input type="text" placeholder="/path/to/videos" value="${path}" />
    <button class="remove-btn" title="Remove">鉁?/button>`;
  item.querySelector('.remove-btn').addEventListener('click', () => {
    item.remove();
    scheduleProjectSave(true);
  });
  list.appendChild(item);
}

function getVideoDirs() {
  return [...$('video-dir-list').querySelectorAll('input')]
    .map(i => i.value.trim())
    .filter(Boolean);
}

// 鈹€鈹€ Dataset Config 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    setStatus('dataset-status', `鉁?Config written to ${res.path}`, 'ok');
  } catch (e) {
    setStatus('dataset-status', `Error: ${e.message}`, 'error');
  }
}

// 鈹€鈹€ Model Check 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
      const icon = info.exists ? 'OK' : 'Missing';
      const cls  = info.exists ? 'ok' : 'miss';
      const label = key.replace(/_/g, ' ');
      row.innerHTML = `<span class="check-icon ${cls}">${icon}</span><span>${label}: <span class="text-mono">${info.path}</span></span>`;
      container.appendChild(row);
    }
    const allOk = Object.values(res).every(v => v.exists);
    setStatus('model-status', allOk ? 'All model paths found.' : 'Some paths are missing.', allOk ? 'ok' : 'error');
  } catch (e) {
    setStatus('model-status', `Error: ${e.message}`, 'error');
  }
}

// 鈹€鈹€ Task Launching 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function requireProject() {
  if (!state.projectId) { alert('Create or load a project first.'); return false; }
  return true;
}

async function cacheLatents() {
  if (!requireProject()) return;
  markStep(1, 'active');
  setStatus('run-status', 'Launching latent cache...', 'info');
  const payload = {
    vae_path: val('vae-path'),
    i2v: checked('i2v-mode'),
    vae_cache_cpu: checked('vae-cache-cpu'),
    clip_path: 'wan2.1_is_handled_by_backend',
    gpu_index: getSelectedGpuValue('wan'),
  };
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/wan/prepare/latents`, payload);
    startPolling(getTaskId(task), 'Caching latents...');
    markStep(1, 'done');
  } catch (e) {
    setStatus('run-status', `Error: ${e.message}`, 'error');
    markStep(1, '');
  }
}

async function cacheTextEncoder() {
  if (!requireProject()) return;
  markStep(2, 'active');
  setStatus('run-status', 'Launching text encoder cache...', 'info');
  const payload = {
    t5_path: val('t5-path'),
    batch_size: parseInt(val('te-batch-size')) || 16,
    fp8_t5: checked('fp8-t5'),
    gpu_index: getSelectedGpuValue('wan'),
  };
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/wan/prepare/text-encoder`, payload);
    startPolling(getTaskId(task), 'Caching text encoder...');
    markStep(2, 'done');
  } catch (e) {
    setStatus('run-status', `Error: ${e.message}`, 'error');
    markStep(2, '');
  }
}

async function startTraining() {
  if (!requireProject()) return;
  markStep(3, 'active');
  setStatus('run-status', 'Launching training...', 'info');

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
    gpu_index: getSelectedGpuValue('wan'),
  };

  try {
    const task = await api('POST', `/api/projects/${state.projectId}/wan/train`, payload);
    startPolling(getTaskId(task), 'Training...');
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

// 鈹€鈹€ Task Polling 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function startPolling(taskId, label = 'Running...') {
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
    const status = normalizeTaskStatus(task.status);
    // Fetch logs
    const logs = await api('GET', `/api/tasks/${taskId}/logs`);
    $('log-output').textContent = logs.content || '(no output yet)';
    $('log-output').scrollTop = $('log-output').scrollHeight;

    if (status === 'running') {
      setLogBadge('running');
    } else if (status === 'done' || status === 'error' || status === 'stopped') {
      handleTerminalTaskState(status, 'wan');
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

// 鈹€鈹€ Step indicator helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€ Z-Image Datasets & Previews 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function loadZImageDatasets() {
  const picker = $('zi-dataset-picker');
  if (!picker) return;
  picker.innerHTML = '<option value="">Loading datasets...</option>';
  try {
    if (!state.projectId) {
      state.availableDatasets = [];
      picker.innerHTML = '';
      updateDatasetSummary();
      syncDatasetPreviewSelector();
      renderDatasetSamples('zi-selected-dataset-preview', [], 'Create or load a Z-Image project to browse datasets.');
      renderDatasetSamples('zi-merged-dataset-preview', [], 'Generate a merged dataset to preview combined samples.');
      return;
    }
    const res = await api('GET', `/api/projects/${state.projectId}/datasets`);
    state.availableDatasets = res.datasets || [];
    picker.innerHTML = '';
    state.availableDatasets.forEach(dataset => {
      const option = document.createElement('option');
      option.value = dataset.name;
      option.textContent = `${dataset.name} (${dataset.image_count})`;
      picker.appendChild(option);
    });
    setSelectedDatasetNames(state.selectedDatasetNames);
    selectPrimaryDatasetPreview();
    await loadZImageDatasetSummary();
    await loadSelectedDatasetPreview();
    await loadMergedDatasetPreview();
  } catch (e) {
    state.availableDatasets = [];
    picker.innerHTML = '';
    updateDatasetSummary();
    syncDatasetPreviewSelector();
    renderDatasetSamples('zi-selected-dataset-preview', [], `Unable to load datasets: ${e.message}`);
    renderDatasetSamples('zi-merged-dataset-preview', [], 'Merged preview is unavailable.');
  }
}

async function loadZImageDatasetSummary() {
  const selectedNames = getSelectedDatasetNames();
  const selectedImageCount = selectedNames.reduce((total, name) => {
    const dataset = state.availableDatasets.find(item => item.name === name);
    return total + (dataset?.image_count || 0);
  }, 0);

  if (!state.projectId) {
    updateDatasetSummary({
      selectedDatasetCount: selectedNames.length,
      selectedImageCount,
      mergedImageCount: 0,
    });
    return;
  }

  const query = selectedNames
    .map(name => `selected=${encodeURIComponent(name)}`)
    .join('&');
  const path = `/api/projects/${state.projectId}/datasets/summary${query ? `?${query}` : ''}`;

  try {
    const res = await api('GET', path);
    updateDatasetSummary({
      selectedDatasetCount: res.selected_dataset_count ?? selectedNames.length,
      selectedImageCount: res.selected_image_count ?? selectedImageCount,
      mergedImageCount: res.merged_image_count ?? 0,
    });
  } catch (e) {
    updateDatasetSummary({
      selectedDatasetCount: selectedNames.length,
      selectedImageCount,
      mergedImageCount: 0,
    });
  }
}

async function loadSelectedDatasetPreview() {
  const datasetName = $('zi-preview-dataset-select')?.value || getSelectedDatasetNames()[0] || '';
  if (!datasetName || !state.projectId) {
    renderDatasetSamples('zi-selected-dataset-preview', [], 'Select a dataset to preview images and prompts.');
    return;
  }
  try {
    const res = await api('GET', `/api/projects/${state.projectId}/datasets/${encodeURIComponent(datasetName)}/samples`);
    renderDatasetSamples('zi-selected-dataset-preview', res.samples, 'This dataset has no supported image samples.');
  } catch (e) {
    renderDatasetSamples('zi-selected-dataset-preview', [], `Unable to load dataset preview: ${e.message}`);
  }
}

async function loadMergedDatasetPreview() {
  if (!state.projectId) {
    renderDatasetSamples('zi-merged-dataset-preview', [], 'Generate a merged dataset to preview combined samples.');
    return;
  }
  try {
    const res = await api('GET', `/api/projects/${state.projectId}/datasets/merged/samples`);
    renderDatasetSamples('zi-merged-dataset-preview', res.samples, 'Generate config to build the merged preview.');
  } catch (e) {
    renderDatasetSamples('zi-merged-dataset-preview', [], `Unable to load merged preview: ${e.message}`);
  }
}

// 鈹€鈹€ Z-Image Dataset Config 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function ziGenerateDatasetConfig() {
  if (!state.projectId) { setStatus('zi-dataset-status', 'Create a project first.', 'error'); return; }
  const dirs = getSelectedDatasetDirs();
  if (!dirs.length) { setStatus('zi-dataset-status', 'Select at least one dataset.', 'error'); return; }
  const payload = {
    image_dirs: dirs,
    resolution: [parseInt(val('zi-res-width')), parseInt(val('zi-res-height'))],
    batch_size: parseInt(val('zi-batch-size')) || 1,
  };
  try {
    const res = await api('POST', `/api/projects/${state.projectId}/dataset-config`, payload);
    $('zi-dataset-preview').textContent = res.content;
    setStatus('zi-dataset-status', `Config written to ${res.path}`, 'ok');
    await loadZImageDatasetSummary();
    await loadMergedDatasetPreview();
  } catch (e) {
    setStatus('zi-dataset-status', `Error: ${e.message}`, 'error');
  }
}

// 鈹€鈹€ Z-Image Model Check 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
      const icon = info.exists ? 'OK' : 'Missing';
      const cls  = info.exists ? 'ok' : 'miss';
      row.innerHTML = `<span class="check-icon ${cls}">${icon}</span><span>${key.replace(/_/g,' ')}: <span class="text-mono">${info.path}</span></span>`;
      container.appendChild(row);
    }
    const allOk = Object.values(res).every(v => v.exists);
    setStatus('zi-model-status', allOk ? 'All paths found.' : 'Some paths are missing.', allOk ? 'ok' : 'error');
  } catch (e) {
    setStatus('zi-model-status', `Error: ${e.message}`, 'error');
  }
}

// 鈹€鈹€ Z-Image Task Polling 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    const status = normalizeTaskStatus(task.status);
    const logs = await api('GET', `/api/tasks/${taskId}/logs`);
    $('zi-log-output').textContent = logs.content || '(no output yet)';
    $('zi-log-output').scrollTop = $('zi-log-output').scrollHeight;

    if (status === 'running') {
      ziSetLogBadge('running');
    } else if (status === 'done' || status === 'error' || status === 'stopped') {
      handleTerminalTaskState(status, 'zi');
    }
  } catch {}
}

function ziStartPolling(taskId, label = 'Running...') {
  stopPolling();
  state.activeTaskId = taskId;
  ziSetLogBadge('running');
  setStatus('zi-run-status', label, 'info');
  updateSummary();
  state.pollInterval = setInterval(() => ziPollTask(taskId), 2000);
  ziPollTask(taskId);
}

// 鈹€鈹€ Z-Image Task Launchers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function ziCacheLatents() {
  if (!requireProject()) return;
  ziMarkStep(1, 'active');
  setStatus('zi-run-status', 'Launching Z-Image latent cache...', 'info');
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/zimage/prepare/latents`, {
      vae_path: val('zi-vae-path'),
      gpu_index: getSelectedGpuValue('zi'),
    });
    ziStartPolling(getTaskId(task), 'Caching latents...');
    ziMarkStep(1, 'done');
  } catch (e) {
    setStatus('zi-run-status', `Error: ${e.message}`, 'error');
    ziMarkStep(1, '');
  }
}

async function ziCacheTextEncoder() {
  if (!requireProject()) return;
  ziMarkStep(2, 'active');
  setStatus('zi-run-status', 'Launching Z-Image text encoder cache...', 'info');
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/zimage/prepare/text-encoder`, {
      vae_path: val('zi-vae-path'),
      text_encoder_path: val('zi-text-encoder-path'),
      gpu_index: getSelectedGpuValue('zi'),
    });
    ziStartPolling(getTaskId(task), 'Caching text encoder...');
    ziMarkStep(2, 'done');
  } catch (e) {
    setStatus('zi-run-status', `Error: ${e.message}`, 'error');
    ziMarkStep(2, '');
  }
}

async function ziStartTraining() {
  if (!requireProject()) return;
  ziMarkStep(3, 'active');
  setStatus('zi-run-status', 'Launching Z-Image training...', 'info');
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
    max_data_loader_n_workers: Math.max(0, parseInt(val('zi-data-loader-workers')) || 0),
    network_dim: parseInt(val('zi-network-dim')) || 32,
    network_alpha: parseInt(val('zi-network-alpha')) || 32,
    timestep_sampling: val('zi-timestep-sampling') || 'shift',
    weighting_scheme: val('zi-weighting-scheme') || 'none',
    discrete_flow_shift: parseFloat(val('zi-discrete-flow-shift')) || 2.0,
    blocks_to_swap: parseInt(val('zi-blocks-to-swap')) || 0,
    optimizer_args: val('zi-optimizer-args'),
    max_grad_norm: parseFloat(val('zi-max-grad-norm')) || 0.0,
    gradient_checkpointing: checked('zi-gradient-checkpointing'),
    persistent_data_loader_workers: checked('zi-persistent-workers'),
    ...getZImageAttentionFlags(),
    fused_backward_pass: checked('zi-fused-backward'),
    full_bf16: checked('zi-full-bf16'),
    gpu_index: getSelectedGpuValue('zi'),
  };
  try {
    const task = await api('POST', `/api/projects/${state.projectId}/zimage/train`, payload);
    ziStartPolling(getTaskId(task), 'Training...');
  } catch (e) {
    setStatus('zi-run-status', `Error: ${e.message}`, 'error');
    ziMarkStep(3, '');
  }
}

// 鈹€鈹€ Init 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function init() {
  state.arch = 'wan22';
  setupGpuSelector('wan');
  setupGpuSelector('zi');

  // Wan 2.2 buttons
  $('new-project-button').addEventListener('click', handleProjectAction);
  $('check-models').addEventListener('click', checkModels);
  $('generate-dataset').addEventListener('click', generateDatasetConfig);
  $('add-video-dir').addEventListener('click', () => {
    addVideoDir();
    scheduleProjectSave(true);
  });
  $('cache-latents').addEventListener('click', cacheLatents);
  $('cache-text-encoder').addEventListener('click', cacheTextEncoder);
  $('start-training').addEventListener('click', startTraining);
  $('stop-task').addEventListener('click', stopTask);
  $('zi-stop-task').addEventListener('click', stopTask);
  $('refresh-task').addEventListener('click', manualRefreshTask);
  $('download-all-assets').addEventListener('click', downloadAllAssets);

  // Z-Image buttons
  $('zi-check-models').addEventListener('click', ziCheckModels);
  $('zi-download-all-assets').addEventListener('click', ziDownloadAllAssets);
  $('zi-generate-dataset').addEventListener('click', ziGenerateDatasetConfig);
  $('zi-refresh-datasets').addEventListener('click', async () => {
    await loadZImageDatasets();
  });
  $('zi-dataset-picker').addEventListener('change', async () => {
    const selectedNames = [...$('zi-dataset-picker').selectedOptions].map(option => option.value);
    setSelectedDatasetNames(selectedNames);
    selectPrimaryDatasetPreview();
    renderDatasetSamples('zi-merged-dataset-preview', [], 'Selection changed. Generate config again to refresh merged preview.');
    await loadZImageDatasetSummary();
    await loadSelectedDatasetPreview();
    scheduleProjectSave(true);
  });
  $('zi-preview-dataset-select').addEventListener('change', async () => {
    await loadSelectedDatasetPreview();
  });
  $('zi-cache-latents').addEventListener('click', ziCacheLatents);
  $('zi-cache-text-encoder').addEventListener('click', ziCacheTextEncoder);
  $('zi-start-training').addEventListener('click', ziStartTraining);
  $('zi-refresh-task').addEventListener('click', () => { if (state.activeTaskId) ziPollTask(state.activeTaskId); });
  $('zi-data-loader-workers')?.addEventListener('input', () => {
    syncZImageWorkerControls();
  });

  // Z-Image Mode Defaults
  $('zi-train-mode')?.addEventListener('change', e => {
    if (e.target.value === 'full_finetune') {
      $('zi-learning-rate').value = '0.000001';
      $('zi-optimizer').value = 'adafactor';
    } else {
      $('zi-learning-rate').value = '0.0001';
      $('zi-optimizer').value = 'adamw8bit';
    }
    scheduleProjectSave(true);
  });

  $('project-picker').addEventListener('change', async e => {
    await loadProjectById(e.target.value);
  });

  $('project-type').addEventListener('change', e => {
    if (state.projectId) {
      setValue('project-type', state.projectType);
      return;
    }
    state.projectType = e.target.value || 'wan22';
    requestArchSwitch(state.projectType);
    updateProjectActionButton();
  });

  // Architecture toggle
  document.querySelectorAll('#arch-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => requestArchSwitch(btn.dataset.arch));
  });

  // Task type tabs (Wan 2.2)
  document.querySelectorAll('#task-type-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTaskType(btn.dataset.task);
      scheduleProjectSave(true);
    });
  });

  // Model mode
  $('train-model-mode').addEventListener('change', e => applyModelMode(e.target.value));

  // Resolution presets
  document.querySelectorAll('.res-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      $('res-width').value  = btn.dataset.w;
      $('res-height').value = btn.dataset.h;
      scheduleProjectSave(true);
    });
  });

  document.addEventListener('input', e => {
    if (isProjectAutoSaveTarget(e.target)) {
      scheduleProjectSave();
    }
  });
  document.addEventListener('change', e => {
    if (isProjectAutoSaveTarget(e.target)) {
      scheduleProjectSave(true);
    }
  });

  // Summary live-update
  ['max-train-epochs','learning-rate'].forEach(id => {
    $(id)?.addEventListener('input', updateSummary);
  });

  // Default dirs
  addVideoDir('/datasets/wan22');

  // Apply initial mode
  applyModelMode('dual');
  applyTaskType('i2v');
  syncZImageWorkerControls();
  state.projectDefaults = {
    wan22: serializeWanSection(),
    zimage: (() => {
      const previousOutputDir = val('output-dir');
      const previousOutputName = val('output-name');
      setValue('output-dir', '/outputs/zimage');
      setValue('output-name', 'zimage-lora-v1');
      const defaults = serializeZImageSection();
      setValue('output-dir', previousOutputDir);
      setValue('output-name', previousOutputName);
      return defaults;
    })(),
  };
  state.projectSections = {
    wan22: cloneSection(state.projectDefaults.wan22),
    zimage: cloneSection(state.projectDefaults.zimage),
  };
  initializeProjectDraft('wan22');
  refreshProjects();
  loadZImageDatasets();

  updateSummary();
}

// 鈹€鈹€ Download All Assets 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    setStatus('model-status', 'Starting batch model download...', 'info');
    const task = await api('POST', `/api/projects/${state.projectId}/models/download-all`, { assets });
    const taskId = getTaskId(task);
    startPolling(taskId, 'Downloading models...');
    setStatus('model-status', `Download task launched: ${taskId}`, 'info');
  } catch (e) {
    setStatus('model-status', `Download error: ${e.message}`, 'error');
  }
}

// 鈹€鈹€ Z-Image Download All Assets 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
           filename: defaults['zimage_text_encoder'] || 'split_files/text_encoders/qwen_3_4b.safetensors',
           target_dir: targetDir },
  };

  try {
    setStatus('zi-model-status', 'Starting batch model download...', 'info');
    const task = await api('POST', `/api/projects/${state.projectId}/models/download-all`, { assets });
    const taskId = getTaskId(task);
    ziStartPolling(taskId, 'Downloading models...');
    setStatus('zi-model-status', `Download task launched: ${taskId}`, 'info');
  } catch (e) {
    setStatus('zi-model-status', `Download error: ${e.message}`, 'error');
  }
}

// 鈹€鈹€ GPU Polling 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function pollGPUStatus() {
  try {
    const res = await api('GET', '/api/gpu/status');
    const textEl = $('gpu-text');
    const dash = $('tasks-gpu-dashboard');
    syncGpuSelectors(res.gpus, res.error || '');
    
    if (res.error && res.gpus.length === 0) {
      if (textEl) textEl.textContent = 'Error or No GPU';
      if (dash && state.arch === 'tasks') dash.innerHTML = `<div style="padding:16px; color:var(--danger)">Error: ${res.error}</div>`;
      return;
    }
    
    if (textEl) {
      const metrics = res.gpus.map(g => `[${g.index}] ${g.utilization}% | ${g.memory_used}MB`);
      textEl.textContent = metrics.join('  路  ');
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
    syncGpuSelectors([], 'GPU status is offline. Falling back to all visible GPUs.');
    const textEl = $('gpu-text');
    if (textEl) textEl.textContent = 'Offline';
    const dash = $('tasks-gpu-dashboard');
    if (dash && state.arch === 'tasks') dash.innerHTML = `<div style="padding:16px; color:var(--danger)">Offline</div>`;
  }
}

setInterval(pollGPUStatus, 3000);
pollGPUStatus();

// 鈹€鈹€ Task Queue 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

