# Test Plan: /v1/model Route Group

## Route Group Overview

This route group covers AI model response generation, model catalog listing, and supporting configuration endpoints. It is the **core revenue-generating surface** of the Freddy API -- every AI interaction flows through `/v1/model/response`.

### Endpoints Under Test

| # | Method | Path | Risk Tier | Auth |
|---|--------|------|-----------|------|
| 1 | POST   | `/v1/model/response` | **Critical** | Bearer / X-API-Key |
| 2 | GET    | `/v1/model/response/output-modes` | Medium | Bearer / X-API-Key |
| 3 | GET    | `/v1/model/response/reasoning-levels` | Medium | Bearer / X-API-Key |
| 4 | POST   | `/v1/model/response/{thread_id}/cancel` | High | Bearer / X-API-Key |
| 5 | GET    | `/v1/models` | Medium | Bearer / X-API-Key |

### Existing Test Coverage

- `test-suites/v1-models.json`: **Empty** -- zero test cases.
- Service-level integration tests exist at `service-under-test/tests/integration/api/v1/routes/test_models.py` and `test_models_auth.py` but these are internal pytest tests, not external API tests.
- No flow tests exist for this route group.

### Key Hidden Constraints Found in Source Code

1. **Mutually exclusive message manipulation**: `edit_message_id`, `previous_message_id`, and `previous_response_id` cannot be combined. Only one at a time. (`conversation.py:672-701`)
2. **`edit_message_id` and `previous_message_id` require `thread_id`**: Validated in `ChatRequest.validate_message_manipulation_constraints` (`conversation.py:690-701`)
3. **`json_schema` output mode explicitly rejected**: Returns 422 with message "json_schema mode is not yet implemented" (`responses.py:1240-1248`)
4. **Tool messages require `tool_call_id`**: `InputMessage.validate_tool_message` raises ValueError when role=tool without tool_call_id (`conversation.py:236-253`)
5. **Function name pattern**: Must match `^[a-zA-Z_][a-zA-Z0-9_]*$` -- no hyphens, spaces, or special chars (`conversation.py:47`)
6. **Parameters size limit**: 32KB for function tool parameters JSON (`conversation.py:19,72`)
7. **Tool result content limit**: 1MB (`conversation.py:20,110`)
8. **MCP tool validation**: Must have either `configuration_id` or `server_url`, not both, not neither (`conversation.py:324-331`)
9. **MCP server_label uniqueness**: Duplicate `server_label` values rejected in tools array (`conversation.py:480-488`)
10. **system_tools deprecated key detection**: `image_generation` renamed to `image_operations` -- server returns helpful error (`conversation.py:592-607`)
11. **Valid system_tools keys**: `web_search`, `code_interpreter`, `image_operations`, `file_search`, `computer_use`, `personal_connectors` (`conversation.py:610-617`)
12. **Valid system_tools modes**: `on`, `off`, `auto` only (`conversation.py:627-634`)
13. **image_operations provider validation**: Only `openai`, `clipdrop`, `google` (`conversation.py:643-648`)
14. **image_operations model validation**: Whitelist of valid models (`conversation.py:651-668`)
15. **Streaming vs non-streaming auth**: Streaming uses `get_lightweight_auth_context` (no DB queries), non-streaming uses full `get_auth_context` (`responses.py:1149-1153`)
16. **Cancel endpoint ownership check**: User must own the active stream (`responses.py:222-227`)
17. **Cancel mode threshold**: 5s default (`STREAM_CANCEL_QUICK_EDIT_THRESHOLD_SECONDS`) determines quick_edit vs keep_partial (`responses.py:231-238`)
18. **Models endpoint caching**: 15-minute cache (900s), varies by query param combo. `include_recent_usage` bypasses cache (`models.py:171-215`)
19. **Files per message limit**: Max 10 files per input message (`conversation.py:209,230`)
20. **Metadata constraints**: Max 16 key-value pairs, keys max 64 chars, values max 512 chars (`conversation.py:787-807` -- ThreadCreate, but applies conceptually)
21. **Error response format**: All errors use structured `{success: false, error: {code, message, system_message, type, status, details, trace_id, timestamp}}` (from `api-error-handling-rules.md`)

