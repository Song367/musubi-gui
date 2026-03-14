# Model Download Task Design

## Context

The current model download flow is synchronous. The frontend calls `/api/projects/{project_id}/models/download`, waits for the request to finish, and then updates `model-status` with a final message. This leaves users with very little feedback during a potentially long-running download.

The project already has a task system for training and preparation:

- `backend/app/runners/task_runner.py` launches background processes and stores `TaskRecord` metadata.
- `backend/app/api/tasks.py` exposes task status, task logs, and stop endpoints.
- `backend/app/api/streams.py` exposes a task log stream endpoint.
- `frontend/static/app.js` already has a unified task panel with `train-status`, `prepare-status`, and `log-output`.

The missing piece is that model downloads do not participate in that task system and therefore do not produce realtime status/log updates in the unified task panel.

## Goal

Make model downloads behave like training/preparation tasks:

- starting a download returns a task immediately
- the unified task panel shows download progress and final status
- the task log updates while the download is running
- success and failure are both visible without leaving the page guessing

## User Experience

### Single asset downloads

When the user clicks `Download DiT`, `Download VAE`, or `Download Text Encoder`:

- the backend creates a `download_model` task and returns its `task_id`
- the frontend marks that task as the active task
- `model-status` shows a short summary such as `Download task started: <id>`
- the existing `Task Log` panel starts streaming download log messages
- when the task succeeds, the matching asset path field is updated to the final saved path
- when the task fails, `model-status` and the task panel show a failed state and the log explains why

### Download all assets

When the user clicks `Download All Base Assets`:

- the backend creates one `download_all_models` task
- that task downloads the configured assets serially
- the log contains per-asset progress entries such as start, resolved repo, saved path, and failure details
- if any asset fails, the overall task becomes `failed`
- users only need to watch one task panel for the whole operation

## Recommended Architecture

Use the existing task model as the canonical source of truth and add a background thread runner for download work.

### Why this approach

- It matches the mental model already used by training and preparation.
- It avoids inventing a second status system just for downloads.
- It keeps the frontend simple because all long-running work can share the same task selection and log display logic.
- It allows download work to write structured progress messages without shelling out to an external process.

## Backend Design

### 1. Add a background runner for Python callables

The current task runner only handles subprocess-based work. Model downloads are direct Python calls through `hf_hub_download`, so we need a parallel execution path for in-process jobs.

Add a callable-based runner that:

- creates the task metadata and log file up front
- launches a daemon thread instead of a subprocess
- writes task status back through `TaskStore`
- marks tasks as `running`, `succeeded`, or `failed`
- records the final exit summary in the log file

This can live alongside the existing subprocess runner in `backend/app/runners/task_runner.py` or in a nearby helper module if separation feels cleaner.

### 2. Extend task metadata for download results

Single asset downloads need to pass the final saved path back to the frontend after the task completes. The current `TaskRecord` has no generic result field.

Add a small optional payload field to `TaskRecord`, for example:

- `result: dict | None = None`
- `error_message: str | None = None`

For download tasks, `result` can include:

- `asset`
- `repo_id`
- `saved_path`
- optionally `completed_assets` for the all-assets case

### 3. Convert `/models/download` into a task-start endpoint

Change `POST /api/projects/{project_id}/models/download` so it:

- validates and resolves the repo selection exactly as today
- creates a log file and task record immediately
- starts background work for either a single asset or the multi-asset batch
- returns task metadata instead of returning `saved_path` synchronously

This keeps the route name stable while changing its behavior to async task startup.

### 4. Introduce an explicit batch payload

The current endpoint accepts one asset payload at a time. For `Download All Base Assets`, the frontend currently loops and makes separate synchronous requests. That would scatter logs across multiple tasks.

Add a dedicated batch endpoint such as:

- `POST /api/projects/{project_id}/models/download-all`

The payload should contain the three asset requests the user configured in the form. The backend will create one task and process them serially.

### 5. Write readable task logs

Each download task should log key lifecycle points:

- task created
- asset name
- source type and resolved `repo_id`
- filename
- target directory
- download started
- download finished with saved path
- task succeeded or failed

On failure, log the exception text and, if useful, the asset being processed when the failure occurred.

### 6. Upgrade the stream endpoint to real tailing

`/api/tasks/{task_id}/stream` currently sends the file contents once and ends. Replace it with a lightweight polling tail that:

- emits current log content on connect
- continues checking for appended content while the task is running
- stops shortly after the task reaches a terminal state

That enables the unified panel to update without manual refresh.

## Frontend Design

### Active task handling

Extend the existing active-task behavior so downloads use the same panel as prepare/train:

- when a download task starts, set `state.taskId`
- show a short summary in `model-status`
- call a shared task-subscription helper that streams logs and updates the panel status

### Shared task subscription

Add a single path for all long-running work:

- prepare
- train
- download single asset
- download all assets

That helper should:

- open `EventSource` for `/api/tasks/{task_id}/stream`
- update `log-output` on each event
- periodically or on stream completion fetch `/api/tasks/{task_id}` to update status
- close previous subscriptions before opening a new one

### Status messaging

Keep the existing summary labels, but make them reflect download work:

- `model-status` for short download-specific messages
- `summary-status` and `log-badge` for the overall active task state
- `train-status` / `prepare-status` can remain task-type specific, but downloads should still visibly update the main log panel

If needed, add a dedicated `download-status` line later, but do not make it required for the first pass.

### Updating path fields after success

Once a single-asset download task completes, fetch the final task record and use `task.result.saved_path` to update:

- `dit-path`
- `vae-path`
- `text-encoder-path`

For batch downloads, update all matching path fields from the batch result payload.

## Failure Handling

- If a single asset fails, the task status becomes `failed` and the log records the failure.
- If a batch download fails on any asset, the overall task becomes `failed`.
- No silent partial success for the batch path.
- Target directories may be auto-created, but permission and network failures should surface in logs unchanged.

## Testing Strategy

### Backend

Update and extend tests in `backend/tests`:

- change `test_model_downloads.py` to expect a task response instead of an immediate `saved_path`
- add coverage for task completion and stored `result.saved_path`
- add a failing-download test that verifies task status and logged error text
- add stream tests that verify the stream route is present and can emit task log content over time

### Frontend

There is no obvious frontend test harness in this repo yet, so the first pass can rely on backend verification plus careful manual flow testing. If we later add JS tests, the right first target is the task-subscription helper because it will centralize the active log behavior.

## Risks and Mitigations

### Risk: in-memory thread/process tracking can be lost on restart

This is already true for subprocess-backed tasks. Do not solve persistence/recovery in this change. Keep scope focused on better live status.

### Risk: streaming logic may hang after task completion

Mitigate by checking the task status on each polling cycle and closing the stream after a short grace period once the task is terminal.

### Risk: Hugging Face progress bars may not map cleanly into logs

Do not depend on native library progress bars for v1. Write explicit application-level lifecycle logs before and after each download step. Fine-grained byte progress can be deferred.

## Scope Boundaries

In scope:

- model downloads become background tasks
- unified task panel shows download logs and final status
- stream endpoint becomes usable for live updates

Out of scope:

- resumable downloads
- percent-complete progress bars
- multi-user task ownership
- task persistence across server restart beyond current behavior
