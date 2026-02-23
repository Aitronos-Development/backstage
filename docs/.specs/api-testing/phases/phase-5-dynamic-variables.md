# Phase 5: Dynamic Variables

**Goal:** Headers, auth tokens, and base URLs are configurable through a layered system — app-config, browser local storage, and runtime overrides — with zero network latency.

**Depends on:** Phase 3

---

## What this phase delivers

- An `apiTesting` section in `app-config.yaml` for environment-level defaults
- A browser-side variable store using `localStorage` for personal overrides
- A runtime override panel in the UI for one-off values at execution time
- Variable interpolation in test case definitions using `{{variable_name}}` syntax
- A resolution pipeline: runtime > localStorage > app-config > defaults

## Technical design

### Variable resolution pipeline

When a test case is executed, every string value in `headers`, `body`, and `path` is scanned for `{{variable_name}}` placeholders. Each placeholder is resolved through the following layers, in order:

```
1. Runtime overrides  (set in the UI for this specific execution)
   ↓ falls through if not found
2. Local storage      (per-user, persisted in browser)
   ↓ falls through if not found
3. App config         (app-config.yaml → apiTesting.variables)
   ↓ falls through if not found
4. Error              (unresolved variable → test fails with clear message)
```

No network calls. No database lookups. All layers are local.

### Layer 1: App config

In `app-config.yaml`:

```yaml
apiTesting:
  defaultEnvironment: develop
  environments:
    develop:
      baseUrl: http://localhost:8000
      variables:
        auth_token: dev-token-placeholder
        org_id: dev-org-001
    staging:
      baseUrl: https://staging-api.example.com
      variables:
        auth_token: staging-token-placeholder
        org_id: staging-org-001
    production:
      baseUrl: https://api.example.com
      variables:
        auth_token: ''
        org_id: ''
```

The backend reads this via Backstage's `config` API (`config.getConfig('apiTesting')`). The selected environment determines which set of variables is active.

### Layer 2: Browser local storage

Stored under the key `backstage:api-testing:variables`:

```json
{
  "auth_token": "eyJhbGciOiJIUzI1NiIs...",
  "custom_header": "my-debug-value"
}
```

These override app-config values. Useful for personal auth tokens that shouldn't be committed to `app-config.yaml`.

The frontend provides a management UI (see below) for adding, editing, and removing local storage variables.

### Layer 3: Runtime overrides

Before clicking ▶ on a test case, a developer can open the "Variables" panel on that specific test and set one-off overrides. These values:

- Only apply to the current execution
- Are not persisted anywhere
- Take highest priority

### Variable interpolation engine

A shared utility used by both the backend (user executions) and the MCP server (agent executions):

```typescript
function resolveVariables(
  template: string | object,
  context: VariableContext,
): string | object;
```

- Recursively walks the object
- For every string value, replaces `{{variable_name}}` with the resolved value
- Supports nested references: `{{base_url}}/v1/rules` → `http://localhost:8000/v1/rules`
- Unresolved variables throw a descriptive error: `Variable '{{missing_var}}' not found in any layer`

**The MCP server uses the same engine** but only has access to the app-config layer (no browser localStorage, no UI runtime overrides). When running tests via MCP, the agent can pass variable overrides as a parameter to `run_test_cases`:

```json
{
  "route_group": "/v1/rules",
  "test_case_ids": ["tc-001"],
  "variable_overrides": {
    "auth_token": "agent-provided-token"
  }
}
```

### Frontend components

#### Environment switcher

A dropdown in the API Testing page header:

- Lists environments from `app-config.yaml` (`develop`, `staging`, `production`)
- Switching environments changes the active variable set
- Selected environment persisted in localStorage

#### Variable configuration modal

Opened via a **"Variables (N)"** button in the page header (next to the environment switcher). The button label shows the count of resolved variables.

The modal is a clean, minimal dialog (`maxWidth="sm"`, `borderRadius: 12`) with three sections:

**Header:**

- Title "Variables" with the active environment shown as an outlined chip (e.g. `develop`)
- Close (X) button on the right

