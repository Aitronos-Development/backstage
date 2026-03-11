# Test Triage & Repair Agent Memory

## /v1/icons Test Suite

### Key Facts
- Test suite: `test-suites/v1-icons.json`
- Test runner: `scripts/run-tests.ts`
- Results dir: `test-results/`
- Flow tests: `flows/icons/`

### Runner Limitations (confirmed in source)
- **No multipart support**: Line 262 of run-tests.ts always does `JSON.stringify(body)`. Upload tests with `body_type: "multipart"` get 422 because API receives JSON instead of form-data.
- **No skip field support**: Runner ignores `skip: true` and executes anyway.
- **No array assertion support**: `status_code: [403, 404]` fails because runner uses `!==` against array object.
- **No `{{api_key}}` variable support**: Runner only resolves `{{auth_token}}`, `{{org_id}}`, `{{base_url}}`. Tests using `{{api_key}}` fail with execution error.

### Auth History
- Previous run (2026-03-05): ALL authenticated tests blocked with 401 due to placeholder JWT `your-staging-jwt-token`
- Login attempt: `developers@aitronos.com` returns 403 (removed from all orgs)
- Dev-login: disabled on staging

### Placeholder ID Issue
- `icon_placeholder_id` was coincidentally resolving to a real icon on staging (previous run), but this is not reliable across environments/time.

### Source Code Bugs Found (from Audit Report, not yet tested)
1. SVG `<style>` tags not sanitized (HIGH - CSS XSS)
2. Name uniqueness not enforced (MEDIUM)
3. Upload Form() fields bypass Pydantic schema validation (MEDIUM)
4. Error details leak GCS paths (MEDIUM)
5. ILIKE wildcards not escaped (LOW)
6. Empty file (0 bytes) passes size validation (LOW)

### Patterns
- Register endpoint 403 = domain restriction. Always use `@aitronos.com` emails.
- Upload 422 when auth works = runner multipart bug, NOT API validation bug.

## /v1/model Test Suite (2026-03-06)

### Key Facts
- Test suite: `test-suites/v1-model.json`
- Schema: `service-under-test/app/api/v1/schemas/conversation.py`
- Response handler: `service-under-test/app/api/v1/routes/responses.py`

### Validation Constants (from schema source)
- `MAX_TOOLS_PER_REQUEST = 128`
- `MAX_FUNCTION_NAME_LENGTH = 64`
- `MAX_FUNCTION_DESCRIPTION_LENGTH = 1024`
- `MAX_PARAMETERS_SIZE_BYTES = 32 * 1024` (32KB)
- `instructions` field: `max_length=5000`

### Confirmed Bugs
- **500 on 64-char function name** (tc-hln7rb): Pydantic allows it (max_length=64), but downstream processing crashes.
- **500 on 128 tools** (tc-84kdsc): Pydantic allows it (MAX_TOOLS_PER_REQUEST=128), but downstream processing crashes.
- **500 on basic function tool calling** (tc-r17opr / FLOW-RESP-004): Even a simple 1-tool request crashes. Same root cause.
- All 500s likely occur in LangChain `llm.bind_tools()` or `llm.ainvoke()` call in `openai_provider.py` line ~318-329.

### Test Bugs Found
- **tc-nxgpxz** (instructions >5000): Test payload only has 4644 chars, not >5000.
- **tc-whre29, tc-53c1ap**: Use `{{api_key}}` variable which runner does not support.
- **tc-aca6f6** (FLOW-RESP-007, reasoning effort=high): Uses default `gpt-4o` which does NOT support reasoning. Fix: add `"model": "o3-mini"`.

### Flow Test Fixes Applied (2026-03-06)
- **Response content blocks**: API returns `response` as `[{"type":"text","text":"..."}]` NOT a plain string. Added `_extract_response_text()` helper.
- **FLOW-RESP-006 branch bug**: `response_id` is NOT a thread message ID. Must fetch from `/v1/threads/{id}/messages`.
- **FLOW-RESP-007 reasoning model**: Must use `o3-mini` (or other O-series). `gpt-4o` returns 422.
- **FLOW-RESP-004 product bug**: Marked `pytest.xfail`. 500 on any function tool request.
- All 6 non-skipped tests now pass (4 healed, 1 xfail, 1 was already passing).
