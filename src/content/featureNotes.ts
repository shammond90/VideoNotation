export const featureNotes = `
# Cuetation — Feature Notes

## Project Management
- **Multi-Project Support** — Create, open, rename, and delete multiple productions
- **Production Metadata** — Track production name, choreographer, venue, year, and notes
- **Project Import/Export** — Share projects as JSON files between users
- **Configuration Templates** — Apply cue type templates when creating new projects

## Video Playback
- **Video Loading** — Drag-and-drop or browse for MP4, WebM, MOV files
- **No-Video Mode** — Work without a video (cues default to 0:00)
- **Change Video** — Swap videos mid-session with options to copy or keep existing cues
- **Playback Controls** — Play/pause, seek ±5s, frame-step forward/back
- **Variable Speed** — Playback at 1×, 1.5×, 2×, 4×, 8×
- **Timecode Overlay** — Optional draggable NTSC 29.97 drop-frame timecode on the video
- **Scrubber Markers** — Title and scene markers displayed on the video timeline

## Cue Management
- **Add Cues** — Stamp a cue at the current video timestamp
- **Edit Cues** — Slide-in edit panel for modifying any cue
- **Duplicate Cues** — Clone an existing cue via context menu
- **Delete Cues** — Remove cues with confirmation
- **Cue Types** — Configurable types with custom colours and short codes
- **Cue Numbering** — Manual cue number and old cue number fields
- **Cue Status** — Mark cues as Provisional, Confirmed, or Cut
- **Cue Flagging** — Flag cues with optional notes for review
- **Tie Groups** — Group cues at the same timecode with drag-reorder
- **Linked Cues** — Bidirectional linking between cues of the same type

## Cue Sheet
- **Chronological Cue Sheet** — Sorted by timestamp with title/scene grouping
- **Classic & Production Views** — Two cue sheet display modes
- **Search & Filter** — Text search and cue-type filtering
- **Past Cues Section** — Greyed-out display of cues before the current playback position
- **Jump Navigation** — Quick-jump to title/scene boundaries
- **Context Menu** — Right-click for edit, duplicate, status, flag, tie, and delete actions

## Configuration
- **Cue Type Management** — Add, remove, rename, reorder cue types
- **Custom Colours & Short Codes** — Per-type colour, font colour, and abbreviations
- **Per-Type Field Selection** — Choose which form fields appear for each cue type
- **Column Visibility & Order** — Toggle and reorder columns; per-type overrides
- **Theatre Mode** — Low-brightness colour scheme for dark environments
- **Config Import/Export** — Save and load configuration as JSON

## Data & Backup
- **Auto-Save** — Annotations saved to IndexedDB automatically
- **Rotating Backups** — Automatic backup ring with configurable interval
- **Backup Recovery** — Browse and restore from backup snapshots
- **Backup Export** — Export individual backup slots as CSV
- **Unsaved Changes Indicator** — Pulsing dot when cues are modified

## Export & Import
- **CSV Export** — Quick export of all cues to CSV
- **XLSX Template Builder** — Drag-and-drop column builder for styled Excel exports
- **Export Templates** — Save and reuse custom export column layouts
- **CSV Import** — Import cues from a CSV file with conflict resolution
`;
