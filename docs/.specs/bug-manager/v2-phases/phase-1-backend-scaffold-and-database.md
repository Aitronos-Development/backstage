# v2 Phase 1: Backend Plugin Scaffold & Database Schema

**Goal:** A fully registered Backstage backend plugin with a PostgreSQL schema (via Knex migrations), a seeded status table, and a working database store class — the foundation every subsequent backend phase builds on.

**Depends on:** Existing Backstage backend (`packages/backend`) running with a PostgreSQL `DatabaseService` configured.

---

## What this phase delivers

- A new backend plugin at `plugins/bug-manager-backend/` using `createBackendPlugin()`
- Knex migration file creating the `bugs`, `bug_statuses`, and `bug_comments` tables with all constraints and foreign keys
- Default status seed data inserted by the migration
- `BugManagerStore` class with all database method signatures stubbed and implemented for statuses
- Plugin registered in `packages/backend/src/index.ts`
- An empty Express router that mounts and returns `200 OK` on `GET /healthz` — confirms the plugin is live

---

## Technical design

### Plugin package structure

```
plugins/bug-manager-backend/
├── package.json
├── tsconfig.json
├── catalog-info.yaml
└── src/
    ├── index.ts
    ├── plugin.ts
    ├── router.ts
    ├── types.ts
    └── database/
        ├── BugManagerStore.ts
        └── migrations/
            └── 20260225_01_initial.ts
```

### `package.json` dependencies

```json
{
  "name": "@internal/plugin-bug-manager-backend",
  "version": "0.1.0",
  "dependencies": {
    "@backstage/backend-plugin-api": "*",
    "@backstage/backend-common": "*",
    "express": "^4.18.0",
    "uuid": "^9.0.0",
    "knex": "*"
  },
  "devDependencies": {
    "@backstage/backend-test-utils": "*",
    "typescript": "*"
  }
}
```

### Plugin registration

**`src/plugin.ts`**

```typescript
import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
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
        logger:     coreServices.logger,
      },
      async init({ httpRouter, database, httpAuth, userInfo, logger }) {
        const router = await createRouter({
          database,
          httpAuth,
          userInfo,
          logger,
        });
        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/healthz',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
```

**`src/index.ts`**

```typescript
export { bugManagerPlugin as default } from './plugin';
```

**`packages/backend/src/index.ts`** — add the plugin:

```typescript
backend.add(import('@internal/plugin-bug-manager-backend'));
```

### Knex migration

