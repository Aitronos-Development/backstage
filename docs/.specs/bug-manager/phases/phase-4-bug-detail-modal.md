# Phase 4: Bug Detail Modal with Inline Editing & Comments

**Goal:** A split-view modal for full bug inspection and editing — content and comments on the left (70%), metadata sidebar on the right (30%) — with inline editing, status/priority dropdowns, and a comment thread.

**Depends on:** Phase 3

---

## What this phase delivers

- A `BugDetailModal` component rendered as a Material-UI `<Dialog>` (maxWidth="lg", fullWidth)
- 70/30 split layout: left panel (content) and right panel (metadata sidebar)
- Inline editing for heading and description (click-to-edit with save on blur/Enter)
- Metadata sidebar with editable assignee, status, priority dropdowns and read-only reporter/timestamps
- Comment section with chronological thread and "add comment" input
- All changes persist to localStorage via context actions
- Changes reflect immediately in the underlying List and Board views (shared context)

## Technical design

### Modal container

**`src/components/BugDetailModal/BugDetailModal.tsx`**

Opens when `selectedBugId` is non-null in context. Fetches the full bug via `getBugById()`.

```tsx
<Dialog
  open={!!selectedBugId}
  onClose={() => selectBug(null)}
  maxWidth="lg"
  fullWidth
>
  <DialogTitle className={classes.dialogTitle}>
    <Box display="flex" alignItems="center" gap={1}>
      <BugReportIcon />
      <Typography variant="h6" component="span" className={classes.ticketNumber}>
        {bug.ticketNumber}
      </Typography>
    </Box>
    <IconButton onClick={() => selectBug(null)}>
      <CloseIcon />
    </IconButton>
  </DialogTitle>
  <DialogContent className={classes.dialogContent}>
    <Grid container spacing={0}>
      <Grid item xs={8} className={classes.leftPanel}>
        <BugContent bug={bug} onUpdate={handleUpdate} />
      </Grid>
      <Grid item xs={4} className={classes.rightPanel}>
        <BugMetadataSidebar bug={bug} onUpdate={handleUpdate} />
      </Grid>
    </Grid>
  </DialogContent>
</Dialog>
```

**Styling:**

```typescript
const useStyles = makeStyles(theme => ({
  dialogTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  dialogContent: {
    padding: 0,
    minHeight: 500,
  },
  ticketNumber: {
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  leftPanel: {
    padding: theme.spacing(3),
    borderRight: `1px solid ${theme.palette.divider}`,
    overflowY: 'auto',
    maxHeight: '70vh',
  },
  rightPanel: {
    padding: theme.spacing(3),
    backgroundColor: '#FAFAFA',
    overflowY: 'auto',
    maxHeight: '70vh',
  },
}));
```

### Left panel — BugContent

**`src/components/BugDetailModal/BugContent.tsx`**

Contains three sections: heading, description, and comments.

#### Inline editable heading

- Renders as `<Typography variant="h5">` by default
- Click toggles to a `<TextField>` with the current heading value
- **Save:** On blur or Enter keypress → calls `updateBug(id, { heading: newValue })`
- **Cancel:** Escape key → reverts to original value
- **Validation:** Empty heading shows inline error, prevents save

```tsx
const [isEditingHeading, setIsEditingHeading] = useState(false);
const [headingValue, setHeadingValue] = useState(bug.heading);

// Display mode
{!isEditingHeading && (
  <Typography
    variant="h5"
    onClick={() => setIsEditingHeading(true)}
    className={classes.editableText}
  >
    {bug.heading}
  </Typography>
)}

// Edit mode
{isEditingHeading && (
  <TextField
    fullWidth
    autoFocus
    value={headingValue}
    onChange={e => setHeadingValue(e.target.value)}
    onBlur={handleHeadingSave}
    onKeyDown={e => {
      if (e.key === 'Enter') handleHeadingSave();
      if (e.key === 'Escape') {
        setHeadingValue(bug.heading);
        setIsEditingHeading(false);
      }
    }}
    variant="outlined"
    inputProps={{ maxLength: 200 }}
  />
)}
```

#### Inline editable description

Same click-to-edit pattern as heading, but uses `<TextField multiline>` with 4–8 rows.

- **Display mode:** Renders description text (plain text for prototype; markdown rendering deferred to future iteration)
- **Empty state:** Shows "Add a description..." placeholder in muted text, clickable
- **Edit mode:** `<TextField multiline minRows={4} maxRows={12}>`
- **Save:** On blur → calls `updateBug(id, { description: newValue })`

