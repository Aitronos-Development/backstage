# v2 Phase 7: Real-time Fetching & Optimistic Board Updates

**Goal:** Replace the provider's manual `useEffect` + `setState` data loading with `useAsync`-based reactive fetching that re-fires automatically when filters change. Implement optimistic state updates for board drag-and-drop so the UI never waits on a network round-trip, with rollback on failure.

**Depends on:** Phase 6 (all features complete; full filter state in context)

---

## What this phase delivers

- `BugManagerProvider` refactored to use `useAsync` for all data fetching — bugs re-fetch automatically whenever any filter, `selectedAssigneeIds`, or `includeClosed` changes
- Optimistic drag-and-drop in `BoardView`: the card moves instantly in the UI; `PATCH /bugs/:id` fires in the background; failure rolls back to the original position with an error snackbar
- Window-focus re-fetch: when a user returns to the tab, the bug list silently refreshes
- Loading and error states unified across all filter combinations
- Manual `refreshBugs` and `refreshStatuses` actions replaced by a single `invalidate()` function that increments a counter, triggering `useAsync` to re-run
- Error snackbar component for surfacing rollback failures without blocking the UI

---

## Technical design

### BugManagerProvider — useAsync refactor

**`src/context/BugManagerProvider.tsx`**

Replace the `useEffect` + manual `setLoading` / `setBugs` pattern with `useAsync` from `react-use`:

```typescript
import { useAsync } from 'react-use';

export function BugManagerProvider({ children }: { children: ReactNode }) {
  const api = useApi(bugManagerApiRef);

  // Filter state (unchanged from Phase 6)
  const [filters, setFilters]                   = useState<BugFilters>({});
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [includeClosed, setIncludeClosed]       = useState(false);
  const [activeView, setActiveView]             = useState<'list' | 'board'>('list');
  const [selectedBugId, setSelectedBugId]       = useState<string | null>(null);

  // Invalidation counter — incrementing this triggers useAsync to re-run
  const [fetchKey, setFetchKey] = useState(0);
  const invalidate = useCallback(() => setFetchKey(k => k + 1), []);

  // ── Main data fetch ───────────────────────────────────────────────────────
  // Re-runs whenever any of these deps changes (filters, assignees, includeClosed, fetchKey)
  const {
    value: bugs = [],
    loading: bugsLoading,
    error: bugsError,
  } = useAsync(async () => {
    return api.getBugs({
      ...filters,
      assignees: selectedAssigneeIds.length ? selectedAssigneeIds : undefined,
      includeClosed,
    });
  }, [filters, selectedAssigneeIds, includeClosed, fetchKey, api]);

  // ── Statuses fetch ────────────────────────────────────────────────────────
  // Statuses rarely change — fetch once on mount and on explicit invalidation
  const {
    value: statuses = [],
    loading: statusesLoading,
  } = useAsync(async () => {
    return api.getStatuses();
  }, [fetchKey, api]);

  // ── Assignees fetch ───────────────────────────────────────────────────────
  const { value: assignees = [] } = useAsync(async () => {
    return api.getDistinctAssignees();
  }, [includeClosed, fetchKey, api]);

  // ── Window focus re-fetch ─────────────────────────────────────────────────
  useEffect(() => {
    const handleFocus = () => invalidate();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [invalidate]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const createBug = useCallback(async (req: CreateBugRequest) => {
    await api.createBug(req);
    invalidate();
  }, [api, invalidate]);

  const updateBug = useCallback(async (id: string, updates: UpdateBugRequest) => {
    await api.updateBug(id, updates);
    invalidate();
  }, [api, invalidate]);

  const closeBug = useCallback(async (id: string) => {
    await api.closeBug(id);
    setSelectedBugId(null);
    invalidate();
  }, [api, invalidate]);

  const reopenBug = useCallback(async (id: string) => {
    await api.updateBug(id, { isClosed: false });
    invalidate();
  }, [api, invalidate]);

  const addComment = useCallback(async (
    bugId: string,
    content: string,
    parentCommentId?: string,
  ) => {
    await api.addComment(bugId, content, parentCommentId);
    // Comments are fetched per-bug in the modal — no global invalidate needed
  }, [api]);

  // ── Context value ─────────────────────────────────────────────────────────
  const value: BugManagerContextValue = {
    bugs,
    statuses,
    assignees,
    filters,
    activeView,
    selectedBugId,
    selectedAssigneeIds,
    includeClosed,
    loading: bugsLoading || statusesLoading,
    error: bugsError?.message ?? null,

    setFilters,
    setView: setActiveView,
    selectBug: setSelectedBugId,
    toggleAssignee: (id: string) =>
      setSelectedAssigneeIds(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
      ),
    clearAssigneeFilter: () => setSelectedAssigneeIds([]),
    setIncludeClosed,

    createBug,
    updateBug,
    closeBug,
    reopenBug,
    addComment,
    invalidate,
  };

  return (
    <BugManagerContext.Provider value={value}>
      {children}
    </BugManagerContext.Provider>
  );
}
```

