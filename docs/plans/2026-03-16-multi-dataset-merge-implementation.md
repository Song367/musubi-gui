# Multi-Dataset Merge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users choose multiple existing server-side dataset directories while the trainer still receives one merged dataset directory.

**Architecture:** Extend project dataset state and dataset-config APIs to accept multiple source directories, build a merged linked dataset view inside each project workspace, and keep generated training config pointed at that merged directory. Update the frontend dataset panel from one path field to a repeatable list UI without changing the rest of the training flow.

**Tech Stack:** FastAPI, Pydantic, pathlib, filesystem links, vanilla JavaScript, pytest.

---

### Task 1: Add failing tests for multi-directory dataset config generation

**Files:**
- Modify: `backend/tests/test_dataset_config_writer.py`
- Modify: `backend/tests/test_task_routes.py`
- Modify: `backend/tests/test_project_store.py`

**Step 1: Write the failing test**
Add tests that expect:
- dataset settings can persist `image_dirs`
- dataset-config route accepts `image_dirs`
- merged dataset config points at one generated directory

**Step 2: Run test to verify it fails**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_dataset_config_writer.py' 'E:/workplace/musubi-tuner-ui/backend/tests/test_project_store.py' 'E:/workplace/musubi-tuner-ui/backend/tests/test_task_routes.py' -v`
Expected: FAIL because current models and route only support one `image_dir`.

**Step 3: Write minimal implementation**
Do not implement yet beyond the smallest scaffolding needed for red/green iteration.

**Step 4: Run test to verify it passes**
Run the same focused pytest command.
Expected: PASS after the related implementation tasks below are complete.

**Step 5: Commit**
```bash
git add backend/tests/test_dataset_config_writer.py backend/tests/test_project_store.py backend/tests/test_task_routes.py
git commit -m "test: cover multi-directory dataset generation"
```

### Task 2: Implement merged dataset view creation in the backend

**Files:**
- Modify: `backend/app/api/projects.py`
- Modify: `backend/app/models/project.py`
- Modify: `backend/app/services/dataset_config_writer.py`
- Create: `backend/app/services/dataset_merger.py`

**Step 1: Write the failing test**
Add a focused test for a merger helper that creates a project-local merged dataset directory from two source directories and preserves captions.

**Step 2: Run test to verify it fails**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_dataset_config_writer.py' -v`
Expected: FAIL because no merger helper exists.

**Step 3: Write minimal implementation**
Implement:
- dataset settings with `image_dirs`
- route request model with `image_dirs`
- merged dataset helper that rebuilds `<workspace>/merged_dataset`
- config writer that targets the merged directory

**Step 4: Run test to verify it passes**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_dataset_config_writer.py' 'E:/workplace/musubi-tuner-ui/backend/tests/test_task_routes.py' -v`
Expected: PASS

**Step 5: Commit**
```bash
git add backend/app/api/projects.py backend/app/models/project.py backend/app/services/dataset_config_writer.py backend/app/services/dataset_merger.py backend/tests/test_dataset_config_writer.py backend/tests/test_task_routes.py
git commit -m "feat: build merged dataset views from multiple directories"
```

### Task 3: Persist multi-directory dataset state in projects

**Files:**
- Modify: `backend/app/models/project.py`
- Modify: `backend/tests/test_project_store.py`

**Step 1: Write the failing test**
Add/extend a test so project state updates persist both `image_dirs` and the resolved merged `image_dir`.

**Step 2: Run test to verify it fails**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_project_store.py' -v`
Expected: FAIL because `image_dirs` is not modeled or persisted.

**Step 3: Write minimal implementation**
Update project models so dataset state stores:
- `image_dirs`
- resolved `image_dir`

**Step 4: Run test to verify it passes**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_project_store.py' -v`
Expected: PASS

**Step 5: Commit**
```bash
git add backend/app/models/project.py backend/tests/test_project_store.py
git commit -m "feat: persist multi-directory dataset selections"
```

### Task 4: Update frontend dataset UI for repeatable directories

**Files:**
- Modify: `frontend/static/index.html`
- Modify: `frontend/static/app.js`
- Modify: `backend/tests/test_frontend_serving.py`

**Step 1: Write the failing test**
Add a static frontend-serving test asserting the new UI includes multi-dataset controls such as `Add Dataset`.

**Step 2: Run test to verify it fails**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_frontend_serving.py' -v`
Expected: FAIL because the UI still exposes one `Image Dir` field.

**Step 3: Write minimal implementation**
Change the frontend to:
- render a repeatable list of dataset directory inputs
- collect all non-empty values into `image_dirs`
- keep project state and summary compatible

**Step 4: Run test to verify it passes**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_frontend_serving.py' -v`
Expected: PASS

**Step 5: Commit**
```bash
git add frontend/static/index.html frontend/static/app.js backend/tests/test_frontend_serving.py
git commit -m "feat: support multiple dataset directories in the UI"
```

### Task 5: Verify the full backend suite and smoke-test assumptions

**Files:**
- Modify: none unless fixes are needed

**Step 1: Run focused verification**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_dataset_config_writer.py' 'E:/workplace/musubi-tuner-ui/backend/tests/test_project_store.py' 'E:/workplace/musubi-tuner-ui/backend/tests/test_task_routes.py' 'E:/workplace/musubi-tuner-ui/backend/tests/test_frontend_serving.py' -v`
Expected: PASS

**Step 2: Run full backend verification**
Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests' -v`
Expected: PASS

**Step 3: Manual smoke-check notes**
Confirm in the browser that:
- users can add/remove dataset directories
- dataset config generation succeeds with multiple source directories
- merged dataset path is stable inside the project workspace
- the rest of the training flow still behaves as before

**Step 4: Commit**
```bash
git add .
git commit -m "feat: merge multiple dataset directories for training"
```
