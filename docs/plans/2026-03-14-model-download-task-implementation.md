# Model Download Task Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make model downloads run as background tasks that stream logs into the existing unified task panel and report final success or failure clearly.

**Architecture:** Extend the current task system with a callable-backed runner for Python download work, upgrade the task stream endpoint into a real log tail, and switch frontend download actions to start tasks and subscribe to shared active-task updates. Keep training and preparation on the existing task model so all long-running operations converge on one UX.

**Tech Stack:** FastAPI, Pydantic, Python threads, existing task/log storage, vanilla JavaScript, Server-Sent Events, pytest.

---

### Task 1: Add task metadata support for download results

**Files:**
- Modify: `backend/app/models/task.py`
- Modify: `backend/app/services/task_store.py`
- Test: `backend/tests/test_model_downloads.py`

**Step 1: Write the failing test**

Extend the download test so it expects the task response shape to carry task metadata and, after simulated completion, a stored `result.saved_path`.

```python
def test_model_download_returns_task_and_persists_result(...):
    response = client.post(...)
    assert response.status_code == 201
    task = response.json()
    assert task["task_type"] == "download_model"
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' -v`
Expected: FAIL because the endpoint still returns the old synchronous payload and `TaskRecord` has no result field.

**Step 3: Write minimal implementation**

Add optional fields such as `result` and `error_message` to `TaskRecord` so download tasks can persist completion data without special-case storage.

**Step 4: Run test to verify it passes**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' -v`
Expected: PASS for the metadata assertions that are now supported by the model.

**Step 5: Commit**

```bash
git add backend/app/models/task.py backend/app/services/task_store.py backend/tests/test_model_downloads.py
git commit -m "feat: extend task records for download results"
```

### Task 2: Add a callable-backed background task runner

**Files:**
- Modify: `backend/app/runners/task_runner.py`
- Modify: `backend/app/api/tasks.py`
- Test: `backend/tests/test_model_downloads.py`

**Step 1: Write the failing test**

Add a test that starts a model download task, waits for background completion, and asserts the task moves from `running` to `succeeded` with a saved result.

```python
def test_model_download_task_completes_and_sets_result(...):
    response = client.post(...)
    task_id = response.json()["id"]
    final_task = client.get(f"/api/tasks/{task_id}").json()
    assert final_task["status"] == "succeeded"
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' -v`
Expected: FAIL because there is no runner for in-process download work.

**Step 3: Write minimal implementation**

Add a runner that:

- creates metadata/log paths
- launches a daemon thread
- writes task lifecycle updates through `TaskStore`
- captures exceptions and marks the task as failed

Keep the existing subprocess runner intact for training/prepare tasks.

**Step 4: Run test to verify it passes**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' -v`
Expected: PASS with the task reaching a terminal state.

**Step 5: Commit**

```bash
git add backend/app/runners/task_runner.py backend/app/api/tasks.py backend/tests/test_model_downloads.py
git commit -m "feat: add background runner for callable tasks"
```

### Task 3: Convert single-asset model download into a background task

**Files:**
- Modify: `backend/app/api/models.py`
- Modify: `backend/tests/test_model_downloads.py`

**Step 1: Write the failing test**

Add a test asserting that `POST /api/projects/{project_id}/models/download` returns `201` and task metadata immediately instead of a synchronous saved path.

```python
def test_model_download_starts_background_task(...):
    response = client.post(...)
    assert response.status_code == 201
    assert response.json()["task_type"] == "download_model"
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' -v`
Expected: FAIL because the route still returns `200` with `saved_path`.

**Step 3: Write minimal implementation**

Change the route to:

- resolve the effective `repo_id`
- create a log-writing download callable
- start a background task
- return the new task record

Log at least: asset name, repo, filename, target dir, start, success/failure.

**Step 4: Run test to verify it passes**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' -v`
Expected: PASS with immediate task creation behavior.

**Step 5: Commit**

```bash
git add backend/app/api/models.py backend/tests/test_model_downloads.py
git commit -m "feat: run model downloads as background tasks"
```

### Task 4: Add batch download support for "Download All Base Assets"

**Files:**
- Modify: `backend/app/api/models.py`
- Modify: `backend/tests/test_model_downloads.py`

**Step 1: Write the failing test**

Add a test for a new batch endpoint that starts one task, downloads three assets in order, and stores all resulting paths in the task result payload.

```python
def test_download_all_starts_one_task_and_records_each_asset(...):
    response = client.post(f"/api/projects/{project['id']}/models/download-all", json={...})
    assert response.status_code == 201
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' -v`
Expected: FAIL because the endpoint does not exist yet.

**Step 3: Write minimal implementation**

