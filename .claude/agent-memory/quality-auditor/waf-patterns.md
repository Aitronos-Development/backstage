# WAF Patterns - Aitronos API

## Confirmed WAF Triggers
1. **Email domain blocking**: `@example.com` and likely other disposable/test domains are blocked with 403
2. **XSS payloads**: `<script>`, `<img onerror>`, HTML tags in any field
3. **SQL injection**: `'; DROP TABLE`, SQL keywords with quotes/semicolons
4. **Suspicious field names**: `role: "admin"`, `is_verified: true`, `org_id` (mass assignment patterns)
5. **Emoji/non-ASCII characters**: Emoji in field values triggers WAF

## WAF Does NOT Block
- Missing fields (empty body, missing email, etc.) -- these reach the app
- Short/numeric passwords like "123"
- Invalid email formats like "not-valid-email"
- Wrong HTTP methods (GET/DELETE on POST endpoint)
- Standard alphanumeric values with special chars in passwords

## Key Insight: WAF Stickiness
- WAF blocking is NOT tied to test case IDs -- creating new test cases with same payload still gets blocked
- WAF blocking IS tied to request content (specifically email domain)
- Changing email domain from @example.com to @aitronos.com bypasses the domain filter

## Test Design Rule
When testing app-level validation, isolate ONE variable and ensure all other fields use WAF-safe values:
- Email: `*@aitronos.com`
- Password: `securePassword123!` (unless testing password validation)
- Username: simple alphanumeric
- Full_name: simple ASCII name
