export function getProjectArch(project) {
  return project?.project_type === 'wan22' ? 'wan22' : 'zimage';
}

function mergePlainObject(defaultValue, savedValue) {
  return {
    ...(defaultValue || {}),
    ...(savedValue || {}),
  };
}

export function mergeProjectSection(defaultSection, savedSection) {
  return {
    model: mergePlainObject(defaultSection?.model, savedSection?.model),
    dataset: mergePlainObject(defaultSection?.dataset, savedSection?.dataset),
    training: mergePlainObject(defaultSection?.training, savedSection?.training),
    ui: mergePlainObject(defaultSection?.ui, savedSection?.ui),
  };
}

export function buildProjectStatePayload({
  projectType,
  name,
  musubi_tuner_path,
  python_bin,
  section,
}) {
  return {
    name,
    musubi_tuner_path,
    python_bin,
    [projectType]: section,
  };
}
