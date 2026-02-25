# v2 Phase 2: Core API Endpoints

**Goal:** All five REST resource groups fully implemented in the Express router — bugs, statuses, comments, and users — with server-enforced constraints, proper error responses, and a complete `BugManagerStore` database layer.

**Depends on:** Phase 1 (backend plugin scaffolded, schema migrated, store stub in place)

---

## What this phase delivers

- `GET /bugs` with query-param filtering (assignee, priority, status, search, includeClosed)
- `GET /bugs/:id` — single bug fetch
- `POST /bugs` — create bug (reporter set server-side in Phase 4; placeholder for now)
- `PATCH /bugs/:id` — update any mutable field (status, assignee, heading, description, isClosed)
- `GET /statuses` — all statuses ordered by `order`
- `POST /statuses` — create with 5-status max enforcement
- `PATCH /statuses/:id` — rename, recolor, reorder
- `DELETE /statuses/:id` — delete with reassignment, min-5 enforcement
- `GET /bugs/:id/comments` — fetch comments for a bug
- `POST /bugs/:id/comments` — add a comment (author set from request body in this phase; locked to auth token in Phase 4)
- `GET /users` — distinct assignee refs currently assigned to open bugs
- Full `BugManagerStore` method implementations replacing all Phase 1 stubs
- Consistent error response shape: `{ error: string }`

---

## Technical design

### Error handling middleware

Add a global error handler at the bottom of `router.ts` so all thrown errors return a consistent JSON shape:

```typescript
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err.message, err);
  res.status(500).json({ error: err.message });
});
```

Use a small helper for 4xx errors to keep route handlers clean:

```typescript
function notFound(res: Response, entity: string) {
  return res.status(404).json({ error: `${entity} not found` });
}

function badRequest(res: Response, message: string) {
  return res.status(400).json({ error: message });
}

function conflict(res: Response, message: string) {
  return res.status(409).json({ error: message });
}
```

### BugManagerStore — full implementation

**`src/database/BugManagerStore.ts`** — replace all stubs with real Knex queries.

#### `nextTicketNumber()`

```typescript
async nextTicketNumber(): Promise<string> {
  const row = await this.db('bugs')
    .max('ticket_number as max')
    .first();
  const max: string | null = row?.max ?? null;
  if (!max) return 'BUG-001';
  const num = parseInt(max.replace('BUG-', ''), 10);
  return `BUG-${String(num + 1).padStart(3, '0')}`;
}
```

#### `getBugs(filters)`

```typescript
async getBugs(filters: BugQueryFilters): Promise<BugRow[]> {
  let query = this.db<BugRow>('bugs');

  if (!filters.includeClosed) {
    query = query.where('is_closed', false);
  }
  if (filters.statusId) {
    query = query.where('status_id', filters.statusId);
  }
  if (filters.priority) {
    query = query.where('priority', filters.priority);
  }
  if (filters.assigneeIds?.length) {
    query = query.whereIn('assignee_id', filters.assigneeIds);
  }
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    query = query.where(builder =>
      builder
        .whereRaw('LOWER(heading) LIKE ?', [term])
        .orWhereRaw('LOWER(ticket_number) LIKE ?', [term]),
    );
  }

  return query.orderBy('ticket_number', 'desc');
}
```

#### `getBugById(id)`

```typescript
async getBugById(id: string): Promise<BugRow | undefined> {
  return this.db<BugRow>('bugs').where({ id }).first();
}
```

#### `createBug(data)`

```typescript
async createBug(data: NewBugRow): Promise<BugRow> {
  const now = new Date().toISOString();
  const row: BugRow = { ...data, created_at: now, updated_at: now };
  await this.db<BugRow>('bugs').insert(row);
  return row;
}
```

#### `updateBug(id, patch)`

```typescript
async updateBug(
  id: string,
  patch: Partial<Omit<BugRow, 'id' | 'ticket_number' | 'reporter_id' | 'created_at'>>,
): Promise<BugRow> {
  const updated_at = new Date().toISOString();
  await this.db<BugRow>('bugs').where({ id }).update({ ...patch, updated_at });
  const updated = await this.db<BugRow>('bugs').where({ id }).first();
  if (!updated) throw new Error(`Bug ${id} not found after update`);
  return updated;
}
```

