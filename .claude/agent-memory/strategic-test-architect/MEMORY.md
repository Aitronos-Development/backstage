# Strategic Test Architect Memory

## Project Structure
- Test repo: `test-repositories/Freddy.Backend.Tests/`
- Standalone JSON tests: `test-suites/` (one file per route group)
- Flow tests: `flows/` (Python pytest + httpx)
- Flow registrations: `flow-test-registrations.json`
- Helpers: `flows/helpers/auth.py`, `flows/helpers/state.py`, `flows/helpers/assertions.py`

## Auth Pattern
- Seeded user: `developers@aitronos.com` / `securePassword123!`
- Dev-login: `POST /v1/auth/dev-login` bypasses 2FA, auto-creates new users
- Must use `@aitronos.com` domain (DomainValidationService rejects others)

## Cross-Org Testing Limitation
- dev-login may assign all auto-created users to same default org
- Cross-org tests (thread/VS injection) need verification that User B gets different org_id
- If same org, test must skip or use fabricated IDs

## Flow Test ID Sequences
- Auth flows: fl-sess01..03, fl-tok01..03, fl-ver01..04, fl-dev01..04
- Model flows: fl-mr0001..0008
- Spaces flows: fl-sp0001..0019 (0011-0019 are gap-fill, pending implementation)
