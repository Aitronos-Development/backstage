# Phase 2: List View with Toolbar, Filtering & Sorting

**Goal:** A fully functional table-based list view with sortable columns, status/priority/search filtering, and a toolbar with view toggle and action buttons — the primary way users browse bugs.

**Depends on:** Phase 1

---

## What this phase delivers

- A `Toolbar` component with: "+ New Bug" button (disabled — wired in Phase 5), view toggle (List/Board), "Statuses" admin button (disabled — wired in Phase 5), status filter dropdown, priority filter dropdown, and search input
- A `ListView` table rendering all bugs with Ticket #, Heading, Assignee, Status, and Priority columns
- Sortable column headers (click to toggle ascending/descending)
- Client-side filtering by status, priority, and free-text search
- Priority-colored left border on each row (4px)
- Status and priority rendered as color-coded `<Chip>` components
- Empty state with "No bugs found" message
- Row click handler that sets `selectedBugId` in context (modal wired in Phase 4)

## Technical design

### Toolbar

**`src/components/BugManagerPage/Toolbar.tsx`**

A horizontal bar rendered between the `<Header>` and `<Content>` sections.

```
[+ New Bug]  [List | Board]  [⚙ Statuses]  |  Status: [All ▾]  Priority: [All ▾]  [🔍 Search...]
```

| Element            | Component                    | Behavior                                                                 |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------ |
| + New Bug          | `Button` variant="contained" | Disabled in Phase 2. Enabled in Phase 5 to open CreateBugDialog.         |
| View Toggle        | `ToggleButtonGroup`          | Two options: "List" (default) and "Board". Updates `activeView` in context. |
| ⚙ Statuses         | `Button` variant="outlined"  | Disabled in Phase 2. Enabled in Phase 5 for admin status management.     |
| Status Filter      | `Select`                     | Options: "All" + all 5 statuses. Updates `filters.status` in context.    |
| Priority Filter    | `Select`                     | Options: "All", "Urgent", "Medium", "Low". Updates `filters.priority`.   |
| Search             | `TextField` with search icon | Debounced (300ms). Updates `filters.search` in context.                  |

Styling: `makeStyles` with `display: flex`, `alignItems: center`, `gap: theme.spacing(2)`, filters right-aligned with `marginLeft: auto`.

### Shared components

**`src/components/shared/PriorityChip.tsx`**

```tsx
interface PriorityChipProps {
  priority: Priority;
}
```

Renders a `<Chip>` with:
- **Label:** Capitalized priority name ("Urgent", "Medium", "Low")
- **Background color:** `urgent` → `#F44336`, `medium` → `#FF9800`, `low` → `#2196F3`
- **Text color:** White
- **Size:** "small"

Uses the color map from `src/utils/priorities.ts`.

**`src/components/shared/StatusChip.tsx`**

```tsx
interface StatusChipProps {
  status: Status;
}
```

Renders a `<Chip>` with:
- **Label:** Status name
- **Background color:** `status.color` (or gray fallback)
- **Text color:** White
- **Size:** "small"

**`src/components/shared/UserAvatar.tsx`**

```tsx
interface UserAvatarProps {
  user: User | null;
  showName?: boolean;  // default true
}
```

Renders:
- If user exists: `<Avatar>` (with `avatarUrl` or first-letter fallback) + display name
- If null: muted "Unassigned" text

### ListView

**`src/components/ListView/ListView.tsx`**

A Material-UI `<Table>` consuming `bugs` and `statuses` from `useBugManagerContext()`.

**Columns:**

| Column     | Width  | Content                                    | Sortable | Sort key        |
| ---------- | ------ | ------------------------------------------ | -------- | --------------- |
| Ticket #   | 120px  | Monospaced `ticketNumber` (e.g., BUG-042)  | Yes      | `ticketNumber`  |
| Heading    | flex   | Primary text, ellipsis overflow             | Yes      | `heading`       |
| Assignee   | 180px  | `UserAvatar` component                     | Yes      | `assignee.displayName` |
| Status     | 140px  | `StatusChip` component                     | Yes      | `status.order`  |
| Priority   | 120px  | `PriorityChip` component                   | Yes      | `priority`      |

**Sorting logic:**

- State: `sortKey` (default: `ticketNumber`) and `sortDirection` (default: `desc`)
- Clicking a column header toggles direction if same key, or sets new key with `asc`
- Sort comparator handles strings, numbers, and null (null assignees sort last)
- Priority sort order: `urgent` (0) → `medium` (1) → `low` (2)
- Column headers render `<TableSortLabel>` with active indicator

**Row component — `src/components/ListView/BugRow.tsx`:**

```tsx
interface BugRowProps {
  bug: Bug;
  onClick: (bugId: string) => void;
}
```

