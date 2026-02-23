# Phase 4: Execution History

**Goal:** Every test execution — whether triggered by a user in the UI or by an agent via MCP — is recorded and displayed in a unified history view with filtering.

**Depends on:** Phase 3

---

## What this phase delivers

- Append-only `.jsonl` history files under `api-tests/.history/`
- History written by both the Backstage backend (user runs) and the MCP server (agent runs)
- A "History" section for each individual endpoint (test case), not at the route group level
- Filtering by initiator (user vs agent) and by result (pass vs fail)
- Expandable rows showing full request/response details

## Technical design

### History file format

Each endpoint (test case) gets its own history file, organized under route group directories:

```
api-tests/.history/
├── v1-health/
│   └── tc-001.jsonl
├── v1-auth/
│   ├── tc-002.jsonl
│   └── tc-003.jsonl
├── v1-rules/
│   ├── tc-004.jsonl
│   ├── tc-005.jsonl
│   └── tc-006.jsonl
└── ...
```

Each line is a self-contained JSON object:

```json
{
  "id": "exec-a1b2c3",
  "timestamp": "2026-02-19T14:30:00.000Z",
  "initiator": "agent",
  "agent_identity": "claude-code-session-xyz",
  "test_case_id": "tc-001",
  "test_case_name": "Create rule with valid payload returns 201",
  "route_group": "/v1/rules",
  "result": "pass",
  "duration_ms": 120,
  "request": {
    "method": "POST",
    "url": "http://localhost:8000/v1/rules",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer ***"
    },
    "body": { "name": "test-rule", "description": "A test rule" }
  },
  "response": {
    "status_code": 201,
    "headers": { "content-type": "application/json" },
    "body": {
      "id": "rule-123",
      "name": "test-rule",
      "created_at": "2026-02-19T14:30:00Z"
    }
  },
  "failure_reason": null
}
```

**Key design decisions:**

- **Per-endpoint history** — each test case gets its own `.jsonl` file, making it trivial to view history for a specific endpoint without filtering through unrelated records.
- **JSONL format** — one JSON object per line, append-only. No need to parse the entire file to add a new entry. Trivial to `tail` for recent entries.
- **Tokens are masked** — `Authorization` headers are stored as `Bearer ***` in history. The full token is never persisted.
- **Request + response stored** — enables full debugging when expanding a failed execution in the UI.
- **Shared schema** — both the Backstage backend and MCP server write the exact same JSON shape. The `initiator` field (`"user"` or `"agent"`) is the only difference.

### History storage layer

A shared module used by both the backend plugin and the MCP server:

```
src/storage/
├── historyStore.ts     # append(), query(), tail()
└── historyTypes.ts     # TypeScript interfaces
```

**API:**

```typescript
// Append a single execution record for a specific endpoint
append(routeGroup: string, testCaseId: string, record: ExecutionRecord): Promise<void>

// Query history for a specific endpoint with filters, returns most recent first
query(routeGroup: string, testCaseId: string, filters?: {
  initiator?: 'user' | 'agent',
  result?: 'pass' | 'fail',
  limit?: number,       // default 50
  offset?: number,      // for pagination
}): Promise<ExecutionRecord[]>

// Get the last N records for a specific endpoint (fast — reads from end of file)
tail(routeGroup: string, testCaseId: string, count: number): Promise<ExecutionRecord[]>

// Query history across all endpoints in a route group
queryGroup(routeGroup: string, filters?: {
  initiator?: 'user' | 'agent',
  result?: 'pass' | 'fail',
  limit?: number,
  offset?: number,
}): Promise<ExecutionRecord[]>
```

**Implementation notes:**

- `append()` opens the per-endpoint file in append mode (`fs.appendFile`), writes one line, closes. Creates the route group directory and file if they don't exist. No locking needed for single-writer-per-process.
- `query()` reads the endpoint's history file, parses each line, filters, sorts by timestamp descending, applies limit/offset.
- `tail()` reads from end of the endpoint's file backwards for efficiency (avoids parsing the entire file for recent results).
- `queryGroup()` reads all endpoint history files within a route group directory, merges and sorts by timestamp descending. Useful for route-group-level overview.

