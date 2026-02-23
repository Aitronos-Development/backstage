# Phase 1: MCP Server Core

**Goal:** A local MCP server that starts alongside the Backstage dev server, auto-registers in Claude Code settings, and exposes the foundational tool interface for test case management.

**Depends on:** Existing Backstage instance (Phase 1–3 of freddy-backend-connection)

---

## What this phase delivers

- A new package at `plugins/api-testing-mcp-server/` — a Node.js process that speaks the Model Context Protocol
- The server starts automatically as a child process when `yarn start` is run
- On first boot, it writes its configuration into `.claude/settings.json` so Claude Code discovers it without manual setup
- The MCP server exposes stub tool definitions (actual logic comes in Phase 2)

## Technical design

### MCP server implementation

The server is a standalone Node.js process using the `@modelcontextprotocol/sdk` package. It communicates over `stdio` (spawned by the Backstage backend as a child process) or over HTTP on `localhost:7008` for direct access.

**Package structure:**

```
plugins/api-testing-mcp-server/
├── package.json
├── src/
│   ├── index.ts            # Entry point — creates and starts the MCP server
│   ├── server.ts           # MCP server class, tool registration
│   ├── tools/              # One file per MCP tool (Phase 2 fills these in)
│   │   ├── listTestCases.ts
│   │   ├── readTestCase.ts
│   │   ├── createTestCase.ts
│   │   ├── editTestCase.ts
│   │   ├── deleteTestCase.ts
│   │   ├── runTestCases.ts
│   │   └── getExecutionHistory.ts
│   ├── storage/            # File-based storage layer (Phase 2)
│   └── registration.ts     # Auto-registration logic
└── tsconfig.json
```

### Auto-start integration

The Backstage backend's `packages/backend/src/index.ts` is modified to spawn the MCP server as a child process on startup:

```typescript
import { fork } from 'child_process';
import path from 'path';

// Start MCP server alongside the backend
const mcpServer = fork(
  path.resolve(__dirname, '../../plugins/api-testing-mcp-server/src/index.ts'),
  [],
  { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] },
);

mcpServer.on('error', err => {
  logger.error('MCP server failed to start', err);
});

process.on('exit', () => mcpServer.kill());
```

The MCP server logs to the same console as the Backstage backend, prefixed with `[api-testing-mcp]`.

### Auto-registration in Claude Code

On startup, the MCP server runs the registration module (`registration.ts`):

1. Reads `.claude/settings.json` (or creates it if absent)
2. Checks if an `api-testing` MCP entry already exists
3. If not, appends the entry:

```json
{
  "mcpServers": {
    "api-testing": {
      "command": "node",
      "args": ["plugins/api-testing-mcp-server/src/index.ts"],
      "cwd": "<project-root>"
    }
  }
}
```

4. If already registered, does nothing (idempotent)

### Tool stubs

Phase 1 registers all 7 tools with their JSON Schema input definitions but returns placeholder responses. This lets us validate:

- The server starts and registers correctly
- Claude Code discovers the tools
- Tool schemas are valid and parse correctly

Example stub:

```typescript
server.tool(
  'list_test_cases',
  'List all test cases for a given API route group',
  {
    route_group: { type: 'string', description: 'e.g. /v1/rules' },
  },
  async ({ route_group }) => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            route_group,
            test_cases: [],
            message: 'stub — Phase 2 implements storage',
          }),
        },
      ],
    };
  },
);
```

## Steps

### 1.1 Scaffold the MCP server package

Create the package directory, `package.json` with dependencies (`@modelcontextprotocol/sdk`, `typescript`), and `tsconfig.json`. Wire it into the Yarn workspace.

### 1.2 Implement the MCP server entry point

Create `src/index.ts` and `src/server.ts`. The server instantiates the MCP SDK, registers tool stubs, and starts listening.

### 1.3 Implement auto-registration

Create `src/registration.ts`. On startup, check `.claude/settings.json` and add the MCP server entry if missing.

### 1.4 Wire into `yarn start`

Modify the Backstage backend startup to fork the MCP server process. Ensure the child process is killed when the parent exits.

### 1.5 Verify

- Run `yarn start`
- MCP server starts (visible in console output)
- `.claude/settings.json` contains the `api-testing` entry
- Open Claude Code in this workspace — the `api-testing` MCP tools are listed
- Call `list_test_cases` from Claude Code — returns the stub response

## What comes out of this phase

A running MCP server that Claude Code can talk to, with all tool interfaces defined but not yet functional. The foundation for everything that follows.

## Risks

| Risk                                                    | Impact                          | Mitigation                                                            |
| ------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk` API changes                 | Server won't start              | Pin SDK version, follow MCP changelog                                 |
| Child process forking issues on Windows                 | Dev environment incompatibility | Primary target is macOS/Linux; document Windows as untested           |
| `.claude/settings.json` permissions or format conflicts | Registration fails silently     | Read-check-write with error logging; fall back to manual instructions |
