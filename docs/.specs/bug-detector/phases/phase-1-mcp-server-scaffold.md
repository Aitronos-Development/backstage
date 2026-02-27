# Phase 1: Bug Detector MCP Server — Scaffold & read_error_logs Tool

**Goal:** A new MCP server that reads execution history (error logs) from the existing API testing history store and returns structured failure data, ready for downstream ticket creation.

**Depends on:** Existing `api-testing-backend` (historyStore), existing `api-testing-mcp-server` (reference architecture)

---

## What this phase delivers

- A new package at `plugins/bug-detector-mcp-server/` — a standalone MCP server process
- Auto-registration in `.claude/settings.json` and `.mcp.json` so Claude Code discovers it
- The `read_error_logs` tool — reads JSONL history files and returns structured failure data
- Stdio transport (same pattern as the existing api-testing MCP server)

## Technical design

### Package structure

```
plugins/bug-detector-mcp-server/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # Entry point — creates server, starts stdio transport
    ├── server.ts             # McpServer instance, tool registration
    ├── registration.ts       # Auto-registers in .claude/settings.json + .mcp.json
    └── tools/
        ├── readErrorLogs.ts  # read_error_logs tool
        ├── createBugTickets.ts   # (stub — Phase 2)
        └── processTestRun.ts     # (stub — Phase 3)
```

### Registration

Follow the exact same pattern as `plugins/api-testing-mcp-server/src/registration.ts`:
- On startup, write entry into `.claude/settings.json` under `allowedMcpServers`
- Write entry into `.mcp.json` under `mcpServers` with the tsx command

`.mcp.json` addition:
```json
{
  "mcpServers": {
    "bug-detector": {
      "command": "npx",
      "args": ["tsx", "plugins/bug-detector-mcp-server/src/index.ts"]
    }
  }
}
```

### read_error_logs tool

**MCP tool name:** `read_error_logs`

**Input schema:**
```typescript
{
  route_group: string;          // e.g. "/v1/auth" — required
  test_case_id?: string;        // optional — filter to a single endpoint
  run_id?: string;              // optional — filter to a specific execution ID
  limit?: number;               // max records to return (default 50)
}
```

**Behavior:**
1. If `test_case_id` is provided, read the single JSONL file at `.api-testing-history/{route-group-slug}/{test_case_id}.jsonl`
2. If only `route_group` is provided, read all JSONL files in `.api-testing-history/{route-group-slug}/`
3. Filter to `result === 'fail'` records only
4. If `run_id` is provided, further filter to `id === run_id`
5. Sort by timestamp descending (most recent first)
6. Apply `limit`

**Output schema:**
```typescript
{
  route_group: string;
  total_failures: number;
  failures: Array<{
    execution_id: string;
    timestamp: string;
    test_case_id: string;
    test_case_name: string;
    endpoint: string;              // request.url
    method: string;                // request.method
    expected_status: number | null; // from failure_reason parse, if available
    actual_status: number;         // response.status_code
    failure_reason: string;
    request: {
      method: string;
      url: string;
      headers: Record<string, string>;  // already masked by historyStore
      body?: unknown;
    };
    response: {
      status_code: number;
      headers: Record<string, string>;
      body?: unknown;
    };
    flow_step_log?: FlowStepLog;   // included if present
  }>;
}
```

### Reading from the existing history store

The history is stored as per-endpoint JSONL files at:
```
.api-testing-history/
├── v1-auth/
│   ├── tc-abc123.jsonl
│   └── tc-def456.jsonl
├── v1-health/
│   └── tc-ghi789.jsonl
```

Each line is a JSON-serialized `ExecutionRecord` (defined in `plugins/api-testing-backend/src/service/historyTypes.ts`). The bug detector reads these files directly — it does NOT go through the backend HTTP API, since both run on the same machine and the file paths are deterministic.

**Path resolution:**
```typescript
const HISTORY_DIR = path.resolve(__dirname, '../../../../.api-testing-history');

function routeGroupToDirName(routeGroup: string): string {
  return routeGroup.replace(/^\//, '').replace(/\//g, '-');
}
```

This matches the existing convention in `plugins/api-testing-backend/src/service/historyStore.ts`.

### Sensitive data handling

The `historyStore` already masks `Authorization` headers to `Bearer ***`. The `read_error_logs` tool should additionally:
- Truncate response bodies larger than 5,000 characters (append `... [truncated]`)
- Strip any field whose key matches common sensitive patterns: `password`, `secret`, `token`, `api_key`, `apiKey` (case-insensitive) from request bodies

## Development process

1. **Scaffold the package** — `package.json` (dependencies: `@modelcontextprotocol/sdk`, `tsx`, `zod`), `tsconfig.json`
2. **Implement `registration.ts`** — copy from api-testing-mcp-server, change server name to `bug-detector`
3. **Implement `index.ts` and `server.ts`** — create McpServer, register the `read_error_logs` tool, start stdio transport
4. **Implement `readErrorLogs.ts`** — file reading, filtering, output mapping
5. **Add stubs for Phase 2/3 tools** — return `{ status: 'not_implemented' }`
6. **Manual test** — run the MCP server, invoke `read_error_logs` via Claude Code to verify it reads real JSONL history

## Acceptance criteria

- [ ] MCP server starts without errors and appears in Claude Code's tool list
- [ ] `read_error_logs` with `route_group` returns all failures across that route group
- [ ] `read_error_logs` with `route_group` + `test_case_id` returns failures for that endpoint only
- [ ] `read_error_logs` with `run_id` returns that specific execution record (if failed)
- [ ] Response bodies over 5,000 chars are truncated
- [ ] Sensitive fields in request bodies are redacted
- [ ] Empty history (no JSONL files) returns `{ total_failures: 0, failures: [] }`