### Writing history — two writers, one schema

**User-initiated (Backstage backend):**
After the `POST /api/api-testing/execute` handler completes execution and evaluates assertions, it calls `historyStore.append()` with `initiator: "user"`.

**Agent-initiated (MCP server):**
The `run_test_cases` MCP tool executes tests and calls `historyStore.append()` with `initiator: "agent"` and `agent_identity` set to the MCP session identifier.

Both share the `historyStore` module, ensuring identical format.

### Backend API additions

```
GET /api/api-testing/history/:routeGroup/:testCaseId
    ?initiator=user|agent
    &result=pass|fail
    &limit=50
    &offset=0
```

Returns an array of `ExecutionRecord` objects for a specific endpoint, most recent first.

```
GET /api/api-testing/history/:routeGroup
    ?initiator=user|agent
    &result=pass|fail
    &limit=50
    &offset=0
```

Returns an array of `ExecutionRecord` objects across all endpoints in the route group, most recent first. Useful for route-group-level overview.

**Note:** The `:routeGroup` parameter uses the dash-encoded form (e.g., `v1-rules` instead of `v1/rules`). The frontend `ApiTestingClient` applies `encodeRouteGroup()` before constructing these URLs. See Phase 3 for details on route group encoding.

### Frontend API client

The `ApiTestingClient` provides two methods for fetching history:

```ts
// Per-endpoint history with filter/pagination support
getEndpointHistory(routeGroup: string, testCaseId: string, options?: {
  initiator?: 'user' | 'agent';
  result?: 'pass' | 'fail';
  limit?: number;
  offset?: number;
}): Promise<ExecutionRecord[]>

// Route-group-level history
getRouteGroupHistory(routeGroup: string, options?: { ... }): Promise<ExecutionRecord[]>
```

Both methods encode the route group and construct query parameters from the filter options.

### Frontend components

#### `EndpointHistory` component (in `plugins/api-testing/`)

Each test case row includes a collapsible "History" section rendered by the `EndpointHistory` component. It sits directly below each `TestCaseRow` in the table.

- **Collapsed state:** A compact header row with a history icon (🕐), the label "History (N)" showing the record count, and a chevron. The header has reduced opacity (0.7) that increases on hover (1.0) with a 150ms transition, keeping it unobtrusive until needed.
- **Expanded state:** Reveals the filter bar and execution history table.
- Default: shows last 10 executions for the endpoint
- "Show more" button loads the next page
- Each row shows: relative timestamp, initiator chip (User/Agent), result chip (Pass/Fail), duration in ms

##### Styling details

- **Root:** Compact padding (`0.5, 2`) to avoid adding too much vertical space between test cases
- **Initiator chips:** Color-coded — User gets `theme.palette.info.main` background, Agent gets `theme.palette.warning.main` background, both with white text and icons (Person/Android)
- **Result chips:** Pass uses `theme.palette.success.main` (green), Fail uses `theme.palette.error.main` (red), both with white text
- **Timestamps:** Displayed as relative time (e.g., "5m ago", "2h ago", "3d ago") using a `relativeTime()` helper
- **Duration:** Monospace font showing milliseconds (e.g., "120ms")
- **Row hover:** Rows highlight on hover with `theme.palette.action.hover` and have pointer cursor

#### Filter bar

- **Initiator filter:** `ButtonGroup` with three-way toggle — All | User | Agent
- **Result filter:** `ButtonGroup` with three-way toggle — All | Pass | Fail
- Active filter button uses `theme.palette.primary.main` background with white text
- Buttons use compact styling (`fontSize: 0.7rem`, `textTransform: none`) to keep the filter bar small
- Filters apply client-side for the loaded records; the backend query params ensure the next page respects filters

#### Expandable execution detail

Clicking a history row expands to show the full `ExecutionDetailRow`:

- **Request:** method, URL, headers (one per line), body (formatted JSON)
- **Response:** status code in header, headers (one per line), body (formatted JSON) or "(empty body)"
- **Failure reason:** if the test failed, rendered in error color with a bold label

##### Dark mode support

All `pre` blocks in both `TestCaseRow` and `EndpointHistory` use theme-aware styling:

```ts
pre: {
  backgroundColor:
    theme.palette.type === 'dark'
      ? theme.palette.grey[900]   // dark background for dark mode
      : theme.palette.grey[100],  // light background for light mode
  color: theme.palette.text.primary,
  // ... monospace font, overflow, word-wrap
}
```

This prevents the white-on-white text issue where `pre` blocks were unreadable in dark mode.

#### Real-time updates via context

The `ExecutionHistoryContext` provides a registration mechanism for WebSocket updates:

- Parent components wrap test case tables in an `ExecutionHistoryProvider`
- Each `EndpointHistory` registers a listener via `historyCtx.registerListener(testCaseId, prependRecord)`
- When a WebSocket `execution-completed` event arrives, the context dispatches the record to the matching endpoint's listener
- The `prependRecord` callback (from `useExecutionHistory`) inserts the new record at the top of the list without refetching

### Frontend component structure

```
plugins/api-testing/src/components/EndpointHistory/
├── EndpointHistory.tsx          # Main component with history table, filter bar, expansion
└── ExecutionHistoryContext.tsx   # React context for WebSocket-driven real-time prepends

plugins/api-testing/src/hooks/
└── useExecutionHistory.ts       # Hook: fetch, paginate, filter, and prepend records
```

The `useExecutionHistory` hook manages:

- Initial fetch of records for a specific `(routeGroup, testCaseId)` pair
- Filter state (`initiator`, `result`) with `setFilters` setter
- Pagination via `loadMore` (increments offset, appends results)
- A `prependRecord` callback for real-time WebSocket inserts
- Loading and `hasMore` state for UI indicators

### WebSocket integration

When a new history entry is written (by either writer), a WebSocket message is broadcast:

```json
{
  "type": "execution-completed",
  "routeGroup": "/v1/rules",
  "testCaseId": "tc-001",
  "record": { ... }
}
```

The frontend's `useWebSocket` hook receives this and prepends the new record to the matching endpoint's history list without a full refetch.

## Steps

### 4.1 Create the history storage layer

Implement `historyStore.ts` with `append()`, `query()`, and `tail()`. Unit test with temporary `.jsonl` files.

### 4.2 Wire history writes into the backend execution endpoint

After test execution in `POST /api/api-testing/execute`, call `historyStore.append()` with `initiator: "user"`.

### 4.3 Wire history writes into the MCP `run_test_cases` tool

After test execution in the MCP tool, call `historyStore.append()` with `initiator: "agent"`.

### 4.4 Implement the history query endpoints

Add `GET /api/api-testing/history/:routeGroup/:testCaseId` for per-endpoint history and `GET /api/api-testing/history/:routeGroup` for route-group-level overview, both with filter/pagination support.

### 4.5 Build the frontend history section

Add a per-endpoint history section to each test case row, with filtering and expandable execution details.

### 4.6 Wire up WebSocket for live history updates

Broadcast `execution-completed` events; frontend prepends new records in real time.

### 4.7 Verify

- Run a test from the UI → history row appears under that endpoint with 👤 User
- Run a test from Claude Code via MCP → history row appears under that endpoint with 🤖 Agent
- Each endpoint shows only its own history, chronologically ordered
- Filter by "Agent only" → user runs disappear
- Filter by "Fail only" → passing tests disappear
- Expand a failed row → see request/response diff and failure reason
- Run a test via MCP while the UI is open → new row appears under the correct endpoint in real time

## What comes out of this phase

A complete execution audit trail, unified across human and agent activity, with real-time updates and full debugging detail.

## Risks

| Risk                                  | Impact            | Mitigation                                                                                   |
| ------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| History files grow unbounded          | Disk usage        | Implement optional rotation: archive files older than 30 days; or add a `max_entries` config |
| Concurrent appends from backend + MCP | Line corruption   | JSONL is append-only and atomic at the OS level for single-line writes; no interleaving risk |
| Sensitive data in response bodies     | Security concern  | Mask auth headers; add configurable body redaction rules for future                          |
| `tail()` on large files is slow       | History page lags | Maintain a separate `.recent` file with last 100 entries for fast reads                      |
