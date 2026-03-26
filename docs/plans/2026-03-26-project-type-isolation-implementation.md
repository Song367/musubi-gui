# Project Type Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add project-type-specific saved configuration so `Wan 2.2` and `Z-Image` projects are fully isolated and switchable from a project dropdown.

**Architecture:** Replace the mixed project schema with a typed project record that stores separate `wan22` and `zimage` sections. Update the static frontend to load project lists, create typed projects, hydrate the matching form, and auto-save changes back to the active project.

**Tech Stack:** FastAPI, Pydantic, pytest, static HTML/CSS/JavaScript, Node test runner

---

### Task 1: Lock the new project schema in backend tests

**Files:**
- Modify: `backend/tests/test_project_models.py`
- Modify: `backend/tests/test_project_store.py`
- Modify: `backend/tests/test_task_routes.py`

**Step 1: Write the failing test**

Add tests that require:
- `project_type` on created projects
- project store defaults for only the chosen architecture
- saving `wan22` and `zimage` state into separate sections
- task routes to work with typed projects

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_project_models.py tests/test_project_store.py tests/test_task_routes.py -q`

Expected: FAIL because the current schema has no `project_type` or isolated sections.

**Step 3: Write minimal implementation**

Update the project models, API payloads, and project store to support the new typed schema.

**Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_project_models.py tests/test_project_store.py tests/test_task_routes.py -q`

Expected: PASS.

### Task 2: Lock the new project picker UI in frontend-serving tests

**Files:**
- Modify: `backend/tests/test_frontend_serving.py`

**Step 1: Write the failing test**

Add assertions for:
- project dropdown markup
- new project button / form markup
- project type selector markup

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_frontend_serving.py -q`

Expected: FAIL because the current HTML still uses freeform project inputs plus a `Load` button.

**Step 3: Write minimal implementation**

Update the static HTML to include the new project selection and creation controls.

**Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_frontend_serving.py -q`

Expected: PASS.

### Task 3: Add frontend helpers for typed project hydration and auto-save

**Files:**
- Create: `frontend/static/project-utils.js`
- Modify: `frontend/static/app.js`
- Test: `frontend/tests/task-utils.test.mjs`
- Test: `frontend/tests/gpu-utils.test.mjs`
- Create: `frontend/tests/project-utils.test.mjs`

**Step 1: Write the failing test**

Add Node tests for:
- picking the correct active architecture from a project type
- extracting the correct architecture state from a project payload
- generating the expected auto-save payload per project type

**Step 2: Run test to verify it fails**

Run: `node --test frontend/tests/project-utils.test.mjs`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Implement small pure helpers for:
- typed project normalization
- form hydration data
- debounced save payload construction

**Step 4: Run test to verify it passes**

Run: `node --test frontend/tests/project-utils.test.mjs`

Expected: PASS.

### Task 4: Wire the sidebar project picker and auto-save behavior

**Files:**
- Modify: `frontend/static/index.html`
- Modify: `frontend/static/styles.css`
- Modify: `frontend/static/app.js`

**Step 1: Reuse failing tests**

Use the failing frontend-serving and project-utils tests as the red state.

**Step 2: Implement minimal UI behavior**

Add:
- project dropdown
- new project panel with project type
- project load/hydrate flow
- architecture auto-switch for typed projects
- auto-save with debounce

**Step 3: Run focused verification**

Run:
- `python -m pytest tests/test_frontend_serving.py -q`
- `node --test frontend/tests/project-utils.test.mjs`
- `node --check frontend/static/app.js`

Expected: PASS.

### Task 5: Full verification

**Files:**
- No additional code required unless regressions appear

**Step 1: Run full backend suite**

Run: `python -m pytest tests -q`

Expected: PASS.

**Step 2: Run frontend helper tests**

Run:
- `node --test frontend/tests/gpu-utils.test.mjs`
- `node --test frontend/tests/task-utils.test.mjs`
- `node --test frontend/tests/project-utils.test.mjs`

Expected: PASS.
