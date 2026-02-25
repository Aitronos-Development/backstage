# v2 Phase 6: Assignee Bar & Multi-select Filter

**Goal:** A Jira-style horizontal avatar bar that renders every user currently assigned to an active bug. Clicking avatars toggles a multi-select assignee filter — selecting one or more users narrows the list and board to show only bugs assigned to them.

**Depends on:** Phase 5 (ticket lifecycle complete, `includeClosed` in context)

---

## What this phase delivers

- `AssigneeBar` component: horizontal strip of clickable avatars above the List/Board content
- Multi-select toggle behaviour: click once to select, click again to deselect
- Visual feedback: selected avatars render with a 2px primary-color border
- "All" indicator: when no avatars are selected, all bugs are shown (no filter applied)
- Context state: `selectedAssigneeIds: string[]` and `toggleAssignee(id: string)`
- `BugFilters.assignees` passed to `BackendClient.getBugs` → `GET /bugs?assignee=ref1,ref2`
- `GET /users` called on mount and whenever `includeClosed` changes to keep the avatar list fresh
- Overflow handling: if more than 8 assignees exist, show the first 7 + a "+N more" chip

---

## Technical design

### Context additions

**`src/context/BugManagerProvider.tsx`**

```typescript
// New state
const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
const [assignees, setAssignees] = useState<User[]>([]);

// Toggle a single assignee in/out of the selection
const toggleAssignee = useCallback((id: string) => {
  setSelectedAssigneeIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
  );
}, []);

// Load distinct assignees whenever includeClosed changes
useEffect(() => {
  api.getDistinctAssignees().then(setAssignees).catch(() => {});
}, [api, includeClosed]);

// Pass selectedAssigneeIds into the bug fetch
const bugs = await api.getBugs({
  ...filters,
  assignees: selectedAssigneeIds.length ? selectedAssigneeIds : undefined,
  includeClosed,
});
```

**Updated `BugManagerContextValue`:**

```typescript
interface BugManagerContextValue {
  // ... existing fields ...
  assignees: User[];
  selectedAssigneeIds: string[];
  toggleAssignee: (id: string) => void;
  clearAssigneeFilter: () => void;
}
```

### AssigneeBar component

**`src/components/AssigneeBar/AssigneeBar.tsx`**

```
┌──────────────────────────────────────────────────────────────────────┐
│ [All ×]  [ JD ]  [ JS ]  [ AM ]  [ CB ]  [ +3 more ]               │
└──────────────────────────────────────────────────────────────────────┘
        ↑                 ↑
   clear pill         selected (primary border)
```

```tsx
interface AssigneeBarProps {
  assignees: User[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function AssigneeBar({
  assignees,
  selectedIds,
  onToggle,
  onClear,
}: AssigneeBarProps) {
  const theme = useTheme();
  const classes = useStyles();

  const VISIBLE_MAX = 7;
  const visible  = assignees.slice(0, VISIBLE_MAX);
  const overflow = assignees.length - VISIBLE_MAX;

  if (assignees.length === 0) return null;

  return (
    <Box className={classes.bar}>
      {/* "Clear" pill — only shown when a selection is active */}
      {selectedIds.length > 0 && (
        <Tooltip title="Clear filter">
          <Chip
            label="All"
            size="small"
            onDelete={onClear}
            onClick={onClear}
            className={classes.clearChip}
          />
        </Tooltip>
      )}

      {visible.map(user => {
        const isSelected = selectedIds.includes(user.id);
        return (
          <Tooltip key={user.id} title={user.displayName}>
            <Avatar
              src={user.avatarUrl}
              className={classes.avatar}
              onClick={() => onToggle(user.id)}
              style={{
                border: isSelected
                  ? `2px solid ${theme.palette.primary.main}`
                  : '2px solid transparent',
                boxSizing: 'border-box',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                boxShadow: isSelected
                  ? `0 0 0 2px ${theme.palette.primary.light}`
                  : 'none',
              }}
            >
              {user.displayName.slice(0, 2).toUpperCase()}
            </Avatar>
          </Tooltip>
        );
      })}

      {overflow > 0 && (
        <Tooltip title={`${overflow} more assignees (not shown)`}>
          <Avatar className={clsx(classes.avatar, classes.overflowAvatar)}>
            +{overflow}
          </Avatar>
        </Tooltip>
      )}
    </Box>
  );
}
```

**Styles:**

```typescript
const useStyles = makeStyles(theme => ({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    flexWrap: 'nowrap',
    overflowX: 'auto',
    minHeight: 52,
  },
  avatar: {
    width: 32,
    height: 32,
    fontSize: 12,
    flexShrink: 0,
  },
  clearChip: {
    marginRight: theme.spacing(0.5),
  },
  overflowAvatar: {
    backgroundColor: theme.palette.grey[400],
    color: theme.palette.common.white,
    fontSize: 11,
    cursor: 'default',
  },
}));
```

### BugManagerPage — placement

**`src/components/BugManagerPage/BugManagerPage.tsx`**

The `AssigneeBar` sits between the `Toolbar` and the content area:

```tsx
const { assignees, selectedAssigneeIds, toggleAssignee, clearAssigneeFilter } =
  useBugManagerContext();

return (
  <BugManagerProvider>
    <Page themeId="tool">
      <Header title="Bug Manager" subtitle={...}>
        <BugReportIcon />
      </Header>
      <Content>
        <Toolbar />
        <AssigneeBar
          assignees={assignees}
          selectedIds={selectedAssigneeIds}
          onToggle={toggleAssignee}
          onClear={clearAssigneeFilter}
        />
        {activeView === 'list'  && <ListView />}
        {activeView === 'board' && <BoardView />}
      </Content>
    </Page>
  </BugManagerProvider>
);
```

### BackendClient — multi-assignee filter

**`src/api/BackendClient.ts`** — already handled in Phase 3. Confirm the query string serialization:

```typescript
async getBugs(filters?: BugFilters): Promise<Bug[]> {
  const params = new URLSearchParams();

  // Multi-select takes precedence over single-select
  if (filters?.assignees?.length) {
    params.set('assignee', filters.assignees.join(','));
  } else if (filters?.assignee) {
    params.set('assignee', filters.assignee);
  }

  // ... other params ...
}
```

### Backend — no changes required

`GET /bugs?assignee=ref1,ref2` is already handled in Phase 2:

```typescript
// From router.ts (Phase 2):
if (filters.assigneeIds?.length) {
  query = query.whereIn('assignee_id', filters.assigneeIds);
}
```

`GET /users` returns the full `User[]` with display names from Phase 4.

### Data flow summary

```
AssigneeBar avatar click
  → toggleAssignee(userId) in BugManagerProvider
  → selectedAssigneeIds state updates (add or remove)
  → refreshBugs() called (or useAsync re-fires — Phase 7)
  → BackendClient.getBugs({ assignees: ['ref1', 'ref2'] })
  → GET /bugs?assignee=ref1,ref2
  → DB: WHERE assignee_id IN ('ref1', 'ref2')
  → List/Board re-renders with filtered results
  → AssigneeBar selected avatars highlight with primary border
```

### Edge cases

**No assignees:** If no bugs have assignees, `GET /users` returns an empty array. The `AssigneeBar` renders nothing (`return null`). This is intentional — the bar only appears when there are assignees to filter by.

**All bugs assigned to one user:** Bar shows a single avatar. Selecting it shows only that user's bugs. Deselecting shows all bugs. The "All" clear chip only appears when a selection is active.

**New bug created with an assignee:** After creation, `refreshBugs` fires, which also re-fetches assignees. The new assignee's avatar appears in the bar immediately.

**Bug assignee cleared:** Same — after saving `assigneeId: null` via `PATCH`, the refresh re-fetches users. If that user has no other open bugs, their avatar is removed from the bar.

**Assignee filter + "Include closed" toggle:** When `includeClosed` changes, the user fetch re-runs (picks up or drops closed-bug assignees). The selected IDs persist across the toggle — users may need to clear manually if their selected assignee has no open bugs.

---

## Steps

### 6.1 Add context state for assignees and selectedAssigneeIds

Add `assignees: User[]`, `selectedAssigneeIds: string[]`, `toggleAssignee`, and `clearAssigneeFilter` to `BugManagerProvider`. Fetch assignees on mount and when `includeClosed` changes.

### 6.2 Update getBugs call in the provider

Pass `assignees: selectedAssigneeIds.length ? selectedAssigneeIds : undefined` in the `getBugs` call.

### 6.3 Write the AssigneeBar component

Create `src/components/AssigneeBar/AssigneeBar.tsx` with avatar rendering, selected state styling, overflow chip, and clear pill.

### 6.4 Place AssigneeBar in BugManagerPage

Import and render `AssigneeBar` between `Toolbar` and the view content in `BugManagerPage.tsx`. Pass context values via props.

### 6.5 Verify assignee query param serialisation

Confirm `BackendClient.getBugs` serialises `assignees[]` as a comma-separated `assignee` query param.

### 6.6 Verify

- Navigate to `/bug-manager` with bugs assigned to multiple users
- AssigneeBar renders one avatar per distinct assignee (no duplicates)
- Click User A's avatar → border highlights, list filters to User A's bugs only
- Click User B's avatar while User A is selected → both selected, list shows bugs for either user
- Click User A's avatar again → deselected, only User B's bugs shown
- Click the "All" chip → selection cleared, all active bugs visible
- No assignees at all → AssigneeBar renders nothing (no empty space)
- Overflow: with 9+ distinct assignees → first 7 shown + "+2 more" chip
- Toggle "Include closed" → assignee list updates to include closed-bug assignees (if different)
- Create a new bug assigned to User C → User C's avatar appears in the bar after save

---

## What comes out of this phase

A polished, multi-user filtering experience. Teams with several active engineers can immediately slice the board or list to see only their own work — or review a specific person's tickets — without touching any dropdown or search field.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `GET /users` is called on every `includeClosed` toggle, even if the result won't change | Extra network request | Acceptable — it's a cheap query with a small payload; cache with `useCallback` + `useState` can be added if noticeable |
| User clears the assignee filter but their previously selected IDs are stale | Unexpected filter state after re-open | `clearAssigneeFilter` sets `selectedAssigneeIds` to `[]` — always a clean reset |
| Overflow "+N more" chip is not interactive | Users can't filter by hidden assignees | For now, show a tooltip with names. A dropdown / "show all" expansion is deferred to a future iteration |
| Avatar border conflicts with the MUI Avatar's default circular border-radius | Selected state looks off | Set `borderRadius: '50%'` explicitly on the inline style alongside the border |