---

## Test Data Strategy

### Minimal Valid ChatRequest (non-streaming)
```json
{
  "inputs": [{"role": "user", "content": "Hello"}],
  "model": "gpt-4o",
  "stream": false
}
```

### Minimal Valid ChatRequest (streaming -- FLOW only)
```json
{
  "inputs": [{"role": "user", "content": "Hello"}],
  "model": "gpt-4o",
  "stream": true
}
```

### Auth Headers
- Bearer: `{"Authorization": "Bearer {{auth_token}}"}`
- API Key: `{"X-API-Key": "{{api_key}}"}`

---

## STANDALONE Tests (JSON test cases for TypeScript runner)

These tests use single HTTP requests with no state dependencies. The SDET Builder will implement these in `test-suites/v1-models.json`.

---

### Endpoint 1: GET /v1/models

**Risk Tier: Medium | Classification: STANDALONE**

#### AUTH-MODELS-001: List models without auth returns 401
- **Priority:** P0
- **Method:** GET
- **URL:** `{{base_url}}/v1/models`
- **Headers:** `{"Content-Type": "application/json"}` (no auth)
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
  - `body.error.code` exists
  - `body.error.status == 401`
- **Why:** Verifies auth enforcement on read endpoint

#### AUTH-MODELS-002: List models with invalid Bearer token returns 401
- **Priority:** P0
- **Method:** GET
- **URL:** `{{base_url}}/v1/models`
- **Headers:** `{"Authorization": "Bearer invalid_token_abc123"}`
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
  - `body.error.type == "client_error"`
- **Why:** Invalid JWT must be rejected

