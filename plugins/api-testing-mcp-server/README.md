# API Testing MCP Server

An MCP (Model Context Protocol) server that enables Claude Code to manage and run API test cases against the Backstage backend.

## How it works

This plugin runs as a standalone Node.js process that speaks the Model Context Protocol over stdio. Claude Code connects to it and gains access to 7 tools for managing API test cases.

## Setup

The MCP server is automatically registered in `.mcp.json` when you run `./start-dev.sh`. No manual setup is needed.

If you need to register it manually, add this to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "api-testing": {
      "command": "npx",
      "args": ["tsx", "plugins/api-testing-mcp-server/src/index.ts"],
      "cwd": "<project-root>"
    }
  }
}
```

Then restart Claude Code to pick up the new server.

## Tools

| Tool                    | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `list_test_cases`       | List all test cases for a route group                                       |
| `read_test_case`        | Read a single test case by ID                                               |
| `create_test_case`      | Create a new test case with headers, body, and assertions                   |
| `edit_test_case`        | Edit a test case field (supports replace, find-and-replace, and deep merge) |
| `delete_test_case`      | Delete a test case by ID                                                    |
| `run_test_cases`        | Execute test cases with optional variable overrides                         |
| `get_execution_history` | Get execution history for a test case or route group                        |

## Storage

Test cases are stored as JSON files in the `api-tests/` directory at the project root, organized by route group. For example, test cases for `/v1/rules` are stored in `api-tests/v1-rules.json`.

## Architecture

```
src/
├── index.ts          # Entry point — stdio transport
├── server.ts         # MCP server creation, tool registration
├── registration.ts   # Auto-registration in .mcp.json
├── tools/            # One file per MCP tool
│   ├── listTestCases.ts
│   ├── readTestCase.ts
│   ├── createTestCase.ts
│   ├── editTestCase.ts
│   ├── deleteTestCase.ts
│   ├── runTestCases.ts
│   └── getExecutionHistory.ts
└── storage/
    ├── index.ts      # Re-exports
    ├── types.ts      # TestCase, RouteGroupFile interfaces
    ├── fileStore.ts   # File-based CRUD with locking and caching
    └── watcher.ts    # File watcher for external changes
```
