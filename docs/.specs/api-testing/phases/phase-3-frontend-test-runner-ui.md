# Phase 3: Frontend Test Runner UI

**Goal:** Inline test runner integrated into the API route definition page — each endpoint row is individually expandable to reveal its test cases with play/stop controls and pass/fail highlighting.

**Depends on:** Phase 2

---

## What this phase delivers

- A shared frontend library at `plugins/api-testing/` exporting hooks, components, and types
- A backend plugin at `plugins/api-testing-backend/` with REST + WebSocket endpoints
- Test cases rendered inline on the API entity's **Definition** tab (`ApiRouteDefinitionContent`)
- Each endpoint row (e.g., `GET /v1/rules/{id}`) is collapsible — clicking it reveals test cases for that specific method+path
- Play/stop controls and inline pass/fail results per test case
- Color-coded status dots on route group accordion headers and individual endpoint rows
- Real-time updates via WebSocket when test cases change on disk

### Navigation flow

There is no standalone "API Testing" page or sidebar item. Users reach test cases through the existing catalog flow:

1. Open a service entity page (e.g., Freddy)
2. Click an API in the "Provided APIs" or "Consumed APIs" card
3. Land on the API entity's **Definition** tab
4. Expand a route group accordion → see endpoints with test counts
5. Click an endpoint row → test cases expand inline below it

## Technical design

### Plugin structure

```
plugins/api-testing/
├── package.json
├── src/
│   ├── index.ts                    # Exports hooks, components, types
│   ├── api/
│   │   ├── ApiTestingClient.ts     # Backend API client
│   │   └── types.ts                # TypeScript interfaces
│   ├── components/
│   │   ├── TestCaseRow/
│   │   │   └── TestCaseRow.tsx     # Single test case with play/stop/result
│   │   ├── TestResultBadge/
│   │   │   └── TestResultBadge.tsx # Pass/fail/running indicator
│   │   └── EndpointHistory/
│   │       ├── EndpointHistory.tsx          # Per-endpoint execution history
│   │       └── ExecutionHistoryContext.tsx  # Context for real-time WS updates
│   └── hooks/
│       ├── useTestCases.ts         # Fetch test cases for a route group
│       ├── useTestExecution.ts     # Run/stop a test, track state
│       ├── useExecutionHistory.ts  # Fetch and paginate endpoint history
│       └── useWebSocket.ts         # Subscribe to real-time updates
```

The integration point is `packages/app/src/components/ApiRouteDefinitionContent.tsx`, which imports hooks and components from `@internal/plugin-api-testing` and renders them inside the existing route group accordions.

### Backend-for-frontend (BFF) route

The Backstage backend exposes a lightweight API that the frontend calls. This is a backend plugin at `plugins/api-testing-backend/`:

```
POST   /api/api-testing/execute          — Run a test case (user-initiated)
POST   /api/api-testing/stop             — Abort a running test
GET    /api/api-testing/route-groups     — List all route groups
GET    /api/api-testing/config           — Get plugin config (environments, variables)
GET    /api/api-testing/test-cases/:routeGroup  — List test cases for a route group
GET    /api/api-testing/test-cases/:routeGroup/:id — Get single test case
POST   /api/api-testing/execute-all      — Run all tests in a route group
POST   /api/api-testing/variables/extract — Extract {{variables}} from a test case
GET    /api/api-testing/history/:routeGroup/:testCaseId — Per-endpoint history
GET    /api/api-testing/history/:routeGroup — Route group history
WS     /api/api-testing/ws               — WebSocket for real-time updates
```

**Note:** The `:routeGroup` parameter in all URLs uses the dash-encoded form (e.g., `v1-health` instead of `v1/health`). See "Route group encoding" above.

The backend reads the same `api-tests/*.json` files that the MCP server writes. No separate data store.

#### Route group encoding

Route groups use `/`-separated paths (e.g., `/v1/rules`), but these must be safely embedded in URL paths and used as filenames. A shared encoding convention is used:

```ts
/** Encode a route group for use in URL paths: `/v1/health` → `v1-health` */
private encodeRouteGroup(routeGroup: string): string {
  return routeGroup.replace(/^\//, '').replace(/\//g, '-');
}
```

Both the frontend client (`ApiTestingClient.ts`) and the backend/MCP server use this encoding. The frontend applies it before constructing API URLs (e.g., `/api/api-testing/test-cases/v1-health`), and the backend uses it for file storage (e.g., `api-tests/v1-health.json`).