#### AUTH-MODELS-003: List models with valid Bearer token returns 200
- **Priority:** P0
- **Method:** GET
- **URL:** `{{base_url}}/v1/models`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.models` is an array
  - `body.total_count` is a number >= 0
  - Each model has `id`, `key`, `name`
  - Each model has `availability_status` in `["general_availability", "coming_soon", "deprecated"]`
- **Why:** Happy path for model catalog

#### AUTH-MODELS-004: List models with valid API key returns 200
- **Priority:** P0
- **Method:** GET
- **URL:** `{{base_url}}/v1/models`
- **Headers:** `{"X-API-Key": "{{api_key}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.models` is an array
  - `body.total_count` is a number >= 0
- **Why:** API key auth path must work identically to Bearer

#### FILTER-MODELS-005: List models with ui_models_only=true filters correctly
- **Priority:** P1
- **Method:** GET
- **URL:** `{{base_url}}/v1/models?ui_models_only=true`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.models` is an array
  - Every model in `body.models` has `is_visible_in_ui == true` (if models exist)
- **Why:** Filter must actually filter, not just be ignored

#### FILTER-MODELS-006: List models with include_capabilities=false omits capabilities
- **Priority:** P1
- **Method:** GET
- **URL:** `{{base_url}}/v1/models?include_capabilities=false`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - Models in response either have `capabilities == null` or the field is absent
  - Models still have `id`, `key`, `name`
- **Why:** Minimal response mode must strip capabilities

#### FILTER-MODELS-007: List models with include_pricing=true includes pricing
- **Priority:** P2
- **Method:** GET
- **URL:** `{{base_url}}/v1/models?include_pricing=true`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - Models have a `pricing` field (may be `{"message": "Pricing not yet implemented"}`)
- **Why:** Pricing flag must not crash even if not implemented

#### FILTER-MODELS-008: List models with include_details=true includes extended fields
- **Priority:** P2
- **Method:** GET
- **URL:** `{{base_url}}/v1/models?include_details=true`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - Models include fields like `context_window`, `description`, `provider`
- **Why:** Details flag must expand response

#### FILTER-MODELS-009: List models with include_deprecated=true includes deprecated models
- **Priority:** P2
- **Method:** GET
- **URL:** `{{base_url}}/v1/models?include_deprecated=true`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.total_count >= 0`
  - Response may include models with `is_deprecated == true`
- **Why:** Deprecated filter must not error

#### CACHE-MODELS-010: List models returns cache headers
- **Priority:** P2
- **Method:** GET
- **URL:** `{{base_url}}/v1/models`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - Response header `Cache-Control` contains `private`
  - Response header `Vary` contains `Authorization`
- **Why:** Source shows explicit cache headers set at `models.py:220-221`

---

### Endpoint 2: GET /v1/model/response/output-modes

**Risk Tier: Medium | Classification: STANDALONE**

#### AUTH-OUTMODE-001: Output modes without auth returns 401
- **Priority:** P0
- **Method:** GET
- **URL:** `{{base_url}}/v1/model/response/output-modes`
- **Headers:** `{}` (no auth)
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
- **Why:** Auth enforcement

#### HAPPY-OUTMODE-002: Output modes with valid auth returns correct modes
- **Priority:** P0
- **Method:** GET
- **URL:** `{{base_url}}/v1/model/response/output-modes`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.success == true`
  - `body.output_modes` is array of length 3
  - Modes include `"text"`, `"plain"`, `"blocks"` (extracted from `mode` field)
  - Exactly one mode has `is_default == true`
  - The default mode is `"text"`
- **Logic Path:** `responses.py:96-133` -- hardcoded return, no DB
- **Why:** Verifies the exact set of output modes matches documentation

#### HAPPY-OUTMODE-003: Output modes with API key auth returns 200
- **Priority:** P1
- **Method:** GET
- **URL:** `{{base_url}}/v1/model/response/output-modes`
- **Headers:** `{"X-API-Key": "{{api_key}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.success == true`
  - `body.output_modes` is array
- **Why:** Dual auth path validation

---

### Endpoint 3: GET /v1/model/response/reasoning-levels

**Risk Tier: Medium | Classification: STANDALONE**

#### AUTH-REASON-001: Reasoning levels without auth returns 401
- **Priority:** P0
- **Method:** GET
- **URL:** `{{base_url}}/v1/model/response/reasoning-levels`
- **Headers:** `{}` (no auth)
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
- **Why:** Auth enforcement

#### HAPPY-REASON-002: Reasoning levels with valid auth returns correct levels
- **Priority:** P0
- **Method:** GET
- **URL:** `{{base_url}}/v1/model/response/reasoning-levels`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.success == true`
  - `body.reasoning_levels` is array of length 5
  - Levels include `"off"`, `"low"`, `"medium"`, `"high"`, `"maximum"`
  - Exactly one level has `is_default == true`
  - The default level is `"medium"`
- **Logic Path:** `responses.py:136-183` -- hardcoded return, no DB
- **Why:** Verifies exact reasoning levels match documentation

---

### Endpoint 4: POST /v1/model/response (Non-streaming)

**Risk Tier: Critical | Classification: Mixed (STANDALONE for validation, FLOW for happy path)**

**IMPORTANT:** Happy-path tests that actually generate AI responses are classified as FLOW because:
1. Responses are non-deterministic (cannot assert exact content)
2. They create threads (state mutation)
3. They take significant time (5-30s)

Validation tests (422 responses) ARE standalone because they fail fast at the Pydantic layer.

#### AUTH-RESP-001: Create response without auth returns 401
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json"}` (no auth)
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "stream": false}`
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
- **Why:** Most critical endpoint must enforce auth

#### AUTH-RESP-002: Create response with invalid token returns 401
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer expired_or_malformed_token"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "stream": false}`
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
- **Why:** Invalid JWT must not reach business logic

#### AUTH-RESP-003: Create response with empty Bearer token returns 401
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer "}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "stream": false}`
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
- **Why:** Edge case -- empty token after "Bearer " prefix

#### VAL-RESP-004: Empty inputs array returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [], "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Response body contains validation error referencing `inputs`
  - Error mentions minimum length or "at least 1"
- **Logic Path:** `conversation.py:398` -- `Field(..., min_length=1)`
- **Why:** Empty inputs is the #1 invalid request pattern

#### VAL-RESP-005: Missing inputs field returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Response body contains validation error for missing `inputs`
- **Why:** Required field omission

#### VAL-RESP-006: Temperature above 1.0 returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "temperature": 1.5, "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references `temperature`
  - Error mentions "less than or equal to 1" or similar
- **Logic Path:** `conversation.py:505` -- `le=1.0`
- **Why:** Boundary value -- temperature must be clamped to [0.0, 1.0]

#### VAL-RESP-007: Temperature below 0.0 returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "temperature": -0.1, "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references `temperature`
- **Logic Path:** `conversation.py:505` -- `ge=0.0`
- **Why:** Negative temperature boundary

#### VAL-RESP-008: top_p above 1.0 returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "top_p": 2.0, "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references `top_p`
- **Logic Path:** `conversation.py:512` -- `le=1.0`
- **Why:** Boundary value for top_p

#### VAL-RESP-009: Instructions exceeding 5000 chars returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "instructions": "<5001 'x' characters>", "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references `instructions`
  - Error mentions max length
- **Logic Path:** `conversation.py:498` -- `max_length=5000`
- **Why:** Instructions length boundary

#### VAL-RESP-010: json_schema output mode returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "output_mode": "json_schema", "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error message contains "json_schema" and "not yet implemented"
- **Logic Path:** `responses.py:1240-1248` -- explicit rejection with `ValidationException`
- **Why:** Documented unsupported mode must return helpful error, not crash

#### VAL-RESP-011: output_mode field accepts only valid enum values
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "output_mode": "xml", "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references `output_mode`
- **Logic Path:** `conversation.py:564` -- `Literal["text", "plain", "structured", "json"]`
- **Why:** Invalid enum value must be rejected by Pydantic

#### VAL-RESP-012: Function tool with invalid name (contains hyphen) returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "tools": [{"type": "function", "name": "get-weather", "parameters": {}}],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error references tool name pattern
- **Logic Path:** `conversation.py:47` -- `pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$"`
- **Why:** Hyphens in function names is common mistake -- must reject clearly

#### VAL-RESP-013: Function tool with name exceeding 64 chars returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "tools": [{"type": "function", "name": "a_very_long_function_name_that_exceeds_the_sixty_four_character_limit_xx", "parameters": {}}],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error references name length
- **Logic Path:** `conversation.py:44` -- `max_length=MAX_FUNCTION_NAME_LENGTH` (64)
- **Why:** Name length boundary

#### VAL-RESP-014: More than 128 tools returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "tools": [<129 function tool objects>], "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "128" or "maximum" tools
- **Logic Path:** `conversation.py:468-477` -- `validate_tools_count`
- **Why:** Resource exhaustion prevention

#### VAL-RESP-015: Tool message without tool_call_id returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [
      {"role": "user", "content": "What is the weather?"},
      {"role": "tool", "content": "{\"temp\": 18}"}
    ],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions `tool_call_id` is required
