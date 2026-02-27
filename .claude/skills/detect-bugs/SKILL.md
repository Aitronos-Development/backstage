---
name: detect-bugs
description: Run API tests for a route group, analyze failures, and create bug tickets in the bug manager. Use when you want to test endpoints and automatically file bugs for failures.
allowed-tools: Bash, Read, Grep, Glob, TodoWrite, mcp__api-testing__list_test_cases, mcp__api-testing__run_test_cases, mcp__api-testing__get_execution_history, mcp__bug-detector__read_error_logs, mcp__bug-detector__process_test_run
---

# Bug Detection Skill

You are a bug detection agent for the API testing system. Your job is to run tests, detect failures, and create bug tickets automatically.

## Arguments

The user may provide:
- A **route group** (e.g. `/v1/auth`, `/v1/rules`, `/v1/models`) — run tests for that group
- `all` — run tests for all route groups
- `--dry-run` — preview what tickets would be created without actually creating them
- No arguments — list available route groups and ask which to test

## Workflow

### Step 1: Identify Route Groups

If the user specified a route group, use that. If they said "all", discover all groups first.

List available route groups:
```
mcp__api-testing__list_test_cases for each known group
```

Known route groups in this project (check for more):
- `/v1/auth`
- `/v1/health`
- `/v1/rules`
- `/v1/models`
- `/v1/workflows`

### Step 2: Run Tests

For each route group, run all test cases:

```
mcp__api-testing__run_test_cases({ route_group: "/v1/auth" })
```

Collect the results. Note which tests passed and which failed.

### Step 3: Analyze Failures

If there are failures, read the error logs for details:

```
mcp__bug-detector__read_error_logs({ route_group: "/v1/auth" })
```

### Step 4: Create Bug Tickets

Process the test run to create bug tickets:

```
mcp__bug-detector__process_test_run({ route_group: "/v1/auth" })
```

If the user specified `--dry-run`, use:
```
mcp__bug-detector__process_test_run({ route_group: "/v1/auth", dry_run: true })
```

### Step 5: Report Results

Present a clear summary to the user:

```
## Test Results: /v1/auth

| Test | Status | Details |
|------|--------|---------|
| Login with valid credentials | PASS | 200 OK (120ms) |
| Login with invalid password | FAIL | Expected 401, got 500 |

### Bug Tickets
- **BUG-015**: [API Test Failure] POST /v1/auth/login - 500 Internal Server Error (urgent)
- Skipped: GET /v1/auth/me - duplicate of BUG-003

### Summary
Ran 5 tests, 3 passed, 2 failed. Created 1 ticket, skipped 1 duplicate.
```

## Important Rules

- Always run the tests FIRST, then process failures. Do not process stale history.
- When running for multiple route groups, process them sequentially and report each one.
- If the bug manager or bug detector is unreachable, tell the user to check that:
  1. The Backstage backend is running (`yarn dev` or `yarn start`)
  2. The bug-detector MCP server is running (check `.mcp.json`)
- Use a todo list to track progress when running multiple route groups.
- Present results in a table format for easy scanning.
- Highlight **urgent** priority tickets prominently.
- If all tests pass, celebrate briefly and move on.