Add a batch route that:

- accepts the three configured asset payloads
- creates one `download_all_models` task
- downloads assets serially
- stores final saved paths in `task.result`
- fails the overall task if any asset fails

**Step 4: Run test to verify it passes**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' -v`
Expected: PASS with one task id and a full result payload.

**Step 5: Commit**

```bash
git add backend/app/api/models.py backend/tests/test_model_downloads.py
git commit -m "feat: add batch model download task"
```

### Task 5: Upgrade log streaming to realtime tail behavior

**Files:**
- Modify: `backend/app/api/streams.py`
- Modify: `backend/app/api/tasks.py`
- Test: `backend/tests/test_log_streams.py`

**Step 1: Write the failing test**

Add a stream test that creates a task/log file, appends content after connect, and asserts the stream can emit updated content while the task is active.

```python
def test_stream_endpoint_tails_task_log(...):
    response = client.get(f"/api/tasks/{task_id}/stream")
    assert "line 1" in body
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_log_streams.py' -v`
Expected: FAIL because the endpoint currently sends only one snapshot and exits.

**Step 3: Write minimal implementation**

Implement a simple polling tail loop that:

- reads appended text
- emits SSE `data:` messages
- checks task status and exits once the task is terminal

Reuse existing log decoding behavior where practical.

**Step 4: Run test to verify it passes**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_log_streams.py' -v`
Expected: PASS with streamed content visible.

**Step 5: Commit**

```bash
git add backend/app/api/streams.py backend/app/api/tasks.py backend/tests/test_log_streams.py
git commit -m "feat: stream live task log updates"
```

### Task 6: Unify frontend active-task subscriptions for download, prepare, and train

**Files:**
- Modify: `frontend/static/app.js`
- Modify: `frontend/static/index.html`

**Step 1: Write the failing test**

No automated frontend harness is present. Use a manual red step by documenting the current broken behavior:

- start a download
- observe that the task panel does not show realtime logs
- observe that the request blocks until completion

**Step 2: Run test to verify it fails**

Run the app and reproduce the current UX manually.
Expected: download blocks and no realtime task logs appear.

**Step 3: Write minimal implementation**

Add shared frontend helpers to:

- track the current `EventSource`
- subscribe to `/api/tasks/{task_id}/stream`
- refresh task status on stream updates and completion
- close old subscriptions when a new task starts

Use those helpers from prepare, train, single download, and batch download.

**Step 4: Run test to verify it passes**

Manual verification:

- start a single download and confirm the task panel begins updating
- start `Download All Base Assets` and confirm one task controls the log panel
- start training afterward and confirm the panel switches to the new active task

**Step 5: Commit**

```bash
git add frontend/static/app.js frontend/static/index.html
git commit -m "feat: stream active task logs in the frontend"
```

### Task 7: Update frontend download actions to use task results

**Files:**
- Modify: `frontend/static/app.js`

**Step 1: Write the failing test**

Use manual red verification:

- start a download task
- let it finish
- confirm the matching asset path field is not automatically updated yet

**Step 2: Run test to verify it fails**

Manual verification in the browser.
Expected: path fields remain stale after task completion.

**Step 3: Write minimal implementation**

After a download task reaches `succeeded`, read `task.result` and update:

- `dit-path`
- `vae-path`
- `text-encoder-path`

For batch downloads, update all relevant fields from the batch result payload and autosave project state.

**Step 4: Run test to verify it passes**

Manual verification:

- single download updates the matching path field
- batch download updates all completed asset path fields
- `model-status` shows a final concise success/failure summary

**Step 5: Commit**

```bash
git add frontend/static/app.js
git commit -m "feat: update asset paths from download task results"
```

### Task 8: Run verification for the backend and smoke-test the full flow

**Files:**
- Modify: none unless fixes are needed
- Test: `backend/tests/test_model_downloads.py`
- Test: `backend/tests/test_log_streams.py`
- Test: `backend/tests`

**Step 1: Run focused tests**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests/test_model_downloads.py' 'E:/workplace/musubi-tuner-ui/backend/tests/test_log_streams.py' -v`
Expected: PASS

**Step 2: Run broader backend verification**

Run: `python -m pytest 'E:/workplace/musubi-tuner-ui/backend/tests' -v`
Expected: PASS or only unrelated pre-existing failures

**Step 3: Perform manual UI smoke test**

Verify:

- single asset download creates a task and streams logs
- download-all creates one task and shows per-asset progress
- failed downloads surface a failed task state and readable log text
- training still starts and streams logs after the new download flow

**Step 4: Commit**

```bash
git add .
git commit -m "feat: unify model downloads with task log monitoring"
```
