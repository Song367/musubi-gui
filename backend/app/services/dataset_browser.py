from __future__ import annotations

from pathlib import Path

from app.services.dataset_merger import SUPPORTED_IMAGE_EXTENSIONS


def _is_supported_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS


def list_available_datasets(datasets_root: Path) -> list[dict[str, object]]:
    if not datasets_root.exists():
        return []

    datasets: list[dict[str, object]] = []
    for item in sorted(datasets_root.iterdir(), key=lambda entry: entry.name.lower()):
        if not item.is_dir():
            continue
        image_count = sum(1 for candidate in item.iterdir() if _is_supported_image(candidate))
        if image_count == 0:
            continue
        datasets.append({
            "name": item.name,
            "path": item.as_posix(),
            "image_count": image_count,
        })
    return datasets


def find_dataset_dir(datasets_root: Path, dataset_name: str) -> Path:
    candidate = (datasets_root / dataset_name).resolve()
    root = datasets_root.resolve()
    if root not in candidate.parents:
        raise FileNotFoundError(dataset_name)
    if not candidate.exists() or not candidate.is_dir():
        raise FileNotFoundError(dataset_name)
    return candidate


def build_dataset_samples(
    *,
    dataset_dir: Path,
    project_id: str,
    image_url_prefix: str,
    source_dataset: str | None = None,
    limit: int = 24,
) -> list[dict[str, str]]:
    samples: list[dict[str, str]] = []
    for image_path in sorted(dataset_dir.iterdir(), key=lambda entry: entry.name.lower()):
        if not _is_supported_image(image_path):
            continue
        stem = image_path.stem
        caption_path = image_path.with_suffix(".txt")
        caption = caption_path.read_text(encoding="utf-8") if caption_path.exists() else ""
        sample = {
            "name": stem,
            "image_name": image_path.name,
            "caption_name": caption_path.name if caption_path.exists() else "",
            "caption": caption,
            "image_url": f"/api/projects/{project_id}/{image_url_prefix}/{image_path.name}",
        }
        if source_dataset:
            sample["source_dataset"] = source_dataset
        samples.append(sample)
        if len(samples) >= limit:
            break
    return samples


def resolve_preview_file(root_dir: Path, filename: str) -> Path:
    file_path = (root_dir / filename).resolve()
    if root_dir.resolve() not in file_path.parents:
        raise FileNotFoundError(filename)
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(filename)
    return file_path
