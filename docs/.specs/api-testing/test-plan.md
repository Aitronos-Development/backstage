# API Testing Feature — Test Plan

**Status:** Draft
**Author:** Platform Engineering Team
**Date:** February 2026

---

This document defines the test strategy for the API Testing feature. Tests are organized by component, with each section mapping to a development phase.

## Test categories

| Category | Purpose | Where it runs |
| --- | --- | --- |
| **Unit tests** | Verify individual functions and modules in isolation | `yarn test` (Jest) |
| **Integration tests** | Verify multi-component flows (MCP → storage → file system) | `yarn test` (Jest, with temp directories) |
| **E2E tests** | Verify the full user/agent experience through real UI + MCP | Manual + automated via Phase 6 validation |

---

## 1. MCP Server Core (Phase 1)

### 1.1 Unit: Server startup

| # | Test | Expected |
| --- | --- | --- |
| 1.1.1 | MCP server instantiates without errors | Server object created, no exceptions |
| 1.1.2 | All 7 tool schemas are registered | `server.listTools()` returns 7 tools with valid JSON Schema |
| 1.1.3 | Tool names are unique | No duplicate tool names |
| 1.1.4 | Each tool schema validates required parameters | Calling a tool without required params returns a schema validation error |

### 1.2 Unit: Auto-registration

| # | Test | Expected |
| --- | --- | --- |
| 1.2.1 | First run — creates MCP entry in settings | `.claude/settings.json` contains `api-testing` under `mcpServers` |
| 1.2.2 | Second run — no-op, file unchanged | File content identical before and after |
| 1.2.3 | Settings file doesn't exist — creates it | New `.claude/settings.json` created with correct structure |
| 1.2.4 | Settings file has other entries — preserves them | Existing MCP entries are not modified or removed |
| 1.2.5 | Settings file is malformed JSON — logs error, does not crash | Server starts, registration skipped, error logged |

### 1.3 Integration: Auto-start with `yarn start`

| # | Test | Expected |
| --- | --- | --- |
| 1.3.1 | Run `yarn start` — MCP server process is alive | Process appears in `ps` output; console shows `[api-testing-mcp]` prefix |
| 1.3.2 | Kill the Backstage backend — MCP server also exits | Child process cleaned up, no orphan |
| 1.3.3 | MCP server crashes — backend continues running | Backend logs the error, does not crash itself |

---

## 2. Test Case Storage & Editing (Phase 2)

### 2.1 Unit: File store — create

| # | Test | Expected |
| --- | --- | --- |
| 2.1.1 | Create first test case for a route group | JSON file created at `api-tests/<route-group>.json`; contains 1 test case |
| 2.1.2 | Create second test case in same route group | File now contains 2 test cases; first one unchanged |
| 2.1.3 | Test case gets auto-generated ID | ID matches `tc-` + 6 chars pattern |
| 2.1.4 | `created_at` and `updated_at` are set | Both timestamps are ISO 8601 and within 1 second of now |
| 2.1.5 | Create with missing required fields (no name) | Returns descriptive error; file unchanged |

### 2.2 Unit: File store — read

| # | Test | Expected |
| --- | --- | --- |
| 2.2.1 | Read existing test case by ID | Returns full JSON matching what was created |
| 2.2.2 | Read non-existent test case ID | Returns error: "Test case 'tc-xyz' not found in /v1/rules" |
| 2.2.3 | Read from non-existent route group | Returns error: "No test cases found for route group /v1/unknown" |

### 2.3 Unit: File store — list

| # | Test | Expected |
| --- | --- | --- |
| 2.3.1 | List from route group with 3 test cases | Returns array of 3 objects |
| 2.3.2 | List from route group with no test cases | Returns empty array |
| 2.3.3 | List from non-existent route group file | Returns empty array (not an error) |

### 2.4 Unit: File store — delete

| # | Test | Expected |
| --- | --- | --- |
| 2.4.1 | Delete existing test case | Test case removed from file; others unchanged |
| 2.4.2 | Delete last test case in a route group | File contains empty `test_cases` array |
| 2.4.3 | Delete non-existent test case | Returns error: "Test case not found" |

### 2.5 Unit: Edit — replace entire field

| # | Test | Expected |
| --- | --- | --- |
| 2.5.1 | Replace `name` field | `name` changed; all other fields identical |
| 2.5.2 | Replace `method` from GET to POST | `method` is now POST; everything else unchanged |
| 2.5.3 | Replace `headers` with new object | `headers` fully replaced; no merge |
| 2.5.4 | Replace `assertions` with new object | `assertions` fully replaced |
| 2.5.5 | `updated_at` timestamp changes | `updated_at` > `created_at`; `created_at` unchanged |

