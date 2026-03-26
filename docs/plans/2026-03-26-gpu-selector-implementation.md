# GPU Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace free-text GPU inputs with an auto-detected hybrid selector that supports all GPUs, single-GPU selection, and custom multi-GPU selection for Wan 2.2 and Z-Image training.

**Architecture:** Reuse the existing `/api/gpu/status` polling endpoint as the source of truth for available GPUs. Render shared GPU selector controls in the static frontend, keep the backend contract as a comma-separated `gpu_index` string, and fall back gracefully when GPU detection fails.

**Tech Stack:** FastAPI, static HTML/CSS/JavaScript, pytest

---

### Task 1: Lock the intended UI behavior with static frontend tests

**Files:**
- Modify: `backend/tests/test_frontend_serving.py`

**Step 1: Write the failing test**

Add assertions that the served HTML contains:
- Wan selector container ids for mode/select/custom options
- Z-Image selector container ids for mode/select/custom options
- No free-text `gpu-index` / `zi-gpu-index` inputs

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_frontend_serving.py -q`

Expected: FAIL because the existing HTML still serves free-text GPU inputs.

**Step 3: Write minimal implementation**

Update `frontend/static/index.html` to serve the new selector markup.

**Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_frontend_serving.py -q`

Expected: PASS.

### Task 2: Implement the hybrid selector behavior in the static frontend

**Files:**
- Modify: `frontend/static/index.html`
- Modify: `frontend/static/styles.css`
- Modify: `frontend/static/app.js`

**Step 1: Write the failing test**

Reuse Task 1 static assertions as the safety net for the new markup.

**Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_frontend_serving.py -q`

Expected: FAIL before implementation.

**Step 3: Write minimal implementation**

Implement:
- Shared selector markup for Wan and Z-Image
- GPU option hydration from `/api/gpu/status`
- Mode switching between all/single/custom
- Checkbox-based custom multi-GPU selection
- Graceful fallback when no GPU data is available
- Existing payload submission still sending comma-separated `gpu_index`

**Step 4: Run targeted verification**

Run: `python -m pytest tests/test_frontend_serving.py tests/test_gpu_routes.py -q`

Expected: PASS.

### Task 3: Verify no backend regressions

**Files:**
- No code changes required unless regressions appear

**Step 1: Run the relevant backend suite**

Run: `python -m pytest tests -q`

Expected: PASS with no regressions.
