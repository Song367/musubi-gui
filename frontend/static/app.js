const LAST_PROJECT_KEY = "musubi-ui:last-project-id";
const ASSET_TYPES = ["dit", "vae", "text-encoder"];
const OFFICIAL_ASSET_TEMPLATES = {
  zimage_comfy: {
    dit: "split_files/diffusion_models/z_image_bf16.safetensors",
    vae: "split_files/vae/ae.safetensors",
    "text-encoder": "split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors",
  },
  zimage_deturbo: {
    dit: "z_image_de_turbo_v1_bf16.safetensors",
  },
  zimage_turbo_adapter: {
    dit: "zimage_turbo_training_adapter_v2.safetensors",
  },
};

const state = {
  projectId: null,
  taskId: null,
  gpus: [],
  sources: [],
  saveTimer: null,
  workspaceRoot: "",
  taskStream: null,
};

const byId = (id) => document.getElementById(id);
const assetInputId = (asset, field) => `${asset}-${field}`;
const assetUiPrefix = (asset) => asset.replace("-", "_");

const PRESETS = {
  rtx3090: {
    label: "RTX 3090 (24GB)",
    mode: "lora",
    width: 1024,
    height: 1024,
    batchSize: 1,
    epochs: 12,
    mixedPrecision: "bf16",
    gradientCheckpointing: true,
    enableBucket: true,
    bucketNoUpscale: false,
    persistentWorkers: true,
    loraLearningRate: 0.0001,
    networkDim: 32,
    networkAlpha: 32,
    loraOptimizerType: "adamw8bit",
    lrScheduler: "constant_with_warmup",
    lrWarmupSteps: 10,
    loraSaveEveryNEpochs: 1,
    fullLearningRate: 0.000001,
    fullOptimizerType: "adafactor",
    fullLrScheduler: "constant_with_warmup",
    fullLrWarmupSteps: 10,
    fullSaveEveryNEpochs: 1,
    fusedBackwardPass: true,
    fullBf16: false,
    blocksToSwap: 8,
    sdpa: true,
    seed: 42,
  },
  h100: {
    label: "H100 (80GB)",
    mode: "full_finetune",
    width: 1024,
    height: 1024,
    batchSize: 1,
    epochs: 16,
    mixedPrecision: "bf16",
    gradientCheckpointing: true,
    enableBucket: true,
    bucketNoUpscale: false,
    persistentWorkers: true,
    loraLearningRate: 0.0001,
    networkDim: 32,
    networkAlpha: 32,
    loraOptimizerType: "adamw8bit",
    lrScheduler: "constant_with_warmup",
    lrWarmupSteps: 10,
    loraSaveEveryNEpochs: 1,
    fullLearningRate: 0.000001,
    fullOptimizerType: "adafactor",
    fullLrScheduler: "constant_with_warmup",
    fullLrWarmupSteps: 10,
    fullSaveEveryNEpochs: 1,
    fusedBackwardPass: true,
    fullBf16: false,
    blocksToSwap: 0,
    sdpa: true,
    seed: 42,
  },
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function setText(id, text) {
  byId(id).textContent = text;
}

function currentPreset() {
  return PRESETS[byId("hardware-preset").value] || PRESETS.rtx3090;
}

function selectedGpuLabel() {
  const select = byId("gpu-device");
  return select.options[select.selectedIndex]?.textContent || "Auto / No Pinning";
}

function joinPath(base, relativePath) {
  const normalizedBase = String(base || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedRelative = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalizedBase) return normalizedRelative;
  if (!normalizedRelative) return normalizedBase;
  return `${normalizedBase}/${normalizedRelative}`;
}

function workspaceModelsDir() {
  return state.workspaceRoot ? joinPath(state.workspaceRoot, "models") : byId("dit-target-dir").value;
}

function workspaceOutputsDir() {
  return state.workspaceRoot ? joinPath(state.workspaceRoot, "outputs") : byId("output-dir").value;
}

function assetPathFieldId(asset) {
  if (asset === "dit") return "dit-path";
  if (asset === "vae") return "vae-path";
  return "text-encoder-path";
}

function syncModePanels() {
  const isFull = byId("train-mode").value === "full_finetune";
  byId("lora-controls").classList.toggle("hidden-mode", isFull);
  byId("full-controls").classList.toggle("hidden-mode", !isFull);
}

function syncAssetSourceFields() {
  const isManual = byId("asset-source-type").value === "manual";
  ASSET_TYPES.forEach((asset) => {
    byId(assetInputId(asset, "source-id")).disabled = isManual;
    byId(assetInputId(asset, "manual-repo-id")).disabled = !isManual;
  });
}

function syncDerivedAssetPath(asset) {
  const targetDir = byId(assetInputId(asset, "target-dir")).value;
  const filename = byId(assetInputId(asset, "filename")).value;
  byId(assetPathFieldId(asset)).value = joinPath(targetDir, filename);
}

function syncAllDerivedAssetPaths() {
  ASSET_TYPES.forEach(syncDerivedAssetPath);
}

function hydrateWorkspaceDefaults() {
  if (!state.workspaceRoot) return;
  const modelsDir = workspaceModelsDir();
  const outputsDir = workspaceOutputsDir();

  ASSET_TYPES.forEach((asset) => {
    const targetDirField = byId(assetInputId(asset, "target-dir"));
    if (!targetDirField.value || targetDirField.value === "E:/models/zimage") {
      targetDirField.value = modelsDir;
    }
  });

  if (!byId("output-dir").value || byId("output-dir").value === "/outputs") {
    byId("output-dir").value = outputsDir;
  }

  if (!byId("dit-path").value || byId("dit-path").value === "/models/dit.safetensors") {
    syncDerivedAssetPath("dit");
  }
  if (!byId("vae-path").value || byId("vae-path").value === "/models/vae.safetensors") {
    syncDerivedAssetPath("vae");
  }
  if (!byId("text-encoder-path").value || byId("text-encoder-path").value === "/models/text_encoder") {
    syncDerivedAssetPath("text-encoder");
  }
}

function updateSummary(statusOverride) {
  const preset = currentPreset();
  const modeLabel = byId("train-mode").value === "full_finetune" ? "Full Finetune" : "LoRA";
  const status = statusOverride || byId("summary-status").textContent || "Idle";

  setText("summary-preset", preset.label);
  setText("summary-mode", modeLabel);
  setText("summary-status", status);
  setText("summary-card-preset", preset.label);
  setText("summary-card-mode", modeLabel);
  setText("summary-card-gpu", selectedGpuLabel());
  setText("summary-card-image-dir", byId("image-dir").value || "-");
  setText("summary-card-output", byId("output-dir").value || "-");
  setText("summary-card-python", byId("python-bin").value || "-");
  setText("log-badge", status);
}

function applyPreset() {
  const preset = currentPreset();
  byId("train-mode").value = preset.mode;
  byId("width").value = preset.width;
  byId("height").value = preset.height;
  byId("batch-size").value = preset.batchSize;
  byId("max-train-epochs").value = preset.epochs;
  byId("mixed-precision").value = preset.mixedPrecision;
  byId("gradient-checkpointing").checked = preset.gradientCheckpointing;
  byId("enable-bucket").checked = preset.enableBucket;
  byId("bucket-no-upscale").checked = preset.bucketNoUpscale;
  byId("persistent-workers").checked = preset.persistentWorkers;
  byId("lora-learning-rate").value = preset.loraLearningRate;
  byId("network-dim").value = preset.networkDim;
  byId("network-alpha").value = preset.networkAlpha;
  byId("lora-optimizer-type").value = preset.loraOptimizerType;
  byId("lr-scheduler").value = preset.lrScheduler;
  byId("lr-warmup-steps").value = preset.lrWarmupSteps;
  byId("save-every-n-epochs").value = preset.loraSaveEveryNEpochs;
  byId("full-learning-rate").value = preset.fullLearningRate;
  byId("full-optimizer-type").value = preset.fullOptimizerType;
  byId("full-lr-scheduler").value = preset.fullLrScheduler;
  byId("full-lr-warmup-steps").value = preset.fullLrWarmupSteps;
  byId("full-save-every-n-epochs").value = preset.fullSaveEveryNEpochs;
  byId("fused-backward-pass").checked = preset.fusedBackwardPass;
  byId("full-bf16").checked = preset.fullBf16;
  byId("blocks-to-swap").value = preset.blocksToSwap;
  byId("sdpa").checked = preset.sdpa;
  byId("seed").value = preset.seed;
  syncModePanels();
  updateSummary("Idle");
}

function numberValue(id) {
  return Number(byId(id).value || 0);
}

function assetPayload(asset) {
  return {
    source_type: byId("asset-source-type").value,
    source_id: byId(assetInputId(asset, "source-id")).value,
    repo_id: byId(assetInputId(asset, "manual-repo-id")).value.trim(),
    asset,
    filename: byId(assetInputId(asset, "filename")).value.trim(),
    target_dir: byId(assetInputId(asset, "target-dir")).value.trim(),
  };
}

function applyOfficialTemplates() {
  if (byId("asset-source-type").value !== "official") {
    setText("model-status", "Switch Source Type to Official Preset to use one-click templates.");
    return;
  }

  const unresolved = [];
  ASSET_TYPES.forEach((asset) => {
    const sourceId = byId(assetInputId(asset, "source-id")).value;
    const template = OFFICIAL_ASSET_TEMPLATES[sourceId]?.[asset];
    if (template) {
      byId(assetInputId(asset, "filename")).value = template;
      syncDerivedAssetPath(asset);
    } else if (sourceId === "zimage_base_official") {
      unresolved.push(`${asset}: Tongyi-MAI/Z-Image uses split safetensors; choose the first shard manually`);
    } else {
      unresolved.push(`${asset}: no canned filename for ${sourceId}`);
    }
  });

  if (unresolved.length) {
    setText("model-status", `Templates applied where available. ${unresolved.join(" | ")}`);
  } else {
    setText("model-status", "Official filename templates applied for DiT, VAE, and Text Encoder.");
  }
  queueSaveProjectState();
}

function payloadFromForm() {
  const mode = byId("train-mode").value;
  const common = {
    mode,
    dit_path: byId("dit-path").value,
    vae_path: byId("vae-path").value,
    text_encoder_path: byId("text-encoder-path").value,
    output_dir: byId("output-dir").value,
    output_name: byId("output-name").value,
    mixed_precision: byId("mixed-precision").value,
    gradient_checkpointing: byId("gradient-checkpointing").checked,
    persistent_data_loader_workers: byId("persistent-workers").checked,
    max_train_epochs: numberValue("max-train-epochs"),
    seed: numberValue("seed"),
    gpu_index: byId("gpu-device").value,
  };

  if (mode === "full_finetune") {
    return {
      ...common,
      learning_rate: Number(byId("full-learning-rate").value),
      optimizer_type: byId("full-optimizer-type").value,
      lr_scheduler: byId("full-lr-scheduler").value,
      lr_warmup_steps: numberValue("full-lr-warmup-steps"),
      fused_backward_pass: byId("fused-backward-pass").checked,
      full_bf16: byId("full-bf16").checked,
      blocks_to_swap: numberValue("blocks-to-swap"),
      sdpa: byId("sdpa").checked,
      save_every_n_epochs: numberValue("full-save-every-n-epochs"),
    };
  }

  return {
    ...common,
    learning_rate: Number(byId("lora-learning-rate").value),
    optimizer_type: byId("lora-optimizer-type").value,
    lr_scheduler: byId("lr-scheduler").value,
    lr_warmup_steps: numberValue("lr-warmup-steps"),
    network_dim: numberValue("network-dim"),
    network_alpha: numberValue("network-alpha"),
    save_every_n_epochs: numberValue("save-every-n-epochs"),
  };
}

function collectProjectState() {
  const ui = {
    hardware_preset: byId("hardware-preset").value,
    asset_source_type: byId("asset-source-type").value,
  };

  ASSET_TYPES.forEach((asset) => {
    const keyPrefix = assetUiPrefix(asset);
    ui[`${keyPrefix}_source_id`] = byId(assetInputId(asset, "source-id")).value;
    ui[`${keyPrefix}_manual_repo_id`] = byId(assetInputId(asset, "manual-repo-id")).value;
    ui[`${keyPrefix}_filename`] = byId(assetInputId(asset, "filename")).value;
    ui[`${keyPrefix}_target_dir`] = byId(assetInputId(asset, "target-dir")).value;
  });

  return {
    model: {
      dit_path: byId("dit-path").value,
      vae_path: byId("vae-path").value,
      text_encoder_path: byId("text-encoder-path").value,
      output_dir: byId("output-dir").value,
      output_name: byId("output-name").value,
    },
    dataset: {
      image_dir: byId("image-dir").value,
      resolution: [numberValue("width"), numberValue("height")],
      batch_size: numberValue("batch-size"),
      enable_bucket: byId("enable-bucket").checked,
      bucket_no_upscale: byId("bucket-no-upscale").checked,
    },
    training: {
      mode: byId("train-mode").value,
      mixed_precision: byId("mixed-precision").value,
      gradient_checkpointing: byId("gradient-checkpointing").checked,
      persistent_data_loader_workers: byId("persistent-workers").checked,
      max_train_epochs: numberValue("max-train-epochs"),
      seed: numberValue("seed"),
      gpu_index: byId("gpu-device").value,
      lora_learning_rate: Number(byId("lora-learning-rate").value),
      network_dim: numberValue("network-dim"),
      network_alpha: numberValue("network-alpha"),
      lora_optimizer_type: byId("lora-optimizer-type").value,
      lora_lr_scheduler: byId("lr-scheduler").value,
      lora_lr_warmup_steps: numberValue("lr-warmup-steps"),
      lora_save_every_n_epochs: numberValue("save-every-n-epochs"),
      full_learning_rate: Number(byId("full-learning-rate").value),
      full_optimizer_type: byId("full-optimizer-type").value,
      full_lr_scheduler: byId("full-lr-scheduler").value,
      full_lr_warmup_steps: numberValue("full-lr-warmup-steps"),
      full_save_every_n_epochs: numberValue("full-save-every-n-epochs"),
      fused_backward_pass: byId("fused-backward-pass").checked,
      full_bf16: byId("full-bf16").checked,
      blocks_to_swap: numberValue("blocks-to-swap"),
      sdpa: byId("sdpa").checked,
      learning_rate: Number(byId("train-mode").value === "full_finetune" ? byId("full-learning-rate").value : byId("lora-learning-rate").value),
      optimizer_type: byId("train-mode").value === "full_finetune" ? byId("full-optimizer-type").value : byId("lora-optimizer-type").value,
      lr_scheduler: byId("train-mode").value === "full_finetune" ? byId("full-lr-scheduler").value : byId("lr-scheduler").value,
      lr_warmup_steps: byId("train-mode").value === "full_finetune" ? numberValue("full-lr-warmup-steps") : numberValue("lr-warmup-steps"),
      save_every_n_epochs: byId("train-mode").value === "full_finetune" ? numberValue("full-save-every-n-epochs") : numberValue("save-every-n-epochs"),
    },
    ui,
  };
}

function applyProjectState(project) {
  state.projectId = project.id;
  state.workspaceRoot = project.workspace_root || "";
  localStorage.setItem(LAST_PROJECT_KEY, project.id);
  byId("project-name").value = project.name || byId("project-name").value;
  byId("musubi-path").value = project.musubi_tuner_path || byId("musubi-path").value;
  byId("python-bin").value = project.python_bin || byId("python-bin").value;

  const model = project.model || {};
  byId("dit-path").value = model.dit_path || "";
  byId("vae-path").value = model.vae_path || "";
  byId("text-encoder-path").value = model.text_encoder_path || "";
  byId("output-dir").value = model.output_dir || byId("output-dir").value;
  byId("output-name").value = model.output_name || byId("output-name").value;

  const dataset = project.dataset || {};
  byId("image-dir").value = dataset.image_dir || byId("image-dir").value;
  const resolution = dataset.resolution || [numberValue("width"), numberValue("height")];
  byId("width").value = resolution[0];
  byId("height").value = resolution[1];
  if (typeof dataset.batch_size === "number") byId("batch-size").value = dataset.batch_size;
  if (typeof dataset.enable_bucket === "boolean") byId("enable-bucket").checked = dataset.enable_bucket;
  if (typeof dataset.bucket_no_upscale === "boolean") byId("bucket-no-upscale").checked = dataset.bucket_no_upscale;

  const training = project.training || {};
  byId("train-mode").value = training.mode || byId("train-mode").value;
  byId("mixed-precision").value = training.mixed_precision || byId("mixed-precision").value;
  if (typeof training.gradient_checkpointing === "boolean") byId("gradient-checkpointing").checked = training.gradient_checkpointing;
  if (typeof training.persistent_data_loader_workers === "boolean") byId("persistent-workers").checked = training.persistent_data_loader_workers;
  if (typeof training.max_train_epochs === "number") byId("max-train-epochs").value = training.max_train_epochs;
  if (typeof training.seed === "number") byId("seed").value = training.seed;
  byId("gpu-device").value = training.gpu_index || "";
  if (typeof training.lora_learning_rate === "number") byId("lora-learning-rate").value = training.lora_learning_rate;
  if (typeof training.network_dim === "number") byId("network-dim").value = training.network_dim;
  if (typeof training.network_alpha === "number") byId("network-alpha").value = training.network_alpha;
  byId("lora-optimizer-type").value = training.lora_optimizer_type || byId("lora-optimizer-type").value;
  byId("lr-scheduler").value = training.lora_lr_scheduler || byId("lr-scheduler").value;
  if (typeof training.lora_lr_warmup_steps === "number") byId("lr-warmup-steps").value = training.lora_lr_warmup_steps;
  if (typeof training.lora_save_every_n_epochs === "number") byId("save-every-n-epochs").value = training.lora_save_every_n_epochs;
  if (typeof training.full_learning_rate === "number") byId("full-learning-rate").value = training.full_learning_rate;
  byId("full-optimizer-type").value = training.full_optimizer_type || byId("full-optimizer-type").value;
  byId("full-lr-scheduler").value = training.full_lr_scheduler || byId("full-lr-scheduler").value;
  if (typeof training.full_lr_warmup_steps === "number") byId("full-lr-warmup-steps").value = training.full_lr_warmup_steps;
  if (typeof training.full_save_every_n_epochs === "number") byId("full-save-every-n-epochs").value = training.full_save_every_n_epochs;
  if (typeof training.fused_backward_pass === "boolean") byId("fused-backward-pass").checked = training.fused_backward_pass;
  if (typeof training.full_bf16 === "boolean") byId("full-bf16").checked = training.full_bf16;
  if (typeof training.blocks_to_swap === "number") byId("blocks-to-swap").value = training.blocks_to_swap;
  if (typeof training.sdpa === "boolean") byId("sdpa").checked = training.sdpa;

  const ui = project.ui || {};
  byId("hardware-preset").value = ui.hardware_preset || byId("hardware-preset").value;
  byId("asset-source-type").value = ui.asset_source_type || byId("asset-source-type").value;

  ASSET_TYPES.forEach((asset) => {
    const keyPrefix = assetUiPrefix(asset);
    byId(assetInputId(asset, "source-id")).value = ui[`${keyPrefix}_source_id`] || byId(assetInputId(asset, "source-id")).value;
    byId(assetInputId(asset, "manual-repo-id")).value = ui[`${keyPrefix}_manual_repo_id`] || "";
    byId(assetInputId(asset, "filename")).value = ui[`${keyPrefix}_filename`] || byId(assetInputId(asset, "filename")).value;
    byId(assetInputId(asset, "target-dir")).value = ui[`${keyPrefix}_target_dir`] || byId(assetInputId(asset, "target-dir")).value;
  });

  hydrateWorkspaceDefaults();
  syncModePanels();
  syncAssetSourceFields();
  setText("project-status", `Project loaded: ${project.name} (${project.id})`);
  updateSummary("Project Loaded");
}

async function saveProjectState() {
  if (!state.projectId) return;
  const project = await request(`/api/projects/${state.projectId}/state`, {
    method: "PUT",
    body: JSON.stringify(collectProjectState()),
  });
  setText("project-status", `Project saved: ${project.name} (${project.id})`);
}

function queueSaveProjectState() {
  if (!state.projectId) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(async () => {
    try {
      await saveProjectState();
    } catch (error) {
      setText("project-status", `Autosave failed: ${String(error.message || error)}`);
    }
  }, 500);
}

function renderSourceOptions() {
  const options = state.sources.map((source) => `<option value="${source.id}">${source.label} - ${source.repo_id}</option>`).join("");
  return options || '<option value="">No presets available</option>';
}

async function loadModelSources() {
  setText("model-status", "Loading asset source presets...");
  try {
    state.sources = await request("/api/models/sources");
    ASSET_TYPES.forEach((asset) => {
      const select = byId(assetInputId(asset, "source-id"));
      const current = select.value;
      select.innerHTML = renderSourceOptions();
      if (current) {
        select.value = current;
      }
    });
    setText("model-status", "Asset source presets loaded.");
  } catch (error) {
    ASSET_TYPES.forEach((asset) => {
      byId(assetInputId(asset, "source-id")).innerHTML = '<option value="">Unable to load presets</option>';
    });
    setText("model-status", "Asset source presets unavailable.");
  }
  syncAssetSourceFields();
}

async function loadGpus() {
  const gpuSelect = byId("gpu-device");
  const selected = gpuSelect.value;
  setText("gpu-status", "Refreshing GPU inventory...");
  try {
    state.gpus = await request("/api/system/gpus");
    const options = ['<option value="">Auto / No Pinning</option>'];
    for (const gpu of state.gpus) {
      options.push(`<option value="${gpu.index}">GPU ${gpu.index} - ${gpu.name} - ${gpu.memory_used_mb}MB / ${gpu.memory_total_mb}MB - ${gpu.utilization_gpu}%</option>`);
    }
    gpuSelect.innerHTML = options.join("");
    gpuSelect.value = selected || gpuSelect.value;
    setText("gpu-status", state.gpus.length ? "GPU inventory loaded." : "No GPUs detected by nvidia-smi.");
  } catch (error) {
    gpuSelect.innerHTML = '<option value="">Auto / No Pinning</option>';
    setText("gpu-status", "GPU inventory unavailable.");
  }
  updateSummary();
}

async function createProject() {
  const payload = {
    name: byId("project-name").value,
    musubi_tuner_path: byId("musubi-path").value,
    python_bin: byId("python-bin").value,
  };
  const project = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  applyProjectState(project);
  await saveProjectState();
}

async function loadLastProject() {
  try {
    const projects = await request("/api/projects");
    if (!projects.length) return;
    const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
    const chosen = projects.find((project) => project.id === lastProjectId) || projects[projects.length - 1];
    const project = await request(`/api/projects/${chosen.id}`);
    applyProjectState(project);
  } catch (error) {
    setText("project-status", "No saved project could be restored.");
  }
}

async function generateDataset() {
  if (!state.projectId) throw new Error("Create a project first.");
  const payload = {
    image_dir: byId("image-dir").value,
    resolution: [numberValue("width"), numberValue("height")],
    batch_size: numberValue("batch-size"),
    enable_bucket: byId("enable-bucket").checked,
    bucket_no_upscale: byId("bucket-no-upscale").checked,
  };
  const result = await request(`/api/projects/${state.projectId}/dataset-config`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setText("dataset-preview", result.content);
  queueSaveProjectState();
  updateSummary("Dataset Ready");
}

async function checkModels() {
  if (!state.projectId) throw new Error("Create a project first.");
  const result = await request(`/api/projects/${state.projectId}/models/check`, {
    method: "POST",
    body: JSON.stringify({
      dit_path: byId("dit-path").value,
      vae_path: byId("vae-path").value,
      text_encoder_path: byId("text-encoder-path").value,
    }),
  });
  const lines = [
    `DiT: ${result.dit_path.exists ? "FOUND" : "MISSING"}`,
    `VAE: ${result.vae_path.exists ? "FOUND" : "MISSING"}`,
    `Text Encoder: ${result.text_encoder_path.exists ? "FOUND" : "MISSING"}`,
  ];
  setText("model-status", lines.join(" | "));
}

function closeTaskStream() {
  if (state.taskStream) {
    state.taskStream.close();
    state.taskStream = null;
  }
}

function isDownloadTask(task) {
  return task.task_type === "download_model" || task.task_type === "download_all_models";
}

function updateTaskStatusText(task) {
  const summary = `Task ${task.id}: ${task.status}`;
  if (isDownloadTask(task)) {
    updateSummary(task.status);
    return;
  }
  setText("train-status", summary);
  setText("prepare-status", summary);
  updateSummary(task.status);
}

function applyDownloadTaskResult(task) {
  const result = task.result || {};
  if (task.task_type === "download_model" && result.saved_path) {
    if (result.asset) {
      byId(assetPathFieldId(result.asset)).value = result.saved_path;
      queueSaveProjectState();
    }
    setText("model-status", task.status === "succeeded" ? `Download completed: ${result.saved_path}` : "Download task failed.");
    return;
  }

  if (task.task_type === "download_all_models" && result.completed_assets) {
    Object.entries(result.completed_assets).forEach(([asset, assetResult]) => {
      byId(assetPathFieldId(asset)).value = assetResult.saved_path;
    });
    queueSaveProjectState();
    setText("model-status", task.status === "succeeded" ? "All base asset downloads completed." : "Base asset download task failed.");
  }
}

async function refreshTask(options = {}) {
  if (!state.taskId) throw new Error("No task has been started yet.");
  const task = await request(`/api/tasks/${state.taskId}`);
  const logs = await request(`/api/tasks/${state.taskId}/logs`);
  updateTaskStatusText(task);
  setText("log-output", logs.content || "No logs yet.");
  if (options.applyResult !== false && task.status !== "running") {
    applyDownloadTaskResult(task);
  }
  return task;
}

function watchTask(task, options = {}) {
  closeTaskStream();
  state.taskId = task.id;
  if (options.onStart) options.onStart(task);
  updateTaskStatusText(task);
  setText("log-output", "Connecting to task log stream...");

  const source = new EventSource(`/api/tasks/${task.id}/stream`);
  state.taskStream = source;

  source.onmessage = async (event) => {
    const current = byId("log-output").textContent;
    const nextChunk = event.data || "";
    setText("log-output", current === "Connecting to task log stream..." ? nextChunk : `${current}${nextChunk}`);
    const latestTask = await refreshTask();
    if (latestTask.status !== "running") {
      closeTaskStream();
    }
  };

  source.onerror = async () => {
    closeTaskStream();
    await refreshTask();
  };
}

async function startDownloadTask(asset) {
  if (!state.projectId) throw new Error("Create a project first.");
  const payload = assetPayload(asset);
  if (!payload.filename) throw new Error(`Filename is required for ${asset}.`);
  const task = await request(`/api/projects/${state.projectId}/models/download`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  watchTask(task, {
    onStart(startedTask) {
      setText("model-status", `Download task started for ${asset}: ${startedTask.id}`);
    },
  });
}

async function downloadAllAssets() {
  if (!state.projectId) throw new Error("Create a project first.");
  const assets = {};
  for (const asset of ASSET_TYPES) {
    const payload = assetPayload(asset);
    if (!payload.filename) throw new Error(`Filename is required for ${asset}.`);
    assets[asset] = payload;
  }
  const task = await request(`/api/projects/${state.projectId}/models/download-all`, {
    method: "POST",
    body: JSON.stringify({ assets }),
  });
  watchTask(task, {
    onStart(startedTask) {
      setText("model-status", `Batch download task started: ${startedTask.id}`);
    },
  });
}

async function runPrepare(kind) {
  if (!state.projectId) throw new Error("Create a project first.");
  await saveProjectState();
  const payload = {
    vae_path: byId("vae-path").value,
    text_encoder_path: byId("text-encoder-path").value,
    gpu_index: byId("gpu-device").value,
  };
  const endpoint = kind === "latents" ? "latents" : "text-encoder";
  const task = await request(`/api/projects/${state.projectId}/prepare/${endpoint}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setText("prepare-status", `Started ${task.task_type}: ${task.id}`);
  watchTask(task);
}

async function startTraining() {
  if (!state.projectId) throw new Error("Create a project first.");
  await saveProjectState();
  const task = await request(`/api/projects/${state.projectId}/train`, {
    method: "POST",
    body: JSON.stringify(payloadFromForm()),
  });
  setText("train-status", `Started ${task.task_type}: ${task.id}`);
  watchTask(task);
}

async function stopTask() {
  if (!state.taskId) throw new Error("No task has been started yet.");
  const task = await request(`/api/tasks/${state.taskId}/stop`, { method: "POST" });
  closeTaskStream();
  updateTaskStatusText(task);
}

function bindClick(id, handler) {
  byId(id).addEventListener("click", async () => {
    try {
      await handler();
    } catch (error) {
      setText("log-output", String(error.message || error));
      updateSummary("Attention Needed");
    }
  });
}

function bindStateInputs() {
  const immediateInputs = [
    "project-name", "musubi-path", "python-bin", "dit-path", "vae-path", "text-encoder-path", "output-dir", "output-name", "image-dir",
    "dit-manual-repo-id", "dit-filename", "dit-target-dir",
    "vae-manual-repo-id", "vae-filename", "vae-target-dir",
    "text-encoder-manual-repo-id", "text-encoder-filename", "text-encoder-target-dir",
  ];

  const changeIds = [
    "train-mode", "hardware-preset", "gpu-device", "mixed-precision", "width", "height", "batch-size", "max-train-epochs",
    "enable-bucket", "bucket-no-upscale", "persistent-workers", "gradient-checkpointing",
    "lora-learning-rate", "network-dim", "network-alpha", "lora-optimizer-type", "lr-scheduler", "lr-warmup-steps", "save-every-n-epochs",
    "full-learning-rate", "full-optimizer-type", "full-lr-scheduler", "full-lr-warmup-steps", "full-save-every-n-epochs",
    "fused-backward-pass", "full-bf16", "blocks-to-swap", "sdpa", "seed", "asset-source-type",
    "dit-source-id", "vae-source-id", "text-encoder-source-id",
  ];

  immediateInputs.forEach((id) => {
    byId(id).addEventListener("input", () => {
      if (id.endsWith("-filename") || id.endsWith("-target-dir")) {
        const asset = id.replace(/-(filename|target-dir)$/, "");
        syncDerivedAssetPath(asset);
      }
      updateSummary();
      queueSaveProjectState();
    });
  });

  changeIds.forEach((id) => {
    byId(id).addEventListener("change", () => {
      if (id === "hardware-preset") {
        applyPreset();
      }
      if (id === "train-mode") {
        syncModePanels();
      }
      if (id === "asset-source-type") {
        syncAssetSourceFields();
      }
      updateSummary();
      queueSaveProjectState();
    });
  });
}

bindClick("create-project", createProject);
bindClick("generate-dataset", generateDataset);
bindClick("apply-asset-templates", async () => applyOfficialTemplates());
bindClick("download-all-assets", downloadAllAssets);
bindClick("check-models", checkModels);
bindClick("download-dit", async () => startDownloadTask("dit"));
bindClick("download-vae", async () => startDownloadTask("vae"));
bindClick("download-text-encoder", async () => startDownloadTask("text-encoder"));
bindClick("cache-latents", () => runPrepare("latents"));
bindClick("cache-text", () => runPrepare("text"));
bindClick("start-training", startTraining);
bindClick("refresh-task", refreshTask);
bindClick("stop-task", stopTask);
bindClick("refresh-gpus", loadGpus);

bindStateInputs();
applyPreset();
syncAssetSourceFields();
Promise.all([loadModelSources(), loadGpus()]).then(loadLastProject);
updateSummary("Idle");

