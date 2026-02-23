# Flow Testing — High-Level Overview

**Status:** Draft
**Author:** Platform Engineering Team
**Date:** February 2026

---

## What is Flow Testing?

Flow testing validates **multi-step user journeys** end-to-end by chaining individual API calls in sequence, where each step can depend on data from previous steps. Unlike the existing API Testing feature (which tests single endpoints in isolation), flow testing orchestrates complete business workflows.

**First target flow:** User Login (register → verify → login → verify → authenticated session).

---

## Where It Lives in the UI

A new **"FLOW TEST"** tab in the entity page topbar, alongside the existing **DEFINITION** and **TECHDOCS** tabs.

```
┌──────────────┬──────────────┬──────────────┐
│  DEFINITION  │   TECHDOCS   │  FLOW TEST   │
└──────────────┴──────────────┴──────────────┘
                                    ▲ new tab
```

When a user clicks into a Service API entity, they see these three top-level tabs. Clicking "FLOW TEST" opens the flow testing interface for that API.

Below the topbar, the page shows:

- **API Routes** with route group count (from DEFINITION)
- **Flow definitions** with run status (from FLOW TEST)

---

## Core Concepts

### Flow Definition

A flow is an ordered sequence of **steps**. Each step calls one API endpoint and can extract values from the response to pass into later steps.

```
┌─────────────────────────────────────────────────────────┐
│  Flow: "User Login"                                     │
│                                                         │
│  Step 1: POST /auth/login                               │
│    body: { email, password }                            │
│    extract: { email_key → from response.email_key }     │
│           ↓                                             │
│  Step 2: POST /auth/verify                              │
│    body: { email_key: {{step1.email_key}},              │
│            verification_code: {{static_otp}} }          │
│    extract: { access_token → from response.access_token,│
│               refresh_token → from response.refresh_token }
│           ↓                                             │
│  Step 3: GET /auth/validate                             │
│    headers: { Authorization: Bearer {{step2.access_token}} }
│    assert: status == 200                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Key Terminology

| Term               | Description                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Flow**           | A named, ordered sequence of steps representing a user journey                                 |
| **Step**           | A single HTTP request within a flow, with optional extractions and assertions                  |
| **Extraction**     | A rule that pulls a value from a step's response (JSONPath or dot-notation)                    |
| **Variable**       | A named value available across steps — either extracted from a prior step or provided as input |
| **Input Variable** | A value the user provides before running the flow (e.g., email, password, base URL)            |
| **Assertion**      | A condition a step's response must satisfy (status code, body field values, field presence)    |
| **Flow Run**       | A single execution of a flow — records pass/fail per step plus timing                          |

---

## Flow Storage Format

Flows are stored as JSON files in the `api-tests/flows/` directory, one file per flow.

```
api-tests/
├── flows/
│   ├── user-login.flow.json
│   ├── user-registration.flow.json
│   └── password-reset.flow.json
├── v1-auth.json              ← existing single-endpoint test cases
└── v1-rules.json
```

### Example: `user-login.flow.json`

```json
{
  "id": "flow-a1b2c3",
  "name": "User Login",
  "description": "Full login flow: credentials → email verification → authenticated session",
  "base_url": "{{base_url}}",
  "input_variables": {
    "base_url": {
      "description": "API base URL",
      "default": "http://localhost:8000"
    },
    "email": { "description": "User email address" },
    "password": { "description": "User password" },
    "static_otp": {
      "description": "Static OTP code (non-production)",
      "default": "1234"
    }
  },
  "steps": [
    {
      "id": "login",
      "name": "Submit credentials",
      "method": "POST",
      "path": "/auth/login",
      "body": {
        "email_or_username": "{{email}}",
        "password": "{{password}}",
        "device_information": {
          "device": "Flow Test Runner",
          "platform": "web",
          "device_id": "flow-test-device"
        }
      },
      "assertions": {
        "status_code": 200,
        "body_contains": { "success": true, "requires_verification": true }
      },
      "extract": {
        "email_key": "$.email_key"
      }
    },
    {
      "id": "verify",
      "name": "Verify email code",
      "method": "POST",
      "path": "/auth/verify",
      "body": {
        "email_key": "{{steps.login.email_key}}",
        "verification_code": "{{static_otp}}",
        "device_information": {
          "device_id": "flow-test-device",
          "platform": "web"
        }
      },
      "assertions": {
        "status_code": 200,
        "body_schema": {
          "required_fields": ["access_token", "refresh_token", "user"]
        }
      },
      "extract": {
        "access_token": "$.access_token",
        "refresh_token": "$.refresh_token",
        "user_id": "$.user.id"
      }
    },
    {
      "id": "validate_session",
      "name": "Validate authenticated session",
      "method": "GET",
      "path": "/auth/validate",
      "headers": {
        "Authorization": "Bearer {{steps.verify.access_token}}"
      },
      "assertions": {
        "status_code": 200
      }
    }
  ]
}
```

---

## Variable Resolution Order

When a step references `{{something}}`, resolution follows this priority:

1. **Step extractions** — `{{steps.<step_id>.<key>}}` — value extracted from a previous step's response
2. **Input variables** — `{{email}}`, `{{password}}` — provided by user before execution
3. **Environment overrides** — passed via MCP `variable_overrides` at runtime

Unresolved variables cause the flow run to fail immediately with a clear error.

---

## MCP Server: Flow Testing Tools

A new set of MCP tools will be added to the existing `api-testing-mcp-server` (not a separate server). This keeps a single MCP registration and shared storage layer.

### New Tools

| Tool               | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `list_flows`       | List all flow definitions from `api-tests/flows/`                  |
| `read_flow`        | Read a single flow definition by ID                                |
| `create_flow`      | Create a new flow definition                                       |
| `edit_flow`        | Edit an existing flow (add/remove/reorder steps, update variables) |
| `delete_flow`      | Delete a flow definition                                           |
| `run_flow`         | Execute a flow end-to-end, returns per-step results                |
| `get_flow_history` | Get execution history for a flow                                   |

### `run_flow` Execution Model

```
run_flow({ flow_id, variable_overrides })
    │
    ├─ Load flow definition from file
    ├─ Merge input_variables defaults ← variable_overrides
    ├─ Validate all required input variables are present
    │
    ├─ For each step (in order):
    │   ├─ Resolve all {{variables}} in path, headers, body
    │   ├─ Send HTTP request to base_url + path
    │   ├─ Record: status, response body, duration
    │   ├─ Run assertions → pass / fail
    │   ├─ If assertions fail → mark step FAILED, stop flow
    │   ├─ Run extractions → store values for later steps
    │   └─ Mark step PASSED
    │
    ├─ Record overall flow result (passed / failed / error)
    └─ Save to execution history
