# Phase 3: Kanban Board View with Drag-and-Drop

**Goal:** A drag-and-drop Kanban board with 5 status columns, bug cards with priority indicators, and status updates on card drop — the visual workflow view for bug tracking.

**Depends on:** Phase 2

---

## What this phase delivers

- A `BoardView` component rendering 5 columns (one per status), ordered by `status.order`
- Draggable `BugCard` components within each column using `@hello-pangea/dnd`
- Dropping a card into a different column updates the bug's status via the context
- Bug cards display ticket number, heading (2-line truncation), priority chip, and assignee avatar
- Priority-colored left border on each card (matching list view)
- Column headers with status name and bug count badge
- Cards within a column ordered by `ticketNumber` (descending)
- Shared filters from the Toolbar apply to the Board view (filtered-out bugs hidden from columns)

## Technical design

### Board layout

**`src/components/BoardView/BoardView.tsx`**

The board is a horizontal flex container wrapped in a `<DragDropContext>` from `@hello-pangea/dnd`.

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│    Open (3)  │ In Progress │  In Review  │  Resolved   │   Closed    │
│              │    (2)      │    (1)      │    (0)      │    (1)      │
├─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│  [Card]      │  [Card]     │  [Card]     │             │  [Card]     │
│  [Card]      │  [Card]     │             │             │             │
│  [Card]      │             │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

Layout styling:

```typescript
const useStyles = makeStyles(theme => ({
  board: {
    display: 'flex',
    gap: theme.spacing(2),
    overflowX: 'auto',
    padding: theme.spacing(2, 0),
    minHeight: 400,
  },
}));
```

**Data grouping:**

```typescript
const bugsByStatus = useMemo(() => {
  const grouped = new Map<string, Bug[]>();
  statuses
    .sort((a, b) => a.order - b.order)
    .forEach(status => grouped.set(status.id, []));

  bugs.forEach(bug => {
    const group = grouped.get(bug.status.id);
    if (group) group.push(bug);
  });

  // Sort cards within each column by ticketNumber descending
  grouped.forEach(bugList =>
    bugList.sort((a, b) => b.ticketNumber.localeCompare(a.ticketNumber)),
  );

  return grouped;
}, [bugs, statuses]);
```

### Board column

**`src/components/BoardView/BoardColumn.tsx`**

```tsx
interface BoardColumnProps {
  status: Status;
  bugs: Bug[];
  onCardClick: (bugId: string) => void;
}
```

Each column is a `<Droppable>` from `@hello-pangea/dnd` with `droppableId={status.id}`.

**Column structure:**

```tsx
<Paper className={classes.column}>
  <Box className={classes.columnHeader}>
    <Box
      className={classes.colorBar}
      style={{ backgroundColor: status.color || '#9E9E9E' }}
    />
    <Typography variant="subtitle2">{status.name}</Typography>
    <Chip label={bugs.length} size="small" />
  </Box>
  <Droppable droppableId={status.id}>
    {(provided, snapshot) => (
      <Box
        ref={provided.innerRef}
        {...provided.droppableProps}
        className={clsx(classes.cardList, {
          [classes.cardListDragOver]: snapshot.isDraggingOver,
        })}
      >
        {bugs.map((bug, index) => (
          <BugCard
            key={bug.id}
            bug={bug}
            index={index}
            onClick={() => onCardClick(bug.id)}
          />
        ))}
        {provided.placeholder}
      </Box>
    )}
  </Droppable>
</Paper>
```

**Column styling:**

```typescript
const useStyles = makeStyles(theme => ({
  column: {
    flex: '1 1 0',
    minWidth: 240,
    maxWidth: 300,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#F5F5F5',
    borderRadius: theme.shape.borderRadius,
  },
  columnHeader: {
    padding: theme.spacing(1.5, 2),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  colorBar: {
    width: '100%',
    height: 3,
    borderRadius: '4px 4px 0 0',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  cardList: {
    padding: theme.spacing(1),
    flex: 1,
    overflowY: 'auto',
    minHeight: 100,
  },
  cardListDragOver: {
    backgroundColor: theme.palette.action.hover,
  },
}));
```

### Bug card

**`src/components/BoardView/BugCard.tsx`**

```tsx
interface BugCardProps {
  bug: Bug;
  index: number;
  onClick: () => void;
}
```

Each card is a `<Draggable>` from `@hello-pangea/dnd` with `draggableId={bug.id}`.

**Card layout:**

```
┌─────────────────┐
│ BUG-001         │  ← ticket number (muted, small)
│ Login fails on  │  ← heading (2-line clamp)
│ Safari when...  │
│                 │
│ 🔴 Urgent  👤   │  ← priority chip + assignee avatar
└─────────────────┘
```

**Card styling:**

