# Omni-Test Orchestrator Memory

## Project: Freddy Backend

### Test Repository Structure
- Test repo: `test-repositories/Freddy.Backend.Tests/`
- Service source: `test-repositories/Freddy.Backend.Tests/service-under-test/`
- Test suites (JSON): `test-repositories/Freddy.Backend.Tests/test-suites/`
- Flow tests (Python): `test-repositories/Freddy.Backend.Tests/flows/`
- Test runner: `npx tsx scripts/run-tests.ts`
- Default base URL: `http://localhost:8000`
- Staging URL: `https://api.staging.freddy.aitronos.com`
- Seeded test user: `developers@aitronos.com` / `securePassword123!` / username: `aitronos_dev`

### Key Patterns Discovered
- **Login field name is `email_or_username`**: NOT `email`. Using `email` causes 422.
- **Login response has `success` but NOT `data`**: Only assert `success`.
- **Login missing password returns 401 not 422**: Treats as bad credentials.
- **Login empty body returns 401 not 422**: Same pattern.
- **Login masks errors as 401 for valid-format emails**: Invalid formats get 422 first.
- **Login case-insensitive email**: Uppercase email works (200).
- **Login trims whitespace on email**: Leading/trailing spaces trimmed, succeeds.
- **Login accepts extra fields silently**: `role`, `is_admin` ignored.
- **Login XSS returns 401 not 403**: Unlike register, WAF does not block login XSS.
- **Content-Type enforcement**: text/plain, xml, multipart return 422. Missing Content-Type still works.
- **Dev-login disabled**: Always 422.
- **Password forgot anti-enumeration**: Always 200.
- **Password reset no anti-enumeration**: Invalid tokens get 422.
- **Password update wrong current_password returns 422 not 401**: Validation error.
- **Password update same old/new returns 422**: Rejects identical passwords.
- **Validate-email**: 200 with `is_valid` field. `{is_valid: false}` for existing.
- **Verify**: `verification_code` must be 4 digits (1000-9999). `0000` rejected.
- **WAF on register**: Blocks `<script>`, emoji, SQL injection, extra fields with 403.
- **Register duplicate email returns 409**: Case-insensitive dedup.
- **Bearer prefix case-sensitive**: Lowercase `bearer` returns 401.
- **HTTP method enforcement**: All endpoints return 405 for wrong methods.
- **Error format**: `{success: false, error: {code, message, system_message, type, status, details, trace_id, timestamp}}`.
- **Auth middleware**: Bearer token + API key (x-api-key).

### Register WAF Behavior (Detailed - from 79-test expansion)
- WAF returns 403 for: plus addressing emails, long local parts, unusual TLDs, whitespace-padded emails
- WAF returns 403 for: null bytes in password, unicode passwords, weak passwords, SQL injection in password
- WAF returns 403 for: spaces/special chars/long/single-char/numeric-only/dotted/hyphenated/underscored usernames
- WAF returns 403 for: numbered full names, special chars (apostrophe), accented chars in full_name
- WAF returns 403 for: no Content-Type header, suspicious Origin headers, extra fields (role, id, timestamps, tokens)
- WAF returns 403 for: LDAP injection, path traversal, command injection, XXE, large bodies
- WAF DOES NOT block (returns 422): IP domain emails, no-TLD emails, space-in-email, multiple @, unicode emails, null/int/bool/array emails, whitespace-only password, empty password, null/int/bool password, text/plain CT, form-urlencoded CT, multipart CT, nested object fields, malformed body shapes

### Bugs Found
1. **Validate-email accepts consecutive dots** (tc-jv8jek): `test..double@example.com` returns 200, should be 422 per RFC 5321.
2. **Google callback returns 200 for invalid code** (tc-tgxg98): returns 200 instead of error.
3. **WAF false positives on register** (multiple tests): WAF blocks legitimate registrations with plus-addressed emails, dotted/hyphenated/underscored usernames, accented names.

### Route Groups Tested
- `/v1/auth` -- 222 test cases (143 original + 79 register expansion), 13 endpoints, all pass after corrections
- `/v1/spaces` -- 49 test cases (43 standalone + 6 flow), 11 endpoints, all pass after 1 correction cycle

### Spaces-Specific Patterns
- **Dev-login works on local**: Use `/usr/bin/python3` with `urllib.request` for token acquisition; `curl` has shell quoting issues with JSON.
- **PATCH valid on /{space_id}**: Don't test PATCH as "wrong method" for space_id path -- it's the update endpoint.
- **GET valid on /v1/spaces/**: It's the list endpoint. Don't test it as "wrong method" for create.
- **SpaceCreate extra fields forbidden**: `model_config = {"extra": "forbid"}` returns 422.
- **organization_id regex validation**: Pattern `^org_[a-f0-9]{32}$` validated at schema level (422).
- **Non-member org returns 403**: INSUFFICIENT_PERMISSIONS for create and list.
- **Space access levels**: view < edit < owner. Owner required for access_mode changes.
- **Thread creation endpoint**: POST /v1/threads with organization_id returns thread with `id` field.
- **Vector store endpoints need state**: Happy path testing for VS add/remove/list requires pre-created spaces and vector stores (flow test territory).

### Operational Notes
- Local backend unreachable. Staging is reliable.
- `{{auth_token}}`/`{{refresh_token}}` auto-resolved on login; `{{email_key}}` needs `variable_overrides`.
- WAF aggressively blocks register endpoint for edge case payloads.
- MCP test tool only supports GET/POST/PUT/PATCH/DELETE methods; OPTIONS/HEAD cannot be tested directly.
- MCP test tool body param only accepts JSON objects, not raw arrays or strings.
