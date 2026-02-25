# Bug Manager Plugin — v2 Technical Specification (Production-Ready)

> **Plugin ID:** `bug-manager`
> **Backend Plugin ID:** `bug-manager-backend`
> **Package (Frontend):** `@internal/plugin-bug-manager`
> **Package (Backend):** `@internal/plugin-bug-manager-backend`
> **Version:** `2.0.0`
> **Status:** Draft
> **Last Updated:** 2026-02-25

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Changes from v1](#2-what-changes-from-v1)
3. [System Architecture](#3-system-architecture)
4. [Database Schema & Migrations](#4-database-schema--migrations)
5. [Backend Plugin — Router & API](#5-backend-plugin--router--api)
6. [Frontend — API Client](#6-frontend--api-client)
7. [Authentication & Identity Integration](#7-authentication--identity-integration)
8. [New UI Components](#8-new-ui-components)
9. [Lifecycle Management (Soft Delete)](#9-lifecycle-management-soft-delete)
10. [Advanced Filtering — Assignee Bar](#10-advanced-filtering--assignee-bar)
11. [Updated State Management](#11-updated-state-management)
12. [Updated Data Schema (TypeScript)](#12-updated-data-schema-typescript)
13. [Directory Structure](#13-directory-structure)
14. [Constraints & Standards](#14-constraints--standards)
15. [Migration from v1](#15-migration-from-v1)
16. [Success Criteria](#16-success-criteria)

---

## 1. Executive Summary

v2 transitions the Bug Manager from a browser-local, static prototype into a **production-ready, multi-user system**. The core changes are:

- **Real backend persistence:** A dedicated `bug-manager-backend` plugin using PostgreSQL via Knex replaces the `LocalStorageClient`.
- **Authenticated actions:** All write operations (create, edit, assign, comment) are tied to the logged-in Backstage user via `IdentityApi`.
- **Soft delete / ticket lifecycle:** Bugs are never hard-deleted. A "Close Ticket" workflow replaces the delete action.
- **Jira-style assignee filtering:** A multi-select avatar bar filters the board and list by assignee.
- **Real-time data fetching:** The frontend switches from static in-memory state to `useAsync`-based live fetching.

---

## 2. What Changes from v1

| Area | v1 Behaviour | v2 Behaviour |
|---|---|---|
| **Persistence** | `localStorage` in the browser | PostgreSQL via Backstage Knex |
| **Identity** | Mock users (`Jane Doe`, `John Smith`) | Real Backstage `IdentityApi` + user entity refs |
| **Reporter** | Hardcoded mock user | Auto-set to logged-in user on creation |
| **Delete** | Hard `deleteBug()` removes the record | `closeBug()` sets `isClosed = true`; no hard deletes |
| **Assignee filter** | Dropdown select for one user | Multi-select avatar bar (Jira-style) |
| **Comments** | Mock author, no auth | Authenticated; shows real Backstage profile picture |
| **Board drag-drop** | Updates local context state | Issues `PATCH /bugs/:id` to the backend |
| **Statuses** | 5-status constraint client-side | 5-status constraint enforced at the API level |
| **Data fetching** | `useEffect` + context on mount | `useAsync` polling / on-demand fetches |

---

## 3. System Architecture

### 3.1 Plugin Layout

```
plugins/
├── bug-manager/                  ← Frontend plugin (unchanged entry points)
└── bug-manager-backend/          ← NEW: Backend plugin
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── plugin.ts             ← createBackendPlugin()
    │   ├── router.ts             ← Express router with all endpoints
    │   ├── database/
    │   │   ├── migrations/       ← Knex migration files
    │   │   └── BugManagerStore.ts ← Database access layer
    │   └── types.ts              ← Backend-internal types
    └── catalog-info.yaml
```

### 3.2 Request Flow

```
Browser                Frontend Plugin                 Backend Plugin          PostgreSQL
  │                         │                               │                      │
  │  ── click "New Bug" ──► │                               │                      │
  │                         │── POST /api/bug-manager/bugs─►│                      │
  │                         │   + Backstage-Token header    │── INSERT INTO bugs ──►│
  │                         │                               │◄── row ──────────────│
  │◄── optimistic update ───│◄── 201 { bug } ───────────────│                      │
```

### 3.3 Authentication Flow

All backend requests from the frontend carry the Backstage user token automatically (via `FetchApi`). The backend calls `auth.getPluginRequestToken` and uses the `httpAuth` service to identify the caller.

---

## 4. Database Schema & Migrations

### 4.1 Knex Migration — Initial Schema

File: `plugins/bug-manager-backend/src/database/migrations/20260225_01_initial.ts`

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // bug_statuses must exist before bugs (FK)
  await knex.schema.createTable('bug_statuses', table => {
    table.string('id').primary();
    table.string('label').notNullable();
    table.string('color', 7).notNullable().defaultTo('#9E9E9E');
    table.integer('order').notNullable();
    table.timestamps(true, true); // created_at, updated_at
  });

  await knex.schema.createTable('bugs', table => {
    table.string('id').primary();
    table.string('ticket_number').notNullable().unique();
    table.string('heading', 200).notNullable();
    table.text('description').nullable();
    table.enum('priority', ['urgent', 'medium', 'low']).notNullable().defaultTo('medium');
    table.string('status_id').notNullable().references('id').inTable('bug_statuses');
    table.string('assignee_id').nullable();      // Backstage userEntityRef
    table.string('reporter_id').notNullable();   // Backstage userEntityRef
    table.boolean('is_closed').notNullable().defaultTo(false);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('bug_comments', table => {
    table.string('id').primary();
    table.string('bug_id').notNullable().references('id').inTable('bugs');
    table.string('user_id').notNullable();        // Backstage userEntityRef
    table.text('comment_body').notNullable();
    table.string('parent_comment_id').nullable().references('id').inTable('bug_comments');
    table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());
  });

  // Seed the 5 default statuses
  const now = new Date().toISOString();
  await knex('bug_statuses').insert([
    { id: 'status-open',        label: 'Open',        color: '#2196F3', order: 0, created_at: now, updated_at: now },
    { id: 'status-in-progress', label: 'In Progress', color: '#FF9800', order: 1, created_at: now, updated_at: now },
    { id: 'status-in-review',   label: 'In Review',   color: '#9C27B0', order: 2, created_at: now, updated_at: now },
    { id: 'status-resolved',    label: 'Resolved',    color: '#4CAF50', order: 3, created_at: now, updated_at: now },
    { id: 'status-closed',      label: 'Closed',      color: '#9E9E9E', order: 4, created_at: now, updated_at: now },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bug_comments');
  await knex.schema.dropTableIfExists('bugs');
  await knex.schema.dropTableIfExists('bug_statuses');
}
```

### 4.2 Schema Summary

**`bugs`**

| Column | Type | Notes |
|---|---|---|
| `id` | `string` (UUID) | PK |
| `ticket_number` | `string` | Unique, e.g. `BUG-001` |
| `heading` | `string(200)` | Required |
| `description` | `text` | Nullable |
| `priority` | `enum` | `urgent`, `medium`, `low` |
| `status_id` | `string` | FK → `bug_statuses.id` |
| `assignee_id` | `string` | Backstage `userEntityRef`, nullable |
| `reporter_id` | `string` | Backstage `userEntityRef`, required |
| `is_closed` | `boolean` | Default `false`; soft-delete flag |
| `created_at` | `timestamp` | Auto |
| `updated_at` | `timestamp` | Auto |

**`bug_statuses`**

| Column | Type | Notes |
|---|---|---|
| `id` | `string` (UUID) | PK |
| `label` | `string` | Display name |
| `color` | `string(7)` | Hex color, e.g. `#FF9800` |
| `order` | `integer` | Board column position (0–4) |

**`bug_comments`**

| Column | Type | Notes |
|---|---|---|
| `id` | `string` (UUID) | PK |
| `bug_id` | `string` | FK → `bugs.id` |
| `user_id` | `string` | Backstage `userEntityRef` |
| `comment_body` | `text` | Required |
| `parent_comment_id` | `string` | FK → `bug_comments.id`, nullable |
| `timestamp` | `timestamp` | Default `now()` |

---

## 5. Backend Plugin — Router & API

### 5.1 Plugin Registration

File: `plugins/bug-manager-backend/src/plugin.ts`

```typescript
import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { createRouter } from './router';

export const bugManagerPlugin = createBackendPlugin({
  pluginId: 'bug-manager',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        database:   coreServices.database,
        httpAuth:   coreServices.httpAuth,
        userInfo:   coreServices.userInfo,
      },
      async init({ httpRouter, database, httpAuth, userInfo }) {
        const router = await createRouter({ database, httpAuth, userInfo });
        httpRouter.use(router);
      },
    });
  },
});
```

### 5.2 Express Router

File: `plugins/bug-manager-backend/src/router.ts`

```typescript
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import type { DatabaseService, HttpAuthService, UserInfoService } from '@backstage/backend-plugin-api';
import { BugManagerStore } from './database/BugManagerStore';

interface RouterOptions {
  database: DatabaseService;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { database, httpAuth, userInfo } = options;
  const db = await database.getClient();
  const store = new BugManagerStore(db);

  const router = Router();
  router.use(express.json());

  // ── Helper: resolve the calling user's entity ref ──────────────────────────
  async function getCallerRef(req: Request): Promise<string> {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const info = await userInfo.getUserInfo(credentials);
    return info.userEntityRef;
  }

  // ── GET /bugs ──────────────────────────────────────────────────────────────
  // Query params: assignee (comma-separated refs), priority, status, search,
  //               includeClosed (boolean string)
  router.get('/bugs', async (req, res) => {
    const { assignee, priority, status, search, includeClosed } = req.query as Record<string, string>;
    const bugs = await store.getBugs({
      assigneeIds: assignee ? assignee.split(',') : undefined,
      priority: priority as any,
      statusId: status,
      search,
      includeClosed: includeClosed === 'true',
    });
    res.json(bugs);
  });

  // ── GET /bugs/:id ──────────────────────────────────────────────────────────
  router.get('/bugs/:id', async (req, res) => {
    const bug = await store.getBugById(req.params.id);
    if (!bug) return res.status(404).json({ error: 'Bug not found' });
    return res.json(bug);
  });

  // ── POST /bugs ─────────────────────────────────────────────────────────────
  router.post('/bugs', async (req, res) => {
    const reporterId = await getCallerRef(req);
    const { heading, description, assigneeId, statusId, priority } = req.body;

    if (!heading?.trim()) {
      return res.status(400).json({ error: 'heading is required' });
    }

    const activeStatusCount = await store.countStatuses();
    if (activeStatusCount === 0) {
      return res.status(400).json({ error: 'No statuses configured' });
    }

    const ticketNumber = await store.nextTicketNumber();
    const bug = await store.createBug({
      id: uuid(),
      ticketNumber,
      heading: heading.trim(),
      description: description ?? '',
      priority: priority ?? 'medium',
      statusId: statusId,
      assigneeId: assigneeId ?? null,
      reporterId,
      isClosed: false,
    });

    return res.status(201).json(bug);
  });

  // ── PATCH /bugs/:id ────────────────────────────────────────────────────────
  // Handles: status change, assignee change, heading/description edits, close
  router.patch('/bugs/:id', async (req, res) => {
    const existing = await store.getBugById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Bug not found' });

    const { heading, description, assigneeId, statusId, priority, isClosed } = req.body;
    const updated = await store.updateBug(req.params.id, {
      heading,
      description,
      assigneeId,
      statusId,
      priority,
      isClosed,
    });

    return res.json(updated);
  });

  // ── GET /statuses ──────────────────────────────────────────────────────────
  router.get('/statuses', async (_req, res) => {
    const statuses = await store.getStatuses();
    res.json(statuses);
  });

  // ── POST /statuses ─────────────────────────────────────────────────────────
  router.post('/statuses', async (req, res) => {
    const count = await store.countStatuses();
    if (count >= 5) {
      return res.status(409).json({ error: 'Maximum of 5 active statuses allowed' });
    }
    const { label, color, order } = req.body;
    const status = await store.createStatus({ id: uuid(), label, color, order });
    return res.status(201).json(status);
  });

  // ── PATCH /statuses/:id ────────────────────────────────────────────────────
  router.patch('/statuses/:id', async (req, res) => {
    const status = await store.updateStatus(req.params.id, req.body);
    if (!status) return res.status(404).json({ error: 'Status not found' });
    return res.json(status);
  });

  // ── DELETE /statuses/:id ───────────────────────────────────────────────────
  // Requires replacementStatusId in body; enforces min-5 constraint
  router.delete('/statuses/:id', async (req, res) => {
    const count = await store.countStatuses();
    if (count <= 5) {
      return res.status(409).json({
        error: 'Cannot delete: minimum of 5 statuses required. Add a replacement status first.',
      });
    }
    const { replacementStatusId } = req.body;
    if (!replacementStatusId) {
      return res.status(400).json({ error: 'replacementStatusId is required' });
    }
    await store.deleteStatus(req.params.id, replacementStatusId);
    return res.status(204).send();
  });

  // ── GET /bugs/:id/comments ─────────────────────────────────────────────────
  router.get('/bugs/:id/comments', async (req, res) => {
    const comments = await store.getComments(req.params.id);
    res.json(comments);
  });

  // ── POST /bugs/:id/comments ────────────────────────────────────────────────
  router.post('/bugs/:id/comments', async (req, res) => {
    const userId = await getCallerRef(req);
    const { commentBody, parentCommentId } = req.body;

    if (!commentBody?.trim()) {
      return res.status(400).json({ error: 'commentBody is required' });
    }

    const comment = await store.addComment({
      id: uuid(),
      bugId: req.params.id,
      userId,
      commentBody: commentBody.trim(),
      parentCommentId: parentCommentId ?? null,
    });

    return res.status(201).json(comment);
  });

  // ── GET /users ─────────────────────────────────────────────────────────────
  // Returns distinct assignee user refs (for the Assignee Bar)
  router.get('/users', async (_req, res) => {
    const users = await store.getDistinctAssignees();
    res.json(users);
  });

  return router;
}
```

### 5.3 Database Store

File: `plugins/bug-manager-backend/src/database/BugManagerStore.ts`

The store is the sole layer that issues SQL via Knex. Key method signatures:

```typescript
export class BugManagerStore {
  constructor(private readonly db: Knex) {}

  async getBugs(filters: BugQueryFilters): Promise<BugRow[]>;
  async getBugById(id: string): Promise<BugRow | undefined>;
  async createBug(data: NewBugRow): Promise<BugRow>;
  async updateBug(id: string, patch: Partial<BugRow>): Promise<BugRow>;

  async getStatuses(): Promise<StatusRow[]>;
  async countStatuses(): Promise<number>;
  async createStatus(data: StatusRow): Promise<StatusRow>;
  async updateStatus(id: string, patch: Partial<StatusRow>): Promise<StatusRow | undefined>;
  async deleteStatus(id: string, replacementId: string): Promise<void>;

  async getComments(bugId: string): Promise<CommentRow[]>;
  async addComment(data: NewCommentRow): Promise<CommentRow>;

  async nextTicketNumber(): Promise<string>;
  async getDistinctAssignees(): Promise<string[]>; // returns userEntityRefs
}
```

The `deleteStatus` method runs in a transaction:
1. `UPDATE bugs SET status_id = :replacementId WHERE status_id = :id AND is_closed = false`
2. `DELETE FROM bug_statuses WHERE id = :id`

---

## 6. Frontend — API Client

Replace `LocalStorageClient` with `BackendClient` that calls the backend via `FetchApi`.

File: `plugins/bug-manager/src/api/BackendClient.ts`

```typescript
import { createApiRef, DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { BugManagerApi } from './BugManagerApi';

export class BackendClient implements BugManagerApi {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('bug-manager');
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}${path}`, init);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed: ${res.status}`);
    }
    return res.json();
  }

  async getBugs(filters?: BugFilters): Promise<Bug[]> {
    const params = new URLSearchParams();
    if (filters?.assignee)          params.set('assignee', filters.assignee);
    if (filters?.assignees?.length) params.set('assignee', filters.assignees.join(','));
    if (filters?.priority)          params.set('priority', filters.priority);
    if (filters?.status)            params.set('status', filters.status);
    if (filters?.search)            params.set('search', filters.search);
    if (filters?.includeClosed)     params.set('includeClosed', 'true');
    const qs = params.toString();
    return this.fetch<Bug[]>(`/bugs${qs ? `?${qs}` : ''}`);
  }

  async createBug(bug: CreateBugRequest): Promise<Bug> {
    return this.fetch<Bug>('/bugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bug),
    });
  }

  async updateBug(id: string, updates: UpdateBugRequest): Promise<Bug> {
    return this.fetch<Bug>(`/bugs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async closeBug(id: string): Promise<Bug> {
    return this.fetch<Bug>(`/bugs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isClosed: true }),
    });
  }

  // deleteBug is removed — use closeBug instead

  async getStatuses(): Promise<Status[]> {
    return this.fetch<Status[]>('/statuses');
  }

  async getComments(bugId: string): Promise<Comment[]> {
    return this.fetch<Comment[]>(`/bugs/${bugId}/comments`);
  }

  async addComment(bugId: string, commentBody: string, parentCommentId?: string): Promise<Comment> {
    return this.fetch<Comment>(`/bugs/${bugId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentBody, parentCommentId }),
    });
  }

  async getDistinctAssignees(): Promise<User[]> {
    return this.fetch<User[]>('/users');
  }
}
```

Register `BackendClient` in `plugin.ts` via `createApiFactory`:

```typescript
createApiFactory({
  api: bugManagerApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
  },
  factory: ({ discoveryApi, fetchApi }) =>
    new BackendClient(discoveryApi, fetchApi),
})
```

---

## 7. Authentication & Identity Integration

### 7.1 Auto-populate Reporter

On bug creation, the reporter is never sent by the client. The backend extracts it from the authenticated request:

```typescript
// router.ts — POST /bugs
const reporterId = await getCallerRef(req); // from httpAuth + userInfo services
```

### 7.2 Authenticated Comments

Comments are authored server-side. The `user_id` column in `bug_comments` is set by the backend from the token, not trusted from the request body.

### 7.3 Displaying User Profiles in the Frontend

The frontend resolves display names and avatar URLs from the Backstage Catalog using `catalogApiRef`:

```typescript
// hooks/useUserProfile.ts
import { useApi, catalogApiRef } from '@backstage/core-plugin-api';

export function useUserProfile(entityRef: string | null) {
  const catalogApi = useApi(catalogApiRef);
  return useAsync(async () => {
    if (!entityRef) return null;
    const entity = await catalogApi.getEntityByRef(entityRef);
    return {
      displayName: entity?.spec?.profile?.displayName ?? entityRef,
      avatarUrl: entity?.spec?.profile?.picture ?? undefined,
    };
  }, [entityRef]);
}
```

### 7.4 Current User Context

```typescript
// hooks/useCurrentUser.ts
import { useApi, identityApiRef } from '@backstage/core-plugin-api';

export function useCurrentUser() {
  const identityApi = useApi(identityApiRef);
  return useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const profile  = await identityApi.getProfileInfo();
    return {
      userEntityRef: identity.userEntityRef,
      displayName:   profile.displayName ?? identity.userEntityRef,
      email:         profile.email,
      picture:       profile.picture,
    };
  }, []);
}
```

This is consumed in `CreateBugDialog` (to show "Reporting as: ..."), `CommentSection` (to pre-fill the avatar in the comment input), and `BugMetadataSidebar`.

### 7.5 Admin Role Check

Admin-only actions (status management) check Backstage permissions via the `usePermission` hook:

```typescript
import { usePermission } from '@backstage/plugin-permission-react';
import { bugManagerAdminPermission } from '@internal/plugin-bug-manager-common';

const { allowed: isAdmin } = usePermission({ permission: bugManagerAdminPermission });
```

For teams without the permission framework configured, fall back to checking group membership via the catalog.

---

## 8. New UI Components

### 8.1 AssigneeBar (Multi-select Avatar Filter)

File: `plugins/bug-manager/src/components/AssigneeBar/AssigneeBar.tsx`

**Placement:** Rendered between the Toolbar and the List/Board content area.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Filter by assignee:                                             │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                           │
│  │ JD  │  │ JS  │  │ AM  │  │ CB  │   (+ 3 more)              │
│  └─────┘  └─────┘  └─────┘  └─────┘                           │
│  (selected: highlighted border)                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Interaction:**
- Clicking an avatar **toggles** that user in/out of the active filter set.
- If no avatars are selected, all bugs are shown (no filter applied).
- If one or more are selected, only bugs assigned to those users are shown.
- Selected avatars render with a `2px solid` border in the Backstage theme primary color.

**Component Sketch:**

```typescript
interface AssigneeBarProps {
  assignees: User[];
  selectedIds: string[];
  onToggle: (userId: string) => void;
}

export function AssigneeBar({ assignees, selectedIds, onToggle }: AssigneeBarProps) {
  return (
    <Box display="flex" alignItems="center" gap={1} px={2} py={1}>
      <Typography variant="caption" color="textSecondary">Filter by assignee:</Typography>
      {assignees.map(user => {
        const isSelected = selectedIds.includes(user.id);
        return (
          <Tooltip key={user.id} title={user.displayName}>
            <Avatar
              src={user.avatarUrl}
              onClick={() => onToggle(user.id)}
              style={{
                cursor: 'pointer',
                border: isSelected ? `2px solid ${theme.palette.primary.main}` : '2px solid transparent',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
            >
              {user.displayName.slice(0, 2).toUpperCase()}
            </Avatar>
          </Tooltip>
        );
      })}
    </Box>
  );
}
```

**Filter state** lives in `BugManagerProvider` as `selectedAssigneeIds: string[]`. The `BugFilters` type gains an `assignees?: string[]` field (multi-value, sent to the backend as `?assignee=ref1,ref2`).

### 8.2 Updated CommentSection

Comments now show:
- Real Backstage profile picture (resolved via `useUserProfile`).
- Relative timestamp using `date-fns/formatDistanceToNow` (e.g. "2 hours ago"), with the absolute time in a `<Tooltip>`.
- The comment input shows the current user's avatar on the left.

```
┌──────────────────────────────────────────────────┐
│ 👤 Jane Doe · 2 hours ago                        │
│ Reproduced on Safari 17.2. Working on a fix.     │
├──────────────────────────────────────────────────┤
│ 👤 John Smith · 1 day ago                        │
│ This is blocking the v2.0 release.               │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│ 👤 [your avatar] Add a comment...           [→]  │
└──────────────────────────────────────────────────┘
```

### 8.3 BugDetailModal — Close Button

The **Delete** button is removed. In its place, the metadata sidebar shows a **"Close Ticket"** button (only visible when `isClosed === false`):

```
┌──────────────────────────────────┐
│  [Archive icon] Close Ticket     │  ← outlined danger button
└──────────────────────────────────┘
```

On click → confirmation dialog → calls `closeBug(id)` → modal closes → bug disappears from default view.

A closed bug can be **re-opened** via `PATCH /bugs/:id` with `{ isClosed: false }`. Admins see a "Re-open" button in the modal when viewing a closed bug (only visible if `includeClosed` toggle is on).

---

## 9. Lifecycle Management (Soft Delete)

### 9.1 Rules

- **No hard deletes.** The `DELETE` method is not exposed on the `/bugs` resource.
- Closing a bug sets `is_closed = true` and `updated_at = now()`.
- `GET /bugs` excludes closed bugs by default (`WHERE is_closed = false`).
- Passing `?includeClosed=true` returns all bugs (active + closed).

### 9.2 "Include Closed" Toggle

A small toggle is added to the Toolbar (right-aligned):

```
[☐ Include closed tickets]
```

When enabled, the frontend appends `includeClosed=true` to all bug fetch calls. Closed bugs render with a muted appearance (e.g., `opacity: 0.6`, strikethrough ticket number) to distinguish them visually.

### 9.3 API Changes

| v1 Endpoint | v2 Change |
|---|---|
| `DELETE /bugs/:id` | **Removed** |
| `PATCH /bugs/:id` | Now accepts `{ isClosed: true }` to close a ticket |
| `GET /bugs` | Now filters `is_closed = false` by default; accepts `?includeClosed=true` |

---

## 10. Advanced Filtering — Assignee Bar

### 10.1 Filter State Shape

```typescript
// Updated BugFilters in src/api/types.ts
export interface BugFilters {
  status?: string;
  priority?: Priority;
  assignee?: string;           // kept for single-value compat
  assignees?: string[];        // NEW: multi-select assignee filter
  search?: string;
  includeClosed?: boolean;     // NEW: show closed bugs
}
```

### 10.2 Context Changes

```typescript
// BugManagerContextValue additions
selectedAssigneeIds: string[];
setSelectedAssigneeIds: (ids: string[]) => void;
toggleAssignee: (id: string) => void;    // adds or removes from selectedAssigneeIds
includeClosed: boolean;
setIncludeClosed: (v: boolean) => void;
```

### 10.3 Data Flow

```
User clicks avatar in AssigneeBar
  → toggleAssignee(userId) in context
  → selectedAssigneeIds updates
  → useAsync re-fetch fires with assignees param
  → BackendClient.getBugs({ assignees: [...] })
  → GET /bugs?assignee=ref1,ref2
  → Backend WHERE assignee_id IN (...) query
  → List/Board re-renders with filtered bugs
```

---

## 11. Updated State Management

### 11.1 useAsync-based Fetching

Replace `useEffect` + manual state with `@backstage/core-components`'s `useAsync`:

```typescript
// In BugManagerProvider (simplified)
const { value: bugs, loading, error } = useAsync(
  () => api.getBugs({
    ...filters,
    assignees: selectedAssigneeIds.length ? selectedAssigneeIds : undefined,
    includeClosed,
  }),
  [filters, selectedAssigneeIds, includeClosed],
);
```

This ensures the bug list re-fetches automatically when any filter changes.

### 11.2 Optimistic Updates for Board Drag-Drop

When a user drags a card to a new column:
1. Immediately update local `bugs` state (optimistic).
2. Issue `PATCH /bugs/:id { statusId: newStatusId }` in the background.
3. On failure: roll back the local state and show an error snackbar.

This prevents UI jank from the network round-trip while keeping the backend as the source of truth.

### 11.3 Concurrency Handling

Since multiple users can move the same card simultaneously:
- The backend always wins. `updated_at` is returned in `PATCH` responses.
- Frontend polls (or re-fetches on window focus) to pick up remote changes.
- Conflict display: if an optimistic update is followed by a poll that shows a different state, silently reconcile to the server value (no user notification needed for drag-drop conflicts — the server state is shown on next fetch).

---

## 12. Updated Data Schema (TypeScript)

File: `plugins/bug-manager/src/api/types.ts`

```typescript
export type Priority = 'urgent' | 'medium' | 'low';

export interface User {
  id: string;           // Backstage userEntityRef, e.g. "user:default/jane.doe"
  displayName: string;
  avatarUrl?: string;
}

export interface Status {
  id: string;
  name: string;         // mapped from DB "label"
  order: number;
  color?: string;
}

export interface Comment {
  id: string;
  author: User;
  content: string;      // mapped from DB "comment_body"
  createdAt: string;    // ISO 8601, mapped from DB "timestamp"
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
  isClosed: boolean;    // NEW in v2
  createdAt: string;
  updatedAt: string;
}

export interface BugFilters {
  status?: string;
  priority?: Priority;
  assignee?: string;
  assignees?: string[];        // NEW: multi-select
  search?: string;
  includeClosed?: boolean;     // NEW
}

export interface CreateBugRequest {
  heading: string;
  description?: string;
  assigneeId?: string;
  statusId: string;
  priority: Priority;
  // reporterId is set server-side; omit from client payload
}

export interface UpdateBugRequest {
  heading?: string;
  description?: string;
  assigneeId?: string | null;
  statusId?: string;
  priority?: Priority;
  isClosed?: boolean;          // NEW: for close/re-open
}
```

---

## 13. Directory Structure

```
plugins/
├── bug-manager/                                 ← Frontend (largely unchanged structure)
│   └── src/
│       ├── api/
│       │   ├── types.ts                         ← Updated with isClosed, assignees[]
│       │   ├── BugManagerApi.ts                 ← Adds closeBug(), removes deleteBug()
│       │   ├── BackendClient.ts                 ← NEW: replaces LocalStorageClient
│       │   └── LocalStorageClient.ts            ← DEPRECATED (kept for local dev only)
│       │
│       ├── context/
│       │   ├── BugManagerProvider.tsx           ← Updated: useAsync, assignee filter state
│       │   └── useBugManagerContext.ts
│       │
│       ├── hooks/
│       │   ├── useComments.ts                   ← Updated: real API, auth user avatar
│       │   ├── useCurrentUser.ts                ← NEW: IdentityApi wrapper
│       │   └── useUserProfile.ts                ← NEW: catalog entity → display name + picture
│       │
│       └── components/
│           ├── AssigneeBar/
│           │   └── AssigneeBar.tsx              ← NEW: multi-select avatar filter bar
│           │
│           ├── BugManagerPage/
│           │   ├── BugManagerPage.tsx           ← Adds AssigneeBar below Toolbar
│           │   └── Toolbar.tsx                  ← Adds "Include Closed" toggle
│           │
│           ├── BugDetailModal/
│           │   ├── BugDetailModal.tsx           ← Delete button → Close Ticket button
│           │   ├── BugMetadataSidebar.tsx       ← Close/Re-open action
│           │   └── CommentSection.tsx           ← Real avatars, relative timestamps
│           │
│           └── shared/
│               └── UserAvatar.tsx               ← Updated: resolves from catalog
│
└── bug-manager-backend/                         ← NEW: Backend plugin
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── plugin.ts                            ← createBackendPlugin()
    │   ├── router.ts                            ← Express router (all endpoints)
    │   ├── types.ts                             ← Backend-internal row types
    │   └── database/
    │       ├── BugManagerStore.ts               ← Knex data access layer
    │       └── migrations/
    │           └── 20260225_01_initial.ts       ← Schema + seed data
    └── catalog-info.yaml
```

---

## 14. Constraints & Standards

| Constraint | Detail |
|---|---|
| **UI library** | Material UI v5 + `@backstage/core-components`. No custom CSS frameworks. |
| **Status count** | Enforced at API level: `POST /statuses` returns `409` when `count >= 5`. `DELETE /statuses/:id` returns `409` when `count <= 5`. |
| **No hard deletes** | `DELETE /bugs/:id` does not exist. Bug removal is exclusively via `PATCH { isClosed: true }`. |
| **Auth on writes** | Every `POST` and `PATCH` endpoint calls `httpAuth.credentials()`. Unauthenticated requests receive `401`. |
| **Reporter immutability** | `reporter_id` is set on `INSERT` and never updated by `PATCH`. |
| **Knex client** | Use only the Backstage-provided Knex instance from `DatabaseService`; do not create an independent connection. |
| **Concurrency** | No row-level locking. Board drag-drop uses optimistic UI with server reconciliation on next poll. |

---

## 15. Migration from v1

### 15.1 Data Migration

v1 data lives in `localStorage` under keys `bug-manager:bugs`, `bug-manager:statuses`, and `bug-manager:comments:{bugId}`.

A one-time **seed script** (`scripts/migrate-localstorage-to-db.ts`) can be provided for teams that want to preserve prototype data:
1. Export data from `localStorage` as JSON.
2. Run the script against the new backend to `POST` each bug, status, and comment.

For most teams, starting fresh with the seeded default statuses is recommended.

### 15.2 API Interface Changes

| v1 Method | v2 Change |
|---|---|
| `deleteBug(id)` | Removed. Use `closeBug(id)` (maps to `PATCH { isClosed: true }`). |
| `addComment(bugId, content)` | Backend now ignores any `userId` from the body; uses the auth token instead. |
| `getBugs(filters)` | `filters.assignees: string[]` added for multi-select; `filters.includeClosed: boolean` added. |

---

## 16. Success Criteria

### Backend

- [ ] `bug-manager-backend` plugin registers in the Backstage backend and runs migrations on startup.
- [ ] `GET /bugs` returns only open (`is_closed = false`) bugs by default; returns all with `?includeClosed=true`.
- [ ] `POST /bugs` sets `reporter_id` from the authenticated token, not from the request body.
- [ ] `PATCH /bugs/:id { isClosed: true }` closes a bug; the bug is hidden from default list/board.
- [ ] `POST /statuses` returns `409 Conflict` when 5 statuses already exist.
- [ ] `DELETE /statuses/:id` returns `409 Conflict` when only 5 statuses exist.
- [ ] `POST /bugs/:id/comments` sets `user_id` from the authenticated token.
- [ ] All write endpoints return `401` for unauthenticated requests.

### Frontend

- [ ] `BackendClient` is registered via `createApiFactory` and used by default in production.
- [ ] Bug list and board re-fetch automatically when filters change (via `useAsync`).
- [ ] The **AssigneeBar** appears above the list/board; clicking avatars toggles the multi-select filter.
- [ ] Selected assignee avatars render with a highlighted border in the Backstage primary color.
- [ ] The **"Close Ticket"** button in the detail modal closes the bug; the bug disappears from the active view.
- [ ] The **"Delete"** button is fully removed from all UI surfaces.
- [ ] Comments display the author's real Backstage profile picture and a relative timestamp.
- [ ] Creating a bug shows "Reporting as: [current user name]" and sets the reporter server-side.
- [ ] The **"Include Closed"** toolbar toggle reveals closed bugs with a muted visual style.
- [ ] Board drag-drop issues `PATCH /bugs/:id` and applies optimistic updates with rollback on failure.
