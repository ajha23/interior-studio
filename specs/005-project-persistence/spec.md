# 005 — Project persistence and history

**Status:** Done (M5)

## User stories
- As a designer, I undo and redo any edit, including a sequence of dependent edits.
- As a designer, I save a project, reload the page, and continue where I left off.
- As a designer, I see my projects, open or delete them, and export/import a project file.

## Requirements
- Undo/redo from the toolbar and ⌘Z / ⇧⌘Z / ⌘Y; the tooltip names the step. 100 steps kept.
- "Unsaved changes" indicator; ⌘S saves; leaving with unsaved changes asks first.
- Projects are stored in IndexedDB; the URL (`#/project/<id>`) reopens a project after reload.
- Files carry a format tag and schema version; loading migrates, validates and reports problems.
- Invalid files are rejected with readable reasons and never partially loaded.

## Acceptance criteria
- Save, reload: entities and material assignments are identical.
- Undo after resize + finish change restores the finish, then the size and the worktop.
