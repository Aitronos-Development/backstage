# Phase 4: Health & Liveness Card

**Goal:** A **Health card** rendered inline on the Overview tab that calls `/v1/health/details` and shows real-time red/green status for each component — directly on the card, not as a link to another page.

**Depends on:** Phase 2

---

## What this phase delivers

- A backend proxy route in Backstage that forwards requests to Freddy's health endpoint
- A custom entity card (`HealthCheckCard`) registered via `EntityCardBlueprint` in the app's `entityExtensionsModule`
- The card is rendered **inline on the Overview tab** — status is visible directly on the card without navigating away
- The card displays: overall status banner + per-component status table (database, redis, qdrant, limit enforcement)
- Binary status: **green** = up/healthy, **red** = down/unhealthy/unreachable
- Auto-refreshes every 30 seconds
- All other default entity cards (About, Links, Labels, Relations, etc.) are disabled — the Overview tab shows only the Health card alongside the Provided APIs and Consumed APIs summary cards

## Current implementation

### Architecture

The health widget is **not** a standalone plugin. It lives directly in the app package as a component + entity extension:

```
packages/app/src/components/HealthCheckCard.tsx   ← the React component
packages/app/src/modules/entityExtensions.tsx     ← registers it as an EntityCardBlueprint
packages/app/app-config.yaml                      ← disables all default cards, keeps custom ones
```

### Proxy configuration

In `app-config.yaml` (root):

```yaml
proxy:
  endpoints:
    '/freddy-health':
      target: 'http://localhost:8000'
      changeOrigin: true
      credentials: 'dangerously-allow-unauthenticated'
```

Frontend calls `GET /api/proxy/freddy-health/v1/health/details` → proxied to Freddy at `http://localhost:8000/v1/health/details`.

### Entity card registration

In `packages/app/src/modules/entityExtensions.tsx`:

```tsx
const healthCheckEntityCard = EntityCardBlueprint.make({
  name: 'health-check',
  params: {
    filter: entity =>
      entity.kind === 'Component' && (entity.spec as any)?.type === 'service',
    loader: () =>
      import('../components/HealthCheckCard').then(m => <m.HealthCheckCard />),
  },
});
```

- Uses `EntityCardBlueprint` from `@backstage/plugin-catalog-react/alpha`
- Filtered to `Component` entities with `type: 'service'`
- Registered in `entityExtensionsModule` alongside `providedApisSummaryCard`, `consumedApisSummaryCard`, and `apiRouteDefinitionContent`

### Component behavior (`HealthCheckCard.tsx`)

1. **Fetches** from the proxy: `GET {backend.baseUrl}/api/proxy/freddy-health/v1/health/details` using `configApiRef` + native `fetch()`
2. **Parses** the response:
   ```json
   {
     "status": "healthy",
     "components": [
       {
         "name": "database",
         "status": "healthy",
         "details": "Connection successful"
       },
       { "name": "redis_cache", "status": "healthy", "details": "..." },
       { "name": "limit_enforcement", "status": "healthy", "details": "..." },
       { "name": "qdrant_vector_store", "status": "healthy", "details": "..." }
     ]
   }
   ```
3. **Renders** a Material-UI `Card` with:
   - Title: "Health"
   - **Overall status banner** — green background with glowing green light and "Up — Service is healthy", or red background with glowing red light and "Down — Service is unhealthy"
   - **Per-component table** with columns: Component, Status, Details
   - Each component row has a 14px glowing indicator light (green/red) + "Up"/"Down" label
   - Component names are formatted from snake_case to Title Case (e.g. `redis_cache` → `Redis Cache`)
4. **Error/unreachable state** — shows red banner with "Down — {error message}" or "Down — Service unreachable"
5. **Loading state** — shows `CircularProgress` spinner
6. **Auto-refreshes** every 30 seconds via `setInterval` in a `useEffect`

### Status logic

Binary — no yellow/degraded state:

