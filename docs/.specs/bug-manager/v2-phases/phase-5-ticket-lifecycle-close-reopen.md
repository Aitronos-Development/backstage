# v2 Phase 5: Ticket Lifecycle — Close & Re-open

**Goal:** Replace the v1 hard-delete flow with a soft-close workflow. Closed bugs are hidden from active views by default, a toolbar toggle reveals them with a muted visual style, and admin users can re-open closed tickets from the Detail Modal.

**Depends on:** Phase 4 (authentication wired; `closeBug` exists on the API interface)

---

## What this phase delivers

- "Close Ticket" button in the `BugDetailModal` header sidebar (replaces the Delete icon)
- Confirmation dialog for closing a ticket
- Closed bugs hidden from the List View and Board View by default
- "Include closed tickets" toggle in the `Toolbar`
- Muted visual style for closed bugs when the toggle is on (opacity + ticket number strikethrough)
- "Re-open" button visible in the Detail Modal for closed bugs (admin only)
- `BugManagerProvider` state: `includeClosed: boolean` and `setIncludeClosed`
- All Delete-related code fully removed from components

---

## Technical design

### BugManagerProvider — add includeClosed state

**`src/context/BugManagerProvider.tsx`**

```typescript
// New state
const [includeClosed, setIncludeClosed] = useState(false);

// Pass to API call
const bugs = await api.getBugs({
  ...filters,
  includeClosed,
});

// Expose in context value
interface BugManagerContextValue {
  // ... existing fields ...
  includeClosed: boolean;
  setIncludeClosed: (v: boolean) => void;
  closeBug: (id: string) => Promise<void>;
  reopenBug: (id: string) => Promise<void>;
  // deleteBug removed
}

// closeBug action
const closeBug = useCallback(async (id: string) => {
  await api.closeBug(id);
  selectBug(null);        // close the modal
  await refreshBugs();
}, [api, selectBug, refreshBugs]);

// reopenBug action
const reopenBug = useCallback(async (id: string) => {
  await api.updateBug(id, { isClosed: false });
  await refreshBugs();
}, [api, refreshBugs]);
```

### Toolbar — "Include closed tickets" toggle

**`src/components/BugManagerPage/Toolbar.tsx`**

Add a right-aligned `FormControlLabel` with a `Switch`:

```tsx
const { includeClosed, setIncludeClosed } = useBugManagerContext();

// Right side of the toolbar, after the search field:
<FormControlLabel
  control={
    <Switch
      size="small"
      checked={includeClosed}
      onChange={e => setIncludeClosed(e.target.checked)}
    />
  }
  label={
    <Typography variant="caption" color="textSecondary">
      Include closed
    </Typography>
  }
  style={{ marginLeft: 'auto' }}
/>
```

**Updated toolbar layout:**

```
[+ New Bug]  [List | Board]  [⚙ Statuses]  | Status[▾]  Priority[▾]  [🔍 Search]  [○ Include closed]
```

### ListView — muted style for closed bugs

**`src/components/ListView/BugRow.tsx`**

When `bug.isClosed === true`, apply a muted visual:

```typescript
const useStyles = makeStyles(theme => ({
  // existing styles...
  closedRow: {
    opacity: 0.5,
  },
  closedTicketNumber: {
    textDecoration: 'line-through',
    color: theme.palette.text.disabled,
  },
}));
```

```tsx
<TableRow
  className={clsx(classes.row, bug.isClosed && classes.closedRow)}
  // ...
>
  <TableCell>
    <Typography
      variant="body2"
      className={clsx(classes.ticketNumber, bug.isClosed && classes.closedTicketNumber)}
    >
      {bug.ticketNumber}
    </Typography>
  </TableCell>
  // ...
</TableRow>
```

### BoardView — muted style for closed bug cards

**`src/components/BoardView/BugCard.tsx`**

Apply the same opacity treatment. Closed cards should still be draggable (the user may want to move them before re-opening), but show a "Closed" badge overlay:

```tsx
<Card
  style={{
    opacity: bug.isClosed ? 0.5 : 1,
    position: 'relative',
  }}
  // ...
>
  {bug.isClosed && (
    <Box
      position="absolute"
      top={4}
      right={4}
    >
      <Chip label="Closed" size="small" style={{ backgroundColor: '#9E9E9E', color: '#fff', fontSize: 10 }} />
    </Box>
  )}
  {/* existing card content */}
</Card>
```

### BugDetailModal — Close Ticket button

**`src/components/BugDetailModal/BugMetadataSidebar.tsx`**

Replace the Delete icon with the Close Ticket action. Place it at the bottom of the sidebar as a full-width button:

```tsx
const { closeBug, reopenBug, selectBug } = useBugManagerContext();
const isAdmin = useIsAdmin();
const [confirmOpen, setConfirmOpen] = useState(false);

// At the bottom of the sidebar:
{!bug.isClosed ? (
  <>
    <Button
      fullWidth
      variant="outlined"
      color="secondary"
      startIcon={<ArchiveIcon />}
      onClick={() => setConfirmOpen(true)}
      style={{ marginTop: 'auto' }}
    >
      Close Ticket
    </Button>

    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs">
      <DialogTitle>Close {bug.ticketNumber}?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          This ticket will be hidden from the active board and list. It can be
          re-opened at any time using the "Include closed" toggle.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
        <Button
          color="secondary"
          variant="contained"
          onClick={async () => {
            setConfirmOpen(false);
            await closeBug(bug.id);
          }}
        >
          Close Ticket
        </Button>
      </DialogActions>
    </Dialog>
  </>
) : (
  isAdmin && (
    <Button
      fullWidth
      variant="outlined"
      startIcon={<UnarchiveIcon />}
      onClick={async () => {
        await reopenBug(bug.id);
        selectBug(null);
      }}
      style={{ marginTop: 'auto' }}
    >
      Re-open Ticket
    </Button>
  )
)}
```