#### `getComments(bugId)`

```typescript
async getComments(bugId: string): Promise<CommentRow[]> {
  return this.db<CommentRow>('bug_comments')
    .where({ bug_id: bugId })
    .orderBy('timestamp', 'asc');
}
```

#### `addComment(data)`

```typescript
async addComment(data: NewCommentRow): Promise<CommentRow> {
  const now = new Date().toISOString();
  const row: CommentRow = { ...data, timestamp: now };
  await this.db<CommentRow>('bug_comments').insert(row);
  return row;
}
```

#### `getDistinctAssignees()`

```typescript
async getDistinctAssignees(): Promise<string[]> {
  const rows = await this.db('bugs')
    .distinct('assignee_id')
    .whereNotNull('assignee_id')
    .where('is_closed', false);
  return rows.map((r: { assignee_id: string }) => r.assignee_id);
}
```

### Full router

**`src/router.ts`** — complete replacement of the Phase 1 stub.

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { v4 as uuid } from 'uuid';
import type {
  DatabaseService,
  HttpAuthService,
  UserInfoService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { BugManagerStore } from './database/BugManagerStore';

export interface RouterOptions {
  database: DatabaseService;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  logger: LoggerService;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { database, logger } = options;
  const store = await BugManagerStore.create(() => database.getClient());

  const router = Router();
  router.use(express.json());

  // ── Health ────────────────────────────────────────────────────────────────

  router.get('/healthz', async (_req, res) => {
    await store.getStatuses();
    res.json({ status: 'ok' });
  });

  // ── Bugs ──────────────────────────────────────────────────────────────────

  router.get('/bugs', async (req, res) => {
    const { assignee, priority, status, search, includeClosed } =
      req.query as Record<string, string>;
    const bugs = await store.getBugs({
      assigneeIds: assignee ? assignee.split(',') : undefined,
      priority: priority as any,
      statusId: status,
      search,
      includeClosed: includeClosed === 'true',
    });
    res.json(bugs);
  });

  router.get('/bugs/:id', async (req, res) => {
    const bug = await store.getBugById(req.params.id);
    if (!bug) return notFound(res, 'Bug');
    return res.json(bug);
  });

  router.post('/bugs', async (req, res) => {
    const { heading, description, assigneeId, statusId, priority, reporterId } = req.body;

    if (!heading?.trim()) return badRequest(res, 'heading is required');
    if (!statusId)        return badRequest(res, 'statusId is required');
    if (!reporterId)      return badRequest(res, 'reporterId is required');
    // NOTE: Phase 4 removes the reporterId from req.body and reads it from the auth token instead

    const statusExists = await store.getStatuses().then(ss => ss.some(s => s.id === statusId));
    if (!statusExists) return badRequest(res, `Status ${statusId} does not exist`);

    const ticketNumber = await store.nextTicketNumber();
    const bug = await store.createBug({
      id: uuid(),
      ticket_number: ticketNumber,
      heading: heading.trim(),
      description: description ?? '',
      priority: priority ?? 'medium',
      status_id: statusId,
      assignee_id: assigneeId ?? null,
      reporter_id: reporterId,
      is_closed: false,
    });
    return res.status(201).json(bug);
  });

  router.patch('/bugs/:id', async (req, res) => {
    const existing = await store.getBugById(req.params.id);
    if (!existing) return notFound(res, 'Bug');

    const { heading, description, assigneeId, statusId, priority, isClosed } = req.body;
    const patch: Record<string, any> = {};
    if (heading     !== undefined) patch.heading      = heading.trim();
    if (description !== undefined) patch.description  = description;
    if (assigneeId  !== undefined) patch.assignee_id  = assigneeId;
    if (statusId    !== undefined) patch.status_id    = statusId;
    if (priority    !== undefined) patch.priority     = priority;
    if (isClosed    !== undefined) patch.is_closed    = isClosed;

    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'No fields to update');
    }

    const updated = await store.updateBug(req.params.id, patch);
    return res.json(updated);
  });

  // ── Statuses ──────────────────────────────────────────────────────────────

  router.get('/statuses', async (_req, res) => {
    const statuses = await store.getStatuses();
    res.json(statuses);
  });

  router.post('/statuses', async (req, res) => {
    const count = await store.countStatuses();
    if (count >= 5) {
      return conflict(res, 'Maximum of 5 active statuses allowed');
    }
    const { label, color, order } = req.body;
    if (!label?.trim()) return badRequest(res, 'label is required');

    const status = await store.createStatus({
      id: uuid(),
      label: label.trim(),
      color: color ?? '#9E9E9E',
      order: order ?? count,
    });
    return res.status(201).json(status);
  });

  router.patch('/statuses/:id', async (req, res) => {
    const { label, color, order } = req.body;
    const patch: Record<string, any> = {};
    if (label !== undefined) patch.label = label.trim();
    if (color !== undefined) patch.color = color;
    if (order !== undefined) patch.order = order;

    const status = await store.updateStatus(req.params.id, patch);
    if (!status) return notFound(res, 'Status');
    return res.json(status);
  });

  router.delete('/statuses/:id', async (req, res) => {
    const count = await store.countStatuses();
    if (count <= 5) {
      return conflict(
        res,
        'Cannot delete: minimum of 5 statuses required. Add a replacement status first.',
      );
    }
    const { replacementStatusId } = req.body;
    if (!replacementStatusId) {
      return badRequest(res, 'replacementStatusId is required');
    }
    await store.deleteStatus(req.params.id, replacementStatusId);
    return res.status(204).send();
  });

  // ── Comments ──────────────────────────────────────────────────────────────

  router.get('/bugs/:id/comments', async (req, res) => {
    const bug = await store.getBugById(req.params.id);
    if (!bug) return notFound(res, 'Bug');
    const comments = await store.getComments(req.params.id);
    res.json(comments);
  });

  router.post('/bugs/:id/comments', async (req, res) => {
    const bug = await store.getBugById(req.params.id);
    if (!bug) return notFound(res, 'Bug');

    const { commentBody, userId, parentCommentId } = req.body;
    if (!commentBody?.trim()) return badRequest(res, 'commentBody is required');
    if (!userId)              return badRequest(res, 'userId is required');
    // NOTE: Phase 4 removes userId from req.body and reads it from the auth token instead

    const comment = await store.addComment({
      id: uuid(),
      bug_id: req.params.id,
      user_id: userId,
      comment_body: commentBody.trim(),
      parent_comment_id: parentCommentId ?? null,
    });
    return res.status(201).json(comment);
  });

  // ── Users ─────────────────────────────────────────────────────────────────

  router.get('/users', async (_req, res) => {
    const refs = await store.getDistinctAssignees();
    // Return the raw refs in this phase; Phase 4 enriches with display names + avatars
    res.json(refs.map(ref => ({ id: ref, displayName: ref, avatarUrl: undefined })));
  });

  // ── Global error handler ──────────────────────────────────────────────────

  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err.message, err);
    res.status(500).json({ error: err.message });
  });

  return router;
}