**Why this matters:** Without encoding, a route group like `/v1/health` would produce URL paths like `/test-cases/v1/health`, which Express interprets as nested route segments — matching the wrong route handler (e.g., the single-test-case `GET /test-cases/:routeGroup/:id` route instead of the list route).

### Component specifications

#### `ApiRouteDefinitionContent` (in `packages/app/`)

- Parses route groups from the API entity's OpenAPI definition (`entity.spec.definition`)
- Renders a list of `RouteGroupAccordion` components, one per route group
- Subscribes to the WebSocket for live updates via `useWebSocket`
- Manages per-group refresh counters — when a WebSocket `test-cases-changed` event arrives, the affected accordion re-fetches its test cases

#### `RouteGroupAccordion` (in `packages/app/`)

- **Collapsed state:** Shows the route group name (e.g., `/v1/rules`), endpoint count chip, and a status dot
  - No tests run yet → neutral/gray dot
  - All executed tests passed → green dot
  - Any executed test failed → red dot
  - Tests currently running → blue dot
- **Expanded state:** Reveals endpoint rows, each with its own collapsible test section
- Calls `useTestCases(routeGroup)` and `useTestExecution()` once — shares execution state across all endpoint rows
- "Run all N tests" button at the bottom when test cases exist

#### `EndpointWithTests` (in `packages/app/`)

- Renders a single endpoint row: method chip + path + summary
- **Without test cases:** Plain row, not clickable
- **With test cases:** Row shows a status dot, test count badge (e.g., "2 tests"), and expand chevron
  - Click to expand/collapse the test case table below
  - Status dot reflects the aggregate result of that endpoint's test cases
- Test cases are matched to endpoints by normalizing path parameters (`{id}` ↔ `:id`)
- Unmatched test cases (not matching any endpoint) appear in an "Other test cases" fallback section

#### `TestCaseRow` (in `plugins/api-testing/`)

- Columns: method chip, test case name, path, result badge, actions (play/stop)
- **Play button (▶):**
  - Sends `POST /api/api-testing/execute` with the test case ID and current variable context
  - Transitions row to "running" state (spinner in result column)
  - On completion, shows pass (green checkmark) or fail (red X with expandable error details)
  - Styled with green color (`theme.palette.success.main`) and subtle hover background
- **Stop button (⏹):**
  - Sends `POST /api/api-testing/stop` with the execution ID
  - Transitions row back to idle state
  - Only enabled when the test is running
  - Styled with red color (`theme.palette.error.main`)
- **Result display:**
  - Idle: em dash (—)
  - Running: spinner
  - Pass: green chip with response time (e.g., "Pass 120ms")
  - Fail: red chip with expandable row showing: status code received vs expected, body assertion failures, missing fields, response body
- **Row styling:**
  - Alternating row colors: odd rows get a subtle background tint (`rgba(255,255,255,0.02)` in dark mode, `rgba(0,0,0,0.02)` in light mode) for visual separation
  - Method chips are color-coded by HTTP method (GET=blue, POST=green, PUT=orange, PATCH=teal, DELETE=red)
  - Test name uses `fontWeight: 500` for emphasis; path uses monospace font
- **Dark mode support:**
  - Expandable error detail `pre` blocks use theme-aware backgrounds: `theme.palette.grey[900]` in dark mode, `theme.palette.grey[100]` in light mode
  - Text color uses `theme.palette.text.primary` for readability in both modes

##### Runtime variable overrides

Each `TestCaseRow` scans its test case definition for `{{variable}}` placeholders. When variables are found, a tune icon (⚙) appears next to the play button. Clicking it reveals an inline override section:

- Each detected variable shows its `{{name}}` and a text input
- The input placeholder shows the currently resolved value from app-config/environment
- Typing a value creates a runtime override that applies only to the next execution
- Clearing the input removes the override, falling back to the environment value
- Overrides are per-test-case and do not persist across page reloads

Variable extraction uses a regex scan of the test case's `path`, `headers`, and `body` fields:

```ts
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;
```

#### `TestResultBadge` (in `plugins/api-testing/`)

- Reusable component for pass/fail/running/idle states
- Uses Backstage theme colors for consistency

### Path matching between OpenAPI and test cases

OpenAPI paths use `{param}` syntax (e.g., `/v1/rules/{id}`), while test cases use `:param` syntax (e.g., `/v1/rules/:id`). A `normalizePath()` function converts both to a common form for matching:

```ts
function normalizePath(p: string): string {
  return p.replace(/\{[^}]+\}/g, ':param').replace(/:[\w]+/g, ':param');
}
```

Test cases are matched to endpoints by `METHOD::normalizedPath`. Unmatched test cases are shown in a fallback section.

### WebSocket real-time updates

The backend opens a WebSocket endpoint. When the file watcher (from Phase 2) detects changes:

1. Backend receives the `test-cases-changed` event
2. Broadcasts `{ type: "test-cases-changed", routeGroup: "/v1/rules" }` to all connected frontends
3. The `useWebSocket` hook receives the message and increments a per-group refresh counter
4. The affected `RouteGroupAccordion` detects the counter change and re-fetches test cases
5. Endpoint rows re-render with the updated test case list

This ensures that when an agent creates or edits a test case via MCP, the Backstage UI updates within seconds without the developer doing anything.

### Test execution flow (user-initiated)

```
User clicks ▶ on a test case row
  → Frontend sends POST /api/api-testing/execute { testCaseId, routeGroup, variables }
  → Backend resolves variables (app-config layer)
  → Backend constructs HTTP request from test case definition
  → Backend sends the request to the target API
  → Backend compares response against assertions
  → Backend writes result to history file (Phase 4)
  → Backend returns { pass: true/false, statusCode, responseTime, details }
  → Frontend updates the TestCaseRow with the result
  → Frontend updates the endpoint status dot and route group status dot
```

## Steps

### 3.1 Scaffold the frontend plugin

Create `plugins/api-testing/` with hooks, API client, types, `TestCaseRow`, and `TestResultBadge`. Export them as building blocks from `index.ts` (no standalone page or `createPlugin`).

### 3.2 Scaffold the backend plugin

Create `plugins/api-testing-backend/` with the REST endpoints and WebSocket support.

### 3.3 Build the `TestCaseRow` component

Implement play/stop buttons, execution state management, and result display with expandable error details.

### 3.4 Build hooks

Implement `useTestCases`, `useTestExecution`, and `useWebSocket` hooks.

### 3.5 Implement the test execution endpoint

Backend receives test case ID, resolves variables, executes the HTTP request, evaluates assertions, returns result.

### 3.6 Integrate into `ApiRouteDefinitionContent`

Enhance the existing route definition accordion in `packages/app/src/components/ApiRouteDefinitionContent.tsx`:
- Import hooks and components from `@internal/plugin-api-testing`
- Add `EndpointWithTests` component — each endpoint row becomes collapsible to reveal its test cases
- Add `RouteGroupTestSection` logic into `RouteGroupAccordion` — fetches test cases, manages execution state, matches tests to endpoints
- Wire `useWebSocket` at the top level for real-time refresh
- Add status dots on accordion headers and endpoint rows

### 3.7 Wire up WebSocket for real-time updates

Backend broadcasts file changes; frontend subscribes and refetches affected route groups.

### 3.8 Verify

- Click an API in "Provided APIs" card on Freddy's service page → lands on Definition tab
- Route group accordions render from the OpenAPI spec
- Expand a route group → endpoint rows show test count badges
- Click an endpoint row with tests → test case table expands inline
- Click ▶ → test runs, result appears inline
- Click ⏹ while running → test aborts
- Endpoint and route group status dots reflect pass/fail/running
- "Run all" button executes all tests in the route group
- Create a test case via MCP from Claude Code → endpoint row updates in real time

## What comes out of this phase

The full inline test runner — developers can see, run, and stop tests from within the API Definition tab, with test cases collapsible per endpoint and results appearing inline. No separate page needed; testing lives where the API context already is.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| WebSocket connections drop silently | UI goes stale | Implement reconnect logic with exponential backoff in `useWebSocket` |
| Test execution timeout | UI stuck in "running" | Enforce 30s timeout on backend; auto-transition to failed state |
| Large number of test cases per endpoint | Slow rendering | Collapse is unmounted when closed (`unmountOnExit`); only expanded endpoints render their table |
| Path mismatch between OpenAPI and test cases | Tests don't appear under the right endpoint | `normalizePath()` handles `{param}` ↔ `:param`; unmatched tests shown in fallback section |
| CORS issues on test execution | Requests fail | All requests go through the Backstage backend proxy — no direct browser-to-API calls |
| Route group encoding mismatch | Test cases not found — wrong Express route matched | Use `encodeRouteGroup()` consistently on both frontend and backend to convert `/v1/health` → `v1-health` in URL paths |
