# musubi-tuner-ui

External web UI for Z-Image LoRA training and full finetuning. This project stays separate from `musubi-tuner` and calls its CLI scripts instead of modifying its tracked source files.

## Current MVP

- Create and persist projects
- Generate `dataset_config.toml`
- Launch Z-Image latent caching
- Launch Z-Image text encoder output caching
- Launch Z-Image LoRA training
- Launch Z-Image full finetuning
- Refresh task state and inspect logs
- Stop a running task
- Serve a browser UI from FastAPI

## Layout

- `backend/app`: FastAPI app, models, services, task runner, and API routes
- `backend/tests`: backend and UI-shell tests
- `frontend/static`: static HTML, CSS, and browser JavaScript

## Run Locally

```bash
cd backend
pip install -r requirements.txt
set PYTHONPATH=.
python -m uvicorn app.main:app --reload --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Linux Server Run

```bash
cd backend
python -m pip install -r requirements.txt
PYTHONPATH=. python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Pointing At Musubi Tuner

When creating a project in the UI, provide:

- `Musubi Tuner Path`: local checkout path of the training engine
- `Python Bin`: Python executable that can run the Musubi Tuner scripts and their dependencies

The UI writes project metadata under its own data directory and invokes these Musubi Tuner entry points:

- `zimage_cache_latents.py`
- `zimage_cache_text_encoder_outputs.py`
- `zimage_train_network.py`
- `zimage_train.py`

## Tests

```bash
cd backend
set PYTHONPATH=.
python -m pytest tests -v
```