**Variable list:**

- Each variable is a horizontal row: **key** (monospace, bold, fixed width) → **value** (filled gray background, rounded, monospace) → **source chip** → **action icons**
- Clicking a value opens inline editing using a borderless `InputBase` with save (check) / cancel (X) icons
- Source chips use subtle, theme-aware colors: `config` (blue), `local` (orange), `runtime` (green)
- Edit icon on every row to override a value into localStorage
- Delete icon only on `localStorage` variables (cannot delete app-config variables from the UI)
- Empty state: centered text prompting the user to add a variable or configure `app-config.yaml`

**"Add new variable" form:**

- Separated from the list by a divider with a section title
- Form layout: label on the left (`Name`, `Value`), filled `InputBase` on the right (gray background, rounded corners, monospace)
- "Add" button aligned to the right, `disableElevation`, contained primary style
- Enter key submits, Escape cancels

**Footer:**

- "Done" button to close the modal

Design principles:

- Uses `InputBase` instead of `TextField` — no outlined borders, clean filled backgrounds
- All inputs use monospace font for consistency with variable names/values
- Dark-mode aware: backgrounds use `rgba()` opacity layers instead of hard-coded palette colors
- No table elements — pure flex layout for precise spacing control

#### Runtime override inline

When a test case row is expanded, a **tune icon** (sliders) toggles a per-test-case variable override section. This section:

- Scans the test case definition for `{{variable_name}}` placeholders (in path, headers, and body)
- Shows each used variable as a row: `{{var_name}}` label → text input → resolved-value chip (shown when no override is set)
- Override values only apply to the next execution of that specific test case
- Overrides are held in component state (not persisted) and are merged on top of the global merged variables at execution time

## Steps

### 5.1 Define the `app-config.yaml` schema

Add `apiTesting` config schema. Document the shape and validation rules.

### 5.2 Implement the variable resolution engine

Create the shared `resolveVariables()` utility. Unit test with all permutations: single variable, nested, multiple layers, missing variables.

### 5.3 Wire into the backend execution endpoint

Before executing a test, resolve all `{{...}}` placeholders in headers, body, and path.

### 5.4 Wire into the MCP `run_test_cases` tool

Same resolution, but using app-config + `variable_overrides` parameter (no localStorage layer for agents).

### 5.5 Build the environment switcher

Dropdown in the page header. Reads from config, persists selection in localStorage.

### 5.6 Build the variable configuration modal

Modal dialog triggered by a "Variables (N)" header button. Flex-row variable list with inline editing via `InputBase`, source chips, and a form-style "Add new variable" section (label-left, filled-input-right layout). No table elements — pure flex layout.

### 5.7 Build runtime override inline

Tune icon per test case row toggles a section showing `{{...}}` placeholders extracted from the test definition, each with an inline override input. Overrides are per-execution, held in component state only.

### 5.8 Verify

- Set `base_url` in app-config → test uses it
- Override `auth_token` in localStorage → test uses the override, not app-config value
- Set a runtime override → test uses it for one run, then reverts to localStorage/app-config
- Switch environments → `base_url` and all environment-specific variables change
- Run a test with an unresolved `{{missing}}` variable → clear error message
- Run via MCP with `variable_overrides` → agent-provided values take effect

## What comes out of this phase

A fully functional, zero-latency variable system that supports team-level defaults, personal overrides, and one-off values — no database, no cloud, no network round-trips.

## Risks

| Risk                                                       | Impact                   | Mitigation                                                                       |
| ---------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| Circular variable references (`{{a}}` → `{{b}}` → `{{a}}`) | Infinite loop            | Detect cycles, limit recursion depth to 5, throw descriptive error               |
| Secrets in localStorage                                    | Security concern         | Document that localStorage is browser-local and clearable; never sync to backend |
| app-config changes require restart                         | Developer friction       | Backstage hot-reloads config on change in dev mode; document this                |
| Agent doesn't have access to user's localStorage variables | Tests may fail for agent | Agent must provide its own tokens via `variable_overrides`; document this        |
