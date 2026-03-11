# Test History Storage Documentation

## Overview
Test execution history for the Freddy Backend API tests is stored in the `api-tests/.history/` directory within the Backstage repository.

## Directory Structure

```
api-tests/
└── .history/
    ├── v1-health/         # Route group directory
    │   ├── tc-2x96lk.jsonl  # Test case execution history
    │   ├── tc-43niwp.jsonl
    │   ├── tc-4x0ug6.jsonl
    │   └── tc-5wydod.jsonl
    └── v1-rules/          # Another route group
        ├── tc-xxxxx.jsonl
        └── ...
```

## Storage Format

### File Organization
- **Directory per route group**: Each API route group (e.g., `/v1/health`, `/v1/rules`) has its own directory
- **File per test case**: Each test case has its own JSONL (JSON Lines) file named `{test_case_id}.jsonl`
- **Append-only logs**: New executions are appended as new lines to preserve history

### JSONL File Format
Each line in a test case's JSONL file represents a single execution with the following structure:

```json
{
  "id": "exec-d427a549",
  "timestamp": "2026-02-20T10:21:43.990Z",
  "initiator": "user",
  "test_case_id": "tc-2x96lk",
  "test_case_name": "Health check has status field",
  "route_group": "/v1/health",
  "result": "pass" | "fail",
  "duration_ms": 4,
  "request": {
    "method": "GET",
    "url": "http://localhost:8000/api/...",
    "headers": { ... },
    "body": { ... }
  },
  "response": {
    "status_code": 200,
    "headers": { ... },
    "body": { ... }
  },
  "failure_reason": "Optional: reason for failure",
  "flow_step_log": {  // For flow tests only
    "steps": [
      {
        "name": "step_name",
        "status": "pass",
        "duration_ms": 100,
        "http_calls": []
      }
    ]
  }
}
```

## Key Features

### 1. Append-Only History
- Each execution is appended as a new line
- Full history preserved for trend analysis
- No data loss on concurrent writes

### 2. Route Group Organization
- Easy to find all tests for a specific API area
- Supports bulk operations per route group
- Clear separation of concerns

### 3. Test Case Isolation
- Each test case has independent history
- Easy to track specific test case performance
- Simplifies debugging of flaky tests

### 4. Flow Test Support
- Special `flow_step_log` field for multi-step tests
- Tracks individual step performance
- Preserves step-by-step execution details

## Usage Examples

### Reading Test History
```bash
# View all executions for a test case
cat api-tests/.history/v1-health/tc-2x96lk.jsonl | jq .

# Get last execution
tail -1 api-tests/.history/v1-health/tc-2x96lk.jsonl | jq .

# Count executions
wc -l api-tests/.history/v1-health/tc-2x96lk.jsonl
```

### Analyzing Results
```bash
# Count pass/fail ratio
cat api-tests/.history/v1-health/tc-2x96lk.jsonl | jq -r .result | sort | uniq -c

# Get average duration
cat api-tests/.history/v1-health/tc-2x96lk.jsonl | jq .duration_ms | awk '{sum+=$1} END {print sum/NR}'
```

## Integration Points

### MCP Server Integration
The MCP API Testing server reads from and writes to this history storage:
- `mcp__api-testing__run_test_cases`: Appends new executions
- `mcp__api-testing__get_execution_history`: Reads from JSONL files

### Backstage Dashboard
The Backstage API Testing dashboard displays this history:
- Shows recent executions per test case
- Calculates success rates over time
- Identifies flaky tests based on history

## Maintenance

### Rotation Policy
Consider implementing rotation for large history files:
- Archive old executions after N days
- Keep summary statistics in separate files
- Compress old JSONL files to save space

### Backup Strategy
- Include `.history/` in git for critical test history
- Or exclude from git and backup separately for large datasets
- Consider cloud storage for long-term retention