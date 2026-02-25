# v2 Phase 3: Frontend — BackendClient & Updated Types

**Goal:** Replace the `LocalStorageClient` with a real `BackendClient` that calls the v2 backend over HTTP, update all TypeScript types to include `isClosed` and the new filter fields, and verify the full frontend renders live data from the database.

**Depends on:** Phase 2 (all backend endpoints live), v1 frontend (existing plugin working with LocalStorageClient)

---

## What this phase delivers

- `BackendClient` implementing `BugManagerApi` using `DiscoveryApi` + `FetchApi`
- Updated `types.ts` adding `isClosed`, `assignees[]`, and `includeClosed` to relevant interfaces
- Updated `BugManagerApi` interface removing `deleteBug`, adding `closeBug` and `getDistinctAssignees`
- `createApiFactory` wiring in `plugin.ts` so the app uses `BackendClient` by default
- `LocalStorageClient` preserved but no longer the default (kept for local dev override)
- Updated `BugManagerProvider` to consume live data — no behavioral changes yet, just the data source swap
- All existing views (List, Board, Detail Modal) rendering real database bugs and statuses

---

## Technical design

### Updated TypeScript types

**`src/api/types.ts`** — add the v2 fields, keep all existing fields intact:

```typescript
export type Priority = 'urgent' | 'medium' | 'low';

export interface User {
  id: string;           // Backstage userEntityRef, e.g. "user:default/jane.doe"
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
  parentCommentId?: string;
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
  isClosed: boolean;     // NEW: was missing in v1
  createdAt: string;
  updatedAt: string;
}

export interface BugFilters {
  status?: string;
  priority?: Priority;
  assignee?: string;
  assignees?: string[];         // NEW: multi-select filter
  search?: string;
  includeClosed?: boolean;      // NEW: show soft-deleted bugs
}

export interface CreateBugRequest {
  heading: string;
  description?: string;
  assigneeId?: string;
  statusId: string;
  priority: Priority;
  // reporterId intentionally omitted — server derives from auth token (Phase 4)
}

export interface UpdateBugRequest {
  heading?: string;
  description?: string;
  assigneeId?: string | null;
  statusId?: string;
  priority?: Priority;
  isClosed?: boolean;           // NEW: for close / re-open
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

### Updated BugManagerApi interface

**`src/api/BugManagerApi.ts`** — replace `deleteBug` with `closeBug`, add `getDistinctAssignees`:

```typescript
import { createApiRef } from '@backstage/core-plugin-api';
import type {
  Bug, Status, Comment, User,
  BugFilters, CreateBugRequest, UpdateBugRequest,
  CreateStatusRequest, UpdateStatusRequest,
} from './types';

export const bugManagerApiRef = createApiRef<BugManagerApi>({
  id: 'plugin.bug-manager.api',
});

export interface BugManagerApi {
  // Bugs
  getBugs(filters?: BugFilters): Promise<Bug[]>;
  getBugById(id: string): Promise<Bug>;
  createBug(bug: CreateBugRequest): Promise<Bug>;
  updateBug(id: string, updates: UpdateBugRequest): Promise<Bug>;
  closeBug(id: string): Promise<Bug>;              // NEW: replaces deleteBug
  // deleteBug removed — use closeBug instead

  // Statuses
  getStatuses(): Promise<Status[]>;
  createStatus(status: CreateStatusRequest): Promise<Status>;
  updateStatus(id: string, updates: UpdateStatusRequest): Promise<Status>;
  deleteStatus(id: string, replacementStatusId?: string): Promise<void>;

  // Comments
  getComments(bugId: string): Promise<Comment[]>;
  addComment(bugId: string, content: string, parentCommentId?: string): Promise<Comment>;
  updateComment(bugId: string, commentId: string, content: string): Promise<Comment>;
  deleteComment(bugId: string, commentId: string): Promise<void>;