- **Logic Path:** `conversation.py:236-240` -- `validate_tool_message`
- **Why:** Tool results must reference their originating call

#### VAL-RESP-016: Mutually exclusive edit_message_id and previous_response_id returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "thread_id": "thread_abc123",
    "edit_message_id": "msg_123",
    "previous_response_id": "resp_456",
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "Cannot use multiple message manipulation parameters"
- **Logic Path:** `conversation.py:672-688`
- **Why:** Critical business logic -- using both would corrupt conversation state

#### VAL-RESP-017: edit_message_id without thread_id returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "edit_message_id": "msg_123",
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "edit_message_id requires thread_id"
- **Logic Path:** `conversation.py:690-694`
- **Why:** Editing a message without thread context is undefined

#### VAL-RESP-018: previous_message_id without thread_id returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "previous_message_id": "msg_123",
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "previous_message_id requires thread_id"
- **Logic Path:** `conversation.py:696-700`
- **Why:** Branching without thread context is undefined

#### VAL-RESP-019: MCP tool with neither configuration_id nor server_url returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "tools": [{"type": "mcp", "server_label": "my_server"}],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "configuration_id or server_url is required"
- **Logic Path:** `conversation.py:324-327`
- **Why:** MCP tool must have a connection target

#### VAL-RESP-020: MCP tool with both configuration_id and server_url returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "tools": [{"type": "mcp", "server_label": "my_server", "configuration_id": "mcp_00000000000000000000000000000001", "server_url": "https://example.com/mcp"}],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "Only one of configuration_id or server_url"
- **Logic Path:** `conversation.py:328-331`
- **Why:** Ambiguous connection target must be rejected

