# Project Type Isolation Design

**Date:** 2026-03-26

## Goal

Make projects first-class saved configurations that are isolated by architecture. A project must be created as either `wan22` or `zimage`, and switching projects should restore the correct saved configuration automatically.

## Decisions

- A project has exactly one `project_type`: `wan22` or `zimage`.
- Old project files are not supported. Users will manually create new projects.
- The sidebar project area becomes:
  - a project dropdown for selecting existing projects
  - a `New Project` action for creating a project
- Configuration changes auto-save to the selected project.
- A `wan22` project may not edit or run `zimage` settings, and vice versa.

## Backend Shape

Each `project.json` stores:

- `id`
- `name`
- `project_type`
- `musubi_tuner_path`
- `python_bin`
- `workspace_root`
- `wan22`
- `zimage`

`wan22` and `zimage` each contain their own `model`, `dataset`, `training`, and `ui` sub-sections. The inactive architecture remains untouched when saving the active one.

## Frontend Behavior

- On load, fetch `/api/projects` to populate the dropdown.
- Selecting a project fetches `/api/projects/{id}` and hydrates the corresponding form.
- Creating a project requires name, type, musubi path, and python executable.
- Changing fields auto-saves with a short debounce for text inputs and immediate saves for selects/toggles.
- If the selected project type does not match the open architecture tab, the UI switches to the matching tab automatically.

## Out of Scope

- Migrating old project files
- Delete / rename / clone project actions
- Cross-project import/export