  // Users
  getDistinctAssignees(): Promise<User[]>;         // NEW: for AssigneeBar
}
```

### BackendClient

**`src/api/BackendClient.ts`**

The client maps the camelCase frontend interface to the snake_case backend responses and handles response-to-frontend-type transformation.

```typescript
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { BugManagerApi } from './BugManagerApi';
import type {
  Bug, Status, Comment, User,
  BugFilters, CreateBugRequest, UpdateBugRequest,
  CreateStatusRequest, UpdateStatusRequest,
} from './types';

export class BackendClient implements BugManagerApi {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('bug-manager');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed with status ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  // ── Response mappers ──────────────────────────────────────────────────────
  // The backend returns snake_case row shapes. Map them to camelCase for the UI.

  private mapBug(row: any, statuses: Status[], users: Map<string, User>): Bug {
    return {
      id:           row.id,
      ticketNumber: row.ticket_number,
      heading:      row.heading,
      description:  row.description ?? '',
      priority:     row.priority,
      isClosed:     row.is_closed,
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
      status:       statuses.find(s => s.id === row.status_id) ?? {
        id: row.status_id, name: row.status_id, order: 0,
      },
      assignee:     row.assignee_id ? (users.get(row.assignee_id) ?? {
        id: row.assignee_id, displayName: row.assignee_id,
      }) : null,
      reporter:     users.get(row.reporter_id) ?? {
        id: row.reporter_id, displayName: row.reporter_id,
      },
    };
  }

  private mapStatus(row: any): Status {
    return {
      id:    row.id,
      name:  row.label,
      order: row.order,
      color: row.color,
    };
  }

  private mapComment(row: any, users: Map<string, User>): Comment {
    return {
      id:              row.id,
      content:         row.comment_body,
      createdAt:       row.timestamp,
      parentCommentId: row.parent_comment_id ?? undefined,
      author:          users.get(row.user_id) ?? {
        id: row.user_id, displayName: row.user_id,
      },
    };
  }

  // ── Bugs ──────────────────────────────────────────────────────────────────

  async getBugs(filters?: BugFilters): Promise<Bug[]> {
    const params = new URLSearchParams();
    if (filters?.status)            params.set('status', filters.status);
    if (filters?.priority)          params.set('priority', filters.priority);
    if (filters?.assignees?.length) params.set('assignee', filters.assignees.join(','));
    else if (filters?.assignee)     params.set('assignee', filters.assignee);
    if (filters?.search)            params.set('search', filters.search);
    if (filters?.includeClosed)     params.set('includeClosed', 'true');

    const qs = params.toString();
    const [rows, statusRows] = await Promise.all([
      this.request<any[]>(`/bugs${qs ? `?${qs}` : ''}`),
      this.request<any[]>('/statuses'),
    ]);
    const statuses = statusRows.map(this.mapStatus);
    return rows.map(r => this.mapBug(r, statuses, new Map()));
  }

  async getBugById(id: string): Promise<Bug> {
    const [row, statusRows] = await Promise.all([
      this.request<any>(`/bugs/${id}`),
      this.request<any[]>('/statuses'),
    ]);
    const statuses = statusRows.map(this.mapStatus);
    return this.mapBug(row, statuses, new Map());
  }

  async createBug(bug: CreateBugRequest): Promise<Bug> {
    const row = await this.request<any>('/bugs', {
      method: 'POST',
      body: JSON.stringify({
        heading:     bug.heading,
        description: bug.description,
        assigneeId:  bug.assigneeId,
        statusId:    bug.statusId,
        priority:    bug.priority,
        // reporterId omitted — set server-side in Phase 4
        // For Phase 3, the backend still reads it from body, so pass a placeholder:
        reporterId: 'user:default/current',
      }),
    });
    const statuses = await this.getStatuses();
    return this.mapBug(row, statuses, new Map());
  }

  async updateBug(id: string, updates: UpdateBugRequest): Promise<Bug> {
    const body: Record<string, any> = {};
    if (updates.heading     !== undefined) body.heading     = updates.heading;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.assigneeId  !== undefined) body.assigneeId  = updates.assigneeId;
    if (updates.statusId    !== undefined) body.statusId    = updates.statusId;
    if (updates.priority    !== undefined) body.priority    = updates.priority;
    if (updates.isClosed    !== undefined) body.isClosed    = updates.isClosed;

