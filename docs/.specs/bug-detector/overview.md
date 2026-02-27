# MCP: Auto Bug Ticket Creation from API Test Runs

## Context

We have an existing API testing UI that:
- Runs tests against API endpoints grouped under parent routes (e.g., `/v1/auth` contains `/v1/auth/login`, `/v1/auth/verify`, etc.)
- Displays pass/fail status with error logs in the UI
- Writes a JSON file with error logs to a history table after each run
- Has a bug manager plugin integrated into the test running service where bug tickets are manually created today

## Goal

Build an MCP (Model Context Protocol) server that **automatically creates bug tickets** in the bug manager after a test run completes. The MCP should read the error logs, generate clear ticket headings and descriptions, and file unassigned tickets — removing the manual step entirely.

---

## Architecture Overview

```
┌─────────────┐      trigger       ┌──────────────────┐
│  Testing UI  │ ──── (manual) ───▶│  Test Runner      │
│              │                    │  (parent route)   │
└─────────────┘                    └────────┬─────────┘
                                            │ test complete
                                            ▼
                                   ┌──────────────────┐
                                   │  History Table    │
                                   │  (JSON error logs)│
                                   └────────┬─────────┘
                                            │ read logs
                                            ▼
                                   ┌──────────────────┐
                                   │  MCP Server       │
                                   │  (Bug Creator)    │
                                   └────────┬─────────┘
                                            │ create tickets
                                            ▼
                                   ┌──────────────────┐
                                   │  Bug Manager      │
                                   │  (Plugin/API)     │
                                   └──────────────────┘
```

---

## MCP Server Design

### Tools the MCP Should Expose

#### 1. `read_error_logs`
- **Input:** `run_id` or `parent_route` (e.g., `/v1/auth`) + optional `timestamp`/`run identifier`
- **Behavior:** Reads the JSON error log file from the history table for the given test run
- **Output:** Structured list of failed test cases with their error details

#### 2. `create_bug_tickets`
- **Input:** Parsed error log data (or `run_id` to do it end-to-end)
- **Behavior:**
  - Iterates over each failed test case
  - Generates a ticket heading and description (see format below)
  - Calls the bug manager plugin API to create an unassigned ticket
- **Output:** List of created ticket IDs with their titles

#### 3. `process_test_run` (composite tool — primary entry point)
- **Input:** `run_id` or `parent_route` + `run_timestamp`
- **Behavior:** Orchestrates the full flow — reads logs, filters failures, generates tickets
- **Output:** Summary of tickets created

---

## Trigger Mechanism

When a test run for a parent route completes:

1. The test runner finishes and writes the JSON error log to the history table (existing behavior).
2. **Post-completion hook**: The test runner (or UI) calls the MCP's `process_test_run` tool, passing the `run_id` / `parent_route`.
3. The MCP processes the errors and creates tickets.

> **Implementation note:** This can be a simple callback/webhook from the test runner after it writes the history entry, or a polling mechanism on the MCP side — prefer the callback approach for immediacy.

---

## Bug Ticket Format

### Heading
```
[API Test Failure] {HTTP_METHOD} {endpoint} — {short_error_summary}
```
**Examples:**
- `[API Test Failure] POST /v1/auth/login — 500 Internal Server Error`
- `[API Test Failure] GET /v1/users/profile — Expected 200, got 403 Forbidden`
- `[API Test Failure] PUT /v1/orders/123 — Response schema validation failed`

### Description Template
```
## Failed Test Details

**Parent Route:** /v1/auth
**Endpoint:** POST /v1/auth/login
**Test Name:** {test_case_name}
**Run ID:** {run_id}
**Timestamp:** {run_timestamp}

## Error Summary

{concise plain-language summary of what went wrong}

## Error Details

- **Expected:** {expected_status / expected_response}
- **Actual:** {actual_status / actual_response}
- **Error Message:** {raw error message from logs}

## Request Info

- **Method:** POST
- **URL:** /v1/auth/login
- **Headers:** {relevant headers, redact auth tokens}
- **Request Body:** {request payload, redact sensitive fields}

## Response Info

- **Status Code:** 500
- **Response Body:** {response payload, truncate if very large}

## Reproduction

This failure was captured during automated test run `{run_id}`.
Re-trigger the parent route `/v1/auth` test suite to verify.
```

