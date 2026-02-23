# Phase 1: Create the Backstage Instance

**Goal:** A running Backstage app on localhost with default catalog working.

---

## What this phase delivers

- A new Backstage app scaffolded using `@backstage/create-app`
- Frontend running on `localhost:3000`
- Backend running on `localhost:7007`
- Default catalog with example entities loading correctly
- SQLite database for local development (no external DB needed)

## Steps

### 1.1 Scaffold the app

Use the Backstage CLI to create a new app. This generates a monorepo with a frontend (`packages/app`) and backend (`packages/backend`), pre-configured with the catalog, API docs plugin, and proxy backend.

### 1.2 Configure `app-config.yaml`

Set the app title, base URLs, and database connection. For local dev, SQLite in-memory is fine. The key sections:

- `app.title` — "Freddy Developer Portal" (or similar)
- `app.baseUrl` — `http://localhost:3000`
- `backend.baseUrl` — `http://localhost:7007`
- `backend.database` — SQLite (default)

### 1.3 Verify it runs

Start the app with `yarn dev`. Confirm:

- Frontend loads at `localhost:3000`
- Catalog page shows default example entities
- No errors in console

## What comes out of this phase

A blank but functional Backstage instance, ready to register Freddy.

## Dependencies

- Node.js (already installed — v22.22.0)
- Yarn

## Risks

| Risk                         | Impact      | Mitigation                                                |
| ---------------------------- | ----------- | --------------------------------------------------------- |
| Node version incompatibility | Build fails | Backstage supports Node 18+, we have v22 — should be fine |
