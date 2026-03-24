from __future__ import annotations

import subprocess
from fastapi import APIRouter

router = APIRouter(tags=["gpu"])

@router.get("/api/gpu/status")
def get_gpu_status():
    try:
        # Request CSV format, no headers, no units (just raw numbers)
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,name,utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits"
            ],
            capture_output=True,
            text=True,
            check=True
        )
        gpus = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = [p.strip() for p in line.split(',')]
            if len(parts) >= 5:
                # Name might still contain spaces, so strip it securely
                gpus.append({
                    "index": parts[0],
                    "name": parts[1],
                    "utilization": int(parts[2]),
                    "memory_used": int(parts[3]),
                    "memory_total": int(parts[4]),
                })
        return {"gpus": gpus, "error": None}
    except FileNotFoundError:
        return {"gpus": [], "error": "nvidia-smi not found. Ensure NVIDIA drivers are installed."}
    except Exception as e:
        return {"gpus": [], "error": str(e)}