// ── Response helpers ──────────────────────────────────────────────────────────

function notFound(res: Response, entity: string) {
  return res.status(404).json({ error: `${entity} not found` });
}

function badRequest(res: Response, message: string) {
  return res.status(400).json({ error: message });
}

function conflict(res: Response, message: string) {
  return res.status(409).json({ error: message });
}
```

---

## API contract reference

| Method | Path | Request body | Success | Error cases |
|---|---|---|---|---|
| `GET` | `/bugs` | — | `200 BugRow[]` | — |
| `GET` | `/bugs/:id` | — | `200 BugRow` | `404` |
| `POST` | `/bugs` | `{ heading, description?, assigneeId?, statusId, priority?, reporterId }` | `201 BugRow` | `400` |
| `PATCH` | `/bugs/:id` | any subset of mutable fields | `200 BugRow` | `400`, `404` |
| `GET` | `/statuses` | — | `200 StatusRow[]` | — |
| `POST` | `/statuses` | `{ label, color?, order? }` | `201 StatusRow` | `400`, `409` |
| `PATCH` | `/statuses/:id` | `{ label?, color?, order? }` | `200 StatusRow` | `404` |
| `DELETE` | `/statuses/:id` | `{ replacementStatusId }` | `204` | `400`, `409` |
| `GET` | `/bugs/:id/comments` | — | `200 CommentRow[]` | `404` |
| `POST` | `/bugs/:id/comments` | `{ commentBody, userId, parentCommentId? }` | `201 CommentRow` | `400`, `404` |
| `GET` | `/users` | — | `200 { id, displayName, avatarUrl }[]` | — |

**Note on `reporter_id` and `user_id`:** In this phase they are accepted from the request body. Phase 4 removes them from the body and derives them from the Backstage auth token — these fields are marked in the router comments.

---

## Steps

### 2.1 Implement full BugManagerStore

Replace all Phase 1 stubs with real Knex queries. Implement `getBugs`, `getBugById`, `createBug`, `updateBug`, `nextTicketNumber`, `getComments`, `addComment`, `getDistinctAssignees`.

### 2.2 Add response helpers to router

Add `notFound`, `badRequest`, `conflict` helper functions and the global error handler middleware.

### 2.3 Implement bug endpoints

Add `GET /bugs`, `GET /bugs/:id`, `POST /bugs`, `PATCH /bugs/:id` to the router.

### 2.4 Implement status endpoints

Add `GET /statuses`, `POST /statuses` (with 5-count guard), `PATCH /statuses/:id`, `DELETE /statuses/:id` (with reassignment and min-5 guard).

### 2.5 Implement comment endpoints

Add `GET /bugs/:id/comments` and `POST /bugs/:id/comments`.

### 2.6 Implement users endpoint

Add `GET /users` returning distinct assignee refs from open bugs.

### 2.7 Verify with curl / REST client

```bash
# Fetch statuses (should return 5 seeded rows)
curl http://localhost:7007/api/bug-manager/statuses