### 2.6 Unit: Edit — find and replace within field

| # | Test | Expected |
| --- | --- | --- |
| 2.6.1 | Replace substring in `body` (string match) | Only the matched substring changed |
| 2.6.2 | `old_value` not found in field | Returns error: "old_value not found in field 'body'" |
| 2.6.3 | `replace_all: false` — only first occurrence replaced | Second occurrence still present |
| 2.6.4 | `replace_all: true` — all occurrences replaced | No remaining occurrences of `old_value` |

### 2.7 Unit: Edit — merge mode

| # | Test | Expected |
| --- | --- | --- |
| 2.7.1 | Merge single key into `headers` | New key added; existing keys preserved |
| 2.7.2 | Merge overwrites existing key in `headers` | Key updated; other keys preserved |
| 2.7.3 | Merge into `assertions` — update `status_code` only | `status_code` changed; `body_contains` and `body_schema` preserved |
| 2.7.4 | Merge on a non-object field (e.g., `name`) | Returns error: "Cannot merge into non-object field 'name'" |
| 2.7.5 | Merge with nested objects | Deep merge — nested keys preserved |

### 2.8 Unit: Edit — optimistic concurrency

| # | Test | Expected |
| --- | --- | --- |
| 2.8.1 | `old_value` matches current state — edit succeeds | Field updated correctly |
| 2.8.2 | `old_value` does not match (stale read) — edit rejected | Error: "Field 'assertions' was modified since last read. Current value: {...}" |
| 2.8.3 | Partial `old_value` match on object (subset of keys) | Succeeds if all specified keys match; other keys ignored |

### 2.9 Unit: Atomic writes

| # | Test | Expected |
| --- | --- | --- |
| 2.9.1 | Write completes fully or not at all | No partial JSON files on disk after any operation |
| 2.9.2 | Concurrent writes to different route groups | Both succeed; no cross-file interference |

### 2.10 Unit: File watcher

| # | Test | Expected |
| --- | --- | --- |
| 2.10.1 | Create a test case → watcher emits event | `test-cases-changed` event with correct route group |
| 2.10.2 | Edit a test case → watcher emits event | Event emitted with the modified route group |
| 2.10.3 | External file modification (e.g., git checkout) | Watcher detects change and emits event |
| 2.10.4 | Non-JSON file created in `api-tests/` | No event emitted |

---

## 3. Frontend Test Runner UI (Phase 3)

### 3.1 Unit: Component rendering

| # | Test | Expected |
| --- | --- | --- |
| 3.1.1 | `ApiTestingPage` renders route group cards | One card per route group file |
| 3.1.2 | `RouteGroupCard` collapsed state | Shows route group name and neutral status |
| 3.1.3 | `RouteGroupCard` expanded state | Shows test case table with correct rows |
| 3.1.4 | `TestCaseRow` renders name, play, stop, and result columns | All columns present; play enabled, stop disabled |
| 3.1.5 | `TestResultBadge` renders all 4 states | idle (—), running (spinner), pass (green ✅), fail (red ❌) |

### 3.2 Unit: Card header color logic

| # | Test | Expected |
| --- | --- | --- |
| 3.2.1 | No tests executed → neutral gray | Header is gray |
| 3.2.2 | All executed tests passed → green | Header is green |
| 3.2.3 | Any executed test failed → red | Header is red |
| 3.2.4 | Tests currently running → pulsing blue | Header has pulse animation |
| 3.2.5 | Mix of pass and not-yet-run → green | Only executed tests count |

### 3.3 Integration: Test execution (user-initiated)

| # | Test | Expected |
| --- | --- | --- |
| 3.3.1 | Click ▶ — request sent to backend | `POST /api/api-testing/execute` called with correct test case ID |
| 3.3.2 | Test passes — row shows pass result | Green badge with response time |
| 3.3.3 | Test fails — row shows fail result | Red badge; expandable error details |
| 3.3.4 | Click ⏹ while running — test aborted | Row returns to idle; "Aborted" shown briefly |
| 3.3.5 | ⏹ disabled when test is not running | Button is grayed out / unclickable |
| 3.3.6 | ▶ disabled while test is running | Prevents double-execution |

### 3.4 Integration: WebSocket updates

| # | Test | Expected |
| --- | --- | --- |
| 3.4.1 | Agent creates test case → UI updates | New test case row appears in the correct card without page refresh |
| 3.4.2 | Agent deletes test case → UI updates | Row removed from the card |
| 3.4.3 | Agent edits test case → UI updates | Row reflects the updated values |
| 3.4.4 | WebSocket disconnects → reconnect | UI shows brief "reconnecting" indicator; recovers automatically |