**Key behavioural changes from the old `useEffect` approach:**

| Old `useEffect` | New `useAsync` |
|---|---|
| Bugs fetch once on mount | Bugs re-fetch every time `filters`, `selectedAssigneeIds`, `includeClosed`, or `fetchKey` change |
| Manual `setLoading(true/false)` around fetch | `loading` is managed automatically by `useAsync` |
| `refreshBugs()` manually invalidates and refetches | `invalidate()` increments `fetchKey`, triggering all `useAsync` hooks that depend on it |
| No re-fetch on window focus | `useEffect` on `window.focus` calls `invalidate()` |

### Optimistic drag-and-drop in BoardView

**`src/components/BoardView/BoardView.tsx`**

Current v1 implementation:

```typescript
// v1 — updates context state, then calls API
const handleDragEnd = async (result: DropResult) => {
  if (!result.destination) return;
  const { draggableId, destination } = result;
  updateBug(draggableId, { statusId: destination.droppableId });
};
```

**v2 — optimistic update with rollback:**

```typescript
const { bugs, statuses, updateBug, invalidate } = useBugManagerContext();
const [localBugs, setLocalBugs]   = useState(bugs);
const [snackbar, setSnackbar]     = useState<string | null>(null);
const dragInFlightRef             = useRef(false);

// Keep localBugs in sync with the authoritative bugs from context,
// but only when no drag is in flight (to avoid flickering during the gesture)
useEffect(() => {
  if (!dragInFlightRef.current) {
    setLocalBugs(bugs);
  }
}, [bugs]);

const handleDragEnd = async (result: DropResult) => {
  dragInFlightRef.current = false;

  if (!result.destination) return;
  if (result.destination.droppableId === result.source.droppableId) return;

  const { draggableId, destination } = result;
  const newStatusId = destination.droppableId;

  // 1. Find the bug and its original status for rollback
  const originalBug   = localBugs.find(b => b.id === draggableId);
  const originalStatus = originalBug?.status.id;

  // 2. Optimistic update — move the card in local state immediately
  setLocalBugs(prev =>
    prev.map(b => {
      if (b.id !== draggableId) return b;
      const newStatus = statuses.find(s => s.id === newStatusId) ?? b.status;
      return { ...b, status: newStatus };
    }),
  );

  // 3. Fire the PATCH request in the background
  try {
    await updateBug(draggableId, { statusId: newStatusId });
    // updateBug calls invalidate() → useAsync re-fetches → localBugs syncs with server
  } catch (err) {
    // 4. Rollback on failure
    setLocalBugs(prev =>
      prev.map(b => {
        if (b.id !== draggableId || !originalStatus) return b;
        const originalStatusObj = statuses.find(s => s.id === originalStatus) ?? b.status;
        return { ...b, status: originalStatusObj };
      }),
    );
    setSnackbar('Failed to move card — please try again.');
  }
};

const handleDragStart = () => {
  dragInFlightRef.current = true;
};
```

**BoardView renders `localBugs`** (not `bugs` from context) so the optimistic move is immediate:

```tsx
<DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
  {statuses.map(status => (
    <BoardColumn
      key={status.id}
      status={status}
      bugs={localBugs.filter(b => b.status.id === status.id)}
    />
  ))}
</DragDropContext>

{/* Error snackbar */}
<Snackbar
  open={!!snackbar}
  autoHideDuration={4000}
  onClose={() => setSnackbar(null)}
  message={snackbar}
  action={
    <IconButton size="small" color="inherit" onClick={() => setSnackbar(null)}>
      <CloseIcon fontSize="small" />
    </IconButton>
  }
/>
```

### Loading states

**List View and Board View skeleton:** While `loading === true` (initial fetch or filter change), show a skeleton instead of an empty list/board:

```tsx
// In ListView.tsx
if (loading) {
  return (
    <Box px={2}>
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={48} style={{ marginBottom: 8 }} />
      ))}
    </Box>
  );
}
```

```tsx
// In BoardView.tsx
if (loading) {
  return (
    <Box display="flex" gap={2} p={2}>
      {statuses.map(s => (
        <Box key={s.id} flex={1}>
          <Skeleton variant="rectangular" height={40} style={{ marginBottom: 8 }} />
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={100} style={{ marginBottom: 8 }} />
          ))}
        </Box>
      ))}
    </Box>
  );
}
```

**Error state:** When `error` is set (network failure), show a `<ResponseErrorPanel>` from `@backstage/core-components`:

```tsx
// In BugManagerPage.tsx
if (error) {
  return (
    <Content>
      <ResponseErrorPanel error={new Error(error)} />
    </Content>
  );
}
```

### Filter change debounce

The search input in `Toolbar` already debounces 300ms before setting `filters.search`. With `useAsync`, the debounce continues to work as before — `useAsync` fires after the debounced value stabilises.

