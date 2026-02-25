# Phase 1: Plugin Scaffold, Types & Mock Data Layer

**Goal:** A registered Backstage plugin with sidebar navigation, page shell, TypeScript interfaces, and a fully functional local storage client seeded with mock data — the foundation every subsequent phase builds on.

**Depends on:** Existing Backstage instance (packages/app, packages/backend already running)

---

## What this phase delivers

- A new plugin at `plugins/bug-manager/` with `createPlugin()` and `createRoutableExtension()`
- Sidebar item with `BugReportIcon` navigating to `/bug-manager`
- Route registered in `packages/app/src/App.tsx`
- All TypeScript interfaces from the overview (`Bug`, `Status`, `Comment`, `User`, `Priority`, etc.)
- API ref (`bugManagerApiRef`) and `BugManagerApi` interface
- `LocalStorageClient` implementation with full CRUD for bugs, statuses, and comments
- Mock data seeded on first load: 5 default statuses and 8–10 sample bugs with comments
- A minimal `BugManagerPage` shell (Header + empty Content area) confirming the plugin renders
- `BugManagerProvider` context wrapping the page with centralized state

## Technical design

### Plugin registration

**`src/routes.ts`**

```typescript
import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({ id: 'bug-manager' });
```

**`src/plugin.ts`**

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

**`src/index.ts`** — public exports:

```typescript
export { bugManagerPlugin, BugManagerPage } from './plugin';
```

### App integration

**Sidebar** — in `packages/app/src/modules/appModuleNav.tsx`:

```typescript
import BugReportIcon from '@material-ui/icons/BugReport';

// Inside the Menu SidebarGroup:
<SidebarItem icon={BugReportIcon} to="bug-manager" text="Bug Manager" />
```

**Route** — in `packages/app/src/App.tsx`:

```typescript
import { BugManagerPage } from '@internal/plugin-bug-manager';

// Inside FlatRoutes:
<Route path="/bug-manager" element={<BugManagerPage />} />
```

### TypeScript interfaces

All types live in `src/api/types.ts`, matching the overview exactly:

```typescript
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

### API ref & interface

**`src/api/BugManagerApi.ts`**

```typescript
import { createApiRef } from '@backstage/core-plugin-api';

export const bugManagerApiRef = createApiRef<BugManagerApi>({
  id: 'plugin.bug-manager.api',
});

export interface BugManagerApi {
  getBugs(filters?: BugFilters): Promise<Bug[]>;
  getBugById(id: string): Promise<Bug>;
  createBug(bug: CreateBugRequest): Promise<Bug>;
  updateBug(id: string, updates: UpdateBugRequest): Promise<Bug>;
  deleteBug(id: string): Promise<void>;

  getStatuses(): Promise<Status[]>;
  createStatus(status: CreateStatusRequest): Promise<Status>;
  updateStatus(id: string, updates: UpdateStatusRequest): Promise<Status>;
  deleteStatus(id: string): Promise<void>;

  getComments(bugId: string): Promise<Comment[]>;
  addComment(bugId: string, content: string): Promise<Comment>;
}
```

### LocalStorageClient

**`src/api/LocalStorageClient.ts`** — implements `BugManagerApi` using `localStorage`.

Key implementation details:

- **Storage keys:** `bug-manager:bugs`, `bug-manager:statuses`, `bug-manager:comments:{bugId}`
- **First-load seeding:** On construction, checks if `bug-manager:statuses` exists. If not, seeds default statuses and sample bugs.
- **Ticket number generation:** Reads all existing bugs, finds the highest ticket number, increments by 1. Format: `BUG-001`, `BUG-002`, etc., zero-padded to 3 digits.
- **Filtering:** `getBugs(filters)` applies client-side filtering on status, priority, assignee, and free-text search (matching heading and ticketNumber).
- **UUID generation:** Uses `crypto.randomUUID()` (available in modern browsers).

### Mock data seed

5 default statuses (from overview):

| Order | Name        | Color     |
| ----- | ----------- | --------- |
| 0     | Open        | `#2196F3` |
| 1     | In Progress | `#FF9800` |
| 2     | In Review   | `#9C27B0` |
| 3     | Resolved    | `#4CAF50` |
| 4     | Closed      | `#9E9E9E` |

8–10 sample bugs across all statuses and priorities, with 2 mock users:

| User          | ID                    | Avatar                |
| ------------- | --------------------- | --------------------- |
| Jane Doe      | `user:default/jane`   | Backstage default     |
| John Smith    | `user:default/john`   | Backstage default     |

