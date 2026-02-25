# Bug Manager Plugin — Technical Product Requirement Document

> **Plugin ID:** `bug-manager`
> **Package:** `@internal/plugin-bug-manager`
> **Version:** `0.1.0`
> **Status:** Draft
> **Last Updated:** 2026-02-24

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Data Schema](#3-data-schema)
4. [UI/UX Specification](#4-uiux-specification)
5. [Administrative Logic](#5-administrative-logic)
6. [Technical Stack](#6-technical-stack)
7. [Directory Structure](#7-directory-structure)
8. [State Management](#8-state-management)
9. [Success Criteria](#9-success-criteria)

---

## 1. Overview

The Bug Manager is a Backstage frontend plugin that provides a Jira/ClickUp-style issue tracker scoped to bug tracking. It integrates into the Backstage sidebar, supports both **List** and **Kanban Board** views, and provides a **Detail Modal** for full bug inspection and editing.

### Goals

- Provide a self-contained bug tracking interface within Backstage.
- Support exactly **5 configurable statuses** managed by admin users.
- Deliver two primary views: a sortable/filterable **List View** and a drag-and-drop **Kanban Board**.
- Display bug details in a **split-view modal** with content (70%) and metadata sidebar (30%).
- Use priority-based visual indicators: **Red** (Urgent), **Yellow** (Medium), **Blue** (Low).

### Non-Goals

- Backend persistence layer (this PRD covers the frontend plugin; storage is abstracted behind an API client interface).
- Integration with external issue trackers (Jira, GitHub Issues, etc.).
- Permission/RBAC enforcement (deferred to a future iteration; admin role is assumed client-side for now).

---

## 2. System Architecture

### 2.1 Plugin Registration

The plugin integrates into Backstage using the standard `@backstage/core-plugin-api` pattern:

```
plugins/bug-manager/
└── src/
    ├── plugin.ts        → createPlugin() + createRoutableExtension()
    ├── routes.ts        → createRouteRef({ id: 'bug-manager' })
    └── index.ts         → Public exports
```

**`routes.ts`**

```typescript
import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({ id: 'bug-manager' });
```

**`plugin.ts`**

```typescript
import { createPlugin, createRoutableExtension } from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';

export const bugManagerPlugin = createPlugin({
  id: 'bug-manager',
  routes: {
    root: rootRouteRef,
  },
});

export const BugManagerPage = bugManagerPlugin.provide(
  createRoutableExtension({
    name: 'BugManagerPage',
    component: () =>
      import('./components/BugManagerPage').then(m => m.BugManagerPage),
    mountPoint: rootRouteRef,
  }),
);
```

### 2.2 Sidebar Integration

A new `SidebarItem` is added to the app navigation in `packages/app/src/modules/appModuleNav.tsx`:

```typescript
import BugReportIcon from '@material-ui/icons/BugReport';

// Inside the Menu SidebarGroup, alongside existing items:
<SidebarItem icon={BugReportIcon} to="bug-manager" text="Bug Manager" />
```

**Icon Choice:** `BugReportIcon` from `@material-ui/icons` — visually communicates the bug tracking purpose and is reused throughout the plugin (page header, modal header, empty states).

### 2.3 Route Registration

In `packages/app/src/App.tsx`, register the route alongside existing plugin routes:

```typescript
import { BugManagerPage } from '@internal/plugin-bug-manager';

// Inside FlatRoutes:
<Route path="/bug-manager" element={<BugManagerPage />} />
```

### 2.4 API Client Interface

The plugin communicates with a backend through an API client abstraction:

```typescript
// src/api/BugManagerApi.ts
import { createApiRef } from '@backstage/core-plugin-api';

export const bugManagerApiRef = createApiRef<BugManagerApi>({
  id: 'plugin.bug-manager.api',
});

export interface BugManagerApi {
  // Bugs
  getBugs(filters?: BugFilters): Promise<Bug[]>;
  getBugById(id: string): Promise<Bug>;
  createBug(bug: CreateBugRequest): Promise<Bug>;
  updateBug(id: string, updates: UpdateBugRequest): Promise<Bug>;
  deleteBug(id: string): Promise<void>;

  // Statuses (Admin)
  getStatuses(): Promise<Status[]>;
  createStatus(status: CreateStatusRequest): Promise<Status>;
  updateStatus(id: string, updates: UpdateStatusRequest): Promise<Status>;
  deleteStatus(id: string): Promise<void>;

  // Comments
  getComments(bugId: string): Promise<Comment[]>;
  addComment(bugId: string, content: string): Promise<Comment>;
}
```

For initial development, a **LocalStorageClient** implementation enables frontend-only prototyping before a backend is available.

---

## 3. Data Schema

### 3.1 Bug Entity

| Field         | Type                             | Required | Description                                      |
| ------------- | -------------------------------- | -------- | ------------------------------------------------ |
| `id`          | `string`                         | Yes      | UUID, auto-generated                             |
| `ticketNumber`| `string`                         | Yes      | Sequential identifier, e.g., `BUG-001`          |
| `heading`     | `string`                         | Yes      | Short summary of the bug (max 200 chars)         |
| `description` | `string`                         | No       | Detailed bug description (supports markdown)     |
| `assignee`    | `User \| null`                   | No       | Person responsible for resolving the bug         |
| `reporter`    | `User`                           | Yes      | Person who reported the bug                      |
| `status`      | `Status`                         | Yes      | Current status (references a Status entity)      |
| `priority`    | `'urgent' \| 'medium' \| 'low'`  | Yes      | Bug priority level                               |
| `comments`    | `Comment[]`                      | No       | Thread of comments (loaded on-demand in modal)   |
| `createdAt`   | `string` (ISO 8601)              | Yes      | Timestamp of creation                            |
| `updatedAt`   | `string` (ISO 8601)              | Yes      | Timestamp of last modification                   |

### 3.2 Status Entity

| Field     | Type     | Required | Description                                                        |
| --------- | -------- | -------- | ------------------------------------------------------------------ |
| `id`      | `string` | Yes      | UUID, auto-generated                                               |
| `name`    | `string` | Yes      | Display name, e.g., "Open", "In Progress"                          |
| `order`   | `number` | Yes      | Position in the workflow (0–4), used for column ordering on Board   |
| `color`   | `string` | No       | Optional hex color for the status chip                             |

**Constraint:** Exactly **5 statuses** must exist at all times. The system enforces this:
- Creation is blocked when 5 statuses already exist.
- Deletion is blocked when only 5 statuses exist (must create a replacement first, or reassign bugs).
- On deletion, all bugs with the deleted status must be reassigned to a selected replacement status.

**Default Statuses (seeded on first use):**

| Order | Name          | Color     |
| ----- | ------------- | --------- |
| 0     | Open          | `#2196F3` |
| 1     | In Progress   | `#FF9800` |
| 2     | In Review     | `#9C27B0` |
| 3     | Resolved      | `#4CAF50` |
| 4     | Closed        | `#9E9E9E` |

### 3.3 User Entity

| Field         | Type     | Required | Description                        |
| ------------- | -------- | -------- | ---------------------------------- |
| `id`          | `string` | Yes      | Backstage user entity ref          |
| `displayName` | `string` | Yes      | Human-readable name                |
| `avatarUrl`   | `string` | No       | URL to user avatar image           |

### 3.4 Comment Entity

| Field       | Type     | Required | Description                        |
| ----------- | -------- | -------- | ---------------------------------- |
| `id`        | `string` | Yes      | UUID, auto-generated               |
| `author`    | `User`   | Yes      | Comment author                     |
| `content`   | `string` | Yes      | Comment body (supports markdown)   |
| `createdAt` | `string` | Yes      | ISO 8601 timestamp                 |

### 3.5 Priority Enum & Visual Mapping

| Priority | Enum Value | Chip Color   | Hex       | Usage                                       |
| -------- | ---------- | ------------ | --------- | ------------------------------------------- |
| Urgent   | `urgent`   | Red          | `#F44336` | Chip background, left-border accent on rows  |
| Medium   | `medium`   | Yellow/Amber | `#FF9800` | Chip background, left-border accent on rows  |
| Low      | `low`      | Blue         | `#2196F3` | Chip background, left-border accent on rows  |

### 3.6 TypeScript Interfaces

```typescript
// src/api/types.ts

export type Priority = 'urgent' | 'medium' | 'low';

export interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Status {
  id: string;
  name: string;
  order: number;
  color?: string;
}

export interface Comment {
  id: string;
  author: User;
  content: string;
  createdAt: string;
}

export interface Bug {
  id: string;
  ticketNumber: string;
  heading: string;
  description: string;
  assignee: User | null;
  reporter: User;
  status: Status;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

export interface BugFilters {
  status?: string;
  priority?: Priority;
  assignee?: string;
  search?: string;
}

export interface CreateBugRequest {
  heading: string;
  description?: string;
  assigneeId?: string;
  statusId: string;
  priority: Priority;
}

export interface UpdateBugRequest {
  heading?: string;
  description?: string;
  assigneeId?: string | null;
  statusId?: string;
  priority?: Priority;
}

export interface CreateStatusRequest {
  name: string;
  order: number;
  color?: string;
}

export interface UpdateStatusRequest {
  name?: string;
  order?: number;
  color?: string;
}
```

---

## 4. UI/UX Specification

### 4.1 Page Layout

The Bug Manager uses the standard Backstage page structure:

```
┌─────────────────────────────────────────────────────────┐
│  Header: "Bug Manager"   [BugReportIcon]                │
│  Subtitle: "{count} bugs tracked"                       │
├─────────────────────────────────────────────────────────┤
│  Toolbar:                                               │
│  [+ New Bug]  [List View | Board View]  [⚙ Statuses]   │
│  [Filter: Status ▾] [Filter: Priority ▾] [🔍 Search ]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Content Area (List View or Board View)                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- **Header:** Uses the Backstage `<Header>` component with `BugReportIcon` and bug count subtitle.
- **Toolbar:** A horizontal bar below the header containing action buttons, view toggle, and filters.
- **Content:** Swaps between List View and Board View based on the active toggle.
- **View Toggle:** A `ToggleButtonGroup` from Material-UI with two options: "List" and "Board".

### 4.2 List View

A tabular view implemented with Material-UI's `<Table>` component.

```
┌──────────┬──────────────────────────────┬────────────┬──────────────┬──────────┐
│ Ticket # │ Heading                      │ Assignee   │ Status       │ Priority │
├──────────┼──────────────────────────────┼────────────┼──────────────┼──────────┤
│ ● BUG-001│ Login fails on Safari        │ 👤 Jane D. │ [In Progress]│ 🔴 Urgent│
│ ● BUG-002│ Typo on settings page        │ 👤 John S. │ [Open]       │ 🔵 Low   │
│ ● BUG-003│ API timeout on large payload │ —          │ [In Review]  │ 🟡 Medium│
└──────────┴──────────────────────────────┴────────────┴──────────────┴──────────┘
```

**Row Behavior:**

- Each row has a **4px left border** colored by priority (Red/Yellow/Blue).
- **Ticket Number:** Monospaced font, e.g., `BUG-042`.
- **Heading:** Primary text, truncated with ellipsis if exceeding column width.
- **Assignee:** Avatar + display name. Shows "Unassigned" in muted text if null.
- **Status:** Rendered as a Material-UI `<Chip>` with the status color as background.
- **Priority:** Rendered as a `<Chip>` with the priority color as background and white text.
- **Hover:** Row highlights on hover with `cursor: pointer`.
- **Click:** Opens the Detail Modal for that bug.
- **Empty State:** A centered illustration with "No bugs found" message and a "Create Bug" CTA.

**Sorting:**

- Columns are sortable by clicking the column header (Ticket #, Heading, Assignee, Status, Priority).
- Default sort: by `ticketNumber` descending (newest first).

**Filtering:**

- **Status filter:** Dropdown with all 5 status options + "All".
- **Priority filter:** Dropdown with Urgent / Medium / Low + "All".
- **Search:** Free-text search matching against heading and ticket number.

### 4.3 Kanban Board View

A drag-and-drop board with exactly **5 columns**, one per status, ordered by `status.order`.

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│    Open (3)  │ In Progress │  In Review  │  Resolved   │   Closed    │
│              │    (2)      │    (1)      │    (0)      │    (1)      │
├─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │             │ ┌─────────┐ │
│ │ BUG-001 │ │ │ BUG-004 │ │ │ BUG-003 │ │             │ │ BUG-006 │ │
│ │ Login.. │ │ │ CSS...  │ │ │ API ti..│ │             │ │ Old bug │ │
│ │ 🔴 Jane │ │ │ 🟡 John │ │ │ 🟡 —    │ │             │ │ 🔵 Jane │ │
│ └─────────┘ │ └─────────┘ │ └─────────┘ │             │ └─────────┘ │
│ ┌─────────┐ │ ┌─────────┐ │             │             │             │
│ │ BUG-002 │ │ │ BUG-005 │ │             │             │             │
│ │ Typo..  │ │ │ Perf... │ │             │             │             │
│ │ 🔵 John │ │ │ 🔴 —    │ │             │             │             │
│ └─────────┘ │ └─────────┘ │             │             │             │
│ ┌─────────┐ │             │             │             │             │
│ │ BUG-007 │ │             │             │             │             │
│ │ Error.. │ │             │             │             │             │
│ │ 🔴 —    │ │             │             │             │             │
│ └─────────┘ │             │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

**Column Specification:**

- **Header:** Status name + bug count badge.
- **Ordering:** Columns render left-to-right sorted by `status.order` (0 → 4).
- **Scrollable:** Each column scrolls vertically when content overflows.
- **Column Background:** Light gray (`#F5F5F5`) with a subtle top border in the status color.

**Card Specification:**

- Each card is a Material-UI `<Card>` (or `<Paper>`) containing:
  - **Ticket Number** (top-left, muted small text)
  - **Heading** (truncated to 2 lines)
  - **Bottom row:** Priority chip (left) + Assignee avatar (right)
- **Left border:** 4px solid in the priority color (same as list view).
- **Click:** Opens the Detail Modal.

**Drag-and-Drop:**

- Implemented using `@hello-pangea/dnd` (React 18-compatible fork of `react-beautiful-dnd`).
- Dragging a card from one column to another updates the bug's `statusId` via the API.
- Visual feedback: drop target column highlights, dragged card has elevation shadow.
- Cards within a column are **not** reorderable (ordering within a column is by `ticketNumber`).

### 4.4 Detail Modal

Triggered by clicking a bug row (List View) or bug card (Board View). Implemented as a Material-UI `<Dialog>` with `maxWidth="lg"` and `fullWidth`.

```
┌──────────────────────────────────────────────────────────────────┐
│  [BugReportIcon] BUG-001                              [✕ Close] │
├────────────────────────────────────┬─────────────────────────────┤
│                                    │  DETAILS                    │
│  Heading (editable)                │                             │
│  ┌──────────────────────────────┐  │  Assignee:                  │
│  │ Login fails on Safari when   │  │  👤 Jane Doe          [✎]  │
│  │ using SSO authentication     │  │                             │
│  └──────────────────────────────┘  │  Reporter:                  │
│                                    │  👤 John Smith              │
│  Description                       │                             │
│  ┌──────────────────────────────┐  │  Status:                    │
│  │ When a user attempts to log  │  │  [In Progress ▾]           │
│  │ in via SSO on Safari 17.x,  │  │                             │
│  │ the callback URL fails to   │  │  Priority:                  │
│  │ resolve. Steps to reproduce: │  │  [🔴 Urgent ▾]             │
│  │ 1. Open Safari              │  │                             │
│  │ 2. Navigate to /login       │  │  Created:                   │
│  │ 3. Click "Sign in with SSO" │  │  2026-02-20 09:15           │
│  │ ...                         │  │                             │
│  └──────────────────────────────┘  │  Updated:                   │
│                                    │  2026-02-24 14:30           │
│  Comments (3)                      │                             │
│  ┌──────────────────────────────┐  │                             │
│  │ 👤 Jane Doe · 2h ago        │  │                             │
│  │ Reproduced on Safari 17.2.  │  │                             │
│  │ Working on a fix.           │  │                             │
│  ├──────────────────────────────┤  │                             │
│  │ 👤 John Smith · 1d ago      │  │                             │
│  │ This is blocking the v2.0   │  │                             │
│  │ release. Please prioritize. │  │                             │
│  └──────────────────────────────┘  │                             │
│  ┌──────────────────────────────┐  │                             │
│  │ Add a comment...            │  │                             │
│  │                        [Send]│  │                             │
│  └──────────────────────────────┘  │                             │
└────────────────────────────────────┴─────────────────────────────┘
```

**Layout: 70/30 Split**

- **Left panel (70%):** Content area.
  - **Header section:** Editable heading displayed as a large `<Typography variant="h5">`. Click-to-edit with inline `<TextField>`.
  - **Description section:** Markdown-rendered description. Click-to-edit toggles a `<TextField multiline>`.
  - **Comment section:** Chronological list of comments with author avatar, name, relative timestamp, and content. A text input at the bottom for adding new comments.

- **Right panel (30%):** Metadata sidebar with a light gray background (`#FAFAFA`).
  - **Assignee:** Avatar + name with an edit button that opens a user picker dropdown.
  - **Reporter:** Avatar + name (read-only).
  - **Status:** Dropdown (`<Select>`) populated with all 5 statuses.
  - **Priority:** Dropdown with color-coded priority options.
  - **Created / Updated:** Formatted timestamps (read-only).

**Modal Header:**

- `BugReportIcon` + ticket number on the left.
- Close button (`✕`) on the right.

**Interactions:**

- All editable fields save on blur or on Enter (optimistic updates with error rollback).
- Comments are appended in real-time after successful API call.
- Status/Priority changes in the modal immediately reflect in the underlying List or Board view.

### 4.5 Create Bug Dialog

A separate `<Dialog>` for creating new bugs, opened via the "+ New Bug" button.

**Fields:**

| Field       | Input Type          | Required | Default                |
| ----------- | ------------------- | -------- | ---------------------- |
| Heading     | `TextField`         | Yes      | —                      |
| Description | `TextField` (multi) | No       | —                      |
| Assignee    | User picker         | No       | `null` (Unassigned)    |
| Status      | `Select`            | Yes      | First status (order 0) |
| Priority    | `Select`            | Yes      | `medium`               |

- **Ticket Number:** Auto-generated by the backend (not user-editable).
- **Reporter:** Automatically set to the currently logged-in user.
- **Validation:** Heading is required; display inline error if empty on submit.

### 4.6 Status Management Dialog

Accessible via the "⚙ Statuses" button in the toolbar. Requires admin role (enforced at UI level).

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
│  ⚠ Exactly 5 statuses are required.             │
│  Note: Deleting a status requires reassigning    │
│  existing bugs to another status.                │
│                                                  │
│                              [Cancel] [Save]     │
└──────────────────────────────────────────────────┘
```

**Rules:**

- The total count of statuses must always equal **5**.
- "Add Status" is enabled only when fewer than 5 statuses exist (after a deletion).
- "Delete" prompts a confirmation dialog asking which replacement status to assign orphaned bugs to.
- "Edit" opens an inline form to rename or recolor the status.
- Order can be changed via drag-and-drop or up/down arrows; this reorders the Kanban columns.

---

## 5. Administrative Logic

### 5.1 Status CRUD Operations

| Operation  | Precondition                           | Side Effects                                                                                     |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Create** | `statuses.length < 5`                  | New status appended with `order = statuses.length`. Board gains a new column.                    |
| **Read**   | None                                   | Returns all 5 statuses sorted by `order`.                                                        |
| **Update** | Status exists                          | Name/color/order changes propagate to all chips in List View and column headers in Board View.   |
| **Delete** | `statuses.length > 5` OR replacement   | All bugs with deleted status are reassigned to the user-selected replacement. Board loses column. |

### 5.2 Propagation Strategy

Status changes must be reflected immediately across all views. The approach:

1. **Centralized Status State:** A `useStatuses()` hook provides status data via React Context. Both List View and Board View consume this context.
2. **Optimistic Updates:** On status CRUD operations, the local state updates immediately. A background API call confirms persistence. On failure, state rolls back with an error snackbar.
3. **Bug Reassignment on Delete:** When a status is deleted:
   - A confirmation dialog shows: "X bugs are currently in [Status Name]. Reassign them to:" with a dropdown of remaining statuses.
   - On confirmation, a bulk update API call reassigns all affected bugs.
   - Both List and Board views re-render with updated bug statuses.

### 5.3 Admin Detection

For the initial version, admin status is determined by checking if the user has an `admin` tag or belongs to an `admins` group in the Backstage identity system. Non-admin users see the "⚙ Statuses" button as disabled with a tooltip: "Admin access required."

```typescript
import { identityApiRef } from '@backstage/core-plugin-api';

// In the component:
const identityApi = useApi(identityApiRef);
const { userEntityRef } = await identityApi.getBackstageIdentity();
// Check group membership via catalog API
```

---

## 6. Technical Stack

### 6.1 Backstage Core

| Package                        | Usage                                                     |
| ------------------------------ | --------------------------------------------------------- |
| `@backstage/core-plugin-api`   | Plugin creation, route refs, API refs, identity access    |
| `@backstage/core-components`   | `Page`, `Header`, `Content`, `InfoCard`, `Sidebar*`       |
| `@backstage/theme`             | Theme variables for consistent styling                    |

### 6.2 Material-UI (v4)

| Component                     | Usage                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| `Table`, `TableRow`, etc.     | List View table                                            |
| `Card`, `Paper`               | Kanban cards, modal panels                                 |
| `Dialog`, `DialogContent`     | Detail Modal, Create Bug, Status Management                |
| `Chip`                        | Status and priority indicators                             |
| `Select`, `MenuItem`          | Dropdowns for status, priority, assignee                   |
| `TextField`                   | Text inputs for heading, description, comments, search     |
| `Button`, `IconButton`        | Actions (create, edit, delete, close)                      |
| `ToggleButtonGroup`           | List/Board view switcher                                   |
| `Avatar`                      | User avatars in assignee, reporter, comments               |
| `Tooltip`, `Snackbar`         | Hover hints, success/error notifications                   |
| `makeStyles`                  | Component-scoped CSS-in-JS styling                         |
| `Grid`                        | Layout structure for modal split-view and board columns    |

### 6.3 Third-Party

| Package                       | Usage                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| `@hello-pangea/dnd`           | Drag-and-drop for Kanban Board (React 18-compatible fork of `react-beautiful-dnd`) |
| `uuid`                        | Client-side ID generation (for local storage client)       |

### 6.4 Dev Dependencies

| Package                       | Usage                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| `@backstage/test-utils`       | Test wrappers for Backstage context                        |
| `@testing-library/react`      | Component testing                                          |

---

## 7. Directory Structure

```
plugins/bug-manager/
├── package.json
├── README.md
├── overview.md                            ← This document
├── src/
│   ├── index.ts                           ← Public exports
│   ├── plugin.ts                          ← Plugin definition + extensions
│   ├── routes.ts                          ← Route ref definitions
│   │
│   ├── api/
│   │   ├── types.ts                       ← Bug, Status, Comment, User interfaces
│   │   ├── BugManagerApi.ts               ← API ref + interface
│   │   └── LocalStorageClient.ts          ← Local storage implementation
│   │
│   ├── context/
│   │   ├── BugManagerProvider.tsx          ← Top-level context provider
│   │   └── useBugManagerContext.ts         ← Context consumer hook
│   │
│   ├── hooks/
│   │   ├── useBugs.ts                     ← CRUD operations for bugs
│   │   ├── useStatuses.ts                 ← CRUD operations for statuses
│   │   └── useComments.ts                 ← Comment operations
│   │
│   ├── components/
│   │   ├── BugManagerPage/
│   │   │   ├── BugManagerPage.tsx          ← Main page layout (Header + Content)
│   │   │   └── Toolbar.tsx                ← Action bar (create, view toggle, filters)
│   │   │
│   │   ├── ListView/
│   │   │   ├── ListView.tsx               ← Table component
│   │   │   └── BugRow.tsx                 ← Individual table row
│   │   │
│   │   ├── BoardView/
│   │   │   ├── BoardView.tsx              ← Kanban board layout
│   │   │   ├── BoardColumn.tsx            ← Single status column
│   │   │   └── BugCard.tsx                ← Draggable bug card
│   │   │
│   │   ├── BugDetailModal/
│   │   │   ├── BugDetailModal.tsx         ← Modal container (70/30 split)
│   │   │   ├── BugContent.tsx             ← Left panel (heading, description, comments)
│   │   │   ├── BugMetadataSidebar.tsx     ← Right panel (assignee, reporter, status, priority)
│   │   │   └── CommentSection.tsx         ← Comment list + input
│   │   │
│   │   ├── CreateBugDialog/
│   │   │   └── CreateBugDialog.tsx        ← New bug form dialog
│   │   │
│   │   ├── StatusManagement/
│   │   │   ├── StatusManagementDialog.tsx ← Admin status CRUD dialog
│   │   │   └── StatusRow.tsx              ← Editable status row
│   │   │
│   │   └── shared/
│   │       ├── PriorityChip.tsx           ← Reusable priority chip (Red/Yellow/Blue)
│   │       ├── StatusChip.tsx             ← Reusable status chip
│   │       └── UserAvatar.tsx             ← Avatar + name display
│   │
│   └── utils/
│       ├── priorities.ts                  ← Priority color map + helpers
│       └── ticketNumber.ts                ← Ticket number formatting
│
└── catalog-info.yaml
```

---

## 8. State Management

### 8.1 Context Architecture

```
<BugManagerProvider>                ← Wraps entire plugin page
  ├── statuses: Status[]            ← Loaded once, refreshed on admin changes
  ├── bugs: Bug[]                   ← Loaded on mount, refreshed on CRUD
  ├── filters: BugFilters           ← Current filter state
  ├── activeView: 'list' | 'board'
  ├── selectedBugId: string | null
  ├── actions:
  │   ├── createBug()
  │   ├── updateBug()
  │   ├── deleteBug()
  │   ├── setFilters()
  │   ├── setView()
  │   ├── selectBug()               ← Opens Detail Modal
  │   ├── closeBug()                ← Closes Detail Modal
  │   ├── createStatus()
  │   ├── updateStatus()
  │   └── deleteStatus()
  └── loading / error states
```

### 8.2 Data Flow

```
User Action → Hook (useBugs/useStatuses) → API Client → State Update → Re-render
                                                ↓
                                        Optimistic UI update
                                        (rollback on API error)
```

### 8.3 Key Hooks

| Hook             | Responsibility                                                              |
| ---------------- | --------------------------------------------------------------------------- |
| `useBugs()`      | Fetches bugs, provides create/update/delete, handles filtering and sorting  |
| `useStatuses()`  | Fetches statuses, provides admin CRUD, enforces the 5-status constraint     |
| `useComments()`  | Fetches comments for a bug, provides add comment                            |

---

## 9. Success Criteria

### Functional Requirements

- [ ] Plugin registers in Backstage and is navigable via a `BugReportIcon` sidebar item at `/bug-manager`.
- [ ] **List View** renders all bugs in a table with Ticket #, Heading, Assignee, Status, and Priority columns.
- [ ] Priority is visually indicated with colored chips (Red = Urgent, Yellow = Medium, Blue = Low) and a left-border accent on each row.
- [ ] Status is rendered as a colored `<Chip>` in both List and Board views.
- [ ] **Board View** displays exactly 5 columns corresponding to the 5 configured statuses.
- [ ] Dragging a card from one Board column to another updates the bug's status and persists the change.
- [ ] Clicking a bug (row or card) opens a **Detail Modal** with a 70/30 split layout.
- [ ] The modal displays heading, description, and comments on the left; assignee, reporter, status, priority, and timestamps on the right.
- [ ] Comments can be added from the modal and appear immediately in the comment thread.
- [ ] Status and priority can be changed from the modal's metadata sidebar.
- [ ] A "Create Bug" dialog allows creating new bugs with heading, description, assignee, status, and priority.
- [ ] Ticket numbers are auto-generated sequentially (e.g., `BUG-001`, `BUG-002`).
- [ ] Admin users can access a "Manage Statuses" dialog to create, update, and delete statuses.
- [ ] The system enforces exactly 5 statuses at all times.
- [ ] Deleting a status requires reassigning all affected bugs to a replacement status.
- [ ] Status changes (name, color, order) propagate immediately to both List and Board views.

### Non-Functional Requirements

- [ ] All components follow Backstage theming conventions (`makeStyles`, `@backstage/theme`).
- [ ] The plugin is lazy-loaded (`import()` in `createRoutableExtension`) to avoid impacting app bundle size.
- [ ] Optimistic updates provide immediate UI feedback; errors are communicated via snackbars.
- [ ] The List View handles 500+ bugs without noticeable scroll jank.
- [ ] The Board View remains responsive with up to 100 cards per column.
- [ ] All interactive elements are keyboard-accessible.

### Stretch Goals (Future Iterations)

- [ ] Backend plugin (`@internal/plugin-bug-manager-backend`) with database persistence.
- [ ] Real-time updates via WebSocket or polling.
- [ ] Backstage permission framework integration for fine-grained RBAC.
- [ ] Bulk operations (multi-select bugs, bulk status change).
- [ ] Bug activity log (audit trail of all changes).
- [ ] File attachments on bugs.
- [ ] Integration with Backstage Catalog entities (link bugs to services/components).
