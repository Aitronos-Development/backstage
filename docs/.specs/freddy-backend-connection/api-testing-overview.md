# API Testing in Backstage

**Status:** Draft
**Author:** Platform Engineering Team
**Date:** February 2026

---

## The Problem

Freddy Backend has ~30 API route groups, and today there is no way to test individual endpoints from within Backstage. A developer who wants to verify that an API behaves correctly has to leave Backstage, open Postman or curl, manually set headers and tokens, and visually compare responses against expectations. There is no shared, in-context way to run test cases against specific endpoints, track pass/fail results, or manage environment-specific variables like base URLs and auth tokens — all without leaving the developer portal.

## The Goal

Give every API listed in Backstage a **test runner interface** where a developer can:

1. **Click on any API** in the API documentation view and see a collapsible list of test cases associated with that endpoint
2. **Run or stop individual test cases** — each test case has a play button to execute and a stop button to abort mid-flight
3. **See pass/fail results inline** — the API card/div highlights green on success or red on failure, giving immediate visual feedback without navigating away
4. **Configure dynamic variables** — headers, auth tokens, and base URLs are assignable per-environment and resolved at runtime, without round-tripping to a database or cloud store

## Agent-Driven Test Management via MCP

Test cases are **not** written or maintained by hand in the browser. They are authored and updated by Claude Code agents through a dedicated **local MCP (Model Context Protocol) server** that ships with this feature.

### How it works

A lightweight MCP server runs alongside the Backstage dev server. It exposes tools that allow Claude Code to:

1. **List test cases** — retrieve all test cases for a given API route group
2. **Read test case** — return the full JSON definition of a single test case (name, method, path, headers, body, assertions), so the agent can inspect it before making changes — just like reading a file before editing
3. **Create test cases** — add new test cases with a name, HTTP method, path, headers, body, and expected assertions (status code, response body shape, specific field values)
4. **Edit test cases** — make surgical, partial modifications to an existing test case (see [Editing model](#editing-model) below)
5. **Delete test cases** — remove test cases that are no longer relevant
6. **Run test cases** — execute one or more test cases and return structured pass/fail results
7. **Get execution history** — retrieve past test runs with their results, timestamps, and initiator (agent or user)

### Editing model

Test case editing follows the same paradigm as editing source files in code — **read first, then make targeted changes** — rather than replacing the entire test case on every update.

The `edit_test_case` MCP tool accepts the following parameters:

| Parameter | Required | Description |
| --- | --- | --- |
| `test_case_id` | yes | The ID of the test case to modify |
| `route_group` | yes | The API route group the test belongs to |
| `field` | yes | Which field to edit: `name`, `method`, `path`, `headers`, `body`, `assertions` |
| `old_value` | no | The current value (or substring) to match against — acts as a safety check to prevent stale edits |
| `new_value` | yes | The replacement value |
| `replace_all` | no | If `true`, replaces all occurrences of `old_value` within the field (useful for bulk find-and-replace in headers or body). Defaults to `false` (first match only) |
| `merge` | no | If `true` and the field is an object (e.g., `headers`, `assertions`), deep-merges `new_value` into the existing object instead of replacing the whole field. Defaults to `false` |

**Why this matters:**

- **Partial header updates** — change a single header without rewriting all of them. Example: replace `old_value: "Bearer expired_token"` with `new_value: "Bearer fresh_token"` on the `Authorization` header, leaving all other headers untouched
- **Targeted assertion changes** — update the expected status code from `200` to `201` without touching the response body assertion
- **Body substring replacement** — find-and-replace a specific field value in a JSON body (e.g., change `"name": "old_rule"` to `"name": "updated_rule"`) without rewriting the entire request body
- **Conflict prevention** — providing `old_value` ensures the edit fails if the test case was modified since the agent last read it, avoiding silent overwrites of concurrent changes (same principle as optimistic concurrency in file editing)

**Example flow** — an agent updating a single assertion on a test case:

```
1. read_test_case(route_group="/v1/rules", test_case_id="tc-001")
   → returns full test case JSON

2. edit_test_case(
     route_group="/v1/rules",
     test_case_id="tc-001",
     field="assertions",
     old_value={ "status_code": 200 },
     new_value={ "status_code": 201 },
     merge=true
   )
   → merges the new status_code into assertions, leaving all other assertions intact
```

This is intentionally modeled after how Claude Code's `Edit` tool works on source files: read the file, target a specific string, replace just that part. Agents should never need to rewrite an entire test case to change one header or one assertion.

### Auto-start and auto-registration

- When `yarn start` (the dev server) is run, the MCP server starts automatically as a child process on a local port (e.g., `localhost:7008`)
- On first startup, the MCP server **registers itself** in the Claude Code MCP settings file (`.claude/settings.json` or the project-level MCP config) so that any Claude Code session in this workspace can immediately discover and use its tools — no manual configuration required
- If the MCP server is already registered, startup is a no-op

### Test case storage

Test cases are stored as **JSON files on disk** inside the repository (e.g., `api-tests/<route-group>.json`). This means:

- Test cases are version-controlled alongside the code they test
- No database dependency
- Agents can read/write them via the MCP tools, and the Backstage UI reads the same files to render the test list
- The MCP server watches these files for changes and pushes updates to the Backstage frontend via WebSocket, so the UI stays in sync without polling

### Validation via the Create Rule endpoint

To validate this MCP flow end-to-end, the agent will use the MCP to create **3 test cases** for the `/v1/rules` (create rule) endpoint:

| # | Test Case | What it checks |
| --- | --- | --- |
| 1 | Create rule with valid payload returns 201 | Happy path — valid body, expect 201 and the created rule object in the response |
| 2 | Create rule with missing required fields returns 422 | Validation — omit required fields, expect 422 with a structured error describing missing fields |
| 3 | Create rule with invalid auth token returns 401 | Auth guard — send an invalid/expired token, expect 401 Unauthorized |

These three cases cover the basic functionality surface: success, validation failure, and auth failure. The agent creates them through the MCP, runs them, and the results appear in the Backstage UI — proving the full loop (agent → MCP → test execution → UI) works.

## Execution History — User and Agent

Every test execution is recorded, regardless of who initiated it. The UI provides a **unified execution history** so a developer can see all test activity in one place.

### What gets recorded per execution

| Field | Description |
| --- | --- |
| **Timestamp** | When the test was executed |
| **Initiator** | `user` (triggered from the Backstage UI) or `agent` (triggered via MCP by Claude Code) |
| **Agent identity** | If initiated by an agent, the session or agent identifier is recorded |
| **Test case name** | Which test case was run |
| **API route group** | Which route group the test belongs to |
| **Result** | Pass or fail |
| **Response details** | Status code, response time, and failure reason (if any) |

### What the developer sees

Below the test case list for each API route group, a **History** section shows recent executions:

| Time | Initiated by | Test Case | Result | Duration |
| --- | --- | --- | --- | --- |
| 2 min ago | 🤖 Agent | Create rule with valid payload returns 201 | ✅ Pass | 120ms |
| 2 min ago | 🤖 Agent | Create rule with missing fields returns 422 | ✅ Pass | 85ms |
| 2 min ago | 🤖 Agent | Create rule with invalid auth returns 401 | ✅ Pass | 62ms |
| 15 min ago | 👤 User | Create rule with valid payload returns 201 | ❌ Fail | 340ms |

The history is stored in a local file (`api-tests/.history/<route-group>.jsonl`) — append-only, one JSON line per execution. No database. The MCP server writes agent-initiated entries; the Backstage backend writes user-initiated entries. Both use the same schema so the UI renders them identically.

A developer can:

- **Filter by initiator** — show only user runs, only agent runs, or both
- **Filter by result** — show only failures to quickly find regressions
- **Expand a row** — see full request/response details and failure reason

## What This Is Not

This is a **test execution and feedback layer**, not a full QA platform:

- No load testing or performance benchmarking
- No mock server or request interception
- No test authoring UI in the browser (agents create and maintain tests via MCP; users trigger them via the UI)

These can all be layered on in future iterations. For now, the only question we're answering is: **"Does this API work correctly, right now, from inside Backstage — and can an agent keep the tests up to date for me?"**

## Dynamic Variables — Why Not a Database?

Storing dynamic variables (base URL, auth tokens, custom headers) in a database or cloud service adds a network round-trip on every test execution. For a tool that needs to feel instant, that latency is unacceptable.

Instead, dynamic variables are resolved using a **local-first layered config strategy**:

| Layer | Source | Example |
| --- | --- | --- |
| **App config** | `app-config.yaml` under a dedicated `apiTesting` key | Base URLs per environment (`develop`, `staging`, `production`) |
| **Browser local storage** | Per-user overrides stored in the browser | Personal auth tokens, one-off header values |
| **Runtime injection** | Inline overrides at test execution time via the UI | Ad-hoc token for a single test run |

Resolution order: **runtime injection > local storage > app config > defaults**. This means a developer can set long-lived defaults in config, personalize via the browser, and override anything at the moment of execution — all with zero network latency.

## What the Developer Sees

A developer navigates to the API documentation tab for Freddy Backend.

**API list view** — each parent route group is displayed as a card:

| API Route Group | Status |
| --- | --- |
| `/v1/health` | — |
| `/v1/auth` | — |
| `/v1/assistants` | — |
| `/v1/threads` | — |
| `/v1/messages` | — |

The developer clicks on `/v1/auth`. The card expands to reveal a list of test cases:

| Test Case | Actions | Result |
| --- | --- | --- |
| Valid login returns 200 and token | ▶ ⏹ | — |
| Expired token returns 401 | ▶ ⏹ | — |
| Missing credentials returns 422 | ▶ ⏹ | — |

The developer clicks ▶ on "Valid login returns 200 and token." The test runs. The result column updates:

| Test Case | Actions | Result |
| --- | --- | --- |
| Valid login returns 200 and token | ▶ ⏹ | ✅ Pass |
| Expired token returns 401 | ▶ ⏹ | — |
| Missing credentials returns 422 | ▶ ⏹ | — |

The `/v1/auth` card header turns **green** because all executed tests passed. If any test fails, the card header turns **red** and the failing test row highlights with the failure reason.

**Variable configuration panel** — accessible via a settings icon on the testing view:

- **Base URL:** dropdown selecting from app-config environments, or a free-text override
- **Headers:** key-value editor with support for variable interpolation (`{{auth_token}}`)
- **Tokens:** secure input field, value persisted only in browser local storage

## Scope Summary

| In scope | Out of scope (future) |
| --- | --- |
| Collapsible test case list per API | Test authoring UI in the browser |
| Play/stop controls per test case | CI/CD triggered test runs |
| Inline pass/fail highlighting on API cards | Load testing / performance benchmarks |
| Dynamic variables via app-config + local storage | Mock server / request stubbing |
| Runtime variable override in UI | Database-backed variable storage |
| Per-environment base URL switching | |
| Local MCP server for agent-driven test CRUD and execution | |
| File-editing-style test case modifications (partial edits, merge, replace) | |
| MCP auto-starts with `yarn start`, auto-registers in Claude Code settings | |
| Unified execution history (user + agent initiated) | |
| History stored as local `.jsonl` files, no database | |
| 3 validation test cases for `/v1/rules` created via MCP | |

## Success Criteria

- A developer can click any API route group and see its associated test cases
- Each test case can be started and stopped independently via play/stop buttons
- Pass/fail results appear inline, and the API card visually highlights green or red
- Dynamic variables (base URL, token, headers) are configurable without any database or cloud dependency
- Variable resolution is instant — no perceptible latency from config lookup
- The MCP server starts automatically when `yarn start` is run and registers itself in Claude Code MCP settings without manual configuration
- A Claude Code agent can create, edit (partial field-level changes), delete, and execute test cases through the MCP tools
- The edit tool supports partial modifications — changing a single header, one assertion, or a substring in the body — without rewriting the entire test case
- The 3 test cases for the create rule endpoint (`/v1/rules`) are created by the agent via MCP and execute successfully
- The Backstage UI shows execution history from both user-triggered and agent-triggered runs, with clear initiator labels
- A developer can filter execution history by initiator (user vs agent) and by result (pass vs fail)