**Icons used:**
- `ArchiveIcon` from `@material-ui/icons/Archive` for Close
- `UnarchiveIcon` from `@material-ui/icons/Unarchive` for Re-open

### Remove all Delete code

Audit and remove:

| File | Change |
|---|---|
| `BugDetailModal.tsx` | Remove `DeleteIcon`, `handleDelete`, and delete confirmation dialog |
| `BugManagerContextValue` | Remove `deleteBug` property |
| `BugManagerProvider.tsx` | Remove `deleteBug` implementation |
| `BugManagerApi.ts` | `deleteBug` was already removed in Phase 3 — confirm it's gone |
| `LocalStorageClient.ts` | Remove `deleteBug` implementation (replaced by `closeBug`) |

### Empty state update

Update the List View empty state messages to reflect the close workflow:

```tsx
// When includeClosed is false and no bugs found:
{hasActiveFilters
  ? 'Try adjusting your filters'
  : 'No active bugs. Use "Include closed" to view closed tickets.'
}

// When includeClosed is true and no bugs found:
{hasActiveFilters
  ? 'No bugs match these filters'
  : 'No bugs found'
}
```

### Header subtitle

Update the bug count in the page header to reflect what's visible:

```tsx
// In BugManagerPage.tsx
const { bugs, totalBugCount, includeClosed } = useBugManagerContext();

<Header
  title="Bug Manager"
  subtitle={
    includeClosed
      ? `${totalBugCount} bugs (including closed)`
      : `${bugs.length} active bugs`
  }
>
```

---

## Steps

### 5.1 Add `includeClosed` state to `BugManagerProvider`

Add `includeClosed: boolean`, `setIncludeClosed`, `closeBug`, and `reopenBug` to the context. Remove `deleteBug`. Update `getBugs` call to pass `includeClosed`.

### 5.2 Add "Include closed" toggle to Toolbar

Add the `Switch` + `FormControlLabel` to the right side of the toolbar. Wire to `setIncludeClosed` from context.

### 5.3 Apply muted style to closed bugs in ListView

Update `BugRow` styles: opacity 0.5 and strikethrough ticket number when `isClosed === true`.

### 5.4 Apply muted style to closed bug cards in BoardView

Update `BugCard`: opacity 0.5 and a "Closed" chip badge when `isClosed === true`.

### 5.5 Build "Close Ticket" button and confirmation dialog

Replace the delete icon in `BugMetadataSidebar` with the Close Ticket button + confirmation dialog. Wire to `closeBug` from context.

### 5.6 Build "Re-open" button for admins

Add the conditional Re-open button below the Close Ticket area. Visible only when `bug.isClosed === true` and `isAdmin === true`.

### 5.7 Remove all Delete code

Remove `DeleteIcon`, `handleDelete`, `deleteBug` from all files. Run TypeScript compiler to confirm no remaining references.

### 5.8 Update empty state messages

Update ListView empty state text for both `includeClosed = true` and `includeClosed = false` scenarios.

### 5.9 Update header subtitle

Change the page subtitle to reflect active vs. total bug counts.

### 5.10 Verify

**Close workflow:**
- Open a bug in the Detail Modal → "Close Ticket" button visible at the bottom of the sidebar
- Click "Close Ticket" → confirmation dialog appears
- Click "Cancel" → nothing happens, modal stays open
- Click "Close Ticket" in confirmation → modal closes, bug disappears from active list/board
- Toggle "Include closed" in toolbar → closed bug reappears with muted appearance and strikethrough ticket number

**Re-open workflow:**
- With "Include closed" on, open a closed bug
- "Re-open Ticket" button visible (admin user)
- Click "Re-open" → bug returns to active view with full opacity

**Delete button absence:**
- No Delete / trash icon visible anywhere in the UI
- TypeScript compilation has zero references to `deleteBug`

**Board behaviour:**
- Closed bug card shows a "Closed" chip in the top-right corner
- Drag a closed card to another column → status updates, but card remains muted
- Toggle off "Include closed" → closed card disappears from board

---

## What comes out of this phase

Bugs are permanent records. No data is ever lost. The board and list show clean, actionable views by default. Admins have full audit access via the "Include closed" toggle. The mental model for users shifts from "delete" to "archive" — appropriate for a production issue tracker.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Users expect a "delete" option for test bugs | Frustration | Document the close-only policy in the plugin's help text or README |
| Closed bugs on the board clutter status columns when toggle is on | Board becomes hard to read | The muted style (opacity + closed chip) visually separates them; consider a separate "Closed" column in a future iteration |
| Re-open button visible only to admins means non-admins are locked out | Support burden | Consider allowing the original reporter to re-open their own tickets in a future iteration |
| `totalBugCount` in the provider counts all bugs including closed | Header subtitle shows inflated count | Pass `allBugs` (unfiltered) to count and `bugs` (filtered) for the display — already how v1 works with `totalBugCount` |