| Freddy status                                    | Card display                |
| ------------------------------------------------ | --------------------------- |
| `healthy` or `ok`                                | Green light, "Up"           |
| Anything else (`degraded`, `unhealthy`, `error`) | Red light, "Down"           |
| Fetch error / unreachable                        | Red light, "Down — {error}" |

### Styling

- Green: `#1DB954` — used for text, light background (`rgba(29, 185, 84, 0.1)`), and border (`rgba(29, 185, 84, 0.3)`)
- Red: `#BA1A1A` — used for text, light background (`rgba(186, 26, 26, 0.1)`), and border (`rgba(186, 26, 26, 0.3)`)
- Status lights: 14px circles with `box-shadow: 0 0 6px 1px currentColor` for a glow effect
- Uses `makeStyles` with theme-aware spacing

### Entity page configuration (`packages/app/app-config.yaml`)

All default entity cards are disabled. Only custom cards from `entityExtensionsModule` are active:

```yaml
app:
  extensions:
    # All default cards disabled
    - entity-card:catalog/about: false
    - entity-card:catalog/labels: false
    - entity-card:catalog/links: false
    - entity-card:catalog/depends-on-components: false
    - entity-card:catalog/depends-on-resources: false
    - entity-card:catalog/has-components: false
    - entity-card:catalog/has-resources: false
    - entity-card:catalog/has-subcomponents: false
    - entity-card:catalog/has-subdomains: false
    - entity-card:catalog/has-systems: false
    - entity-card:catalog-graph/relations: false
    - entity-card:api-docs/has-apis: false
    - entity-card:api-docs/definition: false
    - entity-card:api-docs/consumed-apis: false
    - entity-card:api-docs/provided-apis: false
    - entity-card:api-docs/providing-components: false
    - entity-card:api-docs/consuming-components: false
    - entity-card:org/group-profile: false
    - entity-card:org/members-list: false
    - entity-card:org/ownership: false
    - entity-card:org/user-profile: false
```

### Config loading note

`start-dev.sh` passes explicit `--config` flags to `backstage-cli repo start`. When explicit flags are present, the CLI ignores config paths from `packages/app/package.json`. The fix was to add `packages/app/app-config.yaml` to `start-dev.sh`'s `build_config_flags()`:

```bash
if [[ -f "$PROJECT_ROOT/packages/app/app-config.yaml" ]]; then
    flags="$flags --config $PROJECT_ROOT/packages/app/app-config.yaml"
fi
```

## Verification

- Open Freddy's service page in Backstage (`/catalog/default/component/freddy-backend`)
- Overview tab shows three cards: Health, Provided APIs, Consumed APIs
- No other cards visible (About, Links, Relations, etc. are all disabled)
- Health card shows green lights when Freddy is running
- Stop a dependency (e.g. Redis) — card shows red within 30 seconds
- Stop Freddy entirely — card shows "Down — Service unreachable" with red banner
- Restart services — card recovers to green

## Technical notes

- The proxy backend plugin is included in the default Backstage app — no extra backend setup needed
- The card is a plain React component using Material-UI — no complex state management
- Uses `useApi(configApiRef)` for backend URL, native `fetch()` for HTTP calls
- The card handles errors gracefully: fetch failures show red "Down" state, not crashes
- The `EntityCardBlueprint` filter ensures the card only appears on `Component` entities with `type: 'service'`

## Risks

| Risk                                      | Impact                   | Mitigation                                                                                    |
| ----------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| CORS issues between Backstage and Freddy  | Health calls fail        | The proxy backend handles this — requests go Backstage backend → Freddy, not browser → Freddy |
| Freddy is down                            | Card shows error         | Handled gracefully: shows red status with "Down — Service unreachable"                        |
| Polling every 30s adds load               | Minimal                  | One lightweight GET request every 30s is negligible                                           |
| `packages/app/app-config.yaml` not loaded | Extension config ignored | Fixed in `start-dev.sh` by adding it to `build_config_flags()`                                |
