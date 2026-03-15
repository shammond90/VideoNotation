export const userGuide = `
# Cuetation — User Guide

---

## Getting Started

### Creating Your First Project
1. Launch Cuetation — you'll land on the **Home Screen**
2. Click **+ New Project**
3. Enter a **Project Name** (required)
4. Optionally expand **Production Details** to add choreographer, venue, year, etc.
5. Choose a **Configuration Template** or keep "Cuetation Standard"
6. Click **Create**

### Loading a Video
- **Drag and drop** a video file onto the drop zone, or **click to browse**
- Supported formats: MP4, WebM, MOV (any browser-compatible format)

### Working Without a Video
- Click **"Continue without video"** on the video assignment screen
- All cues will default to timestamp 0:00
- You can upload a video later via the **"Upload video"** link

---

## Video Playback Controls

| Action | Keyboard | Button |
|---|---|---|
| Play / Pause | Space | Play |
| Seek back 5s | Left Arrow | -5s |
| Seek forward 5s | Right Arrow | +5s |
| Previous frame | , | -1f |
| Next frame | . | +1f |
| Speed up | + | Fast |
| Slow down | - | Slow |

Playback speeds cycle through: **1x, 1.5x, 2x, 4x, 8x**

### Timecode Overlay
Enable via **Settings > Show Video Timecode**. The overlay is draggable and displays NTSC drop-frame timecode.

---

## Adding & Editing Cues

### Adding a Cue
1. Play or scrub the video to the desired moment
2. Press **Enter** or click the **Cue** button
3. Select a **Cue Type**, fill in fields
4. Press **Ctrl+Enter** or click **Save Cue**

### Editing a Cue
- Click a cue to expand it, then click **Edit**
- Or right-click a cue and select **Edit** from the context menu

### Duplicating a Cue
- Right-click a cue and select **Duplicate cue**

### Deleting a Cue
- Right-click a cue and select **Delete cue**, then confirm

---

## Cue Types

Built-in types include: TITLE, SCENE, AUDIO, DECK, ENVIRO, LIGHTS, PARTS, RAIL, SPOT 1, SPOT 2, and LOOP.

### Adding Custom Cue Types
1. Open **Settings** (gear icon)
2. Go to the **Cue Types** tab
3. Type a name and click **Add**
4. Assign a colour, short code, and select which fields appear

> TITLE, SCENE, and LOOP are reserved types and cannot be removed.

---

## Cue Statuses & Flagging

### Cue Status
Right-click a cue to set:
- **Provisional** — Work in progress (default)
- **Confirmed** — Locked in for the show
- **Cut** — Removed from running order

### Flagging
- Right-click a cue and select **Flag** to mark for review
- Add an optional **flag note**
- Flagged cues display a flag icon and are counted in the header

---

## Tie Groups

When multiple cues share the **same timestamp**, they form a tie group. Reorder cues within the group via the context menu (Move Up / Move Down).

---

## Linked Cues

Enable **Link Cue#** to create bidirectional links between cues of the same type.

---

## Cue Sheet Views

### Classic View
Default chronological list with configurable columns.

### Production View
Alternative layout with coloured cue type badges and short codes. Toggle via **Settings > Cue Sheet View**.

### Search & Filter
- Use the **search bar** to find cues by text
- Click the **filter icon** to filter by cue type
- The **Past Cues** section shows earlier cues in grey (collapsible)

---

## Configuration (Settings)

| Tab | Controls |
|---|---|
| **Cue Types** | Add/remove/rename types, colours, short codes, per-type fields |
| **Columns** | Toggle/reorder columns; per-type column overrides |
| **Display** | Theatre mode, past cues, skipped cues, timecode, cue sheet view |
| **Backup & Recovery** | Browse/restore backup snapshots, set backup interval |
| **Danger Zone** | Clear cues, factory reset |
| **Projects** | Edit/delete projects, export project JSON |

### Theatre Mode
Low-brightness colour scheme for dark environments. Toggle in **Settings > Display**.

---

## Exporting Cues

Click the **Export** button in the header.

### Quick CSV Export
Exports all cues chronologically as a .csv file.

### XLSX Template Builder
1. Choose **XLSX** from the export dialog
2. Add columns and drag field chips into them
3. Rename columns, reorder via drag-and-drop
4. Customise cue type colours for the spreadsheet
5. Toggle **Include skipped cues**
6. Save as template or export immediately

---

## Importing Cues

1. Click **Import CSV** in the cue panel footer
2. Select a .csv file
3. New cue types found in the CSV are automatically added

---

## Project Management

### Switching Projects
- Click **Home** or use the **Switch** button
- Unsaved changes trigger a save prompt

### Exporting a Project
- **Settings > Projects** then click export on any project
- Downloads a .json file with all project data

### Importing a Project
- On the Home Screen, click **Import**
- Select a project .json file
- Resolve conflicts via the Import Conflict Modal if needed

---

## Backup & Recovery

### Configuring Backups
**Settings > Backup & Recovery > Backup Interval** — Set frequency in minutes.

### Restoring a Backup
1. Go to **Settings > Backup & Recovery**
2. Select a video
3. Browse backup slots
4. Click **Restore**

### Exporting a Backup
Click the download icon on any backup slot to export as CSV.

---

## Danger Zone

| Action | Effect |
|---|---|
| **Clear Current Video Cues** | Removes cues for the active video only |
| **Clear All Cues** | Removes all annotations; config preserved |
| **Factory Reset** | Deletes everything — cannot be undone |

All actions require confirmation.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Enter | Open cue form / Add cue |
| Ctrl+Enter | Save cue |
| Space | Play/pause video |
| Left / Right | Seek 5 seconds |
| , / . | Step 1 frame |
| + / - | Increase/decrease speed |
| J | Toggle Jump Navigation menu |
| Ctrl+S | Save project (works everywhere) |

---

## Tips
- **Unsaved changes** show as a pulsing yellow dot next to the project name
- The **cue panel is resizable** — drag the splitter between video and panel
- **TITLE cues** create section headers and scrubber markers
- **SCENE cues** create coloured bands on the scrubber
- Data is stored in **IndexedDB** — clearing browser data erases everything unless exported
`;
