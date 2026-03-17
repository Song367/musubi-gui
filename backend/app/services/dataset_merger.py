from __future__ import annotations

import os
import shutil
from pathlib import Path

SUPPORTED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}


def _link_file(source: Path, destination: Path) -> None:
    try:
        destination.symlink_to(source)
        return
    except OSError:
        pass

    try:
        os.link(source, destination)
        return
    except OSError as exc:
        raise RuntimeError(f'Unable to link file: {source}') from exc


def build_merged_dataset(*, image_dirs: list[str], output_dir: Path) -> tuple[Path, int]:
    if not image_dirs:
        raise ValueError('At least one dataset directory is required')

    output_dir = output_dir.resolve()
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    image_count = 0
    for dataset_index, image_dir in enumerate(image_dirs, start=1):
        source_dir = Path(image_dir)
        if not source_dir.exists():
            raise ValueError(f'Dataset directory not found: {source_dir}')
        if not source_dir.is_dir():
            raise ValueError(f'Dataset path is not a directory: {source_dir}')

        file_index = 0
        for source_file in sorted(source_dir.iterdir()):
            if source_file.suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS:
                continue
            file_index += 1
            image_count += 1
            safe_name = f'{dataset_index:02d}_{file_index:04d}_{source_file.name}'
            destination_file = output_dir / safe_name
            _link_file(source_file.resolve(), destination_file)

            caption_file = source_file.with_suffix('.txt')
            if caption_file.exists():
                destination_caption = output_dir / f'{destination_file.stem}.txt'
                _link_file(caption_file.resolve(), destination_caption)

    if image_count == 0:
        raise ValueError('No supported images found in the selected dataset directories')

    return output_dir, image_count
