from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.models import router as models_router
from app.api.projects import router as projects_router
from app.api.streams import router as streams_router
from app.api.system import router as system_router
from app.api.tasks import router as tasks_router

app = FastAPI(title="Musubi Tuner UI")
app.include_router(projects_router)
app.include_router(tasks_router)
app.include_router(streams_router)
app.include_router(system_router)
app.include_router(models_router)

static_root = Path(__file__).resolve().parents[2] / 'frontend' / 'static'
app.mount('/static', StaticFiles(directory=static_root), name='static')


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.get('/')
def index():
    return FileResponse(static_root / 'index.html')