#### VAL-RESP-021: Duplicate MCP server_label returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "tools": [
      {"type": "mcp", "server_label": "my_server", "server_url": "https://example.com/mcp1"},
      {"type": "mcp", "server_label": "my_server", "server_url": "https://example.com/mcp2"}
    ],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "Duplicate MCP server_label"
- **Logic Path:** `conversation.py:480-487`
- **Why:** Server labels must be unique for routing tool calls

#### VAL-RESP-022: system_tools with deprecated key image_generation returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "system_tools": {"image_generation": {"mode": "on"}},
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "image_generation" renamed to "image_operations"
- **Logic Path:** `conversation.py:592-607`
- **Why:** Deprecation handling must guide users to correct key

#### VAL-RESP-023: system_tools with invalid key returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "system_tools": {"not_a_real_tool": {"mode": "on"}},
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "Invalid system tool key"
  - Error lists valid keys
- **Logic Path:** `conversation.py:618-624`
- **Why:** Invalid tool keys must return helpful error

#### VAL-RESP-024: system_tools with invalid mode returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "system_tools": {"web_search": {"mode": "always"}},
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "Invalid mode"
  - Error lists valid modes: on, off, auto
- **Logic Path:** `conversation.py:627-634`
- **Why:** Invalid mode values must be caught

#### VAL-RESP-025: max_output_synapses of 0 or negative returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "max_output_synapses": 0, "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references `max_output_synapses`
- **Logic Path:** `conversation.py:521` -- `gt=0`
- **Why:** Zero/negative token limit is invalid

#### VAL-RESP-026: Temperature at exact boundary 0.0 accepted
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Say OK"}], "temperature": 0.0, "stream": false}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.success == true`
  - `body.thread_id` exists and starts with `thread_`
  - `body.response` is a non-empty string
- **Why:** Boundary value -- 0.0 must be accepted (ge=0.0)

#### VAL-RESP-027: Temperature at exact boundary 1.0 accepted
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Say OK"}], "temperature": 1.0, "stream": false}`
- **Expected Status:** 200
- **Key Assertions:**
  - `body.success == true`
- **Why:** Boundary value -- 1.0 must be accepted (le=1.0)

#### VAL-RESP-028: Function tool with valid name at exactly 64 chars accepted
- **Priority:** P2
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Call the function"}],
    "tools": [{"type": "function", "name": "a_function_name_that_is_exactly_sixty_four_characters_long_xxxxx", "parameters": {"type": "object", "properties": {}}}],
    "stream": false
  }
  ```
- **Expected Status:** 200 (or another non-422 status)
- **Key Assertions:**
  - Status is NOT 422
- **Why:** Boundary -- name at exactly max length must be accepted

#### VAL-RESP-029: Exactly 128 tools accepted (boundary)
- **Priority:** P2
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "tools": [<128 valid function tools>], "stream": false}`
- **Expected Status:** NOT 422
- **Key Assertions:**
  - Status is NOT 422 (the tools count itself should pass validation)
- **Why:** Boundary -- exactly at max should be accepted