Sample bugs should cover: various priorities, assigned and unassigned, different statuses, a few with 2-3 pre-seeded comments.

### Context provider

**`src/context/BugManagerProvider.tsx`** — wraps the plugin page. Provides:

```typescript
interface BugManagerContextValue {
  bugs: Bug[];
  statuses: Status[];
  filters: BugFilters;
  activeView: 'list' | 'board';
  selectedBugId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  createBug: (req: CreateBugRequest) => Promise<void>;
  updateBug: (id: string, updates: UpdateBugRequest) => Promise<void>;
  deleteBug: (id: string) => Promise<void>;
  setFilters: (filters: BugFilters) => void;
  setView: (view: 'list' | 'board') => void;
  selectBug: (id: string | null) => void;
  refreshBugs: () => Promise<void>;
  refreshStatuses: () => Promise<void>;
}
```

The provider initializes by calling `getStatuses()` and `getBugs()` on mount. All child components consume this context via `useBugManagerContext()`.

### Page shell

**`src/components/BugManagerPage/BugManagerPage.tsx`**

```tsx
<BugManagerProvider>
  <Page themeId="tool">
    <Header title="Bug Manager" subtitle={`${bugs.length} bugs tracked`}>
      <BugReportIcon />
    </Header>
    <Content>
      {/* Phase 2+ fills this in */}
      <Typography>Bug Manager — coming soon</Typography>
    </Content>
  </Page>
</BugManagerProvider>
```

### Package structure after Phase 1

```
plugins/bug-manager/
├── package.json
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   ├── routes.ts
│   ├── api/
│   │   ├── types.ts
│   │   ├── BugManagerApi.ts
│   │   └── LocalStorageClient.ts
│   ├── context/
│   │   ├── BugManagerProvider.tsx
│   │   └── useBugManagerContext.ts
│   ├── hooks/
│   │   └── (empty — Phase 2+)
│   ├── components/
│   │   └── BugManagerPage/
│   │       └── BugManagerPage.tsx
│   └── utils/
│       ├── priorities.ts
│       └── ticketNumber.ts
```

## Steps

### 1.1 Scaffold the plugin package

Create `plugins/bug-manager/` with `package.json`, `tsconfig.json`. Add dependencies: `@backstage/core-plugin-api`, `@backstage/core-components`, `@backstage/theme`, `@material-ui/core`, `@material-ui/icons`, `uuid`. Wire into the Yarn workspace.

### 1.2 Create types and API interface

Write `src/api/types.ts` and `src/api/BugManagerApi.ts` with all interfaces from the overview.

### 1.3 Implement LocalStorageClient with mock data seeding

Write `src/api/LocalStorageClient.ts`. On first access, seed 5 statuses and 8–10 sample bugs. Implement all CRUD methods.

### 1.4 Implement utility helpers

Write `src/utils/priorities.ts` (priority color map: urgent → `#F44336`, medium → `#FF9800`, low → `#2196F3`) and `src/utils/ticketNumber.ts` (format and increment logic).

### 1.5 Build the context provider

Write `BugManagerProvider.tsx` and `useBugManagerContext.ts`. Provider loads statuses and bugs on mount, exposes actions.

### 1.6 Build the page shell

Write `BugManagerPage.tsx` with Header, bug count subtitle, and placeholder Content.

### 1.7 Register plugin, route, and sidebar item

Write `plugin.ts`, `routes.ts`, `index.ts`. Add the `SidebarItem` and `Route` in the app package.

### 1.8 Verify

- Run `yarn start`
- Sidebar shows "Bug Manager" with `BugReportIcon`
- Clicking it navigates to `/bug-manager`
- Page renders with header showing "Bug Manager" and correct bug count
- Open browser devtools → localStorage contains seeded statuses and bugs

## What comes out of this phase

A fully registered Backstage plugin with a working data layer. No visible UI beyond the page header, but every subsequent phase can immediately consume `useBugManagerContext()` to read bugs and statuses and call CRUD actions. The mock data ensures realistic development and testing from day one.

## Risks

| Risk                                | Impact                              | Mitigation                                                          |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| localStorage quota exceeded         | Data loss on large datasets         | Prototype scope — 10 bugs + 5 statuses is well within 5MB limit    |
| `crypto.randomUUID()` not available | ID generation fails on older browsers | Fallback to `uuid` package already in dependencies                 |
| Context re-renders on every action  | Performance issues with large state | Acceptable for prototype; can memoize with `useMemo` if needed     |
