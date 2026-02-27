# Phase 5: Deduplication Hardening & Edge Cases

**Goal:** Strengthen the deduplication logic, handle edge cases around concurrent runs, and add observability to track the bug detector's behavior over time.

**Depends on:** Phase 4 (end-to-end flow working)

---

## What this phase delivers

- Fingerprint-based deduplication (more robust than heading string matching)
- Concurrent run protection (prevent duplicate tickets when multiple test runs finish simultaneously)
- A local dedup ledger that tracks which execution IDs have already been processed
- Improved error categorization for better ticket grouping

## Technical design

### Fingerprint-based deduplication

Phase 2 uses heading string matching against the bug manager search API. This is fragile — if the heading format changes slightly, duplicates slip through.

Replace with a **fingerprint** approach:

```typescript
function computeFailureFingerprint(failure: FailureData): string {
  const raw = `${failure.method}|${failure.endpoint}|${failure.actual_status}|${normalizeError(failure.failure_reason)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function normalizeError(reason: string): string {
  // Strip variable parts: timestamps, UUIDs, request IDs
  return reason
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '{uuid}')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '{timestamp}')
    .replace(/request[_-]?id[:\s]*\S+/gi, 'request_id:{id}')
    .trim()
    .toLowerCase();
}
```

**Embedding the fingerprint in tickets:**

When creating a ticket, append the fingerprint to the description as a hidden marker:
```markdown
<!-- bug-detector-fingerprint:{fingerprint} -->
```

**Dedup check:**
1. Search bug manager for open bugs with `search={endpoint}`
2. For each returned bug, extract the fingerprint from the description
3. If any open bug matches the computed fingerprint → skip

This is more robust than heading matching because:
- It survives heading format changes
- It normalizes variable error parts (timestamps, UUIDs)
- It checks the actual error signature, not display text

### Local dedup ledger

Prevent reprocessing the same execution records across multiple `process_test_run` calls.

**File:** `.api-testing-history/.bug-detector-ledger.jsonl`

Each line:
```json
{
  "execution_id": "exec-abc123",
  "processed_at": "2026-02-27T10:30:00Z",
  "ticket_number": "BUG-042",
  "fingerprint": "a1b2c3d4e5f6g7h8"
}
```

**Behavior:**
1. Before processing a failure, check if `execution_id` exists in the ledger
2. If found → skip (already processed)
3. After creating a ticket, append to the ledger
4. The ledger is append-only JSONL (same pattern as history files)

**Ledger cleanup:** Entries older than 30 days can be pruned. Run cleanup at startup.

### Concurrent run protection

When multiple `execute-all` runs finish at the same time, their hooks could race and create duplicate tickets.

**Solution:** File-based lock using `lockfile` or `proper-lockfile` npm package:

```typescript
import lockfile from 'proper-lockfile';

const LOCK_FILE = path.join(HISTORY_DIR, '.bug-detector.lock');

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await lockfile.lock(LOCK_FILE, {
    retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
    stale: 30000,  // force release after 30s
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}
```

Wrap the entire `process_test_run` execution in this lock. Only one instance processes at a time; others queue up.

### Error categorization

Improve ticket grouping by categorizing failures:

| Category | Condition | Ticket Label |
|----------|-----------|--------------|
| Server Error | 5xx status | `server-error` |
| Auth Failure | 401, 403 status | `auth-failure` |
| Validation Error | failure_reason contains "schema" or "body_contains" | `validation-error` |
| Timeout | failure_reason contains "timeout" or "ETIMEDOUT" | `timeout` |
| Connection Error | failure_reason contains "ECONNREFUSED" or "ECONNRESET" | `connection-error` |
| Unexpected Status | status mismatch not in above categories | `unexpected-status` |

Append the category as a label in the ticket description:
```markdown
*Labels: `auto-generated`, `api-test`, `v1-auth`, `server-error`*
```

### Smart grouping for related failures

When multiple endpoints fail with the same root cause (e.g., all return 503 Service Unavailable), group them into a single ticket:

**Grouping rule:** If 3+ failures share the same `actual_status` and the status is 5xx or connection-related, create one grouped ticket instead of individual ones.

**Grouped ticket heading:**
```
[API Test Failure] /v1/auth — 4 endpoints returning 503 Service Unavailable
```

**Grouped ticket description:** Lists all affected endpoints in a table.

## Development process

1. **Implement fingerprint computation** — hash function with error normalization
2. **Embed fingerprint in ticket descriptions** — HTML comment marker
3. **Update dedup check** — extract and compare fingerprints
4. **Implement the local ledger** — JSONL append/read, execution ID tracking
5. **Add concurrent run protection** — file lock around process_test_run
6. **Implement error categorization** — category mapping, label generation
7. **Implement smart grouping** — detect shared root causes, generate grouped tickets
8. **Stress test** — run multiple test suites concurrently, verify no duplicate tickets

## Acceptance criteria

- [ ] Fingerprints are computed consistently for the same error (deterministic)
- [ ] Fingerprints normalize out variable parts (UUIDs, timestamps)
- [ ] Fingerprint is embedded in ticket description as HTML comment
- [ ] Dedup check extracts fingerprints from existing open bugs
- [ ] Ledger tracks processed execution IDs — no reprocessing on re-invocation
- [ ] Ledger entries older than 30 days are pruned at startup
- [ ] Concurrent `process_test_run` calls do not produce duplicate tickets
- [ ] Failures are categorized and labeled in ticket descriptions
- [ ] 3+ failures with the same 5xx status are grouped into a single ticket
- [ ] Grouped tickets list all affected endpoints