#### Comment section

**`src/components/BugDetailModal/CommentSection.tsx`**

```tsx
interface CommentSectionProps {
  bugId: string;
}
```

**Comment thread:**

Renders comments chronologically (oldest first). Each comment:

```
┌──────────────────────────────┐
│ 👤 Jane Doe · 2h ago        │
│ Reproduced on Safari 17.2.  │
│ Working on a fix.            │
└──────────────────────────────┘
```

- **Author:** `<UserAvatar>` (small) + display name + relative timestamp
- **Content:** Plain text, preserving line breaks
- **Relative timestamp:** Computed from `comment.createdAt` using a simple helper:
  - < 1 minute → "just now"
  - < 60 minutes → "Xm ago"
  - < 24 hours → "Xh ago"
  - < 7 days → "Xd ago"
  - Otherwise → formatted date (e.g., "Feb 20, 2026")

**Add comment input:**

```tsx
<Box className={classes.addComment}>
  <TextField
    fullWidth
    multiline
    minRows={2}
    maxRows={4}
    placeholder="Add a comment..."
    value={newComment}
    onChange={e => setNewComment(e.target.value)}
    variant="outlined"
  />
  <Button
    variant="contained"
    color="primary"
    size="small"
    disabled={!newComment.trim()}
    onClick={handleAddComment}
    className={classes.sendButton}
  >
    Send
  </Button>
</Box>
```

- **Send** calls `addComment(bugId, content)` from context
- On success, comment appears immediately in the thread, input clears
- **Mock author:** Uses a hardcoded current user (e.g., "Jane Doe") since there's no real auth in the prototype

**Comment loading:**

Comments are loaded when the modal opens via a `useComments(bugId)` hook that calls `api.getComments(bugId)`. The hook returns `{ comments, addComment, loading }`.

### Right panel — BugMetadataSidebar

**`src/components/BugDetailModal/BugMetadataSidebar.tsx`**

A vertical list of metadata fields with labels and values.

```
┌─────────────────────────────┐
│  DETAILS                     │
│                              │
│  Assignee:                   │
│  👤 Jane Doe          [✎]   │
│                              │
│  Reporter:                   │
│  👤 John Smith               │
│                              │
│  Status:                     │
│  [In Progress ▾]            │
│                              │
│  Priority:                   │
│  [🔴 Urgent ▾]              │
│                              │
│  Created:                    │
│  Feb 20, 2026 09:15          │
│                              │
│  Updated:                    │
│  Feb 24, 2026 14:30          │
└─────────────────────────────┘
```

**Field specifications:**

| Field    | Component                     | Behavior                                                                           |
| -------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| Assignee | `<UserAvatar>` + edit button  | Edit button opens a `<Select>` with mock users + "Unassigned" option. Change saves immediately. |
| Reporter | `<UserAvatar>` (read-only)    | No edit capability.                                                                |
| Status   | `<Select>`                    | Populated with all 5 statuses. `onChange` → `updateBug(id, { statusId })`. Status chip color shown next to each option. |
| Priority | `<Select>`                    | Options: Urgent, Medium, Low. Each option shows the priority color dot. `onChange` → `updateBug(id, { priority })`. |
| Created  | `<Typography>` (read-only)    | Formatted as "MMM DD, YYYY HH:mm" from `createdAt`.                               |
| Updated  | `<Typography>` (read-only)    | Formatted as "MMM DD, YYYY HH:mm" from `updatedAt`.                               |

**Assignee picker:**

For the prototype, the assignee picker is a `<Select>` populated with the 2 mock users plus an "Unassigned" option:

```tsx
<Select
  value={bug.assignee?.id || ''}
  onChange={e => {
    const assigneeId = e.target.value || null;
    onUpdate({ assigneeId });
  }}
>
  <MenuItem value="">Unassigned</MenuItem>
  {mockUsers.map(user => (
    <MenuItem key={user.id} value={user.id}>
      <UserAvatar user={user} size="small" />
    </MenuItem>
  ))}
</Select>
```

**Status select with color indicators:**

```tsx
<Select value={bug.status.id} onChange={handleStatusChange}>
  {statuses.map(s => (
    <MenuItem key={s.id} value={s.id}>
      <Box display="flex" alignItems="center" gap={1}>
        <Box
          width={12}
          height={12}
          borderRadius="50%"
          bgcolor={s.color}
        />
        {s.name}
      </Box>
    </MenuItem>
  ))}
</Select>
```