No changes needed to `Toolbar.tsx`.

### Concurrent drag-drop safety

If two users drag the same card simultaneously:
- Both clients apply an optimistic update locally.
- Both fire `PATCH /bugs/:id`.
- The backend processes them sequentially (row-level writes are serialised by PostgreSQL).
- The second PATCH simply overwrites the first.
- The next window-focus or `invalidate()` call re-fetches and both clients converge to the server state.

No explicit conflict detection is required at this level. If conflict visibility becomes important in a future iteration, the `updated_at` timestamp returned by `PATCH` can be compared against the client's local copy.

### Remove manual refresh actions

**`BugManagerContextValue`** — remove:
```typescript
refreshBugs: () => Promise<void>;
refreshStatuses: () => Promise<void>;
```

**Add:**
```typescript
invalidate: () => void;
```

Update all call sites that previously called `refreshBugs()` or `refreshStatuses()` to call `invalidate()` instead. The main call sites are:
- `useStatuses.ts` after status CRUD operations
- `useBugs.ts` after bug CRUD
- `CommentSection.tsx` after posting a comment does not need invalidation (comments are per-bug)

---

## Steps

### 7.1 Refactor `BugManagerProvider` to `useAsync`

Replace the `useEffect` / `setState` loading pattern with three `useAsync` hooks (bugs, statuses, assignees). Add the `fetchKey` invalidation counter. Remove `refreshBugs` and `refreshStatuses` from the context value; expose `invalidate` instead.

### 7.2 Add window-focus re-fetch

Add the `useEffect` that calls `invalidate()` on `window.focus`. Test by switching browser tabs and returning — the bug list should silently update.

### 7.3 Update all `refreshBugs` / `refreshStatuses` call sites

Search the codebase for `refreshBugs` and `refreshStatuses` and replace with `invalidate`. Confirm TypeScript compiles cleanly.

### 7.4 Add skeleton loading states to ListView and BoardView

Render `<Skeleton>` rows/columns while `loading === true`. Render `<ResponseErrorPanel>` when `error !== null`.

### 7.5 Refactor BoardView drag-and-drop to optimistic updates

Add `localBugs` state, `dragInFlightRef`, `handleDragStart`, and the rollback logic in `handleDragEnd`. Render `localBugs` (not `bugs`) in the board columns. Add the failure `Snackbar`.

### 7.6 Verify loading states

- Hard-refresh the page → skeleton rows appear briefly, then real data loads
- Throttle the network in DevTools to "Slow 3G" → skeleton persists for several seconds before data appears
- Disconnect from the network → `ResponseErrorPanel` appears

### 7.7 Verify filter re-fetch

- Type in the search box → network request fires 300ms after stopping (visible in DevTools Network tab)
- Select a status filter → new request fires immediately (no debounce on dropdowns)
- Select an assignee avatar → request fires with `?assignee=` param

### 7.8 Verify optimistic drag-and-drop

- Drag a card to a new column → card moves instantly (no flicker)
- Open DevTools → Network tab shows `PATCH /bugs/:id` firing after the visual update
- Simulate a PATCH failure (temporarily block the endpoint with a browser extension or intercept in the backend) → card snaps back to its original column + error snackbar appears

### 7.9 Verify window-focus re-fetch

- Open two browser windows side-by-side on `/bug-manager`
- In Window A, drag a card to a new column
- Click into Window B → within 1 second, the board in Window B updates to reflect the change
- (Requires Window B to regain focus; the `window.focus` listener triggers `invalidate`)

---

## What comes out of this phase

The plugin behaves like a genuinely real-time system within a single session. Filter changes produce instant, automatic re-fetches without any explicit "Refresh" button. Board changes are lag-free from the user's perspective with graceful degradation on failure. The codebase is simpler — the manual `refreshBugs` / `refreshStatuses` pattern is gone, replaced by a single `invalidate()` function that works uniformly across all data.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `useAsync` re-running on every render because a dep (e.g. `api`) is recreated | Infinite fetch loop | Wrap `api` in `useMemo` at the provider level or confirm the `ApiFactory` always returns a stable singleton |
| `localBugs` in `BoardView` diverges from context `bugs` if `useAsync` returns stale data | Board shows wrong state | `dragInFlightRef` prevents overwriting during a drag; after drop, `invalidate` fires and syncs |
| Window-focus listener fires too aggressively (e.g. focus/blur on a tooltip) | Excessive network requests | `window.focus` fires only when the OS window gains focus, not on internal element focus changes — this is the correct event |
| Skeleton length is hardcoded (5 rows) and may mismatch actual data | Minor visual jump when real data loads | Acceptable tradeoff; a future iteration can track the last known count to size the skeleton appropriately |
| `handleDragEnd` fires before the previous `updateBug` promise resolves (rapid drags) | Out-of-order state | The `dragInFlightRef` prevents `localBugs` from syncing to context during the gesture; each drag is its own optimistic cycle |
