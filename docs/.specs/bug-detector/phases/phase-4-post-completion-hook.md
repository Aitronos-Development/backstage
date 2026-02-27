# Phase 4: Post-Completion Hook — Automatic Trigger After Test Runs

**Goal:** After a test run completes in the API testing backend, automatically invoke the bug detector MCP to create tickets for any failures — removing the manual step entirely.

**Depends on:** Phase 3 (process_test_run), existing `api-testing-backend` (router.ts, test execution flow)

---

## What this phase delivers

- A post-completion callback in the api-testing-backend that fires after test execution
- An HTTP endpoint on the bug detector MCP for programmatic invocation (alongside existing stdio)
- Optional enable/disable toggle in app-config.yaml
- WebSocket notification to the frontend when tickets are auto-created

## Technical design

### Trigger point in the existing test runner

The api-testing-backend executes tests at two endpoints:
- `POST /execute` — runs a single test case
- `POST /execute-all` — runs all test cases in a route group

Both write execution records to the history store via `historyStore.append()`. The hook fires **after** `execute-all` completes (not after individual test executions — individual failures during bulk runs are batched).

**Modified flow in `router.ts`:**
```typescript
// After execute-all completes:
router.post('/execute-all', async (req, res) => {
  // ... existing execution logic ...
  // ... writes results to historyStore ...

  // NEW: Fire post-completion hook asynchronously
  const failedResults = results.filter(r => r.result === 'fail');
  if (failedResults.length > 0 && config.bugDetector?.autoCreate !== false) {
    fireBugDetectorHook(routeGroup, failedResults).catch(err => {
      logger.warn('Bug detector hook failed', err);
    });
  }

  res.json(results);
});
```

The hook fires asynchronously (does not block the response to the frontend). Failures in the hook are logged but do not affect the test run response.

### HTTP endpoint on the bug detector MCP

Add a lightweight HTTP server alongside the stdio transport so the backend can invoke it programmatically:

**Endpoint:** `POST http://localhost:7009/process`

**Request body:**
```json
{
  "route_group": "/v1/auth",
  "run_ids": ["exec-abc123", "exec-def456"]
}
```

**Response body:** Same as `process_test_run` output.

**Port:** `7009` (configurable via `app-config.yaml`)

**Implementation in `index.ts`:**
```typescript
import http from 'node:http';

// Start HTTP server for programmatic access
const httpServer = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/process') {
    const body = await readBody(req);
    const result = await processTestRun(JSON.parse(body));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

httpServer.listen(7009, '127.0.0.1', () => {
  console.error('[bug-detector] HTTP server listening on http://127.0.0.1:7009');
});
```

### Backend hook implementation

New file: `plugins/api-testing-backend/src/service/bugDetectorHook.ts`

```typescript
import type { LoggerService } from '@backstage/backend-plugin-api';

interface BugDetectorConfig {
  enabled: boolean;
  url: string;      // e.g. "http://127.0.0.1:7009"
}

export async function fireBugDetectorHook(
  config: BugDetectorConfig,
  routeGroup: string,
  failedRunIds: string[],
  logger: LoggerService,
): Promise<void> {
  if (!config.enabled) return;

  try {
    const response = await fetch(`${config.url}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route_group: routeGroup,
        run_ids: failedRunIds,
      }),
    });

    if (!response.ok) {
      logger.warn(`Bug detector returned ${response.status}: ${await response.text()}`);
      return;
    }

    const result = await response.json();
    logger.info(
      `Bug detector: ${result.tickets_created?.length ?? 0} tickets created, ` +
      `${result.tickets_skipped?.length ?? 0} duplicates skipped`
    );
  } catch (err) {
    logger.warn('Bug detector hook failed — is the MCP server running?', err as Error);
  }
}
```

### Configuration in app-config.yaml

```yaml
apiTesting:
  bugDetector:
    enabled: true                          # toggle auto-creation on/off
    url: http://127.0.0.1:7009             # bug detector MCP HTTP endpoint
```

Default: `enabled: true`. Setting `enabled: false` disables the hook entirely.

### WebSocket notification

After the bug detector returns, broadcast a WebSocket event to the frontend:

```typescript
// In the execute-all handler, after bug detector responds:
if (bugDetectorResult.tickets_created.length > 0) {
  wsBroadcast({
    type: 'bugs-created',
    route_group: routeGroup,
    tickets: bugDetectorResult.tickets_created.map(t => ({
      ticket_number: t.ticket_number,
      heading: t.heading,
    })),
  });
}
```

The frontend can then display a toast notification: "2 bug tickets created automatically — BUG-042, BUG-043"

### Startup sequencing

The bug detector MCP must be running before the api-testing-backend tries to invoke it. Options:
1. **Spawn as child process** (preferred) — the backend spawns the bug detector on startup, same as the api-testing MCP server
2. **Independent process** — started via `yarn start`, with the hook gracefully failing if the detector is not running

For Phase 4, use option 2 (independent) with graceful fallback. The hook logs a warning and returns if `GET /health` fails.

## Development process

1. **Add HTTP server to bug-detector-mcp-server** — `/process` and `/health` endpoints
2. **Create `bugDetectorHook.ts`** in api-testing-backend — HTTP client for the detector
3. **Modify `router.ts` execute-all handler** — fire hook after test completion
4. **Add configuration** — `app-config.yaml` section, config reading in backend
5. **Add WebSocket broadcast** — notify frontend of auto-created tickets
6. **Test the full loop** — run tests from the UI, verify tickets appear in bug manager

## Acceptance criteria

- [ ] Bug detector MCP serves HTTP on port 7009 alongside stdio
- [ ] `GET /health` returns `{ status: 'ok' }`
- [ ] `POST /process` accepts route_group and run_ids, returns ticket creation results
- [ ] After `execute-all` with failures, tickets are automatically created in bug manager
- [ ] The `execute-all` response is NOT delayed by the bug detector (async hook)
- [ ] If the bug detector is unreachable, a warning is logged and the test run completes normally
- [ ] Setting `bugDetector.enabled: false` in app-config.yaml disables the hook
- [ ] WebSocket event `bugs-created` is broadcast when tickets are created
- [ ] No duplicate tickets are created across repeated test runs
