from __future__ import annotations


def render_dataset_config(image_dir: str, resolution: tuple[int, int], batch_size: int) -> str:
    width, height = resolution
    normalized_image_dir = image_dir.rstrip('/\\')
    cache_directory = f"{normalized_image_dir}/cache"
    return f'''[general]\nresolution = [{width}, {height}]\ncaption_extension = ".txt"\nbatch_size = {batch_size}\nenable_bucket = true\nbucket_no_upscale = false\n\n[[datasets]]\nimage_directory = "{image_dir}"\ncache_directory = "{cache_directory}"\nnum_repeats = 1\n'''