    const row = await this.request<any>(`/bugs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    const statuses = await this.getStatuses();
    return this.mapBug(row, statuses, new Map());
  }

  async closeBug(id: string): Promise<Bug> {
    return this.updateBug(id, { isClosed: true });
  }

  // ── Statuses ──────────────────────────────────────────────────────────────

  async getStatuses(): Promise<Status[]> {
    const rows = await this.request<any[]>('/statuses');
    return rows.map(this.mapStatus);
  }

  async createStatus(status: CreateStatusRequest): Promise<Status> {
    const row = await this.request<any>('/statuses', {
      method: 'POST',
      body: JSON.stringify({ label: status.name, color: status.color, order: status.order }),
    });
    return this.mapStatus(row);
  }

  async updateStatus(id: string, updates: UpdateStatusRequest): Promise<Status> {
    const body: Record<string, any> = {};
    if (updates.name  !== undefined) body.label = updates.name;
    if (updates.color !== undefined) body.color = updates.color;
    if (updates.order !== undefined) body.order = updates.order;

    const row = await this.request<any>(`/statuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return this.mapStatus(row);
  }

  async deleteStatus(id: string, replacementStatusId?: string): Promise<void> {
    await this.request<void>(`/statuses/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ replacementStatusId }),
    });
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async getComments(bugId: string): Promise<Comment[]> {
    const rows = await this.request<any[]>(`/bugs/${bugId}/comments`);
    return rows.map(r => this.mapComment(r, new Map()));
  }

  async addComment(
    bugId: string,
    content: string,
    parentCommentId?: string,
  ): Promise<Comment> {
    const row = await this.request<any>(`/bugs/${bugId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        commentBody: content,
        parentCommentId,
        // userId omitted in Phase 4; required here as placeholder
        userId: 'user:default/current',
      }),
    });
    return this.mapComment(row, new Map());
  }

  async updateComment(bugId: string, commentId: string, content: string): Promise<Comment> {
    // Not in current backend spec — update via PATCH on the comment endpoint if added later
    throw new Error(`updateComment not yet supported by backend (bugId: ${bugId}, commentId: ${commentId}, content: ${content})`);
  }

  async deleteComment(bugId: string, commentId: string): Promise<void> {
    throw new Error(`deleteComment not yet supported by backend (bugId: ${bugId}, commentId: ${commentId})`);
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getDistinctAssignees(): Promise<User[]> {
    return this.request<User[]>('/users');
  }
}
```

### Plugin factory wiring

**`src/plugin.ts`** — register `BackendClient` as the default API factory:

```typescript
import {
  createPlugin,
  createRoutableExtension,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';
import { bugManagerApiRef } from './api/BugManagerApi';
import { BackendClient } from './api/BackendClient';

export const bugManagerPlugin = createPlugin({
  id: 'bug-manager',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: bugManagerApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi:     fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new BackendClient(discoveryApi, fetchApi),
    }),
  ],
});
```

### BugManagerProvider — minimal changes

`BugManagerProvider` continues to load data via `useApi(bugManagerApiRef)`. Because `BackendClient` implements the same interface as `LocalStorageClient`, no changes are required to the provider itself. The only change is removing the `deleteBug` action from the context value and replacing it with `closeBug`:

```typescript
// Remove from BugManagerContextValue:
deleteBug: (id: string) => Promise<void>;