### 3.5 Integration: Backend execution endpoint

| # | Test | Expected |
| --- | --- | --- |
| 3.5.1 | Valid test case with `{{variables}}` → variables resolved | Request sent with resolved values |
| 3.5.2 | Test case with unresolved variable | Returns error: "Variable '{{missing}}' not found" |
| 3.5.3 | Target API is unreachable | Returns fail with "Connection refused" or timeout error |
| 3.5.4 | Target API returns unexpected status | Assertion fails with clear diff: "Expected 201, got 500" |
| 3.5.5 | Target API response missing required fields | Assertion fails: "Missing required field 'id' in response" |
| 3.5.6 | Execution timeout (>30s) | Returns fail with "Timeout after 30000ms" |

---

## 4. Execution History (Phase 4)

### 4.1 Unit: History store — append

| # | Test | Expected |
| --- | --- | --- |
| 4.1.1 | Append a record — file created if absent | `.jsonl` file exists with 1 line |
| 4.1.2 | Append second record — appended to existing file | File has 2 lines; first line unchanged |
| 4.1.3 | Auth headers are masked | `Authorization` value stored as `Bearer ***` |
| 4.1.4 | Record includes all required fields | timestamp, initiator, test_case_id, result, duration_ms all present |

### 4.2 Unit: History store — query

| # | Test | Expected |
| --- | --- | --- |
| 4.2.1 | Query all — returns chronological desc | Most recent first |
| 4.2.2 | Filter `initiator: "agent"` | Only agent entries returned |
| 4.2.3 | Filter `initiator: "user"` | Only user entries returned |
| 4.2.4 | Filter `result: "fail"` | Only failed entries returned |
| 4.2.5 | Combined filter: agent + fail | Only agent failures returned |
| 4.2.6 | `limit: 5` | Returns at most 5 records |
| 4.2.7 | `offset: 5, limit: 5` | Skips first 5, returns next 5 |
| 4.2.8 | Empty history file | Returns empty array |

### 4.3 Unit: History store — tail

| # | Test | Expected |
| --- | --- | --- |
| 4.3.1 | Tail 10 from file with 100 entries | Returns last 10 entries |
| 4.3.2 | Tail 10 from file with 3 entries | Returns all 3 entries |
| 4.3.3 | Tail from empty file | Returns empty array |

### 4.4 Integration: User execution writes history

| # | Test | Expected |
| --- | --- | --- |
| 4.4.1 | User clicks ▶ → history entry written | `.jsonl` has new line with `"initiator": "user"` |
| 4.4.2 | History entry matches execution result | Pass/fail, status code, duration all match |

### 4.5 Integration: Agent execution writes history

| # | Test | Expected |
| --- | --- | --- |
| 4.5.1 | Agent calls `run_test_cases` → history entry written | `.jsonl` has new line with `"initiator": "agent"` |
| 4.5.2 | `agent_identity` is populated | Non-empty string identifying the MCP session |

### 4.6 Integration: Frontend history display

| # | Test | Expected |
| --- | --- | --- |
| 4.6.1 | History section shows recent executions | Rows rendered with correct data |
| 4.6.2 | User entry shows 👤 icon | Initiator column shows user icon |
| 4.6.3 | Agent entry shows 🤖 icon | Initiator column shows agent icon |
| 4.6.4 | Click "Show more" → loads next page | More rows appear; no duplicates |
| 4.6.5 | Expand a row → shows request/response | Full details rendered as formatted JSON |
| 4.6.6 | New execution via WebSocket → prepended to list | New row appears at top without refresh |

### 4.7 Integration: Filters

| # | Test | Expected |
| --- | --- | --- |
| 4.7.1 | Toggle "Agent only" → user rows hidden | Only 🤖 rows visible |
| 4.7.2 | Toggle "Fail only" → passing rows hidden | Only ❌ rows visible |
| 4.7.3 | Both filters active → intersection | Only agent failures shown |
| 4.7.4 | Clear all filters → full list restored | All rows visible again |

---

## 5. Dynamic Variables (Phase 5)

### 5.1 Unit: Variable resolution engine

| # | Test | Expected |
| --- | --- | --- |
| 5.1.1 | Single variable in string | `"Bearer {{auth_token}}"` → `"Bearer abc123"` |
| 5.1.2 | Multiple variables in one string | `"{{base_url}}/v1/{{resource}}"` → `"http://localhost:8000/v1/rules"` |
| 5.1.3 | Variable in nested object | Deep replacement works recursively |
| 5.1.4 | No variables in string | String returned unchanged |
| 5.1.5 | Unresolved variable | Throws: "Variable '{{missing}}' not found in any layer" |
| 5.1.6 | Circular reference detection | Throws: "Circular variable reference detected: a → b → a" |
| 5.1.7 | Layer priority: runtime > localStorage > app-config | Runtime value used when all 3 defined; app-config used when runtime and localStorage absent |

