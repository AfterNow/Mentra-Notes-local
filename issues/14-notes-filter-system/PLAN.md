# Issue 14: Notes Filter System — Trash, Archive, Favourites, Sort, AI/Manual

## Overview

Add the same filter/sort system from conversations to notes. Users can favourite, archive, and trash individual notes. Filter drawer with sort and show filters. Active filters show as tags in the pill bar. Empty Trash permanently deletes notes. Swipe-to-delete only available in trash view.

## Note Schema Changes

### Rename `isStarred` → `isFavourite`

The Note model has `isStarred` but conversations/files use `isFavourite`. Rename for consistency. Add fallback: if `isStarred` is true on existing docs, treat as `isFavourite: true`.

### Add new fields

```ts
isFavourite: boolean;  // default false (replaces isStarred, with migration fallback)
isArchived: boolean;    // default false
isTrashed: boolean;     // default false
```

### Fix `updateNote()` data parameter

Current `updateNote()` only accepts `title`, `content`, `summary`, `isStarred`, `folderId`. Must expand to include all new fields:

```ts
data: Partial<{
  title: string;
  content: string;
  summary: string;
  isFavourite: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  folderId: string | null;
}>
```

### Fix `persistNoteUpdate()` in NotesManager

Currently cherry-picks only `title`, `summary`, `content`, `folderId`. Must also pass through `isFavourite`, `isArchived`, `isTrashed`.

### Files to modify:
- `src/backend/models/note.model.ts` — Rename `isStarred` → `isFavourite`, add `isArchived`, `isTrashed`, expand `updateNote()` type
- `src/shared/types.ts` — Add fields to `Note` interface
- `src/backend/session/managers/NotesManager.ts` — Update `NoteData`, hydrate mapping (with `isStarred` fallback), `persistNoteUpdate`

### Hydrate fallback for `isStarred` → `isFavourite`

```ts
isFavourite: n.isFavourite ?? n.isStarred ?? false,
```

This handles old docs that have `isStarred: true` but no `isFavourite` field.

## New RPCs on NotesManager

```ts
favouriteNote(noteId: string): Promise<void>;      // sets isFavourite=true, clears archived+trashed
unfavouriteNote(noteId: string): Promise<void>;
archiveNote(noteId: string): Promise<void>;         // sets isArchived=true, clears favourite+trashed
unarchiveNote(noteId: string): Promise<void>;
trashNote(noteId: string): Promise<void>;           // sets isTrashed=true, clears favourite+archived
untrashNote(noteId: string): Promise<void>;
permanentlyDeleteNote(noteId: string): Promise<void>; // hard delete from MongoDB
emptyNoteTrash(): Promise<number>;                    // permanently deletes all trashed notes
```

States are mutually exclusive (same as conversations).

**Important:** The existing `deleteNote()` RPC remains as a hard delete but is only called from:
- `permanentlyDeleteNote()` (new)
- `emptyNoteTrash()` (new)
- Swipe-to-delete in trash view only

Normal "delete" actions (3-dots menu, swipe on non-trashed notes) call `trashNote()` instead.

### Files to modify:
- `src/backend/session/managers/NotesManager.ts` — Add RPCs
- `src/shared/types.ts` — Add to `NotesManagerI`

## Archive Refactor: Note-Level Only

**Current problem:** `handleArchiveNote` calls `session.file.archiveFile(note.date)` which archives the entire day, not the individual note.

**Fix:** Archive is now note-level. Remove file-level archive calls from notes. Use `session.notes.archiveNote(noteId)` instead of `session.file.archiveFile(date)`.

### Files to modify:
- `src/frontend/pages/notes/NotesPage.tsx` — Change `handleArchiveNote` to call note-level RPC
- `src/frontend/pages/notes/FolderPage.tsx` — Same change

## Frontend: NotesFilterDrawer

Create `src/frontend/components/shared/NotesFilterDrawer.tsx` — same pattern as `ConversationFilterDrawer`.

### Sort options:
- Most recent (default)
- Oldest first

### Show filters:
- All notes (hides archived + trashed)
- Favourites
- Archived
- Trash

### No date range filter.

## Frontend: NotesPage Changes

### Filter state
```ts
const [sortBy, setSortBy] = useState<NoteSortBy>("recent");
const [showFilter, setShowFilter] = useState<NoteShowFilter>("all");
const [filterLoading, setFilterLoading] = useState(false);
```

### Filter logic in `filteredNotes` useMemo

Two-level filtering: show filter + pill filter (AI/Manual) stack together.