# Create a bug
curl -X POST http://localhost:7007/api/bug-manager/bugs \
  -H "Content-Type: application/json" \
  -d '{"heading":"Test bug","statusId":"status-open","priority":"medium","reporterId":"user:default/jane"}'
# → 201 with ticket_number: "BUG-001"

# Fetch bugs
curl http://localhost:7007/api/bug-manager/bugs
# → array with 1 bug

# Update bug status
curl -X PATCH http://localhost:7007/api/bug-manager/bugs/BUG-001-ID \
  -H "Content-Type: application/json" \
  -d '{"statusId":"status-in-progress"}'

# Close a bug
curl -X PATCH http://localhost:7007/api/bug-manager/bugs/BUG-001-ID \
  -H "Content-Type: application/json" \
  -d '{"isClosed":true}'

# Confirm closed bug hidden by default
curl http://localhost:7007/api/bug-manager/bugs
# → empty array

# Confirm visible with includeClosed
curl "http://localhost:7007/api/bug-manager/bugs?includeClosed=true"
# → array with the closed bug

# Try to create a 6th status
curl -X POST http://localhost:7007/api/bug-manager/statuses \
  -H "Content-Type: application/json" \
  -d '{"label":"Extra","color":"#000"}'
# → 409 Conflict

# Add a comment
curl -X POST "http://localhost:7007/api/bug-manager/bugs/{id}/comments" \
  -H "Content-Type: application/json" \
  -d '{"commentBody":"Reproduced on Safari","userId":"user:default/jane"}'
```

---

## What comes out of this phase

A fully functional REST API. Every resource can be created, read, updated, and closed from any HTTP client. The 5-status constraint is enforced server-side. The frontend can be pointed at this backend immediately in Phase 3 without any further backend changes (Phase 4 tightens auth; the shape of responses does not change).

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `nextTicketNumber` race condition under concurrent creates | Two bugs get the same ticket number | The `UNIQUE` constraint on `ticket_number` will reject the second insert; retry logic can be added in Phase 7 |
| `LOWER()` SQL function differs between SQLite (test) and PostgreSQL (prod) | Tests pass but prod fails | Use a single database for integration tests (`@backstage/backend-test-utils` provides a Postgres container) |
| `DELETE /statuses/:id` min-5 check uses `count <= 5` which allows deletion when count is exactly 5 | Could drop to 4 statuses | Correct: constraint is `count <= 5` blocks delete, so only when count > 5 is delete allowed — this is the intended "add one before deleting" flow |
| `GET /users` returns raw entity refs without display names | Frontend shows ugly refs | Acceptable for Phase 2; Phase 4 enriches via the Backstage catalog |
