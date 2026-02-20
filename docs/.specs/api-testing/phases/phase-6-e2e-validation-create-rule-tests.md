# Phase 6: End-to-End Validation & Create Rule Tests

**Goal:** Validate the entire system by having a Claude Code agent create 3 test cases for the `/v1/rules` endpoint via MCP, run them, and confirm the results appear in the Backstage UI — both in the test runner and in the execution history.

**Depends on:** Phases 1–5

---

## What this phase delivers

- 3 test cases for the `/v1/rules` (create rule) endpoint, authored entirely via MCP
- End-to-end proof that the full loop works: agent → MCP → file storage → UI render → test execution → history
- All success criteria from the overview verified
- Known issues and follow-ups documented

## The 3 test cases

These are created by the agent calling `create_test_case` through the MCP server. The exact payloads:

### Test case 1: Create rule with valid payload returns 201

```json
{
  "name": "Create rule with valid payload returns 201",
  "method": "POST",
  "path": "/v1/rules",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{auth_token}}"
  },
  "body": {
    "name": "e2e-test-rule",
    "description": "Rule created by E2E validation",
    "conditions": [
      {
        "field": "status",
        "operator": "equals",
        "value": "active"
      }
    ],
    "actions": [
      {
        "type": "notify",
        "target": "admin"
      }
    ]
  },
  "assertions": {
    "status_code": 201,
    "body_contains": {
      "name": "e2e-test-rule"
    },
    "body_schema": {
      "required_fields": ["id", "name", "description", "created_at"]
    }
  }
}
```

### Test case 2: Create rule with missing required fields returns 422

```json
{
  "name": "Create rule with missing required fields returns 422",
  "method": "POST",
  "path": "/v1/rules",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{auth_token}}"
  },
  "body": {
    "description": "Missing the required 'name' field"
  },
  "assertions": {
    "status_code": 422,
    "body_contains": {
      "detail": "validation"
    }
  }
}
```

### Test case 3: Create rule with invalid auth token returns 401

```json
{
  "name": "Create rule with invalid auth token returns 401",
  "method": "POST",
  "path": "/v1/rules",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer invalid-token-12345"
  },
  "body": {
    "name": "should-not-be-created",
    "description": "This request should be rejected"
  },
  "assertions": {
    "status_code": 401
  }
}
```

Note: Test case 3 uses a hardcoded invalid token (not `{{auth_token}}`) because it's specifically testing the auth failure path.

## Validation checklist

### V1: MCP server is running and registered

- [ ] Run `yarn start` — console shows `[api-testing-mcp] Server started`
- [ ] `.claude/settings.json` contains the `api-testing` MCP entry
- [ ] Open Claude Code in this workspace — MCP tools are discoverable
- [ ] Call `list_test_cases` for `/v1/rules` — returns empty array (no tests yet)

### V2: Agent creates test cases via MCP

- [ ] From Claude Code, call `create_test_case` with test case 1 payload → returns created test with ID
- [ ] Call `create_test_case` with test case 2 payload → returns created test with ID
- [ ] Call `create_test_case` with test case 3 payload → returns created test with ID
- [ ] File `api-tests/v1-rules.json` exists on disk with all 3 test cases
- [ ] Call `list_test_cases` for `/v1/rules` → returns all 3

### V3: UI reflects agent-created tests in real time

- [ ] Open Backstage → API Testing tab on Freddy's service page
- [ ] `/v1/rules` route group card is visible
- [ ] Click to expand → all 3 test cases listed with play/stop buttons
- [ ] If the UI was already open when the agent created tests, verify they appeared without page refresh (WebSocket)

### V4: Agent runs tests via MCP

- [ ] From Claude Code, call `run_test_cases` with all 3 test case IDs and `variable_overrides: { "auth_token": "<valid-token>" }`
- [ ] Test 1 returns pass (201)
- [ ] Test 2 returns pass (422)
- [ ] Test 3 returns pass (401)
- [ ] History entries created in `api-tests/.history/v1-rules.jsonl` — all 3 with `initiator: "agent"`

### V5: UI shows agent execution results in real time

- [ ] While the UI is open, agent runs appear in the history section with 🤖 Agent label
- [ ] All 3 show ✅ Pass
- [ ] `/v1/rules` card header turns green
- [ ] Expand a history row → see full request/response details

### V6: User runs tests from the UI

- [ ] In the Backstage UI, set `auth_token` in the variable panel (localStorage)
- [ ] Click ▶ on test case 1 → runs, result shows ✅ Pass
- [ ] Click ▶ on test case 3 → runs, result shows ✅ Pass (401 is expected)
- [ ] History now shows both 👤 User and 🤖 Agent entries

### V7: History filtering works

- [ ] Filter by "Agent only" → only 🤖 entries visible
- [ ] Filter by "User only" → only 👤 entries visible
- [ ] Filter by "Fail only" → if all pass, shows empty state message
- [ ] Clear filters → all entries visible again

### V8: Agent edits a test case via MCP

- [ ] From Claude Code, call `read_test_case` on test case 1 → returns full JSON
- [ ] Call `edit_test_case` to change the body's `name` field from `"e2e-test-rule"` to `"e2e-updated-rule"` using `old_value`/`new_value`
- [ ] Call `read_test_case` again → `name` in body is `"e2e-updated-rule"`, everything else unchanged
- [ ] UI updates to show the modified test case name (if the test case name itself was changed)

### V9: Dynamic variables work across layers

- [ ] Set `base_url` in `app-config.yaml` → test execution uses it
- [ ] Override `auth_token` in browser localStorage → execution uses the override
- [ ] Set a runtime override in the UI → that single execution uses it
- [ ] Switch environment (develop → staging) → `base_url` changes accordingly

### V10: Resilience

- [ ] Restart Backstage → test cases persist (they're on disk), history persists
- [ ] Stop the MCP server → UI still works for user-initiated tests; MCP tools unavailable in Claude Code
- [ ] Restart the MCP server → agent can resume creating/running tests
- [ ] Delete a test case via MCP → UI removes it in real time

## Success criteria (from overview)

| Criteria | Verified |
| --- | --- |
| Developer can click any API route group and see its test cases | |
| Each test case can be started/stopped independently via play/stop | |
| Pass/fail results appear inline, card highlights green/red | |
| Dynamic variables configurable without database dependency | |
| Variable resolution has no perceptible latency | |
| MCP server auto-starts with `yarn start` and auto-registers | |
| Agent can create, edit (partial), delete, and execute tests via MCP | |
| Edit tool supports partial modifications without full rewrite | |
| 3 `/v1/rules` test cases created by agent via MCP, execute successfully | |
| UI shows execution history from both user and agent runs | |
| Developer can filter history by initiator and result | |

## What comes out of this phase

A fully validated, working system. The 3 test cases serve as both proof-of-concept and permanent regression tests for the API testing feature itself.

## Follow-up items (out of scope, documented for future)

- [ ] "Run all" button to execute all test cases in a route group
- [ ] Test suite grouping across multiple route groups
- [ ] Scheduled/periodic test runs
- [ ] CI/CD integration — run test suite on deploy
- [ ] Export test results as JUnit XML
- [ ] History retention policies and rotation
