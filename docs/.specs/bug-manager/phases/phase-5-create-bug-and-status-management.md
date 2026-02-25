# Phase 5: Create Bug Dialog & Status Management

**Goal:** Complete the remaining CRUD operations — a dialog for creating new bugs and an admin dialog for managing the 5 status workflow — enabling the full prototype lifecycle.

**Depends on:** Phase 4

---

## What this phase delivers

- A `CreateBugDialog` for creating new bugs with heading, description, assignee, status, and priority fields
- Auto-generated sequential ticket numbers (BUG-001, BUG-002, ...)
- A `StatusManagementDialog` for admin users to rename, recolor, reorder, and swap statuses
- Enforcement of the "exactly 5 statuses" constraint
- Status deletion with bug reassignment workflow
- Both toolbar buttons ("+ New Bug" and "⚙ Statuses") fully wired and functional
- Delete bug action accessible from the detail modal

## Technical design

### Create Bug Dialog

**`src/components/CreateBugDialog/CreateBugDialog.tsx`**

A Material-UI `<Dialog>` opened via the "+ New Bug" toolbar button.

```
┌──────────────────────────────────────────┐
│  Create New Bug                   [✕]    │
├──────────────────────────────────────────┤
│                                          │
│  Heading *                               │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Description                             │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Assignee           Status               │
│  [Unassigned ▾]     [Open ▾]            │
│                                          │
│  Priority                                │
│  [Medium ▾]                              │
│                                          │
│                    [Cancel]  [Create]     │
└──────────────────────────────────────────┘
```

**Form fields:**

| Field       | Component                     | Required | Default            | Validation                          |
| ----------- | ----------------------------- | -------- | ------------------ | ----------------------------------- |
| Heading     | `TextField`                   | Yes      | empty              | Non-empty, max 200 chars. Inline error: "Heading is required" |
| Description | `TextField` multiline (4 rows)| No       | empty              | None                                |
| Assignee    | `Select`                      | No       | "Unassigned"       | None                                |
| Status      | `Select`                      | Yes      | First status (order 0) | Must select one                 |
| Priority    | `Select`                      | Yes      | `medium`           | Must select one                     |

**Assignee options:** "Unassigned" + the 2 mock users (Jane Doe, John Smith).

**Status options:** All 5 statuses, sorted by order. Each option shows a color dot.

**Priority options:** Urgent (red dot), Medium (amber dot), Low (blue dot).

**Form state:**

```typescript
const [form, setForm] = useState<CreateBugFormState>({
  heading: '',
  description: '',
  assigneeId: undefined,
  statusId: statuses[0]?.id || '',
  priority: 'medium' as Priority,
});
const [headingError, setHeadingError] = useState('');
```

**Submit flow:**

1. Validate heading is non-empty
2. Call `createBug(form)` from context
3. Context calls `api.createBug()` which auto-generates ticket number and timestamps
4. On success: close dialog, new bug appears in list/board
5. On error: show snackbar with error message

**Ticket number auto-generation** (in `LocalStorageClient.createBug`):

```typescript
const allBugs = this.getAllBugs();
const maxNumber = allBugs.reduce((max, bug) => {
  const num = parseInt(bug.ticketNumber.replace('BUG-', ''), 10);
  return num > max ? num : max;
}, 0);
const ticketNumber = `BUG-${String(maxNumber + 1).padStart(3, '0')}`;
```

**Reporter:** Hardcoded to the first mock user (Jane Doe) since there's no auth in the prototype.

### Delete Bug

Add a delete action to the `BugDetailModal` header:

```tsx
<DialogTitle>
  <Box display="flex" alignItems="center" gap={1}>
    <BugReportIcon />
    <Typography ...>{bug.ticketNumber}</Typography>
  </Box>
  <Box>
    <IconButton onClick={handleDelete} color="secondary">
      <DeleteIcon />
    </IconButton>
    <IconButton onClick={() => selectBug(null)}>
      <CloseIcon />
    </IconButton>
  </Box>
</DialogTitle>
```

**Delete flow:**

1. Click delete icon → confirmation dialog: "Delete {ticketNumber}? This action cannot be undone."
2. Confirm → `deleteBug(id)` from context
3. Modal closes, bug removed from list/board
4. Cancel → dialog closes, no action

### Status Management Dialog

**`src/components/StatusManagement/StatusManagementDialog.tsx`**

Opened via the "⚙ Statuses" toolbar button.

