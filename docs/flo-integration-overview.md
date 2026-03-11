# Ruflo Integration Plan — Better Test Cases Through Smarter Orchestration

> **Goal:** Integrate ruflo MCP into our existing multi-agent API testing pipeline to produce higher-quality test cases than our current system, while preserving everything that already works well.
>
> **Last Updated:** 2026-03-11

---

## Table of Contents

1. [What We Have Today — And Why It's Already Good](#1-what-we-have-today--and-why-its-already-good)
2. [Where Our Test Quality Falls Short](#2-where-our-test-quality-falls-short)
3. [How Ruflo Directly Addresses Each Gap](#3-how-ruflo-directly-addresses-each-gap)
4. [Integration Architecture — What Changes, What Stays](#4-integration-architecture--what-changes-what-stays)
5. [Phase-by-Phase Integration Plan](#5-phase-by-phase-integration-plan)
6. [Test Quality Improvements — Before vs After](#6-test-quality-improvements--before-vs-after)
7. [Agent Prompt Modifications](#7-agent-prompt-modifications)
8. [New Commands & Skills](#8-new-commands--skills)
9. [Memory Seeding Strategy](#9-memory-seeding-strategy)
10. [Measuring Success — Quality Metrics](#10-measuring-success--quality-metrics)
11. [Implementation Details](#11-implementation-details)

---

## 1. What We Have Today — And Why It's Already Good

Our current pipeline produces strong test cases. Here's what's working:

### Test Case Strengths

**Standalone JSON tests (222 for auth, 49 for spaces, 32 for icons):**
- Correct domain-specific patterns (`email_or_username` not `email`, `@aitronos.com` domain)
- Comprehensive endpoint coverage (13 endpoints for auth, 11 for spaces, 7 for icons)
- Validation layer understanding (WAF → Pydantic → DomainValidation → Business Logic ordering)
- Edge cases discovered through iteration (consecutive dots accepted, Google callback false 200, WAF false positives)

**Flow tests (Python/pytest — 22 files across 4 domains):**
- Multi-step stateful workflows with proper state passing (`FlowState`)
- Field-level response assertions (`assert_has_fields`, `assert_success`, `assert_error`)
- Resource cleanup (delete created resources after test)
- Structured step logging with HTTP call capture
- Auto-skip on unreachable server, destructive test guards for production
- Quality auditor rates flow tests as "significantly higher quality than JSON endpoint tests"

**Agent pipeline quality controls:**
- "Passed for the right reason" verification (auditor checks tests validate the intended layer)
- 7 verdict categories (PASSED, WEAK_PASS, WRONG_LAYER, SKIPPED, BUG, FLAKE, INVALID_TEST)
- Coverage gap analysis (category, endpoint, permission matrix, test depth)
- Source code bug hunting (auditor reads route handlers, not just test results)
- Pipeline assessment (grades each agent's performance A-F)
- Ship/No-Ship recommendation with risk assessment

### The Quality Bar We Must Maintain

Any integration must preserve:
1. The 6-phase pipeline: Scout → Architect → SDET → Runner → Triage → Auditor
2. The flow test framework (FlowState, conftest, helpers)
3. The bug-detector → bug-manager ticket pipeline
4. Agent memory and learned patterns (WAF behavior, auth quirks, runner limitations)
5. The auditor's rigorous quality standards (WEAK_PASS, WRONG_LAYER detection)

---

## 2. Where Our Test Quality Falls Short

Despite good fundamentals, the auditor's own memory files reveal systematic gaps:

### Gap 1: Shallow Assertions on Standalone Tests

The auditor consistently flags JSON endpoint tests as `[WEAK_PASS]`:

```
Current (from v1-auth.json):
{
  "assertions": {
    "status_code": 200,
    "body_contains": { "success": true },
    "body_schema": { "required_fields": ["success"] }
  }
}
```

**Problem:** Only checks `success: true`. Doesn't verify the response contains `access_token`, `refresh_token`, `token_type`, or `expires_in`. A broken token endpoint that returns `{"success": true}` with no token passes this test.

**Auditor quote:** *"A test that only checks `status_code == 200` without validating the response body is `[WEAK_PASS]`, not a real pass."*

### Gap 2: No Cross-Agent Knowledge Transfer

When testing `/v1/spaces`, the SDET builder doesn't know:
- That `email_or_username` (not `email`) is the correct login field (learned during `/v1/auth`)
- That WAF blocks plus-addressing on register (learned during `/v1/auth`)
- That the runner can't do multipart (learned during `/v1/icons`)
- That `Bearer` is case-sensitive (learned during `/v1/auth`)

Each route group starts from scratch. The orchestrator passes context manually, but can miss patterns.

### Gap 3: SDET Builder Off-By Errors

The auditor's memory documents recurring SDET bugs:

- *"Off-by-one in boundary test data: SDET miscounts chars when constructing long strings (e.g., 73 chars labeled as 72)"*
- *"Off-by-MANY in boundary data: SDET generated 4644 chars instead of 5001 for `/v1/model` instructions test"*
- *"Always verify boundary values with `python3 -c \"print(len('...'))\"`"*

These are mechanical errors that burn triage cycles.

### Gap 4: Low Plan-to-Implementation Ratio

The auditor reports: *"JSON tests achieve 49% plan coverage (41/83 scenarios), execution coverage only 13%"*

The Architect plans 83 scenarios, but the SDET only builds 41. Half the planned test surface goes unimplemented.

### Gap 5: Missing Permission Matrix Coverage

The auditor's template includes a permission matrix (Owner × Editor × Viewer × Non-member × Unauthed × Cross-org), but the actual tests rarely fill it:

- `/v1/spaces`: No tests for `access_users`, `editable_by_users`, `visible_to_roles`
- `/v1/icons`: No multi-role coverage
- `/v1/model`: No cross-org tests

### Gap 6: Tests Don't Verify Side Effects

The auditor notes: *"A test that creates a resource and asserts 201 but never checks that the resource actually exists (via GET) is incomplete"* and *"Common flow test weakness: asserting API accepted a mutation (200) but not verifying the mutation took effect"*

Standalone JSON tests by design can't do multi-step verification. Many pass with 201 but never confirm the resource was actually created.

### Gap 7: No Test Prioritization by Risk

All tests run in file order. A critical security test sits next to a trivial edge case with no distinction. When the runner times out or the pipeline is interrupted, low-risk tests may have run while high-risk ones haven't.

### Gap 8: Duplicate Pattern Discovery Across Route Groups

When testing `/v1/model` after `/v1/auth`:
- Scout rediscovers the auth flow from scratch
- Architect re-designs login-first test patterns
- SDET re-implements token acquisition
- Triage re-learns that `email_or_username` is the correct field

This wastes ~30% of pipeline time on already-solved problems.

### Gap 9: No Mutation Testing

The auditor checks for `[WEAK_PASS]` manually, but there's no systematic way to verify assertions are strong. A test that asserts `status_code: 422` but doesn't check the error message would still pass if the API returned 422 for a completely different reason.

### Gap 10: No Automated Regression Suite From Found Bugs

When the auditor finds a PRODUCT_BUG (e.g., "500 on function tool calling"), the bug gets filed in bug-manager, but no regression test is automatically created. If the bug is fixed later, we'd have to manually write a test for it.

---

## 3. How Ruflo Directly Addresses Each Gap

### Gap → Ruflo Solution Mapping

| # | Gap | Ruflo Feature | How It Works | Expected Impact |
|---|-----|---------------|-------------|-----------------|
| 1 | Shallow assertions | **Shared memory + SDET enhancement** | Before SDET builds tests, query ruflo memory for the API's response schema. SDET generates assertions for ALL response fields, not just `success`. | WEAK_PASS rate drops from ~30% to <5% |
| 2 | No cross-agent knowledge | **RuVector shared memory** | All agent discoveries stored in vector memory. SDET queries "auth patterns for Freddy" before building any route group's tests. | Eliminates redundant pattern discovery |
| 3 | SDET boundary errors | **Agent Booster rules + memory** | Store boundary validation rules in memory: "always verify string lengths with python3". Booster auto-validates boundary values before test creation. | Zero off-by errors after initial learning |
| 4 | Low plan coverage | **Swarm parallel SDET** | Spawn multiple SDET instances to implement different portions of the plan simultaneously. | Plan coverage rises from 49% to 85%+ |
| 5 | Missing permission matrix | **AQE coverage analysis** | `aqe/analyze-coverage` generates a permission matrix gap report. SDET fills gaps explicitly. | Full matrix coverage per route group |
| 6 | No side-effect verification | **Memory-driven flow promotion** | Memory stores which endpoints create resources. SDET auto-classifies create→verify pairs as flow tests. | All mutations get side-effect verification |
| 7 | No risk prioritization | **AQE test prioritization** | `aqe/test-prioritize` orders tests by failure history, code change proximity, and severity. Runner executes in risk order. | Critical tests run first; fast failure on regressions |
| 8 | Duplicate discovery | **Vector memory retrieval** | Before Scout phase, query memory for prior reconnaissance on related routes. Scout skips already-mapped endpoints. | ~30% time savings per additional route group |
| 9 | No mutation testing | **AQE mutation testing** | `aqe/mutation-test` mutates assertions (change expected status, remove body checks) and verifies tests fail. Surviving mutations = weak assertions. | Mutation score target: >80% |
| 10 | No auto-regression | **Memory-driven regression** | When bug-detector creates a ticket, ruflo stores the failure pattern. Next SDET run queries for "unfixed bugs" and generates regression tests. | Every PRODUCT_BUG gets a regression test |

---

## 4. Integration Architecture — What Changes, What Stays

### What Stays Unchanged

| Component | Status | Reason |
|---|---|---|
| `.claude/agents/*.md` (all 6 agent definitions) | **Unchanged** | Ruflo enhances, doesn't replace. Agents get new instructions to query/store ruflo memory, but their core roles remain. |
| `plugins/api-testing-mcp-server/` | **Unchanged** | Test CRUD and execution stays exactly as is. |
| `plugins/bug-detector-mcp-server/` | **Unchanged** | Ticket pipeline stays as is. Ruflo only triggers it. |
| `plugins/bug-manager/` + backend | **Unchanged** | Our ticket system. No GitHub Issues. |
| `test-suites/*.json` format | **Unchanged** | Same JSON schema for test cases. |
| `flows/` Python framework | **Unchanged** | FlowState, conftest, helpers all preserved. |
| `scripts/run-tests.ts` | **Unchanged** | TypeScript runner stays as is (with known limitations). |
| `/run-test-orchestration` command | **Unchanged** | Existing command works exactly as before. |

### What Changes

| Component | Change | Why |
|---|---|---|
| `.claude/settings.json` | Add ruflo MCP server config | Enable ruflo tools |
| `.claude/settings.local.json` | Add `mcp__ruflo__*` permissions | Allow ruflo tool calls |
| `.claude/agents/omni-test-orchestrator.md` | Add memory query/store steps to each phase | Enable cross-session learning |
| `.claude/agents/quality-auditor.md` | Add mutation testing and coverage analysis steps | Deeper quality verification |
| `.claude/commands/swarm-test.md` | **New file** | Parallel multi-route testing command |
| `.claude/skills/swarm-test/SKILL.md` | **New file** | Skill definition for swarm testing |

### Architecture Diagram

```
BEFORE:                                    AFTER:

User                                       User
  |                                          |
  v                                          v
Orchestrator (sequential)                  Orchestrator (ruflo-enhanced)
  |                                          |
  ├→ Scout ──────→ MANIFEST                  ├→ ruflo.memory_search("prior recon")
  ├→ Architect ──→ PLAN                      ├→ Scout ──────→ MANIFEST
  ├→ SDET ───────→ Tests                     │    └→ ruflo.memory_store(MANIFEST)
  ├→ Runner ─────→ Results                   ├→ Architect ──→ PLAN + coverage matrix
  ├→ Triage ─────→ Fixes                     │    └→ ruflo.memory_store(PLAN)
  └→ Auditor ────→ Report                    ├→ SDET (memory-informed) ──→ Tests
                                             │    ├→ ruflo.memory_search("patterns")
  Problems:                                  │    ├→ Deep assertions from schema
  - Sequential only                          │    └→ Permission matrix filled
  - No memory between runs                   ├→ Runner (risk-ordered) ──→ Results
  - Shallow assertions                       ├→ Triage (booster for known fixes)
  - 49% plan coverage                        │    └→ ruflo.memory_store(fixes)
  - No mutation testing                      ├→ Auditor ──→ Report
                                             │    ├→ aqe/mutation-test
                                             │    ├→ aqe/analyze-coverage
                                             │    └→ ruflo.memory_store(findings)
                                             └→ bug-detector → bug-manager (auto)
                                                  └→ ruflo.memory_store(bugs)
```

---

## 5. Phase-by-Phase Integration Plan

### Phase 1: MCP Server Setup (Day 1)

**Goal:** Get ruflo running alongside existing MCP servers.

**Changes to `.claude/settings.json`:**
```json
{
  "mcpServers": {
    "ruflo": {
      "command": "npx",
      "args": ["ruflo@v3alpha", "mcp", "start"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "CLAUDE_FLOW_LOG_LEVEL": "info",
        "CLAUDE_FLOW_TOOL_MODE": "develop"
      }
    }
  }
}
```

**Changes to `.claude/settings.local.json`:**
```json
{
  "permissions": {
    "allow": [
      "mcp__ruflo__*"
    ]
  }
}
```

**Verification:**
1. Restart Claude Code
2. Confirm `mcp__ruflo__memory_store` and `mcp__ruflo__memory_search` appear in available tools
3. Test: store a value, retrieve it, confirm semantic search works

**Rollback:** Remove the `mcpServers.ruflo` block and restart. Zero impact on existing pipeline.

---

### Phase 2: Memory Seeding (Days 1-2)

**Goal:** Populate ruflo's vector memory with everything our agents have already learned, so the first ruflo-enhanced run starts with full knowledge.

**Source material (seed these into ruflo memory):**

| Memory File | Key Patterns to Seed |
|---|---|
| `agent-memory/omni-test-orchestrator/MEMORY.md` | Login field names, WAF behavior, route group test counts, operational notes |
| `agent-memory/quality-auditor/MEMORY.md` | Domain validation chain, staging issues, runner limitations, source code bugs, response format notes |
| `agent-memory/test-triage-repair/MEMORY.md` | Runner multipart bug, `{{api_key}}` unsupported, boundary value verification, flow test response format |
| `agent-memory/strategic-test-architect/MEMORY.md` | Test strategy patterns |
| `agent-memory/execution-runner/MEMORY.md` | Environment setup patterns |
| `agent-memory/quality-auditor/waf-patterns.md` | WAF blocking rules (detailed) |

**Seeding approach:**

Each memory entry gets stored with:
- `category`: "auth-pattern", "waf-behavior", "runner-limitation", "api-behavior", "source-code-bug", "test-anti-pattern"
- `route_group`: which route group it applies to (or "global")
- `confidence`: how reliable the pattern is (0.0-1.0)
- `source_agent`: which agent discovered it

**Example seed entries:**

```
Entry 1:
  category: "auth-pattern"
  route_group: "global"
  content: "Login field name is 'email_or_username', NOT 'email'. Using 'email' causes 422."
  confidence: 0.99
  source_agent: "omni-test-orchestrator"

Entry 2:
  category: "runner-limitation"
  route_group: "global"
  content: "TypeScript runner (run-tests.ts line 262) always JSON.stringify(body). Cannot do multipart uploads. Upload tests expecting 201 MUST be flow tests (Python httpx)."
  confidence: 1.0
  source_agent: "test-triage-repair"

Entry 3:
  category: "source-code-bug"
  route_group: "/v1/icons"
  content: "SVG <style> tags not sanitized. icon_validation.py sanitize_svg() omits <style>. CSS XSS possible."
  confidence: 0.95
  source_agent: "quality-auditor"

Entry 4:
  category: "api-behavior"
  route_group: "/v1/auth"
  content: "Register endpoint validation chain: 1) Pydantic schema, 2) DomainValidationService (403), 3) PasswordValidator, 4) Duplicate checks (409). Tests must target the correct layer."
  confidence: 0.98
  source_agent: "quality-auditor"

Entry 5:
  category: "test-anti-pattern"
  route_group: "global"
  content: "SDET miscounts string lengths for boundary tests. Always verify with python3 -c 'print(len(...))'. Off-by-one and off-by-many errors are common."
  confidence: 1.0
  source_agent: "quality-auditor"
```

**Total estimated entries:** ~50-70 from existing memory files.

**Verification:** Query `ruflo.memory_search("WAF blocking patterns for register")` and confirm it returns the WAF behavior entries.

---

### Phase 3: SDET Builder Enhancement — Deep Assertions (Days 2-3)

**Goal:** SDET generates tests with full response body assertions, not just status codes.

**How it works:**

Before the SDET builds tests for any endpoint, it now:

1. **Queries ruflo memory** for the endpoint's response schema:
   ```
   ruflo.memory_search("response schema for POST /v1/auth/login")
   ```

2. **Reads the OpenAPI spec** (existing behavior, but now mandatory)

3. **Generates assertions that validate ALL response fields:**

```json
// BEFORE (current):
{
  "assertions": {
    "status_code": 200,
    "body_contains": { "success": true }
  }
}

// AFTER (ruflo-enhanced):
{
  "assertions": {
    "status_code": 200,
    "body_contains": {
      "success": true
    },
    "body_schema": {
      "required_fields": ["success", "access_token", "refresh_token", "token_type"]
    }
  }
}
```

4. **For error responses, asserts error structure:**

```json
// BEFORE:
{
  "assertions": {
    "status_code": 422
  }
}

// AFTER:
{
  "assertions": {
    "status_code": 422,
    "body_contains": {
      "success": false
    },
    "body_schema": {
      "required_fields": ["success", "error"]
    }
  }
}
```

5. **Stores the response schema in ruflo memory** for future route groups that hit the same patterns.

**Modification to SDET agent prompt** (append to existing instructions):

```markdown
### Memory-Informed Test Generation (NEW)

Before building tests for any endpoint:

1. Query shared memory for known patterns:
   - `ruflo.memory_search("response schema for {endpoint}")`
   - `ruflo.memory_search("validation patterns for {route_group}")`
   - `ruflo.memory_search("known bugs for {route_group}")`

2. Generate assertions that verify ALL response fields, not just status codes:
   - Every 2xx test must assert required response body fields
   - Every 4xx test must assert error response structure
   - Every test that creates a resource should include the resource ID field in assertions

3. After building tests, store discoveries:
   - New response schemas discovered
   - New validation patterns found
   - New boundary values confirmed

4. Verify boundary values: Run `python3 -c "print(len('...'))"` for any
   string-length boundary test. Off-by-one errors are common.
```

**Expected impact:** WEAK_PASS rate drops from ~30% to <5%.

---

### Phase 4: Cross-Agent Memory Integration (Days 3-4)

**Goal:** Every agent queries ruflo memory before starting work, and stores discoveries when done.

**Phase additions to each agent:**

| Agent | Before Work (Query) | After Work (Store) |
|---|---|---|
| **Scout** | "Prior reconnaissance for {route_group}" — skip already-mapped endpoints | Store API_MANIFEST, endpoint inventory, source code locations |
| **Architect** | "Test patterns for similar route groups" — reuse proven patterns | Store TEST_PLAN, category coverage decisions, flow vs standalone classification |
| **SDET** | "Response schemas, validation patterns, known bugs, boundary rules" — build informed tests | Store new response schemas, assertion patterns, boundary values verified |
| **Runner** | "Known environment issues, auth patterns" — pre-configure correctly | Store execution timing, environment notes, failure patterns |
| **Triage** | "Known fix patterns for this failure type" — apply learned fixes instantly | Store fix patterns: "expected 422 got 401 on login → change expected to 401" |
| **Auditor** | "Prior audit findings for this route group" — track improvements over time | Store bugs found, coverage gaps, quality scores, anti-patterns |

**Orchestrator prompt modification** (add to each phase):

```markdown
### Phase 1 Update: Reconnaissance
Before launching Scout:
- Query `ruflo.memory_search("API manifest for {route_group}")`
- If prior manifest exists with >0.9 confidence, pass it to Scout as baseline
- Scout only needs to verify/update, not rediscover from scratch

### Phase 2 Update: Strategy
Before launching Architect:
- Query `ruflo.memory_search("test plan patterns for {domain}")` where domain
  is the functional area (auth, spaces, model, etc.)
- Pass prior patterns as context: "These patterns worked well for /v1/auth,
  consider them for /v1/spaces"

### Phase 3 Update: Construction
Before launching SDET:
- Query `ruflo.memory_search("response schemas for {route_group}")`
- Query `ruflo.memory_search("known bugs for {route_group}")`
- Query `ruflo.memory_search("test anti-patterns global")`
- Pass all results as context to SDET

### Phase 5 Update: Verdict
After Auditor completes:
- Store coverage score, quality grade, and gaps in ruflo memory
- If PRODUCT_BUGs found, store failure patterns for regression test generation
- If WEAK_PASS tests found, store which assertions need strengthening
```

**Expected impact:** Second and subsequent route groups test ~30% faster. Cross-route patterns (auth, WAF, error formats) are automatically applied.

---

### Phase 5: Coverage Gap Auto-Fill (Days 4-5)

**Goal:** Auditor identifies gaps, SDET automatically fills them in a correction loop.

**Current behavior:** Auditor produces a coverage gap table but the orchestrator doesn't always act on it.

**Enhanced behavior:**

```
Auditor reports:
┌────────────────────────────────────────────────┐
│ Coverage Gap Analysis for /v1/spaces           │
│                                                │
│ MISSING CATEGORIES:                            │
│ - Concurrency/race conditions: 0 tests         │
│ - Permission matrix: 12/30 cells covered (40%) │
│ - Business logic abuse: 0 tests                │
│                                                │
│ MISSING PERMISSION MATRIX CELLS:               │
│ - Create × Viewer: NOT TESTED                  │
│ - Update × Non-member: NOT TESTED              │
│ - Delete × Cross-org: NOT TESTED               │
│ ... (15 more)                                  │
│                                                │
│ WEAK ASSERTIONS:                               │
│ - tc-73i8co: status-code only on create        │
│ - tc-sa0by9: claims limit=1 but doesn't verify │
└────────────────────────────────────────────────┘
```

**Orchestrator auto-fills:**

1. Stores gap report in ruflo memory
2. Launches SDET with explicit instructions:
   - "Generate tests for these specific gaps: [list]"
   - "Strengthen assertions for these test IDs: [list]"
   - "Create permission matrix tests for: [cells]"
3. Runner executes new tests
4. Auditor re-evaluates coverage
5. Repeat until coverage target met or max 2 cycles

**Expected impact:** Plan coverage rises from 49% to 85%+. Permission matrix coverage from 40% to 80%+.

---

### Phase 6: Mutation Testing Integration (Days 5-6)

**Goal:** Verify that passing tests actually catch bugs (not just happen to pass).

**How it works:**

After the auditor classifies all tests, ruflo runs mutation testing on passing tests:

```
For each PASSED test:
  Mutation 1: Change expected status_code (200 → 201)
    → Does the test fail? YES = assertion is real. NO = WEAK.

  Mutation 2: Remove body_contains assertion
    → Does the test still pass? YES = assertion was cosmetic. NO = good.

  Mutation 3: Change endpoint path (/login → /logout)
    → Does the test fail? YES = test is specific. NO = test is too generic.

  Mutation 4: Remove auth header
    → Does the test fail? YES = auth is verified. NO = auth check missing.
```

**Implementation in auditor prompt:**

```markdown
### Step 4b: Mutation Testing (NEW — after "Passed for the Right Reason")

For every [PASSED] test, perform these mutations mentally:
1. If I changed the expected status code by +/- 1, would the test fail?
2. If I removed the body_contains assertion, would the test still pass?
3. If I removed the auth header, would the test detect the missing auth?
4. If the API returned the right status code but wrong body, would the test catch it?

Calculate a mutation score: (mutations killed) / (total mutations attempted)
- Score > 80%: Assertions are strong
- Score 50-80%: Assertions need strengthening — list specific weaknesses
- Score < 50%: Tests are superficial — flag for SDET rebuild

Store mutation scores in ruflo memory per test and per route group.
```

**Expected impact:** Identifies ~20-30% of currently-passing tests as mutation-weak. These get strengthened in the next SDET cycle.

---

### Phase 7: Risk-Based Test Prioritization (Day 6)

**Goal:** Run highest-risk tests first so critical failures surface immediately.

**Implementation:**

Before the Runner executes, it queries ruflo memory for risk signals:

```
ruflo.memory_search("failure history for {route_group}")
ruflo.memory_search("source code bugs for {route_group}")
ruflo.memory_search("mutation-weak tests for {route_group}")
```

Tests are then ordered by:
1. **Known bug proximity** — tests that target known PRODUCT_BUGs run first
2. **Prior failure rate** — tests that failed in previous runs
3. **Mutation weakness** — tests with low mutation scores (likely to miss regressions)
4. **Security sensitivity** — auth, injection, IDOR tests before CRUD happy paths
5. **Assertion depth** — deep-assertion tests before shallow ones

**Expected impact:** When pipeline is interrupted or times out, the most valuable tests have already run.

---

### Phase 8: Parallel Multi-Route Testing (Days 7-8)

**Goal:** Test multiple route groups simultaneously.

**New command: `/swarm-test`**

```markdown
# /swarm-test command

Usage: /swarm-test auth,spaces,icons

Launches ruflo swarm with star topology:
1. ruflo.swarm_init(topology="star")
2. For each route_group:
   - ruflo.agent_spawn(role="test-pipeline", target=route_group)
   - Pipeline runs: Scout → Architect → SDET → Runner → Triage
3. All pipelines run in parallel
4. Results merged when all complete
5. Single unified Auditor pass across all results
6. bug-detector triggered for all failures
```

**Implementation:**

Create `.claude/commands/swarm-test.md`:

```markdown
# Parallel Multi-Route Testing: {{route_groups}}

> Ruflo-powered parallel execution of multiple route group test pipelines.

## Setup
1. Parse comma-separated route groups from {{route_groups}}
2. Initialize ruflo swarm: `mcp__ruflo__swarm_init(topology="star")`
3. Query shared memory for cross-route patterns

## Execution
For each route group (IN PARALLEL via ruflo swarm):
1. Launch Scout sub-agent (with memory pre-fill)
2. Launch Architect sub-agent (with memory-informed patterns)
3. Launch SDET sub-agent (with deep assertions + memory)
4. Launch Runner sub-agent (risk-ordered execution)
5. Launch Triage sub-agent (booster for known fixes)

## Merge & Audit
1. Collect all results when all pipelines complete
2. Launch single Quality Auditor across unified results
3. Trigger bug-detector for all PRODUCT_BUGs
4. Store all learnings in ruflo memory

## Progress
Print unified dashboard showing all pipelines.
```

**Expected impact:** 3 route groups in ~15 min parallel vs ~37 min sequential.

---

### Phase 9: Auto-Regression From Bugs (Days 8-9)

**Goal:** Every PRODUCT_BUG discovered automatically generates a regression test.

**Flow:**

```
Auditor finds PRODUCT_BUG:
  "500 on function tool calling (tc-r17opr)"
    │
    v
Bug-detector creates ticket in bug-manager:
  BUG-0042: "[500] /v1/model tool calling crashes in OpenAI provider"
    │
    v
Ruflo stores regression pattern:
  ruflo.memory_store({
    category: "regression-target",
    route_group: "/v1/model",
    endpoint: "POST /v1/model/responses",
    bug_ticket: "BUG-0042",
    failure: "500 on any function tool request",
    expected: "200 with tool call response",
    status: "unfixed"
  })
    │
    v
Next SDET run for /v1/model:
  ruflo.memory_search("regression-target for /v1/model")
  → Returns BUG-0042 pattern
  → SDET generates dedicated regression test:
    {
      "name": "REGRESSION BUG-0042: Function tool calling should not 500",
      "method": "POST",
      "path": "/v1/model/responses",
      "body": { ... minimal tool calling payload ... },
      "assertions": {
        "status_code_not": 500,
        "body_schema": { "required_fields": ["id", "choices"] }
      }
    }
```

**Expected impact:** Every discovered bug gets a permanent regression test. Bug fixes are automatically verified in subsequent runs.

---

## 6. Test Quality Improvements — Before vs After

### Standalone JSON Test (Login Endpoint)

**BEFORE:**
```json
{
  "id": "tc-djqahv",
  "name": "Login - Valid credentials (happy path)",
  "method": "POST",
  "path": "/v1/auth/login",
  "headers": { "Content-Type": "application/json" },
  "body": {
    "email_or_username": "developers@aitronos.com",
    "password": "securePassword123!"
  },
  "assertions": {
    "status_code": 200,
    "body_contains": { "success": true },
    "body_schema": { "required_fields": ["success"] }
  }
}
```

**AFTER (ruflo-enhanced):**
```json
{
  "id": "tc-djqahv",
  "name": "Login - Valid credentials returns tokens and user data",
  "method": "POST",
  "path": "/v1/auth/login",
  "headers": { "Content-Type": "application/json" },
  "body": {
    "email_or_username": "developers@aitronos.com",
    "password": "securePassword123!"
  },
  "assertions": {
    "status_code": 200,
    "body_contains": { "success": true },
    "body_schema": {
      "required_fields": [
        "success",
        "access_token",
        "refresh_token",
        "token_type"
      ]
    }
  }
}
```

**Improvement:** Verifies the response actually contains authentication tokens, not just `success: true`.

### Error Response Test

**BEFORE:**
```json
{
  "name": "Login - Missing password field",
  "assertions": { "status_code": 401 }
}
```

**AFTER:**
```json
{
  "name": "Login - Missing password returns structured error",
  "assertions": {
    "status_code": 401,
    "body_contains": { "success": false },
    "body_schema": {
      "required_fields": ["success", "error"]
    }
  }
}
```

**Improvement:** Verifies error response has proper structure, not just the status code.

### Permission Matrix Test (New — didn't exist before)

```json
{
  "id": "tc-pm01",
  "name": "Spaces - Viewer cannot update space (403)",
  "method": "PATCH",
  "path": "/v1/spaces/{{space_id}}",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{viewer_token}}"
  },
  "body": { "name": "Renamed by viewer" },
  "assertions": {
    "status_code": 403,
    "body_contains": { "success": false }
  }
}
```

**Improvement:** Permission matrix cell that was previously untested now has explicit coverage.

### Regression Test (New — auto-generated from bug)

```json
{
  "id": "tc-reg042",
  "name": "REGRESSION BUG-0042: Tool calling must not return 500",
  "method": "POST",
  "path": "/v1/model/responses",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{auth_token}}"
  },
  "body": {
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "test"}],
    "tools": [{"type": "function", "function": {"name": "test_fn", "parameters": {"type": "object"}}}]
  },
  "assertions": {
    "status_code": 200,
    "body_schema": {
      "required_fields": ["id"]
    }
  }
}
```

**Improvement:** Bug discovered in a previous run now has a permanent regression test. When the bug is fixed, this test auto-confirms it.

---

## 7. Agent Prompt Modifications

### Summary of Changes Per Agent

| Agent | Change Type | Description |
|---|---|---|
| **Orchestrator** | Append | Add memory query/store steps to each phase description |
| **Scout** | Append | Query memory for prior recon before scanning |
| **Architect** | Append | Query memory for proven patterns; store new patterns |
| **SDET** | Append | Query memory for schemas, bugs, anti-patterns; generate deep assertions; verify boundary values |
| **Runner** | Append | Query memory for risk ordering; execute in risk-priority order |
| **Triage** | Append | Query memory for known fix patterns; store new fixes |
| **Auditor** | Append | Add mutation testing step; store quality scores; trigger coverage gap fill |

All changes are **append-only** — no existing instructions are removed or modified. The agents gain capabilities without losing any current behavior.

---

## 8. New Commands & Skills

### `/swarm-test` Command

**Purpose:** Parallel multi-route testing powered by ruflo swarm.

**Usage:** `/swarm-test auth,spaces,icons`

**Behavior:** Launches parallel pipelines per route group, merges results, single audit pass.

### `/seed-memory` Command (One-Time)

**Purpose:** Seed ruflo vector memory from existing agent-memory MEMORY.md files.

**Usage:** `/seed-memory`

**Behavior:** Reads all `.claude/agent-memory/*/MEMORY.md` files, parses patterns, stores in ruflo memory with appropriate categories and confidence scores.

### `/memory-report` Command

**Purpose:** Show what's stored in ruflo memory.

**Usage:** `/memory-report` or `/memory-report /v1/auth`

**Behavior:** Queries ruflo memory and displays categorized summary of stored patterns, bugs, schemas, and fix patterns.

---

## 9. Memory Seeding Strategy

### Categories

| Category | Description | Example |
|---|---|---|
| `api-behavior` | How the API actually behaves | "Login field is email_or_username" |
| `auth-pattern` | Authentication/authorization patterns | "Bearer prefix is case-sensitive" |
| `waf-behavior` | WAF blocking rules | "Plus-addressing emails blocked with 403" |
| `validation-chain` | Validation order for endpoints | "Pydantic → Domain → Password → Duplicate" |
| `response-schema` | Response body structure | "Login returns success, access_token, refresh_token" |
| `runner-limitation` | Test runner constraints | "No multipart, no {{api_key}}, no array status_code" |
| `source-code-bug` | Bugs found in API source code | "SVG style tags not sanitized" |
| `test-anti-pattern` | Known test authoring mistakes | "SDET miscounts boundary string lengths" |
| `fix-pattern` | Triage repair patterns | "expected 422 got 401 on login → change to 401" |
| `regression-target` | Bugs that need regression tests | "BUG-0042: tool calling 500" |
| `coverage-gap` | Known untested areas | "Spaces: no tests for access_users field" |
| `quality-score` | Historical quality metrics | "/v1/auth: mutation score 72%, coverage 85%" |

### Confidence Levels

| Level | Meaning | When to Use |
|---|---|---|
| **0.95-1.0** | Confirmed across multiple runs | Runner limitations, validated API behavior |
| **0.85-0.94** | Confirmed once, likely stable | Source code bugs, response schemas |
| **0.70-0.84** | Observed but not yet confirmed | Suspected patterns, edge case behavior |
| **< 0.70** | Tentative / speculative | First-time observations, environment-dependent |

### Memory Lifecycle

1. **Seed:** Initial population from existing MEMORY.md files (Phase 2)
2. **Accumulate:** Agents store new discoveries after each run
3. **Consolidate:** Ruflo auto-promotes working memory → episodic → semantic
4. **Prune:** Patterns with confidence < 0.5 after 3+ runs get flagged for review
5. **Correct:** When triage finds a stored pattern is wrong, it updates with new evidence

---

## 10. Measuring Success — Quality Metrics

### Before Integration (Baseline — Current State)

| Metric | Current Value | Source |
|---|---|---|
| WEAK_PASS rate | ~30% | Auditor reports (status-code-only assertions) |
| Plan-to-implementation ratio | 49% | Auditor: "41/83 scenarios" |
| Permission matrix coverage | ~40% | Auditor gap analysis |
| Cross-route pattern reuse | 0% | No shared memory |
| Boundary value accuracy | ~85% | Off-by-one/many errors per run |
| Time per route group | ~12-15 min | Sequential pipeline |
| Mutation score | Unknown | No mutation testing |
| Regression test coverage | 0% | No auto-regression |
| Duplicate discovery waste | ~30% of time | Manual observation |

### After Integration (Targets)

| Metric | Target | How Measured |
|---|---|---|
| WEAK_PASS rate | <5% | Auditor report — count of [WEAK_PASS] / total |
| Plan-to-implementation ratio | >85% | Implemented test count / Architect planned count |
| Permission matrix coverage | >80% | Filled cells / total cells in matrix |
| Cross-route pattern reuse | >70% | Memory hits / memory queries per run |
| Boundary value accuracy | >99% | Zero off-by errors (triage reports) |
| Time per route group | ~12 min (same) or ~5 min (parallel) | Wall clock time |
| Mutation score | >80% | Mutations killed / mutations attempted |
| Regression test coverage | 100% of PRODUCT_BUGs | Regression tests / total bugs filed |
| Duplicate discovery waste | <5% | Memory-served patterns / total pattern queries |

### How to Track

After each pipeline run, the auditor stores quality metrics in ruflo memory:

```
ruflo.memory_store({
  category: "quality-score",
  route_group: "/v1/auth",
  timestamp: "2026-03-11",
  metrics: {
    total_tests: 222,
    passed: 210,
    weak_pass: 5,
    bug: 3,
    flake: 2,
    invalid: 2,
    plan_coverage: 0.87,
    permission_coverage: 0.83,
    mutation_score: 0.82,
    assertion_depth: "deep"
  }
})
```

Over time, query `ruflo.memory_search("quality-score for /v1/auth")` to see trends.

---

## 11. Implementation Details

### File Changes Summary

| File | Action | Lines Changed |
|---|---|---|
| `.claude/settings.json` | Edit | +10 (mcpServers block) |
| `.claude/settings.local.json` | Edit | +1 (permission) |
| `.claude/agents/omni-test-orchestrator.md` | Edit | +30 (memory steps per phase) |
| `.claude/agents/quality-auditor.md` | Edit | +20 (mutation testing step) |
| `.claude/commands/swarm-test.md` | **Create** | ~40 lines |
| `.claude/commands/seed-memory.md` | **Create** | ~20 lines |
| `.claude/commands/memory-report.md` | **Create** | ~15 lines |

**Total: 2 files edited, 3 files created. No files deleted. No test formats changed. No runner changes.**

### Dependency Requirements

- Node.js 20+ (already have)
- npm 9+ (already have)
- `ANTHROPIC_API_KEY` in environment (already have)
- ~45MB disk for ruflo package (via npx, cached after first run)

### Risk Mitigation

| Risk | Mitigation |
|---|---|
| Ruflo server fails to start | Existing pipeline works without ruflo. Just skip memory steps. |
| Memory returns wrong patterns | Confidence scores filter low-quality results. Agents verify before using. |
| Parallel execution produces conflicts | Each pipeline works on its own route group — no shared test files. |
| Token cost increase | Agent Booster reduces LLM calls for mechanical tasks. Monitor costs per run. |
| Ruflo breaks in future update | Pin version in args: `["ruflo@3.5.15", "mcp", "start"]`. Update manually. |

### Rollback Plan

1. Remove `mcpServers.ruflo` from settings.json
2. Remove `mcp__ruflo__*` from settings.local.json
3. Revert agent prompt additions (git checkout the appended sections)
4. Delete new command files
5. Restart Claude Code

**Total rollback time: <5 minutes. Zero data loss. Existing pipeline fully functional.**

---

## Summary

This integration adds a **memory and intelligence layer** on top of our already-good test pipeline. The key insight is:

> **Our agents already know how to generate good tests. They just don't remember what they learned, can't share knowledge, and don't verify their own assertions are strong enough.**

Ruflo fixes this with:
1. **Shared vector memory** — agents remember patterns across sessions and route groups
2. **Deep assertions** — SDET generates full response schema validation, not just status codes
3. **Mutation testing** — auditor verifies assertions actually catch bugs
4. **Coverage gap auto-fill** — auditor identifies gaps, SDET fills them in correction loops
5. **Risk-based ordering** — critical tests run first
6. **Auto-regression** — every discovered bug gets a permanent regression test
7. **Parallel execution** — test multiple route groups simultaneously

The result: **better test cases from the same agents**, because the agents start each run with everything they've ever learned.
