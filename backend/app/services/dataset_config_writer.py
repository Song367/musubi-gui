from __future__ import annotations


def render_dataset_config(image_dir: str, resolution: tuple[int, int], batch_size: int) -> str:
    """Image-only dataset config (kept for compatibility)."""
    width, height = resolution
    normalized_image_dir = image_dir.rstrip('/\\')
    cache_directory = f"{normalized_image_dir}/cache"
    return (
        f'[general]\n'
        f'resolution = [{width}, {height}]\n'
        f'caption_extension = ".txt"\n'
        f'batch_size = {batch_size}\n'
        f'enable_bucket = true\n'
        f'bucket_no_upscale = false\n'
        f'\n'
        f'[[datasets]]\n'
        f'image_directory = "{image_dir}"\n'
        f'cache_directory = "{cache_directory}"\n'
        f'num_repeats = 1\n'
    )


def render_video_dataset_config(
    video_dir: str,
    resolution: tuple[int, int],
    batch_size: int,
    target_frames: int = 81,
    frame_extraction: str = 'head',
    fps: int = 16,
    num_repeats: int = 1,
) -> str:
    """Video dataset config for Wan 2.2 training."""
    width, height = resolution
    normalized = video_dir.rstrip('/\\')
    cache_directory = f"{normalized}/cache"
    return (
        f'[general]\n'
        f'resolution = [{width}, {height}]\n'
        f'caption_extension = ".txt"\n'
        f'batch_size = {batch_size}\n'
        f'enable_bucket = true\n'
        f'bucket_no_upscale = false\n'
        f'\n'
        f'[[datasets]]\n'
        f'video_directory = "{video_dir}"\n'
        f'cache_directory = "{cache_directory}"\n'
        f'target_frames = [{target_frames}]\n'
        f'frame_extraction = "{frame_extraction}"\n'
        f'fps = {fps}\n'
        f'num_repeats = {num_repeats}\n'
    )