### Hooks

**`src/hooks/useComments.ts`**

```typescript
function useComments(bugId: string | null) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const api = useApi(bugManagerApiRef);

  useEffect(() => {
    if (!bugId) return;
    setLoading(true);
    api.getComments(bugId).then(setComments).finally(() => setLoading(false));
  }, [bugId, api]);

  const addComment = async (content: string) => {
    if (!bugId) return;
    const comment = await api.addComment(bugId, content);
    setComments(prev => [...prev, comment]);
  };

  return { comments, addComment, loading };
}
```

### Wiring the modal

The modal is rendered at the `BugManagerPage` level, outside the List/Board views:

```tsx
<BugManagerProvider>
  <Page themeId="tool">
    <Header ... />
    <Content>
      <Toolbar />
      {activeView === 'list' && <ListView />}
      {activeView === 'board' && <BoardView />}
    </Content>
    {selectedBugId && <BugDetailModal />}
  </Page>
</BugManagerProvider>
```

Clicking a row in ListView or a card in BoardView sets `selectedBugId` → modal opens. Closing the modal sets it to `null`.

### Cross-view state propagation

When the user changes a bug's status or priority from the modal sidebar:
1. `updateBug(id, updates)` is called on the context
2. Context updates the bug in its local `bugs` array
3. Both ListView and BoardView re-render with the updated data
4. On the Board, the card moves to the new status column immediately

This works because all views consume the same context.

### Package structure additions

```
src/components/
├── BugDetailModal/
│   ├── BugDetailModal.tsx       (new)
│   ├── BugContent.tsx           (new)
│   ├── BugMetadataSidebar.tsx   (new)
│   └── CommentSection.tsx       (new)

src/hooks/
├── useComments.ts               (new)

src/utils/
├── dateFormatting.ts            (new — relative time + date formatting)
```

## Steps

### 4.1 Build date formatting utilities

Create `src/utils/dateFormatting.ts` with `formatRelativeTime(isoString)` and `formatDateTime(isoString)` helpers.

### 4.2 Build CommentSection

Create the comment thread display and "add comment" input. Wire to `useComments` hook.

### 4.3 Build BugContent (left panel)

Create the inline-editable heading, inline-editable description, and embed `CommentSection`. Implement click-to-edit with save-on-blur/Enter pattern.

### 4.4 Build BugMetadataSidebar (right panel)

Create the metadata sidebar with assignee picker, status select, priority select, reporter display, and timestamps.

### 4.5 Build BugDetailModal container

Create the `<Dialog>` with header (icon + ticket number + close button) and 70/30 `<Grid>` layout. Wire `BugContent` and `BugMetadataSidebar`.

### 4.6 Wire modal into BugManagerPage

Render `BugDetailModal` at the page level. Connect row clicks (ListView) and card clicks (BoardView) to `selectBug()`.

### 4.7 Implement useComments hook

Create the hook with comment fetching and `addComment` action using `LocalStorageClient`.

### 4.8 Verify

- Click a bug row in List View → modal opens with correct bug data
- Click a bug card in Board View → same modal opens
- Modal shows 70/30 split layout with proper styling
- Click heading → inline edit mode, type new heading, blur → heading saves, updates list/board
- Click description → inline edit, modify, blur → saves
- Change status dropdown → bug's status chip updates in list view, card moves columns in board view
- Change priority → priority chip updates across all views
- Change assignee → avatar updates across all views
- Comments display chronologically with author, relative time
- Type a comment, click Send → comment appears in thread
- Click close (✕) → modal closes
- Press Escape → modal closes
- Reporter and timestamps are read-only

## What comes out of this phase

The full bug detail experience. Users can inspect any bug in depth, edit its fields inline, change status and priority, reassign it, and add comments — all from a single modal that keeps the underlying views in sync.

## Risks

| Risk                                     | Impact                              | Mitigation                                                          |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Stale data if modal stays open too long  | User sees outdated info             | Prototype with single user — no staleness risk                      |
| Inline edit conflicts with text selection | User can't select text to copy      | Double-click to edit instead of single-click if usability issues arise |
| Dialog height on small screens           | Content gets cut off                | `maxHeight: 70vh` with `overflowY: auto` on both panels            |
| Comment ordering after rapid additions   | Comments appear out of order        | Append to array sequentially; no concurrent writes in prototype     |
