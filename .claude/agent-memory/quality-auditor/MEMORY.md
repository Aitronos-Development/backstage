# Quality Auditor Agent Memory

## Domain Validation (Aitronos API) -- CORRECTED
- 403 responses from @example.com are NOT from WAF -- they come from DomainValidationService
- Email domains must exist in `organization_domains` table; unregistered domains get 403 REGISTRATION_RESTRICTED
- Use `@aitronos.com` for tests that need to reach app validation layer
- Source: `app/services/organizations/domain_validation_service.py`
- Previous WAF hypothesis was wrong -- see scout discovery for details

## Staging Environment Issues
- **Auth is broken on staging** (as of 2026-03-05): dev-login disabled, seeded user removed from orgs, .env has placeholder tokens
- This is a SYSTEMIC issue affecting ALL route groups, not just /v1/icons
- Three auth mechanisms all fail: dev-login (403), standard login (user removed from orgs), .env token (placeholder)

## Test Runner Limitations
- `scripts/run-tests.ts` does NOT support multipart/form-data uploads
- All bodies are sent via `JSON.stringify()` regardless of `body_type` field
- This affects any route group that accepts file uploads: /v1/icons, /v1/files, /v1/documents
- Runner also lacks `skip` field support and array `status_code` assertion support

## Test Authoring Guidelines
- Route group for auth tests is `/v1/auth` (not `/v1/auth/register`)
- Tests that create users (201) need unique emails per run -- email reuse causes 409 on re-run
- Only status_code assertions are currently used -- response body assertions would strengthen tests

## API Behavior Findings
- `POST /v1/auth/register`: username field is OPTIONAL (returns 201 without it)
- Required fields: email, password, full_name (all return 422 when missing)
- Password strength validation: rejects "password123" (422), rejects "123" (422)
- Email duplicate check is case-insensitive
- Extra/unknown fields in request body are silently accepted (potential mass assignment concern)

## Common Test Bugs Found
- Off-by-one in boundary test data: SDET miscounts chars when constructing long strings (e.g., 73 chars labeled as 72)
- Off-by-MANY in boundary data: SDET generated 4644 chars instead of 5001 for /v1/model instructions test
- Always verify boundary values with `python3 -c "print(len('...'))"` -- shell `wc -c` can miscount due to escape chars
- FastAPI accepts JSON bodies without Content-Type header -- tests expecting 422 for missing Content-Type are wrong
- Password schema max_length=72 in Pydantic but PasswordValidator max_length=128 -- schema enforces first

## /v1/model Route Group Findings
- **BUG: Provider boundary mismatch** -- Pydantic schema allows 64-char function names and 128 tools, but OpenAI provider rejects both at boundary, causing unhandled 500s
- This pattern likely affects other schema limits too -- any field forwarded to provider could have mismatched limits
- **BUG: Tool-calling 500 (systemic)** -- ANY function tool request returns 500, not just boundary values. Crash is in OpenAI provider bind_tools/ainvoke path. Confirmed in both standalone and flow tests. HIGH severity.
- `{{api_key}}` variable not supported by TypeScript runner -- AUTH-MODELS-004 and HAPPY-OUTMODE-003 cannot execute
- Execution history test IDs differ from JSON file IDs after test file regeneration -- always query by test name, not ID
- VAL-RESP-009 had 4644 chars at execution time (labeled 5001) -- classic SDET off-by-many error, now fixed in JSON

## /v1/model Flow Test Audit Findings (2026-03-06)
- API returns `response` as content blocks list `[{"type":"text","text":"..."}]` not plain string -- tests need `_extract_response_text()` helper
- `response_id` (e.g. `resp_06b855...`) is NOT a thread message ID -- must query `/v1/threads/{id}/messages` for real message IDs
- `gpt-4o` does NOT support reasoning -- use `o3-mini` for reasoning.effort tests
- Stream cancellation tests require async httpx client -- cannot test with synchronous conftest fixtures
- Common flow test weakness: asserting API accepted a mutation (200) but not verifying the mutation took effect

