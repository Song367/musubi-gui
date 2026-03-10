from __future__ import annotations

import csv
import subprocess

from fastapi import APIRouter

router = APIRouter(prefix='/api/system', tags=['system'])


def list_gpus() -> list[dict]:
    command = [
        'nvidia-smi',
        '--query-gpu=index,name,memory.used,memory.total,utilization.gpu',
        '--format=csv,noheader,nounits',
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=5, check=True)
    except Exception:
        return []

    rows = []
    reader = csv.reader(line for line in result.stdout.splitlines() if line.strip())
    for row in reader:
        if len(row) != 5:
            continue
        rows.append(
            {
                'index': int(row[0].strip()),
                'name': row[1].strip(),
                'memory_used_mb': int(row[2].strip()),
                'memory_total_mb': int(row[3].strip()),
                'utilization_gpu': int(row[4].strip()),
            }
        )
    return rows


@router.get('/gpus')
def get_gpus():
    return list_gpus()