#### VAL-RESP-030: image_operations with invalid provider returns 422
- **Priority:** P2
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "system_tools": {"image_operations": {"mode": "on", "provider": "midjourney"}},
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "Invalid provider"
  - Error lists valid providers
- **Logic Path:** `conversation.py:643-648`
- **Why:** Invalid image provider must be caught at validation

#### VAL-RESP-031: image_operations with invalid model returns 422
- **Priority:** P2
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "system_tools": {"image_operations": {"mode": "on", "model": "stable-diffusion-xl"}},
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "Invalid model"
- **Logic Path:** `conversation.py:651-668`
- **Why:** Invalid image model must be caught

#### VAL-RESP-032: Empty request body returns 422
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references missing `inputs` field
- **Why:** Empty body must fail gracefully

#### VAL-RESP-033: Non-JSON content type returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "text/plain", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** (raw text) `hello`
- **Expected Status:** 422 or 415
- **Key Assertions:**
  - Request is rejected
- **Why:** Content-type mismatch handling

#### VAL-RESP-034: Wrong type for inputs (string instead of array) returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": "not an array", "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references type mismatch for `inputs`
- **Why:** Type validation

#### VAL-RESP-035: Wrong type for temperature (string instead of float) returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:** `{"inputs": [{"role": "user", "content": "Hello"}], "temperature": "hot", "stream": false}`
- **Expected Status:** 422
- **Key Assertions:**
  - Error references `temperature`
- **Why:** Type coercion behavior validation

#### VAL-RESP-036: MCP tool with invalid configuration_id pattern returns 422
- **Priority:** P2
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "tools": [{"type": "mcp", "server_label": "test", "configuration_id": "not_valid_format"}],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error references `configuration_id` pattern
- **Logic Path:** `conversation.py:302` -- `pattern=r"^mcp_[a-f0-9]{32}$"`
- **Why:** Configuration ID format must be validated

#### VAL-RESP-037: Function tool description exceeding 1024 chars returns 422
- **Priority:** P2
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "tools": [{"type": "function", "name": "test_fn", "description": "<1025 chars>", "parameters": {}}],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error references description length
- **Logic Path:** `conversation.py:51` -- `max_length=MAX_FUNCTION_DESCRIPTION_LENGTH` (1024)
- **Why:** Description length boundary

#### VAL-RESP-038: Files array exceeding 10 items per message returns 422
- **Priority:** P2
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{
      "role": "user",
      "content": "Check these files",
      "files": [
        {"file_id": "file_00000000000000000000000000000001"},
        {"file_id": "file_00000000000000000000000000000002"},
        {"file_id": "file_00000000000000000000000000000003"},
        {"file_id": "file_00000000000000000000000000000004"},
        {"file_id": "file_00000000000000000000000000000005"},
        {"file_id": "file_00000000000000000000000000000006"},
        {"file_id": "file_00000000000000000000000000000007"},
        {"file_id": "file_00000000000000000000000000000008"},
        {"file_id": "file_00000000000000000000000000000009"},
        {"file_id": "file_0000000000000000000000000000000a"},
        {"file_id": "file_0000000000000000000000000000000b"}
      ]
    }],
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions file limit or max_length
- **Logic Path:** `conversation.py:209` -- `max_length=10` and `conversation.py:230` validator
- **Why:** Files per message boundary

#### VAL-RESP-039: All three message manipulation params together returns 422
- **Priority:** P1
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response`
- **Headers:** `{"Content-Type": "application/json", "Authorization": "Bearer {{auth_token}}"}`
- **Body:**
  ```json
  {
    "inputs": [{"role": "user", "content": "Hello"}],
    "thread_id": "thread_abc123",
    "edit_message_id": "msg_1",
    "previous_message_id": "msg_2",
    "previous_response_id": "resp_3",
    "stream": false
  }
  ```
- **Expected Status:** 422
- **Key Assertions:**
  - Error mentions "Cannot use multiple message manipulation parameters"
- **Logic Path:** `conversation.py:672-688`
- **Why:** All three at once is the maximum violation

---

### Endpoint 5: POST /v1/model/response/{thread_id}/cancel

**Risk Tier: High | Classification: Primarily FLOW**

The cancel endpoint requires an active stream, so most tests are FLOW. However, auth tests are STANDALONE.

#### AUTH-CANCEL-001: Cancel stream without auth returns 401
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response/nonexistent_thread/cancel`
- **Headers:** `{"Content-Type": "application/json"}` (no auth)
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
- **Why:** Auth enforcement on mutation endpoint

