# Phase 2: Register Freddy Backend in the Catalog

**Goal:** "Freddy Backend" appears as a service in the Backstage catalog. Clicking it opens a dedicated service page.

**Depends on:** Phase 1

---

## What this phase delivers

- A `catalog-info.yaml` file in the Freddy Backend repo
- Freddy registered as a `Component` entity of type `service`
- An `API` entity that references Freddy's OpenAPI spec
- The two entities linked: Freddy "provides" the Freddy API

## Steps

### 2.1 Create `catalog-info.yaml` in the Freddy repo

This file lives at the root of `freddy.backend/`. It declares two entities in one file:

**Entity 1 — The service (Component):**

- `kind: Component`
- `metadata.name: freddy-backend`
- `metadata.description`: what the service is
- `metadata.tags`: `python`, `fastapi`, `rest`
- `spec.type: service`
- `spec.lifecycle: production`
- `spec.owner`: team name
- `spec.providesApis: [freddy-backend-api]` — links to the API entity

**Entity 2 — The API:**

- `kind: API`
- `metadata.name: freddy-backend-api`
- `spec.type: openapi`
- `spec.definition.$text: http://localhost:8000/openapi.json` — Backstage fetches the live OpenAPI spec from Freddy

### 2.2 Register the location in Backstage

Add Freddy's `catalog-info.yaml` as a catalog location in Backstage's `app-config.yaml`:

```yaml
catalog:
  locations:
    - type: file
      target: /path/to/freddy.backend/catalog-info.yaml
```

For local dev, a file path works. In production this would be a GitHub URL.

### 2.3 Verify in the catalog

- Open Backstage at `localhost:3000`
- Navigate to Catalog
- "Freddy Backend" should appear as a service
- Clicking it opens a service page with the default "About" card showing name, description, tags, owner

## What comes out of this phase

Freddy has a home page in Backstage. It doesn't show APIs or health yet — just identity and ownership.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `$text` URL fetch fails if Freddy isn't running | API entity has no definition | Document that Freddy must be running for API docs to load |
| OpenAPI spec is large (~30 route groups) | Slow initial load | Acceptable for v1 — can cache later |