### 5.2 Unit: App-config layer

| # | Test | Expected |
| --- | --- | --- |
| 5.2.1 | Read variables from `develop` environment | Returns `base_url`, `auth_token`, etc. for develop |
| 5.2.2 | Switch to `staging` environment | Returns staging-specific values |
| 5.2.3 | Environment not found in config | Returns error: "Environment 'unknown' not configured" |
| 5.2.4 | `apiTesting` section absent from config | Returns empty variable set; no crash |

### 5.3 Integration: Frontend variable UI

| # | Test | Expected |
| --- | --- | --- |
| 5.3.1 | Environment switcher shows all environments | Dropdown lists develop, staging, production |
| 5.3.2 | Switch environment → variables table updates | Values change to match selected environment |
| 5.3.3 | Add localStorage override | New row appears with "localStorage" source badge |
| 5.3.4 | Delete localStorage override | Row reverts to app-config value (or disappears if no app-config fallback) |
| 5.3.5 | Set runtime override → run test → override applies | Test uses the runtime value; next run without override uses localStorage/app-config |
| 5.3.6 | Variable table shows source for each variable | Correct badge: "app-config" / "localStorage" / "runtime" |

### 5.4 Integration: MCP variable overrides

| # | Test | Expected |
| --- | --- | --- |
| 5.4.1 | Agent passes `variable_overrides` → overrides apply | Test uses agent-provided values |
| 5.4.2 | Agent passes no overrides → app-config used | Test uses app-config defaults |
| 5.4.3 | Agent override for undefined variable | Variable resolved from override; no error |

---

## 6. End-to-End Validation (Phase 6)

These tests are the Phase 6 validation checklist executed as a complete walkthrough. See [phase-6-e2e-validation-create-rule-tests.md](phases/phase-6-e2e-validation-create-rule-tests.md) for the full checklist (V1–V10).

### Summary of E2E scenarios

| # | Scenario | Phases exercised |
| --- | --- | --- |
| 6.1 | MCP server auto-starts and registers | 1 |
| 6.2 | Agent creates 3 test cases via MCP | 1, 2 |
| 6.3 | UI shows agent-created tests in real time | 2, 3 |
| 6.4 | Agent runs all 3 tests via MCP — all pass | 1, 2, 5 |
| 6.5 | Agent execution history appears in UI | 3, 4 |
| 6.6 | User runs tests from UI — pass | 3, 5 |
| 6.7 | User execution history appears alongside agent history | 4 |
| 6.8 | History filters work (initiator, result) | 4 |
| 6.9 | Agent edits a test case — UI updates | 2, 3 |
| 6.10 | Environment switch changes variables | 5 |
| 6.11 | Restart Backstage — all data persists | 1, 2, 4 |
| 6.12 | MCP server crash — UI continues for user tests | 1, 3 |

---

## Test coverage matrix

| Component | Unit | Integration | E2E |
| --- | --- | --- | --- |
| MCP server startup | ✅ 1.1 | ✅ 1.3 | ✅ 6.1 |
| Auto-registration | ✅ 1.2 | ✅ 1.3 | ✅ 6.1 |
| Test case CRUD | ✅ 2.1–2.4 | ✅ 2.9 | ✅ 6.2, 6.9 |
| Edit model (replace/merge/concurrency) | ✅ 2.5–2.8 | — | ✅ 6.9 |
| File watcher | ✅ 2.10 | ✅ 3.4 | ✅ 6.3 |
| Frontend rendering | ✅ 3.1–3.2 | — | ✅ 6.3, 6.5 |
| Test execution (user) | — | ✅ 3.3, 3.5 | ✅ 6.6 |
| Test execution (agent) | — | — | ✅ 6.4 |
| WebSocket updates | — | ✅ 3.4 | ✅ 6.3, 6.5 |
| History store | ✅ 4.1–4.3 | ✅ 4.4–4.5 | ✅ 6.5, 6.7 |
| History UI + filters | — | ✅ 4.6–4.7 | ✅ 6.8 |
| Variable resolution | ✅ 5.1 | ✅ 5.3–5.4 | ✅ 6.10 |
| App-config layer | ✅ 5.2 | ✅ 5.3 | ✅ 6.10 |
| Resilience | — | — | ✅ 6.11, 6.12 |