### Ticket Fields
| Field      | Value                           |
|------------|---------------------------------|
| Title      | Generated heading (see above)   |
| Description| Generated description (see above)|
| Assignee   | **Unassigned**                  |
| Status     | New / Open                      |
| Labels/Tags| `auto-generated`, `api-test`, `{parent_route}` (e.g., `v1-auth`) |
| Priority   | Derive from status code or error type (optional, can default to Medium) |

---

## Error Log JSON — Expected Structure

The MCP needs to read the JSON error logs from the history table. Confirm the exact schema, but the MCP should expect something like:

```json
{
  "run_id": "run_abc123",
  "parent_route": "/v1/auth",
  "timestamp": "2026-02-27T10:30:00Z",
  "total_tests": 12,
  "passed": 10,
  "failed": 2,
  "failures": [
    {
      "test_name": "login_with_valid_credentials",
      "endpoint": "/v1/auth/login",
      "method": "POST",
      "expected_status": 200,
      "actual_status": 500,
      "error_message": "Internal Server Error",
      "request": {
        "headers": { ... },
        "body": { ... }
      },
      "response": {
        "status": 500,
        "headers": { ... },
        "body": { ... }
      }
    }
  ]
}
```

> **Action item for coding agent:** Inspect the actual JSON schema from the history table and adapt the MCP's parsing logic accordingly.

---

## Deduplication & Safety

- **Deduplication:** Before creating a ticket, check the bug manager for existing open tickets with the same endpoint + error signature. Skip creation if a matching open ticket exists. This prevents duplicate tickets across re-runs.
- **Sensitive data:** Redact authorization tokens, passwords, API keys, and PII from ticket descriptions before posting.
- **Bulk limits:** If a test run has a very high failure count (e.g., >20 failures), consider grouping them into a single summary ticket for the parent route instead of individual tickets, flagging it as a potential systemic issue.

---

## Tech Stack Notes

- The MCP server should follow the [Model Context Protocol SDK](https://modelcontextprotocol.io) patterns.
- Use the bug manager plugin's existing API/SDK for ticket creation — do not bypass it.
- The MCP server runs as a sidecar or standalone service that the test runner calls into.

---

## Summary of Work

1. **Build the MCP server** with the three tools described above.
2. **Integrate with the history table** — read JSON error logs by run ID.
3. **Integrate with the bug manager plugin** — create tickets via its API.
4. **Add the post-completion hook** in the test runner to invoke the MCP after each parent route test run.
5. **Implement deduplication** to avoid duplicate tickets on re-runs.
6. **Redact sensitive data** from ticket descriptions.

---

## Development Phases

| Phase | Title | Delivers | Spec |
|-------|-------|----------|------|
| 1 | MCP Server Scaffold & `read_error_logs` | New MCP server package, reads JSONL history files, returns structured failure data | [phase-1-mcp-server-scaffold.md](phases/phase-1-mcp-server-scaffold.md) |
| 2 | `create_bug_tickets` Tool | Bug manager API integration, ticket heading/description generation, dedup, redaction, bulk limits | [phase-2-create-bug-tickets.md](phases/phase-2-create-bug-tickets.md) |
| 3 | `process_test_run` Composite Tool | End-to-end orchestrator chaining Phase 1 + 2, dry run mode, error handling | [phase-3-process-test-run.md](phases/phase-3-process-test-run.md) |
| 4 | Post-Completion Hook | Automatic trigger after `execute-all`, HTTP endpoint on MCP, WebSocket notifications | [phase-4-post-completion-hook.md](phases/phase-4-post-completion-hook.md) |
| 5 | Deduplication Hardening & Edge Cases | Fingerprint-based dedup, concurrent run protection, local ledger, error categorization, smart grouping | [phase-5-dedup-and-hardening.md](phases/phase-5-dedup-and-hardening.md) |
