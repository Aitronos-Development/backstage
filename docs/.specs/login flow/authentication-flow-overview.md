# Freddy Backend — Authentication Flow Overview

> Complete reference for every authentication flow in the Freddy Backend, tracing from HTTP request to database writes and back.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Configuration](#configuration)
- [Flow 1: Registration](#flow-1-registration)
- [Flow 2: Email Verification](#flow-2-email-verification)
- [Flow 3: Login (Existing User)](#flow-3-login-existing-user)
- [Flow 4: Token Refresh](#flow-4-token-refresh)
- [Flow 5: Logout](#flow-5-logout)
- [Flow 6: Password Reset (Forgot Password)](#flow-6-password-reset-forgot-password)
- [Flow 7: Password Update (Authenticated)](#flow-7-password-update-authenticated)
- [Flow 8: API Key Authentication](#flow-8-api-key-authentication)
- [Flow 9: Bearer Token Authentication](#flow-9-bearer-token-authentication)
- [Flow 10: Resend Verification Code](#flow-10-resend-verification-code)
- [Flow 11: Email Validation (Pre-Registration Check)](#flow-11-email-validation-pre-registration-check)
- [Flow 12: Dev Login (Non-Production Only)](#flow-12-dev-login-non-production-only)
- [JWT Token Structure](#jwt-token-structure)
- [Middleware & Auth Context](#middleware--auth-context)
- [Roles & Permissions](#roles--permissions)
- [Security Features Summary](#security-features-summary)
- [API Endpoints Reference](#api-endpoints-reference)
- [Key Files Reference](#key-files-reference)

---

## Architecture Overview

```
                    +---------------------------------------------+
                    |              UNAUTHENTICATED                 |
                    +---------------------------------------------+
                         |              |              |
                  +------v------+ +-----v-----+ +-----v------+
                  |  REGISTER   | |   LOGIN   | |  FORGOT    |
                  |  /register  | |  /login   | |  PASSWORD  |
                  +------+------+ +-----+-----+ +-----+------+
                         |              |              |
                         |    +---------v----------+   |
                         +--->|   VERIFY CODE      |<--+
                              |   /verify          |
                              |   /password/reset  |
                              |     /verify        |
                              +---------+----------+
                                        |
                    +-------------------v------------------------+
                    |              AUTHENTICATED                  |
                    |                                             |
                    |  Access Token (3 weeks) in every request   |
                    |  +--------------------------------------+  |
                    |  |  Middleware validates on EVERY call:  |  |
                    |  |  1. JWT signature + expiry            |  |
                    |  |  2. Environment match                 |  |
                    |  |  3. User exists + active              |  |
                    |  |  4. Org membership active             |  |
                    |  +--------------------------------------+  |
                    |                                             |
                    |  Available actions:                         |
                    |  - /auth/validate       (check token)      |
                    |  - /auth/password/update (change password)  |
                    |  - /auth/logout         (revoke tokens)    |
                    |  - /auth/refresh        (new access token) |
                    |  - All other API endpoints                  |
                    +---------------------------------------------+
```

### Authentication Methods

The system supports three authentication methods:

| Method                   | Header                          | Format                                         | Use Case              |
| ------------------------ | ------------------------------- | ---------------------------------------------- | --------------------- |
| **JWT Bearer Token**     | `Authorization: Bearer <token>` | HS256-signed JWT with Fernet-encrypted payload | User login sessions   |
| **Organization API Key** | `x-api-key`                     | `ak_{env}_{base64_key}`                        | Programmatic access   |
| **Flowplate User Key**   | `x-api-key`                     | `fl_user_{env}_{hex}`                          | Flowplate integration |

---

## Configuration

### Required Environment Variables

| Setting                        | Default                    | Description                                             |
| ------------------------------ | -------------------------- | ------------------------------------------------------- |
| `SECRET_KEY`                   | **Required**               | >= 32 char hex for JWT signing                          |
| `JWT_PAYLOAD_ENCRYPTION_KEY`   | **Required**               | >= 32 char base64 for Fernet encryption                 |
| `JWT_ALGORITHM`                | `HS256`                    | HMAC-SHA256                                             |
| `ACCESS_TOKEN_EXPIRE_MINUTES`  | `30240`                    | 3 weeks (60 _ 24 _ 21)                                  |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | `30`                       | 30 days (used as days despite name)                     |
| `ADMIN_API_KEY`                | **Required** (except test) | Admin endpoint protection                               |
| `AUTHENTICATION_MODE`          | `aitronos`                 | `aitronos` or `flowplate`                               |
| `TESTER_STATIC_EMAIL`          | `None`                     | Static OTP bypass email (non-prod)                      |
| `TESTER_STATIC_OTP`            | `None`                     | Static OTP bypass code (non-prod)                       |
| `FLOWPLATE_MASTER_API_KEY`     | `""`                       | Flowplate integration key                               |
| `EMAIL_ENABLED`                | `False`                    | Enable email sending                                    |
| `ENVIRONMENT`                  | `local`                    | `local` / `develop` / `staging` / `production` / `test` |

---

## Flow 1: Registration

**Endpoint:** `POST /auth/register`
**Auth Required:** No
**Source:** `app/services/auth/registration_service.py`

### What the user does

Fills out registration form with email, password, full name, and optional username.

### Request

```json
{
  "email": "rahul.sa@aitronos.com",
  "password": "SecurePassword123!",
  "full_name": "Rahul S",
  "user_name": "rahul.sa",
  "organization_id": "org_12345678901234567890123456789012",
  "device_information": {
    "device": "Chrome Browser",
    "platform": "web",
    "device_id": "device-123"
  }
}
```

### Backend Step-by-Step

#### 1. Schema Validation (Pydantic)

Before any code runs, the request schema validates:

- **Email:** regex validated, lowercased, max 255 chars
- **Password:** 8-72 chars (72 is bcrypt's hard limit)
- **Username** (if provided): 3-100 chars, lowercased, only `a-z0-9._-`
- **Organization ID** (if provided): must be `org_` + 32 hex chars (36 total)

#### 2. Domain Validation

```
DomainValidationService.can_register(email)
  -> Extract domain from email (e.g., "aitronos.com")
  -> SELECT * FROM organization_domains WHERE domain = 'aitronos.com'
  -> If no match: 403 "Registration is restricted to users with registered domains"
  -> If match: returns the organization_id
```

Only users from registered domains can register.

#### 3. Uniqueness Checks

```sql
SELECT * FROM users WHERE email = 'rahul.sa@aitronos.com'
-- If exists: 409 "User with this email already exists"

SELECT * FROM pending_registrations WHERE email = 'rahul.sa@aitronos.com'
-- If exists: DELETE it (allow re-registration)

-- If username provided:
SELECT * FROM users WHERE username = 'rahul.sa'
SELECT * FROM pending_registrations WHERE username = 'rahul.sa'
-- If either exists: 409 "Username already taken"
```

#### 4. Password Strength Validation

Rules:

- > = 8 characters
- <= 128 characters
- At least one special character (`!@#$%^&*()_+-=[]{}|;:,.<>?/\\"'` `` ` `` `~`)
- Not in weak password list: `password`, `12345678`, `qwerty`, `abc123`, `password123`, `admin123`, `letmein`, `welcome`, `monkey`, `1234567890`

If fails: 422 with specific message.

#### 5. Hash Password

```python
bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
# Produces: '$2b$12$...' (12 rounds, auto-salted)
```

#### 6. Generate Verification Artifacts

```python
email_key = str(uuid4())                        # e.g., "a1b2c3d4-..."
verification_code = secrets.randbelow(9000) + 1000  # random 4-digit (1000-9999)
expires_at = datetime.now(UTC) + timedelta(hours=24)
```

#### 7. Send Verification Email (FIRST)

Calls ZeptoMail API with verification code template. If email send fails, returns 500 with no DB records created. This fail-fast approach prevents orphaned pending registrations.

#### 8. Auto-Generate Username (if not provided)

```
Email: rahul.sa@aitronos.com
  -> prefix: "rahul.sa"
  -> strip special chars: "rahul.sa"
  -> check users + pending_registrations tables
  -> if taken: try "rahul.sa1", "rahul.sa2", ... up to "rahul.sa99"
  -> last resort: "user{random 5 digits}"
```

#### 9. Create Pending Registration

```sql
INSERT INTO pending_registrations (
  email, password_hash, full_name, username,
  organization_id, verification_key, verification_code, expires_at
) VALUES (
  'rahul.sa@aitronos.com', '$2b$12$...', 'Rahul S', 'rahul.sa',
  'org_123...', 'a1b2c3d4-...', 4567, '2026-02-21T...'
)
```

> **The user is NOT created yet.** Only a pending record exists.

### Response

```json
{
  "success": true,
  "user_id": "prg_abc123...",
  "email": "rahul.sa@aitronos.com",
  "email_key": "a1b2c3d4-...",
  "verification_required": true,
  "type": "registration",
  "message": "Registration successful. Please check your email for a 4-digit verification code.",
  "recommended_username": "rahul.sa"
}
```

**User sees:** "Check your email for a verification code."

---

## Flow 2: Email Verification

**Endpoint:** `POST /auth/verify`
**Auth Required:** No
**Source:** `app/services/auth/auth_service.py` -> `verify_email_and_get_tokens()`

This single endpoint handles two paths:

- **Registration verification** (if `email_key` matches a `PendingRegistration`)
- **Login verification** (if `email_key` matches an `EmailVerification`)

### What the user does

Enters the 4-digit code from their email.

### Request

```json
{
  "email_key": "a1b2c3d4-...",
  "verification_code": 4567,
  "device_information": {
    "device_id": "device-123",
    "platform": "web"
  }
}
```

### Path A: Registration Verification

Triggered when `email_key` matches a record in `pending_registrations`.

#### Steps

1. **Check if user already exists** (race condition guard):

   ```sql
   SELECT * FROM users WHERE email = ?
   -- If exists: delete pending registration, return 409
   ```

2. **Validate code:** Compare submitted code vs `pending_reg.verification_code`

3. **Static OTP bypass** (non-production only): If email matches `TESTER_STATIC_EMAIL` and code matches `TESTER_STATIC_OTP`, bypass code comparison.

4. **Check expiry:** `pending_reg.expires_at < now` -> 401 "Expired"

5. **Validate organization:**

   ```sql
   SELECT * FROM roles WHERE name = 'Member' AND organization_id = ?
   SELECT * FROM user_statuses WHERE name = 'Active' AND organization_id = ?
   ```

6. **CREATE THE USER:**

   ```sql
   INSERT INTO users (
     id, email, hashed_password, full_name, username,
     is_active, last_verified, current_organization_id
   ) VALUES ('usr_abc123...', 'rahul.sa@aitronos.com', '$2b$12$...', 'Rahul S',
             'rahul.sa', true, NOW(), 'org_xyz...')
   ```

7. **Create organization membership:**

   ```sql
   INSERT INTO organization_users (
     organization_id, user_id, role_id, status_id, joined_at, is_deleted
   ) VALUES ('org_xyz...', 'usr_abc...', 'role_member...', 'status_active...', NOW(), false)
   ```

8. **Cleanup:** Delete `PendingRegistration` record.

9. **Send welcome email** (fire-and-forget, won't fail the flow).

10. **Create device session** (if device info provided):

    ```sql
    INSERT INTO device_sessions (user_id, device_id, device_name, platform, ...)
    ```

11. **Generate tokens:**

    ```python
    access_token = encode_jwt(
      sub=user_id, type="access", exp=3_weeks,
      ctx=encrypt({email, username}), env=settings.ENVIRONMENT
    )
    refresh_token = encode_jwt(
      sub=user_id, type="refresh", exp=30_days,
      ctx=encrypt({email, username}), env=settings.ENVIRONMENT
    )
    ```

12. **Store refresh token:**
    ```sql
    INSERT INTO refresh_tokens (id, user_id, token, expires_at, device_id, device_info)
    VALUES ('rtok_xyz...', 'usr_abc...', 'eyJhbG...', NOW() + 30 days, 'device-123', '{}')
    ```

### Path B: Login Verification

Triggered when `email_key` matches a record in `email_verifications`.

#### Steps

1. **Lookup:**

   ```sql
   SELECT * FROM email_verifications WHERE key = ?
   -- Not found: 404
   ```

2. **Validate type:** `verification_type_id` must be `"login"` (not registration or password_reset). Otherwise 422.

3. **Check expiry:** `expires_at < now` -> 401 "Code expired"

4. **Check already used:** `is_verified == true` -> 409 "Already verified"

5. **Static OTP bypass** (non-production only).

6. **Verify code:** Compare submitted code vs stored code. Mismatch -> 401 "Invalid verification code"

7. **Update user:**

   ```sql
   UPDATE users SET last_verified = NOW() WHERE id = ?
   ```

8. **Create/update device session.**

9. **Generate tokens** (same as Path A).

10. **Store refresh token in DB.**

### Response (both paths)

```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in": 1814400,
  "device_id": "device-123",
  "user": {
    "id": "usr_abc123...",
    "email": "rahul.sa@aitronos.com",
    "verified": true,
    "current_organization_id": "org_xyz..."
  }
}
```

**User sees:** Logged in, redirected to the app.

---

## Flow 3: Login (Existing User)

**Endpoint:** `POST /auth/login` then `POST /auth/verify`
**Auth Required:** No
**Source:** `app/services/auth/auth_service.py` -> `initiate_login()`

### What the user does

Enters email/username + password on the login page.

### Step 1: Credential Verification (`POST /auth/login`)

#### Request

```json
{
  "email_or_username": "rahul.sa@aitronos.com",
  "password": "SecurePassword123!",
  "device_information": {
    "device": "Chrome Browser",
    "platform": "web",
    "device_id": "device-123"
  }
}
```

#### Validation Chain (exact order)

```
1. SELECT * FROM users WHERE email = ? OR username = ?
       | not found
   -> Record failed login attempt -> 401 "Invalid credentials"

2. user.is_deleted == true?
       | yes
   -> Record failed attempt -> 401 "Invalid credentials"

3. user.is_active == false?
       | yes
   -> Record failed attempt -> 401 "Invalid credentials"

4. bcrypt.checkpw(password, user.hashed_password) == false?
       | yes
   -> Record failed attempt -> 401 "Invalid credentials"

5. SELECT ou.*, us.*
   FROM organization_users ou
   JOIN user_statuses us ON ou.status_id = us.id
   WHERE ou.user_id = ? AND ou.is_deleted = false
       | no rows
   -> 403 "Your account has been removed from all organizations"
       | all rows have status in ['Inactive', 'Deleted', 'InvitationSent']
   -> 403 "Your account has been deactivated"

6. All checks passed
   -> Record successful login attempt
```

> Every error returns the same generic "Invalid credentials" message to prevent attackers from discovering whether an email exists.

#### After Validation Passes

```python
email_key = uuid4()
verification_code = secrets.randbelow(9000) + 1000  # 4-digit
expires_at = now + 5 minutes
```

```sql
-- Invalidate existing login verifications for this email
UPDATE email_verifications SET is_deleted = true
WHERE email_id = ? AND verification_type_id = 'login'

-- Create new verification record
INSERT INTO email_verifications (
  key, email_id, verification_code, verification_type_id, expires_at, user_id
) VALUES (email_key, email, code, 'login', expires_at, user_id)
```

Send verification email via ZeptoMail.

#### Response

```json
{
  "success": true,
  "message": "Login credentials verified. Please check your email for verification code.",
  "email_key": "a1b2c3d4-...",
  "email": "rahul.sa@aitronos.com",
  "requires_verification": true,
  "next_step": "email_verification",
  "type": "login",
  "user": {
    "id": "usr_abc123...",
    "email": "rahul.sa@aitronos.com",
    "username": "rahul.sa"
  }
}
```

### Step 2: Code Verification (`POST /auth/verify`)

See [Flow 2 - Path B: Login Verification](#path-b-login-verification).

**User sees:** Check email -> enter code -> logged in.

---

## Flow 4: Token Refresh

**Endpoint:** `POST /auth/refresh`
**Auth Required:** No (uses refresh token in body)
**Source:** `app/services/auth/auth_service.py` -> `refresh_tokens()`

### When this happens

Client's access token expired (after 3 weeks). The client automatically calls this endpoint.

### Request

```json
{
  "refresh_token": "eyJhbG..."
}
```

### Backend Step-by-Step

```
1. SELECT * FROM refresh_tokens WHERE token = ?
       | not found -> 401 "Invalid refresh token"

2. is_revoked == true? -> 401 "Token has been revoked"

3. is_expired (expires_at < now)? -> 401 "Token has expired"

4. SELECT * FROM users WHERE id = token_record.user_id
   -> Check user exists, is_active, not is_deleted
       | fail -> 404 "User not found or inactive"

5. UPDATE refresh_tokens SET last_used_at = NOW() WHERE token = ?

6. Generate NEW access token only (same user_id, fresh 3-week expiry)
   NOTE: The refresh token itself is NOT rotated
```

### Response

```json
{
  "access_token": "eyJhbG...<new>",
  "refresh_token": "eyJhbG...<same>",
  "token_type": "bearer",
  "device_id": "device-123"
}
```

**User sees:** Nothing. This happens transparently in the background.

---

## Flow 5: Logout

**Endpoint:** `POST /auth/logout`
**Auth Required:** Yes (Bearer token)
**Source:** `app/services/auth/auth_service.py` -> `logout()`

### What the user does

Clicks "Log out."

### Request

```json
{
  "refresh_token": "eyJhbG..."
}
```

### Three Logout Modes

#### Mode A: Specific refresh token provided

```
1. SELECT * FROM refresh_tokens WHERE token = ?
       | not found -> 422 "Invalid refresh token"
2. Verify token belongs to this user (user_id from access token)
       | mismatch -> 422 "Token does not belong to user"
3. is_revoked == true? -> 422 "Already revoked"
4. is_expired? -> 422 "Token expired"
5. UPDATE refresh_tokens SET is_revoked = true WHERE token = ?
```

#### Mode B: Device ID provided (no refresh token)

```
UPDATE refresh_tokens SET is_revoked = true
WHERE user_id = ? AND device_id = ?
```

#### Mode C: Nothing provided

```
UPDATE refresh_tokens SET is_revoked = true
WHERE user_id = ?
-- Revokes ALL tokens for this user (logout everywhere)
```

### Response

```json
{
  "message": "Successfully logged out",
  "logged_out_at": "2026-02-20T14:05:00Z"
}
```

**User sees:** Redirected to login page.

---

## Flow 6: Password Reset (Forgot Password)

**Endpoints:** `POST /auth/password/reset` then `POST /auth/password/reset/verify`
**Auth Required:** No
**Source:** `app/services/auth/password_service.py` + `app/services/auth/auth_service.py`

### Step 1: Request Reset (`POST /auth/password/reset`)

#### What the user does

Enters their email on the "Forgot Password" page.

#### Request

```json
{
  "email": "rahul.sa@aitronos.com"
}
```

#### Backend Step-by-Step

```
1. SELECT * FROM users WHERE email = ?

2. User not found OR not active?
   -> Return success anyway (prevents email enumeration)

3. Rate limit check:
   SELECT * FROM email_verifications
   WHERE email_id = ? AND verification_type = 'password_reset'
   AND created_at > (NOW() - 1 minute)
       | found -> silently return success (don't reveal rate limiting)

4. Invalidate old password reset verifications:
   UPDATE email_verifications SET is_deleted = true
   WHERE email_id = ? AND verification_type = 'password_reset'

5. Generate code (4-digit) + email_key (UUID)
   expires_at = NOW() + 5 minutes

6. INSERT INTO email_verifications (
     key, email_id, verification_code, verification_type_id, expires_at, user_id
   ) VALUES (?, ?, ?, 'password_reset', ?, ?)

7. Send password reset email via ZeptoMail
```

#### Response (always the same, regardless of whether user exists)

```json
{
  "success": true,
  "message": "If the account exists, a password reset email has been sent",
  "type": "password_reset"
}
```

### Step 2: Verify and Set New Password (`POST /auth/password/reset/verify`)

#### Request

```json
{
  "email": "rahul.sa@aitronos.com",
  "verification_code": 4567,
  "new_password": "NewSecurePassword456!"
}
```

#### Backend Step-by-Step

```
1. Validate password strength (8+ chars, special char, not weak)
       | fail -> 422

2. SELECT * FROM users WHERE email = ?
       | not found -> 404

3. Static OTP bypass check (non-production only)

4. Verify code against email_verifications table
       | invalid/expired -> 422

5. Hash new password:
   bcrypt.hashpw(new_password, bcrypt.gensalt())

6. UPDATE users SET hashed_password = ? WHERE id = ?

7. Mark verification as used:
   UPDATE email_verifications SET is_deleted = true WHERE id = ?

8. REVOKE ALL REFRESH TOKENS for this user:
   UPDATE refresh_tokens SET is_revoked = true WHERE user_id = ?
   -> Forces re-login on ALL devices
```

#### Response

```json
{
  "success": true,
  "message": "Password has been reset successfully. You can now login with your new password."
}
```

**User sees:** "Password reset successful" -> redirected to login page -> must log in again on all devices.

---

## Flow 7: Password Update (Authenticated)

**Endpoint:** `PUT /auth/password/update`
**Auth Required:** Yes (Bearer token)
**Source:** `app/services/auth/auth_service.py` -> `update_password()`

### What the user does

Goes to settings, enters current password + new password + confirm password.

### Request

```json
{
  "current_password": "CurrentPassword123!",
  "new_password": "NewSecurePassword456!",
  "confirm_password": "NewSecurePassword456!"
}
```

### Backend Step-by-Step

```
1. Extract user_id from access token (via get_auth_context dependency)

2. new_password != confirm_password?
   -> 422 "Passwords do not match"

3. SELECT * FROM users WHERE id = ?
       | not found -> 404

4. bcrypt.checkpw(current_password, user.hashed_password) == false?
   -> 401 "Current password is incorrect"

5. Validate new password strength
       | fail -> 422

6. UPDATE users SET hashed_password = bcrypt(new_password) WHERE id = ?

7. If X-Device-ID header present:
   -> Revoke ALL refresh tokens EXCEPT this device:
   UPDATE refresh_tokens SET is_revoked = true
   WHERE user_id = ? AND device_id != ?
   -> Current session stays alive, all other devices logged out

   If no device ID:
   -> No tokens revoked (only password changed)
```

### Response

```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

**User sees:** "Password updated" - stays logged in on current device, logged out everywhere else.

---

## Flow 8: API Key Authentication

**Trigger:** Any protected endpoint with `x-api-key` header
**Source:** `app/api/middleware/api_key_auth.py`

### What the user does

Sends API request with `x-api-key: ak_production_AbCdEf...` header.

### Backend Step-by-Step

```
1. Extract raw key from headers
   (checks: x-api-key, api-key, X-API-Key, API-Key)

2. Check if Flowplate key (starts with "fl_user_")
   -> If yes: go to Flowplate validation flow (see below)

3. Extract environment from key format:
   "ak_production_AbCdEf..." -> env = "production"

4. env != settings.ENVIRONMENT?
   -> 401 "API key is for {env} environment, but server is running in {current_env}"

5. Extract key prefix (first N chars after environment segment)

6. SELECT * FROM organization_api_keys WHERE key_prefix = ?
   -> Returns candidate keys (narrows search without comparing every hash)

7. For each candidate:
     bcrypt.checkpw(raw_key, candidate.key_hash)
     -> First match wins
     -> No match after all candidates -> 401 "Invalid API key"

8. Status checks (in order):
   is_deleted?           -> 401 "API key has been deleted"
   is_active == false?   -> 401 "API key is deactivated"
   is_paused?            -> 401 "API key is temporarily paused"
   expires_at < now?     -> 401 "API key has expired"

9. Load organization associations:
   SELECT * FROM api_key_organizations
   WHERE api_key_id = ? AND is_deleted = false

10. Return auth context:
    {
      api_key_id: "ak_abc...",
      organization_id: "org_xyz...",
      organization_ids: ["org_xyz...", "org_def..."],
      is_multi_org: true/false,
      auth_method: "api_key",
      scopes: ["chat", "files", ...]
    }
```

### Flowplate User Key Validation

For keys starting with `fl_user_`:

```
1. FlowplateKeyService.validate_user_key(raw_key)
2. Check key exists, not expired, not deactivated
3. Extract user_id and org_id from key record
4. Return auth context:
   {
     api_key_id: "...",
     flowplate_key: true,
     user_id: "usr_...",
     organization_id: "org_...",
     auth_method: "flowplate_api_key",
     scopes: FLOWPLATE_KEY_SCOPES
   }
```

### API Key Model Fields

| Field                                    | Description                               |
| ---------------------------------------- | ----------------------------------------- |
| `id`                                     | `ak_{uuid}` prefix                        |
| `key_hash`                               | bcrypt hash of the raw key                |
| `key_prefix`                             | First N chars for efficient lookup        |
| `is_active` / `is_paused` / `is_deleted` | Lifecycle flags                           |
| `usage_limit_chf`                        | Spending cap in Swiss Francs              |
| `scopes`                                 | JSON array of permission scopes           |
| `expires_at`                             | Optional expiration                       |
| `created_by` / `deleted_by`              | Audit trail                               |
| Multi-org support                        | via `api_key_organization` junction table |

---

## Flow 9: Bearer Token Authentication

**Trigger:** Any protected endpoint with `Authorization: Bearer <token>` header
**Source:** `app/api/v1/utils/auth_utils.py` -> `get_auth_context()`

### What happens on every authenticated request

```
1. Extract token from "Authorization: Bearer eyJhbG..." header

2. Decode JWT:
   - Verify HS256 signature against SECRET_KEY
   - Check exp > now (reject expired)
   - Check nbf <= now
   - Decrypt ctx field with Fernet key

3. Validate environment:
   token.env != settings.ENVIRONMENT? -> 401

4. Validate token type:
   token.type != "access"? -> reject

5. Extract user_id from token.sub

6. SELECT * FROM users WHERE id = user_id
   -> not found or not active -> 401

7. Check user.is_deleted
   -> 403 "Account has been deleted"

8. Organization membership check:
   SELECT ou.*, us.*
   FROM organization_users ou
   JOIN user_statuses us ON ou.status_id = us.id
   WHERE ou.user_id = ? AND ou.is_deleted = false

   -> No memberships: 403 "No active organization memberships"
   -> All memberships in ['Inactive', 'Deleted', 'InvitationSent']: 403 "Account not active"

9. AuthContext populated:
   {
     user_id: "usr_abc...",
     user: <User object>,
     bearer_token: "eyJhbG...",
     organization_id: user.current_organization_id,
     auth_method: "user"
   }
```

---

## Flow 10: Resend Verification Code

**Endpoint:** `POST /auth/resend-code`
**Auth Required:** No
**Source:** `app/services/auth/verification_service.py`

### What the user does

Clicks "Resend code" on the verification screen.

### Request

```json
{
  "email_key": "a1b2c3d4-..."
}
```

### Backend Step-by-Step

```
1. Check: is this a pending registration?
   SELECT * FROM pending_registrations WHERE verification_key = ?

   If yes (registration resend):
     -> Check not expired (24hr window)
     -> Generate new 4-digit code
     -> UPDATE pending_registrations SET verification_code = ?, expires_at = NOW() + 24h
     -> Send registration verification email
     -> Return { type: "registration" }

2. If not, check email_verifications:
   SELECT * FROM email_verifications WHERE key = ?
       | not found -> 404

3. is_verified == true? -> 422 "Already completed"

4. Generate new 4-digit code

5. UPDATE email_verifications
   SET verification_code = ?, expires_at = NOW() + 5 min
   WHERE key = ?

6. Send appropriate email based on verification_type:
   - 'login'          -> login verification email
   - 'password_reset' -> password reset email
   - other            -> generic verification email
```

### Response

```json
{
  "success": true,
  "message": "A new verification code has been sent to your email",
  "email_key": "a1b2c3d4-...",
  "type": "login"
}
```

---

## Flow 11: Email Validation (Pre-Registration Check)

**Endpoint:** `POST /auth/validate-email`
**Auth Required:** No
**Source:** `app/services/auth/verification_service.py` -> `validate_email()`

### What the user does

Types email on the registration form (real-time validation as they type).

### Request

```json
{
  "email": "rahul.sa@aitronos.com"
}
```

### Backend Step-by-Step

```
1. Normalize: strip whitespace + lowercase

2. SELECT * FROM users WHERE email = ?
   -> If exists: { is_valid: false, reason: "already_registered" }

3. Domain lookup:
   DomainValidationService.get_organization_for_email(email)
   -> Extract "aitronos.com" from email
   -> SELECT * FROM organization_domains WHERE domain = 'aitronos.com'

   If match:
     -> Get organization details
     -> Return: { is_valid: true, organization: { id, name, logo, requires_invitation } }

   If no match:
     -> Return: { is_valid: true, organization: null }
     (Email is valid format but no org; registration will fail at domain check)
```

### Response (domain matched)

```json
{
  "success": true,
  "is_valid": true,
  "email": "rahul.sa@aitronos.com",
  "message": "Email is valid and available for registration",
  "organization": {
    "id": "org_123...",
    "name": "Aitronos",
    "logo": "https://...",
    "requires_invitation": false
  }
}
```

---

## Flow 12: Dev Login (Non-Production Only)

**Endpoint:** `POST /auth/dev-login`
**Auth Required:** No
**Source:** `app/services/auth/auth_service.py` -> `dev_login()`

### Guard

Only works in `local`, `develop`, or `test` environments. Returns 403 in staging/production.

### What it does

```
1. Same credential validation as /login:
   - User lookup, deleted check, active check, password verify
2. SKIP email verification entirely
3. Immediately generate access + refresh tokens
4. Store refresh token in DB
5. Create device session
6. Return tokens directly
```

One-step login instead of two-step. Same request format as `/auth/login`, same response format as `/auth/verify`.

---

## JWT Token Structure

### Token Claims

| Claim  | Description                  | Example                   |
| ------ | ---------------------------- | ------------------------- |
| `iat`  | Issued at (UTC)              | `1708437600`              |
| `jti`  | Unique token ID (UUID)       | `"550e8400-e29b-..."`     |
| `type` | Token type                   | `"access"` or `"refresh"` |
| `sub`  | User ID (subject)            | `"usr_abc123..."`         |
| `nbf`  | Not before (same as iat)     | `1708437600`              |
| `exp`  | Expiration timestamp         | `1710252000`              |
| `env`  | Environment identifier       | `"production"`            |
| `ctx`  | **Fernet-encrypted** payload | `"gAAAAABl..."`           |

### Encrypted Context (`ctx`)

The `ctx` field contains a Fernet-encrypted JSON string:

```json
{
  "email": "rahul.sa@aitronos.com",
  "username": "rahul.sa"
}
```

This is encrypted with `JWT_PAYLOAD_ENCRYPTION_KEY` using Fernet (AES-128-CBC), so even if someone decodes the JWT (which is only base64), they cannot read the context without the encryption key.

### Token Lifetimes

| Token         | Expiry                   | Purpose                  |
| ------------- | ------------------------ | ------------------------ |
| Access Token  | 3 weeks (30,240 minutes) | API authentication       |
| Refresh Token | 30 days                  | Obtain new access tokens |

### Security Properties

- **Signed:** HS256 (HMAC-SHA256) with `SECRET_KEY`
- **Encrypted payload:** Fernet (AES-128-CBC) with `JWT_PAYLOAD_ENCRYPTION_KEY`
- **Environment-bound:** Tokens from `staging` rejected on `production`
- **Non-replayable:** Unique `jti` per token

---

## Middleware & Auth Context

### Layer 1: AuthContextMiddleware (ASGI)

**File:** `app/middleware/auth_context_middleware.py`

Runs on **every** HTTP request. Pure ASGI middleware (supports streaming).

```
Request arrives
    |
    v
Try API key auth first (from headers)
    | success -> set request.state (org_id, api_key_id, auth_method="api_key")
    | fail/absent
    v
Try Bearer token auth
    | success -> set request.state (org_id, user_id, auth_method="bearer")
    | fail/absent
    v
Leave all as None (route handler decides if auth is required)
```

### Layer 2: get_auth_context() (FastAPI Dependency)

**File:** `app/api/v1/utils/auth_utils.py`

Used as `Depends(get_auth_context)` on protected routes. Does **full validation** with DB queries.

Returns an `AuthContext` object:

```python
@dataclass
class AuthContext:
    user_id: Optional[str]
    api_key_id: Optional[str]
    user: Optional[User]               # Only for bearer auth
    organization_id: Optional[str]
    organization_ids: Optional[list]    # Multi-org API keys
    is_multi_org: bool
    bearer_token: Optional[str]
    api_key: Optional[str]
    auth_method: "api_key" | "user" | None

    # Properties
    is_user_auth -> bool
    is_api_key_auth -> bool
    email -> Optional[str]
    display_name -> Optional[str]

    # Multi-org resolution
    get_organization_id(requested_org_id?) -> str
```

### Layer 3: LightweightAuthContext (Streaming Fast Path)

For streaming endpoints needing < 200ms time-to-first-token:

- **API key:** validates format only, no DB query
- **Bearer token:** decodes JWT to get user_id, no DB query
- Full validation happens inside the streaming generator

### Multi-Org API Key Resolution

| Scenario                           | Behavior                      |
| ---------------------------------- | ----------------------------- |
| Single-org key, no requested org   | Auto-infer from key's org     |
| Multi-org key, no requested org    | **Reject** (ambiguous)        |
| Single-org key, with requested org | Validate match                |
| Multi-org key, with requested org  | Validate org is in key's list |

---

## Roles & Permissions

### Base Roles (global, `organization_id = NULL`)

| Role       | Description                        |
| ---------- | ---------------------------------- |
| **Owner**  | Complete control including billing |
| **Admin**  | Full access except billing         |
| **Member** | Read-only access                   |

### Custom Roles

- Per-organization (`organization_id = specific org`)
- `permissions`: flexible JSON object
- `is_custom = true`, `can_be_deleted = true`
- `aitronos_only`: restricts to Aitronos team members
- `hidden`: hides from regular API responses

### Admin Verification

Two paths to admin access:

1. **API key auth** -> automatically granted admin access (any API key)
2. **Bearer token auth** -> requires `user.global_role_id` to be set

Alternative: `get_current_admin_user` in `deps.py` checks if `user.id` is in `settings.ADMIN_USER_IDS` list (more restrictive).

---

## Security Features Summary

| Feature                      | Implementation                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Password hashing             | bcrypt with auto-salt (12 rounds)                                                    |
| JWT signing                  | HS256 (HMAC-SHA256)                                                                  |
| JWT payload encryption       | Fernet (AES-128-CBC)                                                                 |
| 2FA                          | Email verification (4-digit code, 5-min expiry for login, 24hr for registration)     |
| Cross-environment protection | `env` claim in JWT, API key env prefix                                               |
| Login auditing               | `LoginAttempt` model (IP, user agent, device, success/failure reason)                |
| Device tracking              | `DeviceSession` model per user+device                                                |
| Token revocation             | Per-token, per-device, or all-user revocation                                        |
| Password reset               | Revokes all sessions, rate-limited (1/min), 5-min code expiry                        |
| Email enumeration prevention | Password reset always returns success                                                |
| API key security             | bcrypt hashed, prefix-based lookup, status lifecycle (active/paused/expired/deleted) |
| Account protection           | Deleted account check, inactive check, org membership blocklist                      |
| Secrets management           | `SecretStr` (Pydantic) for all sensitive config values                               |
| Generic error messages       | Login errors never reveal whether email/username exists                              |

---

## API Endpoints Reference

| Endpoint                      | Method | Auth | Purpose                              |
| ----------------------------- | ------ | ---- | ------------------------------------ |
| `/auth/register`              | POST   | No   | Create pending registration          |
| `/auth/login`                 | POST   | No   | Verify credentials, send email code  |
| `/auth/verify`                | POST   | No   | Verify code, return tokens           |
| `/auth/refresh`               | POST   | No   | Refresh access token                 |
| `/auth/logout`                | POST   | Yes  | Revoke tokens                        |
| `/auth/password/reset`        | POST   | No   | Request password reset code          |
| `/auth/password/reset/verify` | POST   | No   | Verify code + set new password       |
| `/auth/password/forgot`       | POST   | No   | Alias for `/password/reset`          |
| `/auth/password/update`       | PUT    | Yes  | Change password (authenticated)      |
| `/auth/validate-email`        | POST   | No   | Check email availability + org match |
| `/auth/resend-code`           | POST   | No   | Resend verification code             |
| `/auth/validate`              | GET    | Yes  | Check if current token is valid      |
| `/auth/dev-login`             | POST   | No   | Dev-only login (local/develop/test)  |

---

## Key Files Reference

### Core Authentication

| File                             | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `app/core/token_manager.py`      | JWT encoding/decoding with Fernet encryption |
| `app/core/security.py`           | Token creation (access + refresh)            |
| `app/core/password.py`           | bcrypt hashing and verification              |
| `app/core/password_validator.py` | Password strength validation rules           |
| `app/core/config.py`             | All auth-related settings                    |
| `app/core/error_codes.py`        | Centralized error code registry              |

### Routes & Schemas

| File                         | Purpose                          |
| ---------------------------- | -------------------------------- |
| `app/api/v1/routes/auth.py`  | Auth endpoint definitions        |
| `app/api/v1/schemas/auth.py` | Request/response Pydantic models |

### Services

| File                                        | Purpose                        |
| ------------------------------------------- | ------------------------------ |
| `app/services/auth/auth_service.py`         | Login, verify, refresh, logout |
| `app/services/auth/registration_service.py` | User registration              |
| `app/services/auth/verification_service.py` | Email verification + resend    |
| `app/services/auth/password_service.py`     | Password reset and update      |

### Middleware & Dependencies

| File                                        | Purpose                                                     |
| ------------------------------------------- | ----------------------------------------------------------- |
| `app/middleware/auth_context_middleware.py` | ASGI middleware (sets request.state)                        |
| `app/api/middleware/api_key_auth.py`        | API key validation logic                                    |
| `app/api/v1/utils/auth_utils.py`            | AuthContext, get_auth_context, org access verification      |
| `app/api/deps.py`                           | FastAPI dependencies (get_current_user, authenticate_token) |

### Models

| File                                             | Purpose                              |
| ------------------------------------------------ | ------------------------------------ |
| `app/services/db/models/user.py`                 | User model (`usr_` prefix)           |
| `app/services/db/models/refresh_token.py`        | Refresh token model (`rtok_` prefix) |
| `app/services/db/models/role.py`                 | Role model (`role_` prefix)          |
| `app/services/db/models/organization_api_key.py` | API key model (`ak_` prefix)         |
| `app/services/db/models/organization_user.py`    | User-organization membership         |
| `app/services/db/models/login_attempt.py`        | Login audit log                      |
