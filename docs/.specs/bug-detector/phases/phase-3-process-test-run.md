# Phase 3: process_test_run Composite Tool — End-to-End Orchestration

**Goal:** A single MCP tool that orchestrates the full flow: read error logs → filter failures → create bug tickets. This is the primary entry point for automated bug creation after a test run completes.

**Depends on:** Phase 1 (read_error_logs), Phase 2 (create_bug_tickets)

---

## What this phase delivers

- The `process_test_run` tool — composite orchestrator that chains Phase 1 and Phase 2 tools
- A single-call entry point for Claude Code or the test runner to trigger bug creation
- A run summary output with actionable results

## Technical design

### process_test_run tool

**MCP tool name:** `process_test_run`

**Input schema:**
```typescript
{
  route_group: string;          // e.g. "/v1/auth" — required
  test_case_id?: string;        // optional — process a single endpoint only
  run_id?: string;              // optional — process a specific execution only
  dry_run?: boolean;            // optional — if true, returns what WOULD be created without creating
}
```

**Behavior:**
1. Call `read_error_logs` internally with the provided `route_group`, `test_case_id`, and `run_id`
2. If no failures found → return early with a success summary
3. If failures found → pass them to `create_bug_tickets`
4. Return a combined summary

**Output schema:**
```typescript
{
  route_group: string;
  processed_at: string;           // ISO 8601 timestamp
  total_tests_failed: number;
  tickets_created: Array<{
    ticket_number: string;
    bug_id: string;
    heading: string;
    endpoint: string;
    priority: 'urgent' | 'medium' | 'low';
  }>;
  tickets_skipped: Array<{
    endpoint: string;
    method: string;
    existing_ticket_number: string;
    reason: string;
  }>;
  bulk_ticket?: {                  // present only when >20 failures triggered bulk mode
    ticket_number: string;
    bug_id: string;
    heading: string;
    failure_count: number;
  };
  summary: string;                 // human-readable summary
  dry_run: boolean;
}
```

### Dry run mode

When `dry_run: true`:
- Reads error logs and generates ticket headings/descriptions
- Runs the deduplication check (reads from bug manager but does not write)
- Returns the full output structure but with `dry_run: true` and no actual ticket creation
- Useful for previewing what the tool would do before committing

### Internal orchestration

```typescript
async function processTestRun(input: ProcessTestRunInput): Promise<ProcessTestRunOutput> {
  // Step 1: Read failures
  const errorLogs = await readErrorLogs({
    route_group: input.route_group,
    test_case_id: input.test_case_id,
    run_id: input.run_id,
  });

  if (errorLogs.total_failures === 0) {
    return {
      route_group: input.route_group,
      processed_at: new Date().toISOString(),
      total_tests_failed: 0,
      tickets_created: [],
      tickets_skipped: [],
      summary: `No failures found for ${input.route_group}. All tests passed.`,
      dry_run: input.dry_run ?? false,
    };
  }

  // Step 2: Create tickets (or simulate in dry_run)
  if (input.dry_run) {
    const preview = await previewTickets(errorLogs.failures);
    return { ...preview, dry_run: true };
  }

  const result = await createBugTickets({ failures: errorLogs.failures });

  return {
    route_group: input.route_group,
    processed_at: new Date().toISOString(),
    total_tests_failed: errorLogs.total_failures,
    tickets_created: result.created.map(t => ({
      ...t,
      priority: derivePriority(/* matching failure */),
    })),
    tickets_skipped: result.skipped_duplicates,
    summary: result.summary,
    dry_run: false,
  };
}
```

### Error handling

| Scenario | Behavior |
|----------|----------|
| History directory doesn't exist | Return 0 failures, no error |
| JSONL file has corrupt lines | Skip corrupt lines, log warning, process valid ones |
| Bug manager API is unreachable | Return error with `{ error: "Bug manager unreachable at {url}" }` |
| Bug manager returns 4xx on create | Include the failed endpoint in output with the error message |
| Partial success (some tickets created, some failed) | Return both `tickets_created` and a new `tickets_failed` array |

### Logging

The tool should log to stderr (MCP convention) at each step:
```
[bug-detector] Reading error logs for /v1/auth...
[bug-detector] Found 3 failures
[bug-detector] Checking deduplication for POST /v1/auth/login...
[bug-detector] Creating ticket: [API Test Failure] POST /v1/auth/login — 500 Internal Server Error
[bug-detector] Created BUG-042
[bug-detector] Skipping POST /v1/auth/verify — duplicate of BUG-039
[bug-detector] Done: 2 created, 1 skipped
```

## Development process

1. **Implement `processTestRun.ts`** — orchestration logic calling readErrorLogs + createBugTickets
2. **Implement dry run path** — generate previews without calling bug manager POST
3. **Add error handling** — graceful degradation for corrupt history, unreachable bug manager
4. **Add stderr logging** — progress updates at each step
5. **Register the tool in `server.ts`** — add to McpServer alongside the other tools
6. **End-to-end manual test** — trigger a test run in the UI, then call `process_test_run` via Claude Code

## Acceptance criteria

- [ ] `process_test_run` with a `route_group` that has failures creates tickets and returns a summary
- [ ] `process_test_run` with a `route_group` that has no failures returns a clean success summary
- [ ] `process_test_run` with `dry_run: true` returns what would be created without actually creating
- [ ] `process_test_run` with `test_case_id` scopes to a single endpoint
- [ ] `process_test_run` with `run_id` scopes to a specific execution
- [ ] Corrupt JSONL lines are skipped with a logged warning
- [ ] Bug manager API failure is surfaced in the output, not thrown as an unhandled error
- [ ] Partial success returns both created and failed tickets
- [ ] Stderr logs show progress through each step