```
┌──────────────────────────────────────────────────┐
│  Manage Statuses                        [✕]      │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──┬────────────────┬──────────┬───────┬──────┐ │
│  │# │ Name           │ Color    │ Bugs  │      │ │
│  ├──┼────────────────┼──────────┼───────┼──────┤ │
│  │0 │ Open           │ 🔵       │ 12    │ ✎ 🗑 │ │
│  │1 │ In Progress    │ 🟠       │ 5     │ ✎ 🗑 │ │
│  │2 │ In Review      │ 🟣       │ 3     │ ✎ 🗑 │ │
│  │3 │ Resolved       │ 🟢       │ 8     │ ✎ 🗑 │ │
│  │4 │ Closed         │ ⚫       │ 20    │ ✎ 🗑 │ │
│  └──┴────────────────┴──────────┴───────┴──────┘ │
│                                                  │
│  [+ Add Status]                                  │
│                                                  │
│  ℹ Exactly 5 statuses are required.             │
│    Deleting a status requires reassigning        │
│    existing bugs to another status.              │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Status row component — `src/components/StatusManagement/StatusRow.tsx`:**

```tsx
interface StatusRowProps {
  status: Status;
  bugCount: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}
```

Each row displays:
- **Order number** (`status.order`)
- **Name** (text)
- **Color** (small circle swatch with `status.color` as background)
- **Bug count** (number of bugs currently in this status)
- **Edit button** (pencil icon) → toggles row to inline edit mode
- **Delete button** (trash icon) → opens reassignment dialog

### Status edit (inline)

Clicking the edit button transforms the row into an editable form:

```
│ 0 │ [Open_________] │ [#2196F3] │ 12    │ ✓ ✕ │
```

- **Name field:** `<TextField>` with current name
- **Color field:** `<TextField>` with hex color input (or a simple predefined color picker with 8 options)
- **Save (✓):** Calls `updateStatus(id, { name, color })` from context
- **Cancel (✕):** Reverts to display mode

**Predefined color palette** (simple radio buttons or clickable swatches):

```typescript
const STATUS_COLORS = [
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#9C27B0', // Purple
  '#4CAF50', // Green
  '#9E9E9E', // Gray
  '#F44336', // Red
  '#00BCD4', // Cyan
  '#795548', // Brown
];
```

### Status delete with reassignment

Clicking the delete button opens a confirmation dialog:

```
┌─────────────────────────────────────────────┐
│  Delete Status: "In Review"          [✕]    │
├─────────────────────────────────────────────┤
│                                             │
│  3 bugs are currently in "In Review".       │
│  Reassign them to:                          │
│                                             │
│  [Open ▾]                                   │
│                                             │
│  ⚠ This action cannot be undone.           │
│                                             │
│                    [Cancel]  [Delete]        │
└─────────────────────────────────────────────┘
```

**Reassignment select:** Populated with all statuses except the one being deleted.

**Delete flow:**

1. User selects a replacement status
2. Click "Delete"
3. All bugs with the deleted status are bulk-updated to the replacement status
4. The status is deleted
5. Both list and board views re-render (board loses a column, affected cards move to the replacement column)
6. "Add Status" button becomes enabled (now < 5 statuses)

### The 5-status constraint

**Business rules:**

| Current count | Create allowed | Delete allowed |
| ------------- | -------------- | -------------- |
| < 5           | Yes            | No (must reach 5 first) |
| 5             | No             | Yes (but must reassign bugs) |
| > 5           | No             | Yes (until back to 5) |

In practice, the workflow is: delete one status (drops to 4) → create a replacement (back to 5). The dialog enforces this:

- "Add Status" button: enabled when `statuses.length < 5`, disabled otherwise
- "Delete" button per row: enabled when `statuses.length >= 5`, disabled otherwise
- Info banner always visible: "Exactly 5 statuses are required."

**Add status form** (shown inline below the table when "Add Status" is clicked):

```
│ [5] │ [New Status____] │ [#color] │   │ ✓ ✕ │
```

Creates a new status with `order = statuses.length` (appended at the end).

### Status reordering

Up/down arrow buttons on each status row to swap order with adjacent statuses:

```tsx
<IconButton
  size="small"
  disabled={status.order === 0}
  onClick={() => handleReorder(status.id, 'up')}
>
  <ArrowUpwardIcon fontSize="small" />
</IconButton>
<IconButton
  size="small"
  disabled={status.order === statuses.length - 1}
  onClick={() => handleReorder(status.id, 'down')}
>
  <ArrowDownwardIcon fontSize="small" />
</IconButton>
```

Reordering swaps the `order` values of the two adjacent statuses and calls `updateStatus` for both. This immediately changes the column order in Board View.

### Toolbar button wiring

Update `Toolbar.tsx` to enable both buttons:

```tsx
// + New Bug
<Button
  variant="contained"
  color="primary"
  startIcon={<AddIcon />}
  onClick={() => setCreateDialogOpen(true)}
>
  New Bug
</Button>

// ⚙ Statuses
<Button
  variant="outlined"
  startIcon={<SettingsIcon />}
  onClick={() => setStatusDialogOpen(true)}
>
  Statuses
</Button>
```

State for dialog visibility is managed in the `Toolbar` component (or lifted to `BugManagerPage` if needed for context access).

### Hooks

**`src/hooks/useBugs.ts`** (extracted from context if not already):

Provides `createBug`, `updateBug`, `deleteBug` with optimistic updates.

**`src/hooks/useStatuses.ts`**:

Provides `createStatus`, `updateStatus`, `deleteStatus`, `reorderStatus` with constraint enforcement.

```typescript
function useStatuses() {
  const { statuses, refreshStatuses } = useBugManagerContext();
  const api = useApi(bugManagerApiRef);

  const createStatus = async (req: CreateStatusRequest) => {
    if (statuses.length >= 5) {
      throw new Error('Cannot create more than 5 statuses');
    }
    await api.createStatus(req);
    await refreshStatuses();
  };

  const deleteStatus = async (id: string, replacementStatusId: string) => {
    // Bulk-reassign bugs first
    const bugsToReassign = bugs.filter(b => b.status.id === id);
    await Promise.all(
      bugsToReassign.map(b =>
        api.updateBug(b.id, { statusId: replacementStatusId }),
      ),
    );
    await api.deleteStatus(id);
    await refreshStatuses();
    await refreshBugs();
  };

  return { statuses, createStatus, updateStatus, deleteStatus };
}
```

### Package structure additions

```
src/components/
├── CreateBugDialog/
│   └── CreateBugDialog.tsx        (new)
├── StatusManagement/
│   ├── StatusManagementDialog.tsx  (new)
│   ├── StatusRow.tsx              (new)
│   └── DeleteStatusDialog.tsx     (new)

src/hooks/
├── useBugs.ts                     (new or extracted)
└── useStatuses.ts                 (new)
```

## Steps

### 5.1 Build CreateBugDialog

Create the form dialog with heading, description, assignee, status, and priority fields. Wire validation and submit flow.

### 5.2 Wire "+ New Bug" button

Enable the toolbar button. Open `CreateBugDialog` on click. On successful creation, close dialog and refresh bug list.

### 5.3 Add delete bug action to detail modal

Add delete icon to modal header. Implement confirmation dialog and delete flow.

### 5.4 Build StatusRow

Create the inline-editable status row with name, color picker, bug count, edit/delete buttons, and reorder arrows.

### 5.5 Build DeleteStatusDialog

Create the reassignment confirmation dialog. Wire bulk bug reassignment + status deletion.

### 5.6 Build StatusManagementDialog

Create the admin dialog with status table, add/edit/delete/reorder functionality, and 5-status constraint enforcement.

### 5.7 Wire "⚙ Statuses" button

Enable the toolbar button. Open `StatusManagementDialog` on click.

### 5.8 Extract hooks (useBugs, useStatuses)

If not already extracted, move bug and status CRUD logic into dedicated hooks for cleaner separation.

### 5.9 Verify

**Create bug:**
- Click "+ New Bug" → dialog opens with default values
- Submit with empty heading → inline error shown
- Fill in heading, select priority "Urgent", click Create → new bug appears in list with BUG-0XX ticket number
- New bug also appears on board in the selected status column
- Toggle to Board → card visible in correct column

**Delete bug:**
- Open a bug detail modal → click delete icon
- Confirmation dialog appears → click Cancel → nothing happens
- Click Delete → bug removed from list and board, modal closes

**Status management:**
- Click "⚙ Statuses" → dialog opens with 5 statuses
- Click edit on "Open" → inline form, rename to "New", save → status chip updates across list/board
- Click delete on "In Review" → reassignment dialog shows bug count
- Select "Open" as replacement → confirm → bugs move, board drops a column
- "Add Status" becomes enabled → add "QA Review" → board gains a column
- Reorder statuses with arrows → board column order updates

## What comes out of this phase

The complete prototype. Users can create bugs, browse them in List or Board view, inspect and edit in the Detail Modal, add comments, and manage the 5-status workflow. All data persists in localStorage and is seeded with realistic mock data on first load. Every feature from the overview is functional.

## Risks

| Risk                                                   | Impact                           | Mitigation                                                                |
| ------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------- |
| Bulk reassignment on status delete is slow with many bugs | UI freezes during Promise.all  | Prototype has ~10 bugs — no performance concern                           |
| Color picker UX is limited (hex input / preset swatches) | Users pick bad colors          | Preset palette with 8 curated colors covers common needs                  |
| Status order gaps after reordering                     | Board columns out of order       | Normalize orders (0–4) after every reorder operation                      |
| Creating > 999 bugs overflows ticket number format     | "BUG-1000" breaks layout         | `padStart(3)` still works — it just doesn't pad. Acceptable for prototype |