```

### Execution Result Schema

```json
{
  "flow_id": "flow-a1b2c3",
  "flow_name": "User Login",
  "status": "passed",
  "started_at": "2026-02-20T10:00:00Z",
  "finished_at": "2026-02-20T10:00:02Z",
  "duration_ms": 2340,
  "steps": [
    {
      "step_id": "login",
      "name": "Submit credentials",
      "status": "passed",
      "duration_ms": 890,
      "request": {
        "method": "POST",
        "url": "http://localhost:8000/auth/login",
        "body": "..."
      },
      "response": { "status_code": 200, "body": "..." },
      "assertions": {
        "status_code": { "expected": 200, "actual": 200, "passed": true }
      },
      "extracted": { "email_key": "a1b2c3d4-..." }
    },
    {
      "step_id": "verify",
      "name": "Verify email code",
      "status": "passed",
      "duration_ms": 1200
    },
    {
      "step_id": "validate_session",
      "name": "Validate authenticated session",
      "status": "passed",
      "duration_ms": 250
    }
  ]
}
```

---

## Frontend — "FLOW TEST" Tab

### Tab Registration

The "FLOW TEST" tab is registered as a top-level entity tab on the Service API entity page, at the same level as DEFINITION and TECHDOCS.

```
┌──────────────┬──────────────┬──────────────┐
│  DEFINITION  │   TECHDOCS   │  FLOW TEST   │
└──────────────┴──────────────┴──────────────┘

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Flow Test                                     [+ New Flow] │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ▶  User Login                            [Run]     │    │
│  │     3 steps · Last run: 2m ago · ✓ Passed           │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  ▶  User Registration                     [Run]     │    │
│  │     5 steps · Never run                             │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  ▶  Password Reset                        [Run]     │    │
│  │     4 steps · Last run: 1h ago · ✗ Failed (step 3) │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Expanded Flow View (click a flow)