```ts
let result = [...notes];

// Show filter (mutually exclusive states)
if (showFilter === "favourites") result = result.filter(n => n.isFavourite);
else if (showFilter === "archived") result = result.filter(n => n.isArchived);
else if (showFilter === "trash") result = result.filter(n => n.isTrashed);
else result = result.filter(n => !n.isTrashed && !n.isArchived); // "all"

// Pill filters (AI/Manual) — applied on top
if (activeFilter === "manual") result = result.filter(n => !n.isAIGenerated);
else if (activeFilter === "ai") result = result.filter(n => n.isAIGenerated);

// Sort
if (sortBy === "oldest") result.sort(byOldest);
else result.sort(byNewest);
```

### Filter pill bar

Current pills: All | Favorites | Manual | AI Generated

Changes:
- Rename "AI Generated" → "AI"
- "Favorites" pill sets `showFilter = "favourites"` (no longer a broken TODO)
- Add show filter tag (black pill) for Favourites/Archived/Trash when active from drawer
- When show filter is active from drawer, gray out All pill
- Tapping "All" pill resets show filter to "all"
- Horizontal scroll (`overflow-x-auto`) if pills overflow
- No date range tags

### Trash view

When `showFilter === "trash"`:
- Show "X notes in trash" + "Empty Trash" button above list
- Swipe-to-delete on trashed notes calls `permanentlyDeleteNote()` (hard delete)
- "Empty Trash" opens `BottomDrawer` confirmation: "Your notes will be permanently deleted. Are you sure?" with Cancel / Delete All

### Swipe actions by context

| Note state | Left swipe reveals |
|---|---|
| Normal (not trashed/archived) | Archive + Trash |
| Trashed | Restore + Delete (permanent) |
| Archived | shown via archive filter only, swipe reveals Unarchive + Trash |

### Loading animation

Same `LoadingState` spinner for 3 seconds when switching show filters via drawer.

### Empty state

Same dot art "Nothing found" illustration with contextual messages:
- Trash: "Your trash is empty"
- Archived: "No archived notes"
- Favourites: "No favourite notes yet"
- Default: "Try adjusting your filters"

## Frontend: NotePage 3-Dots Menu

Current menu: Send Email | Delete Note

Replace with:
- Send Email
- Divider
- Favourite / Unfavourite (moved star button here)
- Archive / Unarchive
- Divider
- Trash / Untrash

Remove the standalone star button from header (move to menu).

Trash navigates back to `/notes`. States are mutually exclusive.

### Files to modify:
- `src/frontend/pages/note/NotePage.tsx` — Update dropdown menu, remove star button

## Frontend: FolderPage

Filter out trashed notes from folder view:
```ts
const folderNotes = notes.filter(n => n.folderId === folderId && !n.isTrashed);
```

### Files to modify:
- `src/frontend/pages/notes/FolderPage.tsx` — Filter trashed notes

## Files Summary

### New files:
| File | Description |
|------|-------------|
| `src/frontend/components/shared/NotesFilterDrawer.tsx` | Filter drawer for notes |

### Modified files:
| File | Change |
|------|--------|
| `src/backend/models/note.model.ts` | Rename `isStarred` → `isFavourite`, add `isArchived`/`isTrashed`, expand `updateNote` type |
| `src/shared/types.ts` | Add fields to `Note`, add RPCs to `NotesManagerI` |
| `src/backend/session/managers/NotesManager.ts` | Update `NoteData`, hydrate (with fallback), `persistNoteUpdate`, add RPCs |
| `src/frontend/pages/notes/NotesPage.tsx` | Filter state, filter logic, pill bar, trash UI, loading, empty state |
| `src/frontend/pages/note/NotePage.tsx` | Update 3-dots menu, remove star button |
| `src/frontend/pages/notes/NoteRow.tsx` | Context-aware swipe actions |
| `src/frontend/pages/notes/FolderPage.tsx` | Filter out trashed notes |

## Implementation Order

1. **Schema** — Rename `isStarred` → `isFavourite`, add `isArchived`/`isTrashed` to model + types
2. **Fix updateNote + persistNoteUpdate** — Expand accepted fields
3. **Backend RPCs** — Add favourite/archive/trash/permanentlyDelete/emptyTrash RPCs
4. **Hydrate fallback** — Map new fields with `isStarred` fallback
5. **NotesFilterDrawer** — Create the filter drawer component
6. **NotesPage** — Filter state, logic, pill bar tags, trash view, loading, empty state
7. **NotePage menu** — Update 3-dots with favourite/archive/trash, remove star button
8. **NoteRow swipe** — Context-aware swipe actions
9. **FolderPage** — Filter out trashed notes
10. **Archive refactor** — Change note archive from file-level to note-level