## /v1/icons Source Code Bugs (Confirmed from Code Review)
1. **SVG `<style>` not sanitized** (HIGH) - `icon_validation.py` sanitize_svg() omits `<style>` tags
2. **Name uniqueness not enforced** (MEDIUM) - `icon_repo.check_name_exists()` exists but never called
3. **Form fields bypass Pydantic** (MEDIUM) - `icons.py:40` Form() has no min/max length
4. **Error details leak GCS paths** (MEDIUM) - `icon_service.py:569` and `:318`
5. **ILIKE wildcards not escaped** (LOW) - `icon_repo.py:74`
6. **Empty file passes size check** (LOW) - `icon_validation.py:123` uses `>` not `>=`

## /v1/icons Audit Results (2026-03-06)
- **32 total tests:** 29 PASSED, 3 FLAKE (all GCS auth expiry)
- **Effective pass rate:** 100% excluding infra failures
- **Blocked paths:** Upload->store->serve lifecycle (GCS credentials expired)
- **XSS test gap:** fl-x2ss5n verifies upload acceptance but NOT sanitization of served content
- **5 weak validation tests:** tc-f9ak3g, tc-e5jn2s, tc-u8rg5w, tc-y4ks7p, tc-b5tn7w have status-code-only assertions
- **GCS credential expiry is INFRA, not a bug** -- but error response leaks internal GCS messages

## Known Test Design Anti-Patterns
- **Placeholder IDs:** Tests using `icon_placeholder_id` or similar static IDs that don't exist on the target environment
- **Ambiguous security assertions:** SVG XSS tests assert 201 but don't verify sanitization
- **Status-code-only assertions on validation tests:** 422 tests should also verify error response structure
- **Triage-adapted tests:** tc-x9cz4d and tc-f2ym6r changed from [403,404] to 401 -- must be restored when auth is fixed

## Register Endpoint Validation Chain
- Schema validation (Pydantic) runs FIRST: email format/length, password length 8-72, full_name required
- DomainValidationService runs SECOND: checks email domain against organization_domains table (403)
- PasswordValidator runs THIRD in service layer: special chars, weak password list (max_length=128 but irrelevant since schema caps at 72)
- Duplicate checks run LAST: email uniqueness (409), username uniqueness (409)

## MCP Tool Notes
- Large route groups (like `/v1/auth`) can return huge list results -- use grep/jq to filter
- `mcp__api-testing__edit_test_case` requires `route_group` matching the group the test lives in

## Test Quality Observations
- Flow tests (Python/pytest) are significantly higher quality than JSON endpoint tests
- Flow test pattern: dev_login -> CRUD operations -> field-level assertions -> cleanup verification
- The flow test at `flows/icons/test_icon_lifecycle.py` is the gold standard for the /v1/icons suite
- JSON tests achieve 49% plan coverage (41/83 scenarios), execution coverage only 13%

## /v1/spaces Audit Results (2026-03-09)
- **29 total tests:** 27 PASSED, 0 BUG, 0 FLAKE, 2 INVALID_TEST
- All 7 endpoints covered, auth tests on every endpoint
- **INVALID: tc-sa0by9** claims limit=1 enforcement but only asserts status 200 + field presence
- **Weak: test_cursor_pagination** silently passes if next_cursor is None (defensive branch masks regression)
- **Gap: PATCH validation** -- no standalone tests for empty name, long name, invalid access_mode on PATCH
- **Gap: Access control fields** -- access_users, editable_by_users, visible_to_roles never tested
- **Validation order quirk:** invalid org_id format gets 403 (membership check) not 422 (schema validation)
- Flow tests are high quality: field-level assertions, mutation persistence verification, proper cleanup
- Standalone create tests (tc-73i8co, tc-wi8hz5, tc-26uauh) leak spaces -- no cleanup

## Response Format Notes
- App-level errors: `{success: false, error: {code, message, ...}}`
- Framework-level 401 may use `{detail: "Not authenticated"}` -- needs verification
- Framework-level 404 for unmatched routes: `{detail: "Not Found"}`
- Path traversal attempts get framework-level 404, not app-level