```typescript
const useStyles = makeStyles(theme => ({
  card: {
    marginBottom: theme.spacing(1),
    padding: theme.spacing(1.5),
    cursor: 'pointer',
    '&:hover': {
      boxShadow: theme.shadows[3],
    },
  },
  urgentBorder: { borderLeft: '4px solid #F44336' },
  mediumBorder: { borderLeft: '4px solid #FF9800' },
  lowBorder: { borderLeft: '4px solid #2196F3' },
  ticketNumber: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  heading: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '0.875rem',
    fontWeight: 500,
    margin: theme.spacing(0.5, 0),
  },
  bottomRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing(1),
  },
  dragging: {
    boxShadow: theme.shadows[8],
    transform: 'rotate(2deg)',
  },
}));
```

**Drag visual feedback:**

- While dragging: card elevation increases (shadow[8]), subtle rotation (2deg)
- Drop target column: background color changes to `theme.palette.action.hover`

### Drag-and-drop handler

In `BoardView.tsx`, the `onDragEnd` callback:

```typescript
const handleDragEnd = useCallback(
  async (result: DropResult) => {
    const { draggableId, destination, source } = result;

    // Dropped outside a column or in the same column
    if (!destination || destination.droppableId === source.droppableId) {
      return;
    }

    // Update bug status to the destination column's status
    const newStatusId = destination.droppableId;
    await updateBug(draggableId, { statusId: newStatusId });
  },
  [updateBug],
);
```

This calls `updateBug` from the context, which:
1. Optimistically updates the bug's status in local state (card moves immediately)
2. Persists to localStorage via `LocalStorageClient.updateBug()`
3. On error, rolls back the state and shows an error snackbar

### Empty column state

When a column has 0 bugs:

```tsx
<Box className={classes.emptyColumn}>
  <Typography variant="body2" color="textSecondary">
    No bugs
  </Typography>
</Box>
```

Styled with dashed border, centered text, muted color.

### Filter interaction

The board view consumes the same `bugs` array from context (already filtered by the Toolbar). When a status filter is active, columns for non-matching statuses still render but appear empty. When a priority or search filter is active, only matching cards show in their respective columns.

### Dependency: `@hello-pangea/dnd`

Add to `plugins/bug-manager/package.json`:

```json
{
  "dependencies": {
    "@hello-pangea/dnd": "^16.6.0"
  }
}
```

This is a React 18-compatible fork of `react-beautiful-dnd` (as specified in the overview).

### Package structure additions

```
src/components/
├── BoardView/
│   ├── BoardView.tsx        (new)
│   ├── BoardColumn.tsx      (new)
│   └── BugCard.tsx          (new)
```

## Steps

### 3.1 Install `@hello-pangea/dnd`

Add the dependency to the plugin's `package.json` and run `yarn install`.

### 3.2 Build BugCard

Create the draggable card component with ticket number, heading (2-line clamp), priority chip, assignee avatar, and priority-colored left border.

### 3.3 Build BoardColumn

Create the droppable column with status header (name + count), scrollable card list, and empty state.

### 3.4 Build BoardView

Create the board layout with `DragDropContext`, bug grouping by status, and `onDragEnd` handler that calls `updateBug`.

### 3.5 Wire into BugManagerPage

Update the page to render `BoardView` when `activeView === 'board'`. The view toggle in the Toolbar now switches between the two views.

### 3.6 Verify

- Toggle to "Board" view → 5 columns render, one per status
- Columns are ordered left-to-right by `status.order` (Open → Closed)
- Cards show ticket number, heading, priority chip, assignee avatar
- Card left borders match priority colors
- Drag a card from "Open" to "In Progress" → card moves, column counts update
- Bug status persists in localStorage (reload confirms the change)
- Apply a priority filter → only matching cards visible across all columns
- Search filter → only matching cards visible
- Click a card → `selectedBugId` updates in context (modal wired in Phase 4)

## What comes out of this phase

Both primary views are functional. Users can browse bugs as a sortable table (List) or as a visual workflow board (Kanban) and switch between them. Dragging cards across columns updates bug status. The Toolbar's filters apply consistently to both views.

## Risks

| Risk                                           | Impact                        | Mitigation                                                                    |
| ---------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `@hello-pangea/dnd` conflicts with MUI version | DnD doesn't work              | Library is actively maintained and tested with MUI v4; pin version if needed  |
| Horizontal overflow on small screens           | Columns get squished          | `overflowX: auto` on board container; `minWidth: 240px` per column           |
| 100+ cards in a single column                  | Scroll performance            | Prototype has ~10 cards total; virtualization deferred to future iteration    |
| Optimistic update rollback on error            | Card flickers back            | LocalStorageClient is synchronous — errors are unlikely in prototype          |