**`src/database/migrations/20260225_01_initial.ts`**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('bug_statuses', table => {
    table.string('id').primary();
    table.string('label').notNullable();
    table.string('color', 7).notNullable().defaultTo('#9E9E9E');
    table.integer('order').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('bugs', table => {
    table.string('id').primary();
    table.string('ticket_number').notNullable().unique();
    table.string('heading', 200).notNullable();
    table.text('description').nullable();
    table
      .enum('priority', ['urgent', 'medium', 'low'])
      .notNullable()
      .defaultTo('medium');
    table
      .string('status_id')
      .notNullable()
      .references('id')
      .inTable('bug_statuses')
      .onUpdate('CASCADE');
    table.string('assignee_id').nullable();   // Backstage userEntityRef
    table.string('reporter_id').notNullable(); // Backstage userEntityRef
    table.boolean('is_closed').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('bug_comments', table => {
    table.string('id').primary();
    table
      .string('bug_id')
      .notNullable()
      .references('id')
      .inTable('bugs')
      .onDelete('CASCADE');
    table.string('user_id').notNullable(); // Backstage userEntityRef
    table.text('comment_body').notNullable();
    table
      .string('parent_comment_id')
      .nullable()
      .references('id')
      .inTable('bug_comments')
      .onDelete('SET NULL');
    table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());
  });

  // Seed default statuses
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

### Backend-internal types

**`src/types.ts`**

These are the raw database row shapes — distinct from the frontend `Bug`/`Status` types:

```typescript
export interface BugRow {
  id: string;
  ticket_number: string;
  heading: string;
  description: string | null;
  priority: 'urgent' | 'medium' | 'low';
  status_id: string;
  assignee_id: string | null;
  reporter_id: string;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

export interface StatusRow {
  id: string;
  label: string;
  color: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  bug_id: string;
  user_id: string;
  comment_body: string;
  parent_comment_id: string | null;
  timestamp: string;
}

export interface BugQueryFilters {
  assigneeIds?: string[];
  priority?: 'urgent' | 'medium' | 'low';
  statusId?: string;
  search?: string;
  includeClosed?: boolean;
}

export interface NewBugRow extends Omit<BugRow, 'created_at' | 'updated_at'> {}
export interface NewCommentRow extends Omit<CommentRow, 'timestamp'> {}
```

### BugManagerStore

**`src/database/BugManagerStore.ts`**

This phase implements only the status methods and the store constructor (which runs migrations). Bug and comment methods are stubbed and completed in Phase 2.

```typescript
import type { Knex } from 'knex';
import type {
  BugRow, StatusRow, CommentRow,
  BugQueryFilters, NewBugRow, NewCommentRow,
} from '../types';

export class BugManagerStore {
  private constructor(private readonly db: Knex) {}

  static async create(
    getClient: () => Promise<Knex>,
  ): Promise<BugManagerStore> {
    const db = await getClient();
    await db.migrate.latest({
      directory: `${__dirname}/migrations`,
    });
    return new BugManagerStore(db);
  }

  // ── Statuses ────────────────────────────────────────────────────────────

  async getStatuses(): Promise<StatusRow[]> {
    return this.db<StatusRow>('bug_statuses').orderBy('order', 'asc');
  }

  async countStatuses(): Promise<number> {
    const [{ count }] = await this.db('bug_statuses').count('id as count');
    return Number(count);
  }

  async createStatus(data: Omit<StatusRow, 'created_at' | 'updated_at'>): Promise<StatusRow> {
    const now = new Date().toISOString();
    const row = { ...data, created_at: now, updated_at: now };
    await this.db<StatusRow>('bug_statuses').insert(row);
    return row as StatusRow;
  }

  async updateStatus(
    id: string,
    patch: Partial<Pick<StatusRow, 'label' | 'color' | 'order'>>,
  ): Promise<StatusRow | undefined> {
    const updated_at = new Date().toISOString();
    await this.db<StatusRow>('bug_statuses')
      .where({ id })
      .update({ ...patch, updated_at });
    return this.db<StatusRow>('bug_statuses').where({ id }).first();
  }

  async deleteStatus(id: string, replacementId: string): Promise<void> {
    await this.db.transaction(async trx => {
      await trx('bugs')
        .where({ status_id: id, is_closed: false })
        .update({ status_id: replacementId, updated_at: new Date().toISOString() });
      await trx('bug_statuses').where({ id }).delete();
    });
  }

  // ── Bugs (stubbed — completed in Phase 2) ────────────────────────────────

  async getBugs(_filters: BugQueryFilters): Promise<BugRow[]> {
    throw new Error('Not implemented — Phase 2');
  }

  async getBugById(_id: string): Promise<BugRow | undefined> {
    throw new Error('Not implemented — Phase 2');
  }

  async createBug(_data: NewBugRow): Promise<BugRow> {
    throw new Error('Not implemented — Phase 2');
  }

  async updateBug(_id: string, _patch: Partial<BugRow>): Promise<BugRow> {
    throw new Error('Not implemented — Phase 2');
  }

  async nextTicketNumber(): Promise<string> {
    throw new Error('Not implemented — Phase 2');
  }

  // ── Comments (stubbed — completed in Phase 2) ────────────────────────────

  async getComments(_bugId: string): Promise<CommentRow[]> {
    throw new Error('Not implemented — Phase 2');
  }

  async addComment(_data: NewCommentRow): Promise<CommentRow> {
    throw new Error('Not implemented — Phase 2');
  }

  // ── Users (stubbed — completed in Phase 2) ───────────────────────────────

  async getDistinctAssignees(): Promise<string[]> {
    throw new Error('Not implemented — Phase 2');
  }
}
```

### Minimal router

**`src/router.ts`** (Phase 1 stub — endpoints added in Phase 2)

```typescript
import { Router } from 'express';
import express from 'express';
import type { DatabaseService, HttpAuthService, UserInfoService } from '@backstage/backend-plugin-api';
import type { LoggerService } from '@backstage/backend-plugin-api';
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

  // Health check — confirms the plugin is mounted and DB is reachable
  router.get('/healthz', async (_req, res) => {
    try {
      await store.getStatuses(); // cheap DB round-trip
      res.json({ status: 'ok' });
    } catch (err) {
      logger.error('Health check failed', err as Error);
      res.status(500).json({ status: 'error' });
    }
  });

  // Phase 2+ adds all other endpoints

  return router;
}
```

---

## Steps

### 1.1 Scaffold the backend plugin package

Create `plugins/bug-manager-backend/` with `package.json`, `tsconfig.json`, `catalog-info.yaml`. Add the package to the Yarn workspace in the root `package.json`. Install dependencies.

### 1.2 Write backend-internal types

Write `src/types.ts` with `BugRow`, `StatusRow`, `CommentRow`, `BugQueryFilters`, `NewBugRow`, `NewCommentRow`.

### 1.3 Write the Knex migration

Write `src/database/migrations/20260225_01_initial.ts` with the three `CREATE TABLE` statements and the 5-status seed `INSERT`.

### 1.4 Implement BugManagerStore (status methods only)

Write `BugManagerStore.ts` with the static `create()` factory (runs migrations), `getStatuses`, `countStatuses`, `createStatus`, `updateStatus`, `deleteStatus`. Stub all other methods with `throw new Error('Not implemented')`.

### 1.5 Write the stub router

Write `src/router.ts` with the `GET /healthz` endpoint only.

### 1.6 Write plugin.ts and index.ts

Wire `createBackendPlugin()`, register `httpRouter`, `database`, `httpAuth`, `userInfo`, `logger` deps.

### 1.7 Register the plugin in the backend

Add `backend.add(import('@internal/plugin-bug-manager-backend'))` to `packages/backend/src/index.ts`.

### 1.8 Verify

- Run `yarn start` for the backend
- `GET http://localhost:7007/api/bug-manager/healthz` returns `{ "status": "ok" }`
- Check the PostgreSQL database — tables `bugs`, `bug_statuses`, `bug_comments` exist
- `SELECT * FROM bug_statuses ORDER BY "order"` returns the 5 seeded statuses

---

## What comes out of this phase

A registered backend plugin with a live database schema. No business logic is exposed yet, but the migration infrastructure is proven, the store factory pattern is established, and every Phase 2 endpoint can immediately import `BugManagerStore` and call its methods.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Migration runs twice on restart | Duplicate rows / errors | Knex `migrate.latest()` is idempotent — it tracks applied migrations in `knex_migrations` table |
| PostgreSQL `DatabaseService` not configured in app-config | Plugin fails to start | Ensure `backend.database` is configured in `app-config.yaml` before testing |
| FK constraint on `status_id` fails if seed rows not inserted | `createBug` will fail | Migration inserts seed statuses in the same transaction as table creation |
| `onDelete: 'CASCADE'` on `bug_comments.bug_id` | Comments deleted with bug | Intentional — soft-delete via `is_closed` means bugs are never hard-deleted anyway |
