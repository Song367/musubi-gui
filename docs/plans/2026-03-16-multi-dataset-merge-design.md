# Multi-Dataset Merge Design

## Context

The current dataset flow only supports one server-side image directory.

- Frontend stores a single `image-dir` field.
- `POST /api/projects/{project_id}/dataset-config` accepts one `image_dir`.
- `render_dataset_config()` writes one `[[datasets]]` entry.

The user needs to select multiple existing server directories while keeping the downstream trainer pointed at a single dataset directory.

## Goal

Allow users to provide multiple existing server-side dataset directories. Internally, the app should build one merged dataset view inside the project workspace and keep training pointed at that single merged directory.

## Recommended Approach

Create a merged dataset view directory in the project workspace and populate it with linked files from the selected source directories.

Why this approach:
- Keeps compatibility with tools that only accept one dataset directory.
- Avoids copying whole datasets.
- Makes the merged output deterministic and project-local.
- Keeps source datasets untouched.

## User Experience

In the Dataset panel:
- Replace the single `Image Dir` input with a list of dataset directory inputs.
- Users can add and remove entries.
- One empty entry exists by default for backwards compatibility.
- `Generate Dataset Config` sends all non-empty directories.

When generating the dataset config:
- The backend validates all selected directories.
- The backend rebuilds `<workspace>/merged_dataset/`.
- The generated `dataset_config.toml` points only to that merged directory.
- The preview still shows one final config file.

## Merge Rules

- Scan each source directory for supported image files.
- For each image, also include the matching caption file if it exists.
- Write links into the merged dataset directory with stable conflict-free names.
- Suggested naming: `<dataset_index>_<file_index>_<original_name>`.
- Rebuild the merged directory on each dataset-config generation to avoid drift.

## Link Strategy

Preferred order:
- symbolic link
- hard link fallback for files if symlink creation fails

Do not copy dataset contents in this change.
If both strategies fail, return a clear error.

## Data Model Changes

- Add `image_dirs: list[str]` to dataset settings.
- Keep `image_dir` as the resolved merged directory path for compatibility with existing summary/training code.
- Update request models and project persistence to store the multi-directory source list.

## Error Handling

Return 400 when:
- no dataset directories were provided
- a provided directory does not exist
- a provided path is not a directory
- no supported images were found across all directories
- merged links cannot be created

Error messages should identify the offending directory or filename when possible.

## Testing

Backend tests should cover:
- rendering config for a merged dataset directory
- generating a merged dataset view from multiple directories
- collision-safe naming for duplicate filenames across sources
- project state persistence for `image_dirs`
- route behavior for multi-directory dataset config generation

Frontend tests can stay lightweight for now:
- static assertion that the page and JS include add/remove multi-dataset controls

## Scope

In scope:
- multiple existing server-side dataset directories
- merged project-local dataset view
- one final trainer-facing dataset directory

Out of scope:
- browser uploads
- zip extraction
- real file copying
- per-dataset weighting/repeats