// Add:
closeBug: (id: string) => Promise<void>;
```

Update all call sites in the provider implementation:

```typescript
const closeBug = useCallback(async (id: string) => {
  await api.closeBug(id);
  await refreshBugs();
}, [api, refreshBugs]);
```

---

## Handling snake_case ↔ camelCase

The backend returns raw Knex row shapes in `snake_case`. The `BackendClient` maps these to the camelCase frontend types in the `mapBug`, `mapStatus`, and `mapComment` private methods. This mapping is the single responsibility of `BackendClient` — no other component should deal with the raw backend shapes.

**Known limitation in this phase:** User display names and avatars are not yet resolved from the Backstage Catalog. The `mapBug` method creates `User` objects with `displayName = userEntityRef` as a fallback. Phase 4 replaces this with real catalog lookups.

---

## LocalStorageClient preservation

Keep `LocalStorageClient` as a non-default alternative for:
- Local frontend development when the backend isn't running
- Storybook / isolated component testing

Document in `LocalStorageClient.ts`:

```typescript
/**
 * @deprecated Use BackendClient for production. This client is kept for
 * local-only development without a backend. To use it, override the API
 * factory in your test setup or app config.
 */
export class LocalStorageClient implements BugManagerApi {
  // ...
  // Add closeBug to satisfy the updated interface:
  async closeBug(id: string): Promise<Bug> {
    return this.updateBug(id, { isClosed: true } as any);
  }

  async getDistinctAssignees(): Promise<User[]> {
    const bugs = await this.getBugs();
    const seen = new Map<string, User>();
    for (const bug of bugs) {
      if (bug.assignee && !seen.has(bug.assignee.id)) {
        seen.set(bug.assignee.id, bug.assignee);
      }
    }
    return [...seen.values()];
  }
}
```

---

## Steps

### 3.1 Update `types.ts`

Add `isClosed: boolean` to `Bug`, `assignees?: string[]` and `includeClosed?: boolean` to `BugFilters`, and `isClosed?: boolean` to `UpdateBugRequest`.

### 3.2 Update `BugManagerApi.ts`

Remove `deleteBug`, add `closeBug` and `getDistinctAssignees` to the interface.

### 3.3 Write `BackendClient.ts`

Implement all interface methods with `DiscoveryApi` + `FetchApi`. Add private `mapBug`, `mapStatus`, `mapComment` helpers.

### 3.4 Update `plugin.ts`

Register `createApiFactory` with `BackendClient` as the factory.

### 3.5 Update `LocalStorageClient.ts`

Add stub implementations for `closeBug` and `getDistinctAssignees` to satisfy the updated interface. Add the `@deprecated` JSDoc.

### 3.6 Update `BugManagerProvider.tsx`

Replace `deleteBug` with `closeBug` in the context value and implementation.

### 3.7 Update call sites for `deleteBug`

Find all components calling `deleteBug` from context (currently only `BugDetailModal`) and update to call `closeBug` instead. The confirmation dialog text changes from "Delete ticket?" to "Close ticket?" — the full close UI is built in Phase 5; this change just prevents a compile error.

### 3.8 Verify

- Navigate to `/bug-manager` — no bugs visible (database is empty)
- `POST` a bug via curl (see Phase 2 verify commands), then refresh — bug appears in the list
- `GET /api/bug-manager/statuses` in browser devtools → Network tab shows the backend call
- Drag a card in Board View → `PATCH` request visible in Network tab
- Status chip colors reflect the live database status colors (not hardcoded mock values)
- Changing status in the Detail Modal updates the board in real time (after context refresh)
- `LocalStorageClient` is no longer used by default (confirm in `plugin.ts` — only `BackendClient` is registered)

---

## What comes out of this phase

The frontend is fully connected to the PostgreSQL backend. All bug, status, and comment data is live. The UI renders real data and all writes (create, update, close) are persisted. User identity is still a placeholder (`user:default/current`) — Phase 4 replaces this with real Backstage authentication.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| CORS errors if backend is on a different port during local dev | All API calls fail | Backstage's `FetchApi` + `DiscoveryApi` handle proxy routing through the app backend — no direct cross-origin calls needed |
| `mapBug` called without statuses pre-loaded causes missing status | Status chip shows raw ID | `getBugs` fetches statuses in parallel (`Promise.all`) before mapping — always available |
| `BackendClient.getBugs` makes two round-trips (bugs + statuses) | Slower than v1 | Acceptable; statuses can be cached in a future iteration since they change rarely |
| `closeBug` call sites in components still reference `deleteBug` prop | TypeScript error | Step 3.7 covers all call sites — fix before shipping this phase |