Each `<TableRow>`:
- **Left border:** 4px solid, colored by priority (`priorities.ts` color map)
- **Hover:** Background highlight via `&:hover` style, `cursor: pointer`
- **Click:** Calls `selectBug(bug.id)` from context (opens Detail Modal in Phase 4)

Styling:

```typescript
const useStyles = makeStyles(theme => ({
  row: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  urgentBorder: { borderLeft: '4px solid #F44336' },
  mediumBorder: { borderLeft: '4px solid #FF9800' },
  lowBorder: { borderLeft: '4px solid #2196F3' },
  ticketNumber: {
    fontFamily: 'monospace',
    fontWeight: 500,
  },
  heading: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 400,
  },
}));
```

### Filtering integration

Filtering is applied in the context provider before exposing `bugs` to consumers. When `filters` change, `BugManagerProvider` recomputes the filtered bug list:

```typescript
const filteredBugs = useMemo(() => {
  let result = allBugs;

  if (filters.status) {
    result = result.filter(b => b.status.id === filters.status);
  }
  if (filters.priority) {
    result = result.filter(b => b.priority === filters.priority);
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    result = result.filter(
      b =>
        b.heading.toLowerCase().includes(term) ||
        b.ticketNumber.toLowerCase().includes(term),
    );
  }

  return result;
}, [allBugs, filters]);
```

The context exposes both `bugs` (filtered) and a `totalBugCount` (unfiltered) for the header subtitle.

### Empty state

When `bugs.length === 0` after filtering, ListView renders:

```tsx
<Box textAlign="center" py={8}>
  <BugReportIcon style={{ fontSize: 64, color: theme.palette.text.disabled }} />
  <Typography variant="h6" color="textSecondary">
    No bugs found
  </Typography>
  <Typography variant="body2" color="textSecondary">
    {hasActiveFilters ? 'Try adjusting your filters' : 'Create your first bug to get started'}
  </Typography>
</Box>
```

### Updated page layout

`BugManagerPage.tsx` now renders:

```tsx
<BugManagerProvider>
  <Page themeId="tool">
    <Header title="Bug Manager" subtitle={`${totalBugCount} bugs tracked`}>
      <BugReportIcon />
    </Header>
    <Content>
      <Toolbar />
      {activeView === 'list' && <ListView />}
      {activeView === 'board' && <Typography>Board view — Phase 3</Typography>}
    </Content>
  </Page>
</BugManagerProvider>
```

### Package structure additions

```
src/components/
├── BugManagerPage/
│   ├── BugManagerPage.tsx   (updated)
│   └── Toolbar.tsx          (new)
├── ListView/
│   ├── ListView.tsx         (new)
│   └── BugRow.tsx           (new)
└── shared/
    ├── PriorityChip.tsx     (new)
    ├── StatusChip.tsx       (new)
    └── UserAvatar.tsx       (new)
```

## Steps

### 2.1 Build shared components

Create `PriorityChip`, `StatusChip`, and `UserAvatar` in `src/components/shared/`. These are reused across List View, Board View, and Detail Modal.

### 2.2 Build the Toolbar

Create `Toolbar.tsx` with view toggle, filter dropdowns, search input, and placeholder buttons for "+ New Bug" and "⚙ Statuses" (disabled).

### 2.3 Build BugRow

Create `BugRow.tsx` with priority-colored left border, monospaced ticket number, truncated heading, assignee avatar, status chip, and priority chip. Wire click handler.

### 2.4 Build ListView

Create `ListView.tsx` with sortable table headers, `BugRow` rendering, and empty state. Consume `bugs` and `statuses` from context.

### 2.5 Add filtering to the context provider

Update `BugManagerProvider` to apply filters client-side and expose `totalBugCount`.

### 2.6 Update BugManagerPage

Wire `Toolbar` and `ListView` into the page. Conditionally render based on `activeView`.

### 2.7 Verify

- Navigate to `/bug-manager` — table renders with seeded mock bugs
- All 5 columns display correctly with proper formatting
- Click column headers → rows re-sort (toggle asc/desc)
- Select a status from the filter → table filters to matching bugs
- Select a priority → further filters
- Type in search → filters by heading and ticket number
- Clear all filters → all bugs reappear
- Toggle to "Board" view → placeholder text renders
- Empty state shows when filters match nothing
- Row hover highlights, cursor changes to pointer

## What comes out of this phase

A fully browsable bug list. Users can view all mock bugs, sort by any column, and filter by status, priority, or search term. The toolbar establishes the persistent control bar that both List and Board views share.

## Risks

| Risk                                         | Impact                          | Mitigation                                                           |
| -------------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| MUI Table performance with 500+ rows         | Scroll jank                     | Prototype uses ~10 rows; virtual scrolling deferred to future iteration |
| Search debounce feels sluggish               | UX annoyance                    | 300ms is standard; reduce to 150ms if needed                         |
| Sort comparator edge cases (null assignee)   | Incorrect ordering              | Null sorts last in both asc and desc directions                      |
