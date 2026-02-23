# Phase 3: API Docs — Render Freddy's Routes in Backstage

**Goal:** Clicking an API from Freddy's service page navigates to a dedicated API entity page with a **Definition** tab (no Overview tab) showing collapsible parent route groups that expand to reveal individual endpoints.

**Depends on:** Phase 2

**Status:** Implemented

---

## What this phase delivers

- Custom **Provided APIs** and **Consumed APIs** cards on the service entity Overview tab
- Clicking an API navigates directly to the API entity's **Definition** tab
- The Definition tab replaces Swagger UI with a custom collapsible route view:
  - **Parent route groups** listed as accordions (e.g., `/v1/health`, `/v1/auth`, `/v1/assistants`)
  - Clicking a parent route **expands** to show individual endpoints with colored HTTP method chips and summaries
- The **Overview** tab is hidden for API entities — only Definition and TechDocs tabs are visible

## User flow

```
freddy-service (Overview tab)
  → Provided APIs / Consumed APIs cards list related API entities
    → Click an API (e.g., "freddy-backend-api")
      → API entity page loads with Definition tab pre-selected (no Overview tab)
        → Collapsible parent route groups (e.g., /v1/health, /v1/rules)
          → Click a parent route → expands to show endpoints (GET, POST, PUT, DELETE, PATCH)
```

## Implementation

### 3.1 Service page: API summary cards

**File:** `packages/app/src/components/ApiSummaryCards.tsx`

- `ProvidedApisSummaryCard` and `ConsumedApisSummaryCard` use `useRelatedEntities()` with `RELATION_PROVIDES_API` / `RELATION_CONSUMES_API`
- Each API is rendered as a clickable list item with an arrow icon
- Links point to `{entityRoute}/definition` so the user lands directly on the Definition tab

**File:** `packages/app/src/modules/entityExtensions.tsx`

- Registered as `EntityCardBlueprint` extensions (`provided-apis-summary`, `consumed-apis-summary`)
- Filtered to `Component` entities with `type: 'service'`

### 3.2 API entity page: custom Definition tab

**File:** `packages/app/src/components/ApiRouteDefinitionContent.tsx`

- Reads the current API entity's OpenAPI definition from `entity.spec.definition`
- Parses the JSON spec to extract all paths
- Groups endpoints by parent route prefix (first two path segments, e.g., `/v1/health`)
- Renders each group as a Material-UI `Accordion`:
  - **Summary:** route prefix in monospace + endpoint count chip
  - **Details:** list of endpoints with colored HTTP method chips (GET=blue, POST=green, PUT=orange, DELETE=red, PATCH=cyan), path in monospace, and summary text

**File:** `packages/app/src/modules/entityExtensions.tsx`

- Registered as `EntityContentBlueprint` named `api-route-definition`
- Path: `/definition`, title: "Definition", filtered to `kind: 'api'`

### 3.3 Disable default Swagger definition and Overview tab for APIs

**File:** `packages/app/app-config.yaml`

```yaml
# Disable default Swagger-based definition tab
- entity-content:api-docs/definition: false
# Enable custom collapsible route definition tab
- entity-content:app/api-route-definition
```

**File:** `packages/app/src/App.tsx`

- The catalog overview extension is overridden with a filter to exclude API entities:
  ```typescript
  catalogPlugin.getExtension('entity-content:catalog/overview').override({
    params: {
      filter: entity => entity.kind !== 'API',
    },
  });
  ```
- This hides the Overview tab when viewing API entities, so users land on the Definition tab

### 3.4 Verify the route grouping

Parent route groups are derived from the OpenAPI spec's `paths` object. For Freddy's ~30 route groups, confirm:

- Health, Auth, Users, Organizations, API Keys, Models, Assistants, Threads, Messages, Files, Vector Stores, Rules, Documents, Workflows, MCP, Analytics, Web Scraping, Admin, Connectors, etc.

Each parent route expands to reveal its individual endpoints with method, path, and summary.

## Files changed

| File                                                        | Change                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/app/src/components/ApiRouteDefinitionContent.tsx` | New — collapsible route view for API Definition tab                |
| `packages/app/src/components/ApiSummaryCards.tsx`           | Links navigate to `/definition` instead of entity root             |
| `packages/app/src/modules/entityExtensions.tsx`             | Registered `api-route-definition` EntityContentBlueprint           |
| `packages/app/app-config.yaml`                              | Disabled `api-docs/definition`, enabled `app/api-route-definition` |
| `packages/app/src/App.tsx`                                  | Hidden Overview tab for API entities via filter                    |

## What comes out of this phase

A developer can click an API from Freddy's service page and land on a clean Definition tab showing all API routes organized as collapsible parent route groups — no Swagger UI, no Overview tab clutter.

## Risks

| Risk                                              | Impact                                  | Mitigation                                                                                  |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| OpenAPI definition stored as YAML instead of JSON | `JSON.parse` fails, no routes shown     | Add YAML parsing fallback if needed                                                         |
| Route prefix grouping doesn't match expected tags | Groups look different from FastAPI tags | Grouping uses first two path segments — works for RESTful APIs with `/v1/resource` patterns |
| Large number of endpoints in a single group       | Accordion content gets long             | Endpoints are lightweight DOM elements — no performance concern at ~30 groups               |
