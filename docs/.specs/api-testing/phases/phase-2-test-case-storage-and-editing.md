# Phase 2: Test Case Storage & Editing Model

**Goal:** The MCP server can create, read, edit, and delete test cases stored as JSON files on disk, using a file-editing-style interface for surgical modifications.

**Depends on:** Phase 1

---

## What this phase delivers

- A file-based storage layer under `api-tests/` at the repository root
- Fully functional CRUD tools: `create_test_case`, `read_test_case`, `edit_test_case`, `delete_test_case`, `list_test_cases`
- The editing model — partial field modifications, merge, replace, and optimistic concurrency via `old_value`
- File watching that emits change events (consumed by the frontend in Phase 3)

## Technical design

### Test case file format

Each API route group gets one JSON file:

```
api-tests/
├── v1-health.json
├── v1-auth.json
├── v1-rules.json
├── v1-assistants.json
└── ...
```

Each file contains an array of test case objects:

```json
{
  "route_group": "/v1/rules",
  "test_cases": [
    {
      "id": "tc-001",
      "name": "Create rule with valid payload returns 201",
      "method": "POST",
      "path": "/v1/rules",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer {{auth_token}}"
      },
      "body": {
        "name": "test-rule",
        "description": "A test rule",
        "conditions": []
      },
      "assertions": {
        "status_code": 201,
        "body_contains": {
          "name": "test-rule"
        },
        "body_schema": {
          "required_fields": ["id", "name", "created_at"]
        }
      },
      "created_at": "2026-02-19T10:00:00Z",
      "updated_at": "2026-02-19T10:00:00Z"
    }
  ]
}
```

### Storage layer (`src/storage/`)

```
src/storage/
├── index.ts          # Public API: load, save, watch
├── fileStore.ts      # Read/write JSON files, atomic writes
└── watcher.ts        # fs.watch wrapper, emits change events
```

**Key behaviors:**

- **Atomic writes** — write to a `.tmp` file then rename, preventing partial reads
- **Lazy loading** — files are read on demand and cached in memory; cache invalidated on file change
- **ID generation** — `tc-` prefix + 6 char nanoid (e.g., `tc-a1b2c3`)

### Tool implementations

#### `list_test_cases(route_group)`

Returns all test cases for the route group. If the file doesn't exist, returns an empty array.

#### `read_test_case(route_group, test_case_id)`

Returns the full JSON of a single test case. Errors if not found.

#### `create_test_case(route_group, name, method, path, headers?, body?, assertions)`

Appends a new test case to the route group file. Generates an `id`, sets `created_at` and `updated_at`. Returns the created test case.

#### `edit_test_case(route_group, test_case_id, field, new_value, old_value?, replace_all?, merge?)`

The core editing tool, modeled after Claude Code's `Edit` tool:

**Field targeting:**

- `field` must be one of: `name`, `method`, `path`, `headers`, `body`, `assertions`
- The tool operates only on the specified field, leaving everything else untouched

**Replacement modes:**

| `merge` | `old_value` | Behavior                                                                                                       |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `false` | absent      | Replaces the entire field with `new_value`                                                                     |
| `false` | present     | Finds `old_value` within the field, replaces first occurrence (or all if `replace_all: true`) with `new_value` |
| `true`  | absent      | Deep-merges `new_value` into the existing field (field must be an object)                                      |
| `true`  | present     | Validates `old_value` matches current state, then deep-merges `new_value`                                      |

**Optimistic concurrency:**
When `old_value` is provided, the tool compares it against the current field value. If they don't match, the edit is rejected with an error message showing the actual current value — forcing the agent to re-read before retrying. This prevents stale overwrites.

**Example scenarios:**

1. **Change a single header:**

   ```json
   {
     "field": "headers",
     "old_value": { "Authorization": "Bearer old_token" },
     "new_value": { "Authorization": "Bearer new_token" },
     "merge": true
   }
   ```

   Result: Only `Authorization` header changes. All other headers preserved.

2. **Update expected status code:**

   ```json
   {
     "field": "assertions",
     "old_value": { "status_code": 200 },
     "new_value": { "status_code": 201 },
     "merge": true
   }
   ```

   Result: Only `status_code` changes. `body_contains` and `body_schema` preserved.

3. **Replace a string in the body:**
   ```json
   {
     "field": "body",
     "old_value": "old_rule",
     "new_value": "updated_rule",
     "replace_all": true
   }
   ```
   Result: All occurrences of `"old_rule"` in the body JSON are replaced with `"updated_rule"`.

#### `delete_test_case(route_group, test_case_id)`

Removes the test case from the file. Errors if not found.

### File watching

The storage layer uses `fs.watch` on the `api-tests/` directory. When any `.json` file changes:

1. Invalidate the in-memory cache for that route group
2. Emit a `test-cases-changed` event with the route group name
3. In Phase 3, the frontend subscribes to these events via WebSocket

## Steps

### 2.1 Create the storage layer

Implement `fileStore.ts` with atomic read/write and `watcher.ts` with file system watching. Unit test with temporary directories.

### 2.2 Implement `create_test_case` and `list_test_cases`

Replace Phase 1 stubs with real implementations. Test by creating test cases and listing them back.

### 2.3 Implement `read_test_case`

Return single test case by ID. Test with valid and invalid IDs.

### 2.4 Implement `edit_test_case`

The most complex tool. Implement all four replacement modes (replace whole field, find-replace, merge, merge with validation). Extensive unit tests for each mode.

### 2.5 Implement `delete_test_case`

Remove by ID. Test with valid and invalid IDs.

### 2.6 End-to-end verification

Use Claude Code to: create a test case → read it → edit one header → read again to confirm the edit → delete it. Confirm the JSON files on disk reflect every change.

## What comes out of this phase

A fully functional test case management system accessible through MCP tools. Agents can create and maintain test suites using the same read-then-edit workflow they use for source files.

## Risks

| Risk                                         | Impact                | Mitigation                                                                    |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| Concurrent writes from multiple agents       | File corruption       | Atomic writes + in-memory locking per route group file                        |
| Deep merge edge cases (arrays, nested nulls) | Unexpected edits      | Use a well-tested merge library (e.g., `deepmerge`); document merge semantics |
| `fs.watch` unreliable on some platforms      | UI doesn't update     | Fall back to polling with 1s interval; abstract behind the watcher interface  |
| Large test suites slow down file I/O         | Latency on read/write | Unlikely for test case files; add lazy loading if needed                      |
