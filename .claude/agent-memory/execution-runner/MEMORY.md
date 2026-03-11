# Execution Runner Memory

## Staging Environment
- Base URL: `https://api.staging.freddy.aitronos.com`
- **dev-login is DISABLED on staging** (returns 403: "Dev login is not available in this environment")
- Seeded user `developers@aitronos.com` (user_id: `usr_4ab3bd9533df40318468ed9cc0d8c391`) has been **removed from all organizations** on staging as of 2026-03-05
- Standard login at `/v1/auth/login` works (password accepted) but user has no org access
- `.env` ships with placeholder tokens (`your-staging-jwt-token`) -- must be replaced with real JWTs
- Staging health endpoint is reliable: `GET /v1/health/` returns `{"status":"ok"}`
- Staging response times: ~370-580ms per request from local
- `icon_placeholder_id` exists on staging and returns 200 (coincidental)
- Auth is enforced before validation -- invalid auth returns 401 even if request body is invalid

## Staging API Response Formats
- **401 responses:** `{"success":false,"error":{"code":"AUTHENTICATION_REQUIRED",...}}` -- contains `success: false`
- **404 (app-level):** `{"success":false,"error":{"code":"ICON_NOT_FOUND",...}}` -- contains `success: false`
- **404 (framework-level, e.g., path traversal):** `{"detail":"Not Found"}` -- does NOT contain `success` field
- **422 (validation):** `{"success":false,"error":{"code":"INVALID_FIELD_VALUE",...}}` -- contains `success: false`

## Authentication Patterns
- dev-login uses field `email_or_username` (NOT `email`) -- see `flows/helpers/auth.py`
- curl may have shell escaping issues with JSON on zsh; use Python urllib for reliable HTTP calls
- Auth endpoints on staging: register, login, verify, refresh, logout, password/reset, google/authorize

## TypeScript Runner Limitations (scripts/run-tests.ts)
1. **No multipart support:** Sends all bodies as `JSON.stringify(body)` via `fetch()`. Tests with `body_type: "multipart"` will fail -- upload tests must use Python flow runner.
2. **No `skip` support:** `skip: true` field is ignored, tests run anyway.
3. **No array assertion support:** `status_code: [403, 404]` fails because runner compares with `!==` against array object. Needs `Array.isArray()` check.
4. **No body_type handling at all:** all bodies go through `JSON.stringify()`
5. **FLOW entries skipped correctly:** Tests with `method: "FLOW"` are properly skipped by the runner.

## Test Infrastructure
- TypeScript runner: `npx tsx scripts/run-tests.ts --route-group /v1/icons --env staging --verbose`
- Must `npm install` first if `node_modules/` missing (only devDeps: tsx, typescript, @types/node)
- Python flow tests: `FREDDY_ENV=staging uv run pytest flows/icons/ -v --tb=long`
- conftest.py auto-loads `.env`, auto-skips if server unreachable, skips destructive in prod
- Source env: `source <(grep -v '^#' .env | sed 's/^/export /') && npx tsx scripts/run-tests.ts --route-group /v1/icons --env staging --verbose`
- Quote URLs with `?` in curl to avoid zsh glob issues

## Model Response API (/v1/model/response) - Local
- `response` field is a **list of content blocks** `[{"type": "text", "text": "..."}]`, NOT a plain string
- Function tool calling with `gpt-4o` returns **500 Internal Server Error**
- `gpt-4o` does NOT support reasoning -- returns 422 with "Model 'gpt-4o' does not support reasoning"
- `response_id` is NOT a valid `previous_message_id` for branching -- returns 404 MESSAGE_NOT_FOUND
- Confirmed 200 response fields: `success`, `thread_id`, `response`, `response_id`, `is_summarized`, `stop_reason`

## Test Design Issues
- Tests using `icon_placeholder_id` (tc-d2yn5b, tc-aw6t3f) are marked `skip: true` but runner ignores skip
- 401 response body format: Some tests assert `body_contains: {"success": false}` but the actual 401 response may use a different shape
- Path traversal test (tc-d8nk1f): 404 response doesn't include `success` field in body

## File Locations
- Test suites: `test-suites/<route-group>.json`
- Test runner: `scripts/run-tests.ts`
- Flow tests: `flows/<domain>/test_*.py`
- Results: `test-results/`
- Env config: `.env`