```
┌─────────────────────────────────────────────────────────────┐
│  ◀ Back    User Login                        [Run Flow]     │
├─────────────────────────────────────────────────────────────┤
│  Input Variables:                                           │
│    email:      [rahul.sa@aitronos.com    ]                  │
│    password:   [••••••••••               ]                  │
│    static_otp: [1234                     ]                  │
│    base_url:   [http://localhost:8000    ]                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Steps:                                                     │
│                                                             │
│  ● Step 1: Submit credentials          POST /auth/login     │
│  │  ✓ Status 200 · 890ms                                   │
│  │  Extracted: email_key = "a1b2c3d4-..."                   │
│  │                                                          │
│  ● Step 2: Verify email code           POST /auth/verify    │
│  │  ✓ Status 200 · 1200ms                                  │
│  │  Extracted: access_token, refresh_token, user_id         │
│  │                                                          │
│  ● Step 3: Validate session            GET /auth/validate   │
│     ✓ Status 200 · 250ms                                   │
│                                                             │
│  ── Total: 2.34s · PASSED ──                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Clicking any step expands to show the full request/response with headers and body.

---

## Initial Flows (Shipped with Plugin)

Based on the [Freddy Backend Authentication Flow Overview](../login%20flow/authentication-flow-overview.md), the first set of flows to include:

### 1. User Login (3 steps)

`POST /auth/login` → `POST /auth/verify` → `GET /auth/validate`

### 2. User Registration (4 steps)

`POST /auth/validate-email` → `POST /auth/register` → `POST /auth/verify` → `GET /auth/validate`

### 3. Password Reset (3 steps)

`POST /auth/password/reset` → `POST /auth/password/reset/verify` → `POST /auth/login`

### 4. Token Refresh (3 steps)

`POST /auth/login` → `POST /auth/verify` → `POST /auth/refresh`

### 5. Logout (3 steps)

`POST /auth/login` → `POST /auth/verify` → `POST /auth/logout`

---

## Implementation Phases

### Phase 1: MCP Flow Engine

- Flow file storage (read/write `api-tests/flows/*.flow.json`)
- Variable resolution engine (input vars, step extractions, overrides)
- Sequential step executor with extraction and assertion logic
- MCP tools: `list_flows`, `read_flow`, `create_flow`, `edit_flow`, `delete_flow`, `run_flow`, `get_flow_history`

### Phase 2: Frontend — Flow Test Tab

- New "FLOW TEST" tab registered alongside DEFINITION and TECHDOCS on the Service API entity page
- Flow list view with last-run status
- Flow detail view with input variable form
- Step-by-step execution results with expandable request/response

### Phase 3: Seed Flows & History

- Ship the 5 initial authentication flows as defaults
- Execution history storage per flow (file-based, same pattern as API test history)
- History view with pass/fail timeline per flow

### Phase 4: Advanced Features (Future)

- Conditional steps (skip step if condition met)
- Parallel step groups (steps that can run concurrently)
- Flow composition (one flow calling another as a sub-flow)
- Scheduled flow runs

---

## Relationship to Existing API Testing

| Aspect             | API Testing (existing)          | Flow Testing (new)                                       |
| ------------------ | ------------------------------- | -------------------------------------------------------- |
| **Scope**          | Single endpoint                 | Multi-endpoint journey                                   |
| **Storage**        | `api-tests/<route-group>.json`  | `api-tests/flows/<name>.flow.json`                       |
| **MCP Server**     | `api-testing-mcp-server`        | Same server, new tools added                             |
| **Data passing**   | None (each test is independent) | Extractions flow between steps                           |
| **UI location**    | DEFINITION tab content          | FLOW TEST tab (top-level, next to DEFINITION & TECHDOCS) |
| **First use case** | Individual endpoint validation  | Login / registration / password flows                    |