#### AUTH-CANCEL-002: Cancel stream with invalid token returns 401
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response/nonexistent_thread/cancel`
- **Headers:** `{"Authorization": "Bearer invalid_token"}`
- **Expected Status:** 401
- **Key Assertions:**
  - `body.success == false`
- **Why:** Invalid JWT rejection

#### CANCEL-003: Cancel non-existent stream returns 404
- **Priority:** P0
- **Method:** POST
- **URL:** `{{base_url}}/v1/model/response/thread_nonexistent_00000000/cancel`
- **Headers:** `{"Authorization": "Bearer {{auth_token}}"}`
- **Expected Status:** 404
- **Key Assertions:**
  - `body.success == false`
  - `body.error.code == "RESOURCE_NOT_FOUND"`
  - `body.error.message` contains "No active stream"
- **Logic Path:** `responses.py:214-219` -- checks `_active_streams` dict
- **Why:** Cancelling non-existent stream must return 404, not 500

---

## FLOW Tests (Python httpx -- multi-step state-dependent)

These tests require state from previous requests and/or streaming capabilities.

### FLOW-RESP-001: Non-streaming happy path creates thread and returns response
- **Priority:** P0
- **Classification:** FLOW
- **Steps:**
  1. POST `/v1/model/response` with minimal valid body (stream=false)
  2. Assert 200, `body.success == true`, `body.thread_id` starts with `thread_`
  3. Assert `body.response` is a non-empty string
  4. GET `/v1/threads/{thread_id}` to verify thread was created
  5. Assert thread exists and has message_count >= 2 (user + assistant)
- **Why:** End-to-end validation of the core feature

### FLOW-RESP-002: Non-streaming with explicit organization_id
- **Priority:** P1
- **Classification:** FLOW
- **Steps:**
  1. POST `/v1/model/response` with `organization_id: {{org_id}}`
  2. Assert 200
  3. Verify thread's organization_id matches
- **Why:** Explicit org selection path

### FLOW-RESP-003: Non-streaming with wrong organization_id returns 403
- **Priority:** P0
- **Classification:** FLOW
- **Steps:**
  1. POST `/v1/model/response` with `organization_id: "org_nonexistent_000000000000"`
  2. Assert 403
  3. Assert error code is `ORGANIZATION_ACCESS_DENIED`
- **Logic Path:** `responses.py:1273-1281`
- **Why:** IDOR prevention -- users must not access other orgs

### FLOW-RESP-004: Streaming happy path returns SSE events
- **Priority:** P0
- **Classification:** FLOW
- **Steps:**
  1. POST `/v1/model/response` with stream=true
  2. Assert response content-type is `text/event-stream`
  3. Parse SSE events
  4. Assert events include `response.processing`, `response.created`, at least one `response.content_delta`, and `response.completed`
  5. Assert `response.completed` event has `thread_id` and `stop_reason`
- **Why:** Streaming is the primary production path

### FLOW-RESP-005: Cancel active stream
- **Priority:** P1
- **Classification:** FLOW
- **Steps:**
  1. Start streaming request (POST with stream=true)
  2. Wait for `response.created` event to get thread_id
  3. POST `/v1/model/response/{thread_id}/cancel`
  4. Assert cancel response has `cancel_mode` in `["quick_edit", "keep_partial"]`
  5. Assert streaming events include `response.cancelled`
- **Logic Path:** `responses.py:186-333`
- **Why:** Cancel is critical UX feature

### FLOW-RESP-006: Cancel another user's stream returns 403
- **Priority:** P0
- **Classification:** FLOW
- **Steps:**
  1. User A starts streaming request
  2. User B attempts to cancel User A's stream
  3. Assert 403 with `INSUFFICIENT_PERMISSIONS`
- **Logic Path:** `responses.py:222-227`
- **Why:** IDOR -- users must not cancel each other's streams

### FLOW-RESP-007: Non-streaming with function tools returns function call
- **Priority:** P1
- **Classification:** FLOW
- **Steps:**
  1. POST with tools=[{type: "function", name: "get_weather", parameters: {type: "object", properties: {location: {type: "string"}}}}] and a user message asking about weather
  2. Assert response contains function call data or text response
  3. If function call returned, POST again with tool result message
  4. Assert final response incorporates tool result
- **Why:** Function calling is a key feature

### FLOW-RESP-008: Non-streaming continue existing thread
- **Priority:** P1
- **Classification:** FLOW
- **Steps:**
  1. POST to create new thread (stream=false)
  2. Capture thread_id
  3. POST again with same thread_id and new message
  4. Assert same thread_id returned
  5. Verify message_count increased
- **Why:** Thread continuity is core to conversation feature

---

## Scenario Coverage Summary

| Endpoint | Auth (401) | Authz (403) | Validation (422) | Business Logic (400) | Happy Path (200) | Not Found (404) | Total |
|----------|-----------|-------------|-------------------|---------------------|-----------------|----------------|-------|
| GET /v1/models | 2 | - | - | - | 6 | - | 8 |
| GET /v1/model/response/output-modes | 1 | - | - | - | 2 | - | 3 |
| GET /v1/model/response/reasoning-levels | 1 | - | - | - | 1 | - | 2 |
| POST /v1/model/response | 3 | 1 (flow) | 27 | 1 | 3 (2 boundary + 1 flow) | - | 35 |
| POST /v1/model/response/{thread_id}/cancel | 2 | 1 (flow) | - | - | 1 (flow) | 1 | 5 |
| **Total** | **9** | **2** | **27** | **1** | **13** | **1** | **53** |

## Self-Verification Checklist

- [x] Every Critical/High endpoint has auth scenarios (AUTH-RESP-001/002/003, AUTH-CANCEL-001/002)
- [x] Every mutation endpoint has concurrency scenarios (FLOW-RESP-005/006 for cancel)
- [x] Every endpoint with auth has token manipulation scenarios (missing, invalid, empty, API key alternative)
- [x] Every endpoint with input validation has boundary/stress scenarios (temperature 0.0/1.0, instructions 5001, tools 128/129, name 64/65)
- [x] Scenarios reference actual code paths with file and line references
- [x] Expected outcomes include specific status codes
- [x] STANDALONE vs FLOW classification follows the decision matrix (validation=STANDALONE, state-dependent=FLOW)
- [x] Tests that would pass due to auth failure before reaching intended validation layer are called out

## Flags and Observations

1. **No rate limiting test**: The 429 (spending limit exceeded) response is testable only if a test org has spending limits configured. Recommend a dedicated test org with low limits for FLOW testing. Source: `responses.py:1311-1344`.
2. **No pagination on /v1/models**: The models endpoint returns all models without pagination. For large catalogs this could be a performance concern. No `limit` or `offset` params in the spec.
3. **Cache bypass**: `include_recent_usage=true` bypasses the 15-minute cache (`models.py:175-176`). This is testable only with API key auth (requires `auth.api_key_id`).
4. **Streaming auth is lightweight**: The streaming path uses `get_lightweight_auth_context` which skips DB queries (`responses.py:1152`). Full auth happens inside the generator. This means a streaming request with an invalid token will return 200 with SSE error events rather than a 401 HTTP response. This is an intentional design decision for TTFT optimization but could be surprising.
5. **output_mode accepts "structured" and "json"**: These are in the Literal type but not listed in the output-modes endpoint response. The output-modes endpoint only returns text/plain/blocks. ASSUMPTION -- "structured" and "json" are valid but not UI-visible modes.
