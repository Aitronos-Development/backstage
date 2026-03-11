# Ruflo MCP Integration Overview for Backstage API Testing Platform

> **Document Purpose:** A comprehensive analysis of how the [ruflo](https://github.com/ruvnet/ruflo) MCP server can be integrated into this Backstage repository to enhance the existing multi-agent API testing platform.
>
> **Last Updated:** 2026-03-11

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What is Ruflo?](#2-what-is-ruflo)
3. [Our Current Architecture](#3-our-current-architecture)
4. [Ruflo's Full MCP Capabilities](#4-ruflos-full-mcp-capabilities)
5. [Integration Points — Where Ruflo Fits](#5-integration-points--where-ruflo-fits)
6. [Setup & Installation](#6-setup--installation)
7. [Configuration Deep Dive](#7-configuration-deep-dive)
8. [Use Case Scenarios](#8-use-case-scenarios)
9. [Architecture After Integration](#9-architecture-after-integration)
10. [Risks, Limitations & Considerations](#10-risks-limitations--considerations)
11. [Recommended Rollout Plan](#11-recommended-rollout-plan)
12. [Appendix A — Complete Tool Reference](#appendix-a--complete-tool-reference)
13. [Appendix B — Agent Type Catalog](#appendix-b--agent-type-catalog)

---

## 1. Executive Summary

Our Backstage repo currently runs a **custom multi-agent API testing pipeline** with 6 specialized Claude Code agents (orchestrator, execution-runner, quality-auditor, test-triage-repair, strategic-test-architect, omni-scan-scout) coordinated through markdown-based agent definitions and two custom MCP servers (`api-testing`, `bug-detector`).

**Ruflo** (v3.5.15, formerly Claude Flow) is an enterprise AI orchestration framework that exposes **175+ MCP tools** across three servers for swarm coordination, memory management, agent optimization, and — critically — an **Agentic QE (Quality Engineering) plugin** with 16 tools purpose-built for test generation, TDD, coverage analysis, security scanning, and chaos injection.

### Gap Analysis

| Current Gap | Ruflo Solution | Relevant Tools |
|---|---|---|
| No shared memory between agents across sessions | RuVector persistent vector memory with HNSW search | `memory_store`, `memory_search`, `agentdb_*` |
| Sequential agent execution (no true parallelism) | Swarm orchestration with 6 topologies | `swarm_init`, `task_orchestrate`, `agent_spawn` |
| No consensus when agents disagree on test classification | 5 consensus algorithms (Raft, BFT, Gossip, CRDT, Quorum) | `consensus_init`, `consensus_vote` |
| Manual agent coordination via orchestrator prompts | Automated task routing and agent spawning | `route/task`, `route/explain` |
| No performance optimization for repetitive tasks | Agent Booster (WASM) skips LLM calls for simple ops (<1ms) | Pre-edit hooks, model routing |
| No cross-session learning persistence | Neural training with EWC (prevents knowledge forgetting) | `neural_train`, `neural_patterns` |
| No automated test generation from specs | Agentic QE plugin for test generation and TDD | `aqe/generate-tests`, `aqe/tdd-cycle` |
| No security scanning of test payloads | Built-in security scanning and chaos injection | `aqe/security-scan`, `aqe/chaos-inject` |
| No automated coverage analysis | Coverage gap detection | `aqe/analyze-coverage` |
| No automated ticket creation after test runs | Ruflo orchestration triggers bug-detector → bug-manager pipeline | `task_orchestrate` → `mcp__bug-detector__create_bug_tickets` |

**Key decision:** Ruflo is not a replacement for our existing MCP servers or agent definitions — it's an **orchestration and intelligence layer on top** that adds coordination, memory, optimization, and QE capabilities our agents currently lack.

---

## 2. What is Ruflo?

Ruflo (also published as `claude-flow`) is a production-ready multi-agent AI orchestration framework.

### Key Facts

| Attribute | Value |
|---|---|
| **Package** | `ruflo@v3alpha` / `claude-flow@alpha` (npm) |
| **Version** | 3.5.15 |
| **License** | MIT |
| **Author** | RuvNet |
| **Requirements** | Node.js 20+, npm 9+ |
| **Dependencies** | 2 production deps (semver, zod); everything else optional |
| **Install size** | ~15MB minimal, ~45MB core, ~340MB with ML/embeddings |
| **MCP Tools** | 175+ across 3 servers |
| **Agent Types** | 60+ specialized |
| **Skills** | 42+ pre-built |
| **CLI Commands** | 26 commands, 140+ subcommands |

### Three MCP Servers

| Server | Package | Purpose | Tool Count | Status |
|---|---|---|---|---|
| **claude-flow** | `ruflo@v3alpha` | Core orchestration, agent management, memory, task routing | ~100 tools | Stable |
| **ruv-swarm** | `ruv-swarm` | Enhanced swarm coordination with WASM acceleration (2.8-4.4x speedup) | ~40 tools | Stable |
| **flow-nexus** | `flow-nexus@latest` | Cloud-based orchestration platform (requires auth) | ~70 tools | Alpha |

### Core Principle

> "Claude Flow coordinates, Claude Code creates."

The MCP server handles orchestration, memory, and routing. Claude Code handles actual file operations, code generation, and execution. This maps directly to our architecture where the orchestrator coordinates and sub-agents do the work.

---

## 3. Our Current Architecture

### 3.1 Agent Pipeline

```
User triggers /run-test-orchestration or /detect-bugs
        |
        v
┌─────────────────────────────────────────┐
│  Omni-Test Orchestrator (Chief)         │
│  .claude/agents/omni-test-orchestrator  │
│  Pure coordinator — NEVER does work     │
└──────────┬──────────────────────────────┘
           |
Phase 1    ├── Scout ──────────────→ API_MANIFEST
Phase 2    ├── Architect ──────────→ TEST_PLAN (flow vs standalone classification)
Phase 3    ├── SDET Builder ───────→ JSON tests + Python flow tests
Phase 4    ├── Execution Runner ───→ Test results + execution artifacts
Phase 5    ├── Triage-Repair Loop ─→ Fix TEST_BUGs (max 2 retries) / escalate PRODUCT_BUGs
Phase 6    └── Quality Auditor ────→ AUDIT_REPORT + QUALITY_CERTIFICATE
                                     (SHIP / CONDITIONAL_SHIP / NO-SHIP verdict)
```

**Critical design rule:** Phases execute sequentially. No parallel sub-agent work. Phase N+1 waits for Phase N completion.

### 3.2 Existing MCP Servers

**`api-testing` MCP Server** (`plugins/api-testing-mcp-server/src/`)

| Tool | Purpose | Primary Caller |
|---|---|---|
| `list_test_cases` | List all tests for a route group | All agents |
| `read_test_case` | Fetch a single test case | Auditor, Triage |
| `create_test_case` | Create new test case | SDET-Builder |
| `edit_test_case` | Edit existing test (supports deep merge) | Triage-Repair |
| `delete_test_case` | Remove a test case | Maintenance |
| `run_test_cases` | Execute tests (JSON via TypeScript, Flow via Python) | Execution-Runner |
| `get_execution_history` | Query per-test execution records | Auditor, Triage |
| `get_test_history` | Read JSONL history files | Bug-Detector |

**`bug-detector` MCP Server** (`plugins/bug-detector-mcp-server/src/`)

| Tool | Purpose |
|---|---|
| `read_error_logs` | Read error logs from test runs |
| `create_bug_tickets` | File discovered bugs in tracking system |
| `process_test_run` | Analyze test results; classify bugs vs flakes vs invalid tests |

### 3.3 Agent Memory System

Each agent has a persistent memory directory: `.claude/agent-memory/<agent-name>/MEMORY.md`

**What agents have learned (examples from memory files):**

| Agent | Key Learnings |
|---|---|
| **Orchestrator** | Login field is `email_or_username` not `email`; WAF blocks plus-addressing; register duplicate = 409; 222 auth tests, 49 spaces tests |
| **Quality-Auditor** | DomainValidationService rejects unregistered domains; dev-login disabled on staging; WAF patterns documented |
| **Triage-Repair** | Runner has no multipart support (line 262 JSON.stringify); no `{{api_key}}` variable; 500 on function tool calling is LangChain bug |
| **Strategic-Architect** | (Accumulates test strategy patterns) |

**Memory limitations:**
- File-based (no semantic search)
- Per-agent (no shared memory across agents)
- Text-only (no vector embeddings or similarity matching)
- Requires manual reading at agent startup

### 3.4 Current Pain Points

1. **No parallel agent execution:** The orchestrator runs agents sequentially. A test suite with 3 route groups takes 3x as long.

2. **No inter-agent communication during execution:** Agents only communicate through the orchestrator by passing results. They cannot signal each other directly.

3. **No shared semantic memory:** If the auditor discovers a WAF pattern, the triage agent must rediscover it independently unless the orchestrator explicitly passes it.

4. **Fixed topology:** The pipeline is linear. No dynamic adjustment based on task complexity.

5. **No deduplication of work:** If two route groups share similar patterns (e.g., WAF behavior), each test run starts from scratch.

6. **Runner limitations are hard-coded:** TypeScript runner can't do multipart (`JSON.stringify` on line 262 of `run-tests.ts`). Requires manual routing to Python flow tests.

7. **Scout & Architect MCP tools referenced but not implemented:** `detect-bugs.md` references `mcp__api-testing__discover_with_scout` and `mcp__api-testing__analyze_with_architect` — these tools don't exist in the MCP server.

8. **Orchestrator runs stored in-memory only:** Lost on process restart. No persistence.

9. **No aggregated analytics:** No endpoint for total pass rate, trend analysis, or risk scoring across route groups.

10. **No automated end-to-end ticket pipeline:** Bug detector can create tickets in bug-manager, but there's no automated trigger from test execution to ticket creation without manual orchestration.

---

## 4. Ruflo's Full MCP Capabilities

### 4.1 Swarm Orchestration

**6 Swarm Topologies:**

| Topology | Min Agents | Memory/Agent | Latency | Description | Our Use Case |
|---|---|---|---|---|---|
| **Hierarchical** | 6 | 256MB | 0.20s | Queen coordinates workers (default) | Multi-route orchestration with lead agent |
| **Mesh** | 4 | 192MB | 0.15s | Peer-to-peer, all agents communicate | Cross-pollinating insights between auditor and triage |
| **Ring** | 3 | 128MB | 0.12s | Sequential with feedback loop | Pipeline with automatic retry on failure |
| **Star** | 5 | 180MB | 0.14s | Central coordinator with spokes | What we already do manually via orchestrator |
| **Hybrid** | 7 | 320MB | 0.18s | Hierarchical + Mesh combined | Multi-domain tasks (auth + spaces + icons) |
| **Adaptive** | 2 | Variable | Variable | Dynamic topology switching | Start simple, scale up as needed |

**5 Consensus Algorithms:**

| Algorithm | Fault Tolerance | Latency | Model | Our Use Case |
|---|---|---|---|---|
| **Raft** | f < n/2 | ~50ms | Leader-based replication | Deciding which agent handles ambiguous failures |
| **Byzantine (PBFT)** | f < n/3 | ~100ms | 2/3 supermajority | Validating tests pass "for the right reason" |
| **Gossip** | High partition tolerance | ~200ms | Epidemic dissemination | Propagating discovered patterns across agents |
| **CRDT** | Eventual consistency | ~10ms | Conflict-free replicated types | Merging test results from parallel runners |
| **Quorum** | Tunable | ~75ms | Configurable R/W quorums | Multiple auditors voting on test quality |

**Queen-Led Coordination:**
- 3 Queen types: Strategic (planning), Tactical (execution), Adaptive (optimization)
- 8 Worker specializations: researcher, coder, analyst, tester, architect, reviewer, optimizer, documenter
- 3 Consensus modes: Majority, Weighted (Queen has 3x voting power), Byzantine (2/3 supermajority)
- Auto-start triggers: 3+ file changes, new features, cross-module refactoring, API changes, security modifications

### 4.2 Memory & Vector Search

**3-Tier Hierarchical Memory:**

| Tier | Purpose | Size Limit | Eviction |
|---|---|---|---|
| **Working** | Active context | 1MB | LRU |
| **Episodic** | Recent patterns | Configurable | Importance × retention ranking |
| **Semantic** | Consolidated knowledge | Persistent | Promoted via consolidation |

**RuVector (Vector Search):**
- HNSW vector search: 150x-12,500x faster retrieval
- Distance metrics: cosine, euclidean, dot product
- Batch search for parallel queries
- Optional PostgreSQL backend via pgvector (77+ SQL functions)
- Sub-millisecond retrieval with LRU caching (95% hit rate)

**AgentDB v3 (20+ memory controllers):**
- `hierarchical-store` / `hierarchical-recall` — tiered storage
- `semantic-route` — route queries to appropriate memory tier
- `context-synthesize` — combine memories for coherent context
- `pattern-store` / `pattern-search` — reusable pattern library
- `causal-edge` — track cause-effect relationships
- `consolidate` — promote working → episodic → semantic
- `batch` — bulk memory operations

**Multi-Provider Embeddings:**

| Provider | Latency | Notes |
|---|---|---|
| agentic-flow ONNX | 3ms | Built-in, recommended |
| OpenAI | 50-100ms | Requires API key |
| Transformers.js | 230ms | Local, no API needed |

**Intelligence Layer (SONA):**
- Self-Optimizing Neural Architecture: <0.05ms adaptation
- EWC++ (Elastic Weight Consolidation): prevents catastrophic forgetting
- Flash Attention: 2.49x-7.47x speedup
- ReasoningBank: retrieve → judge → distill trajectory
- Hyperbolic (Poincare) embeddings for hierarchical code relationships
- 9 reinforcement learning algorithms
- 39 attention mechanisms, 15 GNN layer types

**Self-Learning Pipeline:**
- LearningBridge: insights → SONA/ReasoningBank, 0.12ms/insight
- MemoryGraph: PageRank + label propagation, 2.78ms build for 1k nodes
- AgentMemoryScope: 3 scopes (project/local/user), 1.25ms cross-agent transfer
- AutoMemoryBridge: bidirectional Claude Code ↔ AgentDB sync

### 4.3 Agent Booster (WebAssembly)

Skips LLM entirely for simple code transforms using WASM:

| Metric | Agent Booster | LLM Call |
|---|---|---|
| **Latency** | <1ms | 2-5s |
| **Cost** | $0 | $0.0002-$0.015 |
| **Speedup** | 352x | Baseline |

**6 Built-In Transform Intents:**
1. `var-to-const` — convert var/let to const
2. `add-types` — add TypeScript annotations
3. `add-error-handling` — wrap in try/catch
4. `async-await` — promise chains to async/await
5. `add-logging` — insert console.log
6. `remove-console` — strip console.* calls

**3-Tier Model Routing:**
- Tier 1: Agent Booster (WASM) <1ms — simple transforms
- Tier 2: Haiku ~500ms — low-complexity (<30%)
- Tier 3: Sonnet/Opus 2-5s — complex reasoning (>30%)

**Token Optimization (combined 30-50% reduction):**
- ReasoningBank retrieval: -32%
- Agent Booster edits: -15%
- Cache (95% hit rate): -10%
- Optimal batch sizing: -20%

### 4.4 Agentic QE Plugin (Quality Engineering) — 16 Tools

This is the most directly relevant ruflo capability for our API testing use case.

| Tool | Purpose | Maps To Our Pipeline |
|---|---|---|
| `aqe/generate-tests` | Generate tests from specs/code | SDET Builder phase |
| `aqe/tdd-cycle` | Run TDD red-green-refactor | Runner + Triage loop |
| `aqe/analyze-coverage` | Identify coverage gaps | Auditor coverage analysis |
| `aqe/security-scan` | Security-focused test generation | WAF pattern discovery |
| `aqe/chaos-inject` | Chaos engineering / fault injection | Edge case test generation |
| `aqe/mutation-test` | Mutation testing for assertion quality | Auditor "right reason" validation |
| `aqe/load-test` | Performance/load test generation | (Currently not in our pipeline) |
| `aqe/api-fuzz` | API fuzzing for edge cases | Scout edge case discovery |
| `aqe/contract-test` | Contract testing between services | (New capability) |
| `aqe/regression-suite` | Build regression suites from bugs | Triage → regression conversion |
| `aqe/flake-detect` | Identify flaky tests | Auditor flake classification |
| `aqe/test-prioritize` | Prioritize tests by risk/impact | (New capability) |
| `aqe/snapshot-test` | Snapshot/golden file testing | (New capability) |
| `aqe/a11y-test` | Accessibility testing | (Not applicable — API only) |
| `aqe/visual-regression` | Visual regression testing | (Not applicable — API only) |
| `aqe/e2e-orchestrate` | End-to-end test orchestration | Full pipeline replacement |

### 4.5 Bug Ticket Pipeline (Our Bug Manager, NOT GitHub Issues)

> **Important:** We do NOT use GitHub Issues for bug tracking. Our Backstage repo has a dedicated **bug-manager plugin** (`plugins/bug-manager/` + `plugins/bug-manager-backend/`) with its own database, Kanban board, list view, comments, statuses, and priorities. The **bug-detector MCP server** already integrates with it via REST API (`http://localhost:7007/api/bug-manager`).

**Existing bug-manager capabilities:**

| Feature | Endpoint | Description |
|---|---|---|
| Create bug ticket | `POST /api/bug-manager/bugs` | Creates ticket with heading, description, priority, status, assignee |
| List/search bugs | `GET /api/bug-manager/bugs?search=...` | Search by endpoint, filter by status/priority/assignee |
| Update bug | `PATCH /api/bug-manager/bugs/:id` | Update status, priority, assignee, close/reopen |
| Get statuses | `GET /api/bug-manager/statuses` | Kanban columns (up to 5 configurable statuses) |
| Comments | `POST /api/bug-manager/bugs/:id/comments` | Add threaded comments to tickets |
| Users | `GET /api/bug-manager/users` | List Backstage catalog users for assignment |
| Deduplication | Built into bug-detector | Fingerprint-based + heading-based duplicate detection |
| Ledger tracking | Built into bug-detector | Tracks which test failures → which tickets |

**How bug-detector already connects:**
```
bug-detector MCP server (plugins/bug-detector-mcp-server/)
    │
    ├── bugManagerApi.ts
    │   ├── fetchDefaultOpenStatusId()  → GET /api/bug-manager/statuses
    │   ├── findDuplicateBug()          → GET /api/bug-manager/bugs?search=...
    │   └── createBugViaApi()           → POST /api/bug-manager/bugs
    │
    ├── Deduplication (fingerprint + heading match)
    ├── Smart grouping (categorizes related failures into single ticket)
    ├── Bulk limits (>N failures → single summary ticket)
    └── Ledger (tracks execution_id → ticket_number mapping)
```

**Ruflo's role here is orchestration, not ticket creation.** Ruflo coordinates the test pipeline; when failures are found, it triggers the existing `mcp__bug-detector__create_bug_tickets` tool, which handles the entire ticket lifecycle through the bug-manager backend. Ruflo's GitHub tools (`github_issues`, `issue_triage`, etc.) are **not needed** for this repo.

**What ruflo adds to the ticket pipeline:**
- **Automated trigger:** Swarm orchestration automatically invokes `create_bug_tickets` after test execution completes — no manual step needed
- **Shared memory for dedup:** Store ticket fingerprints in ruflo vector memory so agents across sessions know which bugs are already filed
- **Consensus for severity:** Multiple agents vote on priority (urgent/medium/low) before ticket creation
- **Pattern matching:** Before creating a ticket, query ruflo memory: "has this failure pattern been seen before?" to reduce noise

### 4.6 Security — 7 Protection Layers

1. **Input validation** (Zod-based boundary validation)
2. **Path traversal prevention** (blocks `../`, `~/`, `/etc/`)
3. **Command sandboxing** (allowlisted commands, metacharacter blocking)
4. **Prototype pollution prevention** (safe JSON parsing)
5. **TOCTOU protection** (symlink skipping, atomic operations)
6. **Information disclosure prevention** (error sanitization)
7. **CVE monitoring** (active vulnerability scanning)

**AIDefence Module (<10ms detection):**
- Prompt injection blocking
- Memory poisoning detection
- Inter-agent collusion detection
- PII detection
- Jailbreak detection

### 4.7 Hooks & Lifecycle — 33 Hooks

| Category | Hooks | Use Case |
|---|---|---|
| **Core** | `pre-edit`, `post-edit`, `pre-command`, `post-command` | Intercept agent operations |
| **Routing** | `route`, `explain` | Route tasks to appropriate agents |
| **Session** | `session-start`, `session-end`, `session-restore` | Initialize/cleanup agent state |
| **Intelligence** | `intelligence/*` | Pre-training, pattern learning |
| **Worker** | `worker/*` | Background task management |
| **Agent Teams** | `teammate-idle`, `task-completed`, `task-*` | Team coordination events |

### 4.8 Background Workers — 12 Types

| Worker | Priority | Purpose |
|---|---|---|
| `ultralearn` | Highest | Accelerated learning from patterns |
| `optimize` | High | Code/config optimization |
| `consolidate` | Medium | Memory tier promotion |
| `predict` | Medium | Predict likely test failures |
| `audit` | High | Security/quality auditing |
| `map` | Low | Dependency mapping |
| `preload` | Low | Pre-cache likely needed data |
| `deepdive` | Medium | Deep analysis of complex issues |
| `document` | Low | Auto-documentation |
| `refactor` | Medium | Code improvement suggestions |
| `benchmark` | Low | Performance benchmarking |
| `testgaps` | High | Identify missing test coverage |

---

## 5. Integration Points — Where Ruflo Fits

### 5.1 Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Claude Code CLI                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │ api-testing  │  │bug-detector │  │         ruflo            │ │
│  │ MCP Server   │  │ MCP Server  │  │       MCP Server         │ │
│  │              │  │             │  │                          │ │
│  │ - CRUD tests │  │ - error logs│  │ ORCHESTRATION            │ │
│  │ - run tests  │  │ - bug tix   │  │ - swarm coordination    │ │
│  │ - history    │  │ - process   │  │ - task routing           │ │
│  │              │  │             │  │ - consensus engine       │ │
│  │              │  │             │  │                          │ │
│  │              │  │             │  │ MEMORY                   │ │
│  │              │  │             │  │ - vector search (HNSW)   │ │
│  │              │  │             │  │ - AgentDB (20 controllers│ │
│  │              │  │             │  │ - 3-tier hierarchical    │ │
│  │              │  │             │  │                          │ │
│  │              │  │             │  │ QUALITY ENGINEERING      │ │
│  │              │  │             │  │ - test generation        │ │
│  │              │  │             │  │ - coverage analysis      │ │
│  │              │  │             │  │ - security scanning      │ │
│  │              │  │             │  │ - chaos injection        │ │
│  │              │  │             │  │ - flake detection        │ │
│  │              │  │             │  │                          │ │
│  │              │  │             │  │ OPTIMIZATION             │ │
│  │              │  │             │  │ - Agent Booster (WASM)   │ │
│  │              │  │             │  │ - model routing          │ │
│  │              │  │             │  │ - token compression      │ │
│  │              │  │             │  │                          │ │
│  │              │  │             │  │ (GitHub tools available   │ │
│  │              │  │             │  │  but NOT used for bugs — │ │
│  │              │  │             │  │  we use bug-manager)     │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │           .claude/agents/ (Agent Definitions)             │    │
│  │  orchestrator │ runner │ auditor │ triage │ architect     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │         .claude/skills/ & .claude/commands/               │    │
│  │  detect-bugs │ run-test-orchestration │ compliance        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                test-repositories/Freddy.Backend.Tests/            │
│    test-suites/ (JSON) │ flows/ (Python) │ test-results/         │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Integration Opportunity Map

#### A. Replace Sequential Orchestration with Swarm Coordination

**Before:** Orchestrator manually spawns agents one at a time, waits for each to complete.

**After:** Ruflo's swarm manager spawns scout + architect in parallel where possible, then fans out to multiple SDET builders, then parallel runners.

```
                    ┌─────────────┐
                    │ Ruflo Swarm │
                    │   Manager   │
                    └──────┬──────┘
              ┌────────────┼────────────┐
              v            v            v
         ┌────────┐  ┌────────┐  ┌────────┐
         │ Scout  │  │ Scout  │  │ Scout  │   Phase 1: Parallel recon
         │ Auth   │  │ Spaces │  │ Icons  │
         └────┬───┘  └────┬───┘  └────┬───┘
              v            v            v
         ┌────────┐  ┌────────┐  ┌────────┐
         │ Arch   │  │ Arch   │  │ Arch   │   Phase 2: Parallel planning
         │ Auth   │  │ Spaces │  │ Icons  │
         └────┬───┘  └────┬───┘  └────┬───┘
              v            v            v
         ┌────────┐  ┌────────┐  ┌────────┐
         │ SDET   │  │ SDET   │  │ SDET   │   Phase 3: Parallel build
         │ Auth   │  │ Spaces │  │ Icons  │
         └────┬───┘  └────┬───┘  └────┬───┘
              v            v            v
         ┌────────┐  ┌────────┐  ┌────────┐
         │ Runner │  │ Runner │  │ Runner │   Phase 4: Parallel execution
         └────┬───┘  └────┬───┘  └────┬───┘
              └────────────┼────────────┘
                           v
                    ┌─────────────┐
                    │ CRDT Merge  │   Results merged via consensus
                    └──────┬──────┘
                           v
                    ┌─────────────┐
                    │   Auditor   │   Phase 5: Unified audit
                    └──────┬──────┘
                           v
                    ┌─────────────┐
                    │   Triage    │   Phase 6: Fix + escalate
                    └─────────────┘
```

**Time savings estimate:** 3 route groups × ~12 min each = ~36 min sequential → ~15 min parallel (bounded by slowest route).

#### B. Shared Vector Memory for Cross-Agent Learning

Instead of isolated MEMORY.md files per agent:

```
┌─────────────────────────────────────────────────────────┐
│                  Ruflo Vector Memory                     │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Working  │→ │ Episodic │→ │ Semantic │              │
│  │ (active) │  │ (recent) │  │ (stable) │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  Queryable by ALL agents:                               │
│  - "WAF patterns for register endpoint"                 │
│  - "auth token format for staging"                      │
│  - "known TEST_BUG patterns for /v1/model"              │
│  - "which route groups have multipart uploads?"          │
│                                                         │
│  Auto-consolidation: working → episodic → semantic      │
│  Cross-agent transfer: 1.25ms                           │
│  Semantic search: sub-millisecond (HNSW)                │
└─────────────────────────────────────────────────────────┘
```

**Concrete example:** When testing `/v1/model`:
1. SDET queries memory: "authentication patterns for Freddy Backend"
2. Gets back: `email_or_username` field name, `@aitronos.com` domain requirement, bearer case-sensitivity
3. SDET builds tests with correct patterns from the start — no trial-and-error

#### C. Agentic QE Integration

The AQE plugin maps directly to our pipeline phases:

| AQE Tool | Our Pipeline Phase | Enhancement |
|---|---|---|
| `aqe/generate-tests` | Phase 3 (SDET) | Automated test generation from API specs |
| `aqe/security-scan` | Phase 1 (Scout) | Find security issues in API surface |
| `aqe/chaos-inject` | Phase 3 (SDET) | Generate chaos/fault injection tests |
| `aqe/analyze-coverage` | Phase 6 (Auditor) | Quantitative coverage gaps |
| `aqe/flake-detect` | Phase 6 (Auditor) | Identify flaky tests automatically |
| `aqe/mutation-test` | Phase 6 (Auditor) | Verify tests catch real bugs (not just passing) |
| `aqe/test-prioritize` | Phase 4 (Runner) | Run highest-risk tests first |
| `aqe/regression-suite` | Post-Triage | Convert found bugs into regression tests |
| `aqe/api-fuzz` | Phase 1 (Scout) | Fuzz APIs for unexpected edge cases |
| `aqe/contract-test` | Phase 3 (SDET) | Verify API contracts between services |

#### D. Consensus for Test Classification

When the auditor and triage disagree on whether a failure is TEST_BUG vs PRODUCT_BUG:

```
Auditor says: "TEST_BUG - test expects 422 but API correctly returns 401"
Triage says:  "PRODUCT_BUG - API should return 422 per spec"

        ┌─────────────────────────────────┐
        │       BFT Consensus Engine       │
        ├─────────────────────────────────┤
        │ Input: both classifications     │
        │ Voters: Auditor + Triage +      │
        │         spec-checker agent      │
        │ Algorithm: 2/3 supermajority    │
        │                                 │
        │ Result: TEST_BUG (2/3 agree     │
        │   login endpoint intentionally  │
        │   masks errors as 401)          │
        │                                 │
        │ Evidence stored in memory for   │
        │ future similar classifications  │
        └─────────────────────────────────┘
```

#### E. Agent Booster for Mechanical Triage Fixes

Common fixes that don't need LLM reasoning:

| Pattern | Fix | Current Cost | Booster Cost |
|---|---|---|---|
| `field 'email' not recognized` | Rename to `email_or_username` | ~$0.003 + 3s | $0 + <1ms |
| `expected 422, got 401 on login` | Change `expected_status` to 401 | ~$0.003 + 3s | $0 + <1ms |
| `execution error: api_key` | Remove `{{api_key}}` variable | ~$0.003 + 3s | $0 + <1ms |
| `test@example.com → 403` | Change to `test@aitronos.com` | ~$0.003 + 3s | $0 + <1ms |

**Savings at scale:** With 222 auth tests and ~30% failure rate on first run = ~66 fixes. At $0.003 each = $0.20 saved per route group. More importantly, 66 × 3s = ~200s saved → instant.

#### F. Automated Bug-Manager Ticket Pipeline

```
Ruflo Swarm completes test execution
        │
        v
Ruflo triggers mcp__bug-detector__create_bug_tickets(route_group)
        │
        v
Bug Detector MCP Server (existing)
        │
        ├── Reads failures from JSONL history
        ├── Smart grouping: detectFailureGroups()
        │   - Groups related failures (same root cause → single ticket)
        │   - Bulk limit: >N failures → summary ticket
        │
        ├── Fingerprint dedup: findDuplicateBug()
        │   - Checks bug-manager for existing open tickets
        │   - Skips if fingerprint or heading matches
        │
        ├── createBugViaApi() → POST /api/bug-manager/bugs
        │   - Heading: "[500] /v1/model function tool calling"
        │   - Description: test case ID, request/response, stack trace
        │   - Priority: derivePriority() (urgent/medium/low)
        │   - Status: first configured status (e.g., "Open")
        │
        ├── appendLedger(): Track execution_id → ticket_number
        │
        └── Returns: { created: [...], skipped_duplicates: [...], summary }
                │
                v
        Ruflo memory_store: Record patterns for future runs
        │
        v
        Bug visible in Backstage Bug Manager UI
        (Kanban board, list view, comments, assignees)
```

**What ruflo enhances in this flow:**
- **Automatic trigger:** No manual step — swarm orchestration invokes `create_bug_tickets` as the final pipeline phase
- **Memory-enhanced dedup:** Before invoking bug-detector, ruflo queries vector memory: "have we seen this failure fingerprint?" — catches duplicates even across route groups
- **Consensus-based severity:** Multiple agents vote on priority before ticket creation
- **Cross-session learning:** Patterns from past ticket creation inform future triage decisions

#### G. Background Workers for Continuous Improvement

| Worker | What It Does For Us |
|---|---|
| `testgaps` | Continuously analyzes which endpoints lack tests |
| `audit` | Background security scanning of test payloads |
| `predict` | Predicts which tests are likely to fail based on code changes |
| `consolidate` | Promotes working memory to long-term semantic memory |
| `ultralearn` | Learns from test patterns to improve future test generation |

---

## 6. Setup & Installation

### 6.1 Prerequisites

- Node.js 20+ (check: `node --version`)
- npm 9+ (check: `npm --version`)
- Claude Code installed
- `ANTHROPIC_API_KEY` set in environment

### 6.2 Option A: Core Server Only (Recommended Start)

Add to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(curl:*)",
      "Bash(python3:*)",
      "Read(//Users/rahul/Documents/github/**)",
      "WebFetch(domain:designsystems.surf)",
      "WebFetch(domain:mypalettetool.com)",
      "WebFetch(domain:vercel.com)",
      "WebFetch(domain:www.mockplus.com)",
      "WebFetch(domain:www.merveilleux.design)",
      "WebFetch(domain:tailscan.com)",
      "WebFetch(domain:ui.shadcn.com)",
      "WebFetch(domain:localhost)"
    ]
  },
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": 10,
  "teammateMode": "in-process",
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

### 6.3 Option B: Full Setup (All Three Servers)

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
    },
    "ruv-swarm": {
      "command": "npx",
      "args": ["ruv-swarm", "mcp", "start"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    },
    "flow-nexus": {
      "command": "npx",
      "args": ["flow-nexus@latest", "mcp", "start"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

### 6.4 Option C: CLI Installation (Alternative)

```bash
# Global install
npm install -g ruflo@v3alpha

# Or via Claude Code CLI
claude mcp add ruflo -- npx ruflo@v3alpha mcp start

# With WASM acceleration
claude mcp add ruv-swarm -- npx ruv-swarm mcp start
```

### 6.5 Permission Updates

Add to `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__ruflo__*",
      "mcp__ruv-swarm__*",
      "mcp__flow-nexus__*"
    ]
  }
}
```

### 6.6 Verification

After restarting Claude Code:

1. Check that ruflo tools appear in available tools:
   - Look for `mcp__ruflo__swarm_init`, `mcp__ruflo__memory_search`, etc.
2. Test basic operations:
   - `mcp__ruflo__swarm_init` — should initialize a swarm
   - `mcp__ruflo__memory_store` — should store a test value
   - `mcp__ruflo__memory_search` — should retrieve the stored value
3. Check logs for: `[ruflo] MCP server running on stdio`

### 6.7 Troubleshooting

| Issue | Solution |
|---|---|
| `npx` hangs on first run | First download can take 30-60s; subsequent starts are cached |
| Tools don't appear | Restart Claude Code completely (not just reload) |
| Permission denied | Add `mcp__ruflo__*` to `settings.local.json` allow list |
| High memory usage | Use `CLAUDE_FLOW_TOOL_MODE=develop` to load only relevant tools |
| Conflicts with existing MCP | Ruflo tools are namespaced as `mcp__ruflo__*` — no overlap |

---

## 7. Configuration Deep Dive

### 7.1 Environment Variables

| Variable | Purpose | Default | Recommended |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Required for Claude model access | — | Set in `~/.zshrc` |
| `CLAUDE_FLOW_LOG_LEVEL` | Logging verbosity | `info` | `info` for dev, `warn` for CI |
| `CLAUDE_FLOW_TOOL_GROUPS` | Comma-separated tool groups to load | All | `test,memory,security` |
| `CLAUDE_FLOW_TOOL_MODE` | Preset tool configuration | — | `develop` |
| `CLAUDE_FLOW_CONFIG` | Path to config file | — | Optional override |
| `CLAUDE_FLOW_MCP_PORT` | MCP server port | 3000 | Change if port conflict |
| `CLAUDE_FLOW_MEMORY_BACKEND` | Memory backend type | `hybrid` | `hybrid` (default) |

### 7.2 Tool Modes (Presets)

| Mode | Tool Groups Loaded | Best For |
|---|---|---|
| `develop` | create, implement, test, fix, memory | Day-to-day test development |
| `pr-review` | branch, fix, monitor, security | Reviewing test changes |
| `devops` | create, monitor, optimize, security | CI/CD pipeline runs |
| `triage` | issue, monitor, fix | Bug triage sessions |

### 7.3 Tool Groups (Fine-Grained Control)

| Group | Tools Included |
|---|---|
| `create` | Test creation, scaffolding |
| `issue` | Issue management, triage |
| `branch` | Git branch operations |
| `implement` | Code generation, editing |
| `test` | Test execution, coverage, QE |
| `fix` | Bug fixing, triage repair |
| `optimize` | Performance, token optimization |
| `monitor` | Status, metrics, progress |
| `security` | Security scanning, CVE checking |
| `memory` | Vector search, AgentDB, neural |
| `all` | Everything (175+ tools) |
| `minimal` | Core swarm + memory only |

### 7.4 Performance Tuning

Key settings from ruflo's `config.toml` that affect our test pipeline:

```toml
[performance]
max_agents = 8          # Max concurrent agents
                        # For us: set to number of route groups × 2
task_timeout = 300      # Seconds before task times out
                        # For us: increase to 600 for large test suites
memory_limit = "512MB"  # Per-agent memory cap
cache_enabled = true    # Cache repeated operations
cache_ttl = 3600        # Cache lifetime (1 hour)
parallel_execution = true

[swarm]
default_topology = "star"           # Star matches our orchestrator pattern
specialization_strategy = "specialized"
consensus_algorithm = "raft"        # Good default for test classification

[security]
input_validation = true
path_traversal_prevention = true
secret_scanning = true              # Blocks .env, credentials.json, etc.
max_file_size = 10485760            # 10MB

[neural]
sona_enabled = true
hnsw_enabled = true
pattern_learning = true
```

---

## 8. Use Case Scenarios

### Scenario 1: Parallel Multi-Route Testing

**Goal:** Test `/v1/auth`, `/v1/spaces`, and `/v1/icons` simultaneously.

**Without ruflo:**
```
/run-test-orchestration auth     → 15 min
/run-test-orchestration spaces   → 12 min
/run-test-orchestration icons    → 10 min
Total: ~37 min sequential
```

**With ruflo swarm:**
```
1. mcp__ruflo__swarm_init(topology="star", agents=6)
2. mcp__ruflo__agent_spawn(role="test-pipeline", count=3)
3. mcp__ruflo__task_orchestrate(tasks=[
     {target: "/v1/auth", pipeline: "full"},
     {target: "/v1/spaces", pipeline: "full"},
     {target: "/v1/icons", pipeline: "full"}
   ], parallel=true)
4. mcp__ruflo__swarm_monitor() → real-time progress
5. Results merged via CRDT consensus

Total: ~15 min parallel (bounded by slowest route)
```

### Scenario 2: Cross-Route Pattern Learning

**Goal:** When testing `/v1/model`, automatically apply learnings from `/v1/auth`.

**Without ruflo:** SDET starts from scratch. Rediscovers `email_or_username`, `@aitronos.com` domain, WAF patterns.

**With ruflo memory:**
```
1. Before SDET builds /v1/model tests:
   mcp__ruflo__memory_search(query="authentication patterns Freddy Backend")

   Returns:
   - email_or_username field (not email) [confidence: 0.98]
   - @aitronos.com domain required [confidence: 0.95]
   - Bearer token case-sensitive [confidence: 0.92]
   - WAF blocks plus-addressing on register [confidence: 0.90]

2. SDET incorporates patterns into test generation
3. First-run pass rate increases from ~70% to ~90%
```

### Scenario 3: Automated Triage with Booster

**Goal:** Fix known test bugs instantly without LLM roundtrip.

**Without ruflo:** Triage agent reads failure, reasons about it (3s + $0.003), decides it's a known pattern, edits test, re-runs. ~3 min per test bug.

**With ruflo booster:**
```
Pre-compiled pattern rules:
- match: "field 'email' not recognized" → rename to email_or_username
- match: "expected 422, got 401 on login" → change expected_status to 401
- match: "execution error: api_key" → remove {{api_key}} variable
- match: "403 on register with @example.com" → change to @aitronos.com

67 failures on first run × <1ms each = ~0.07s total (vs ~200s with LLM)
Cost: $0 (vs ~$0.20 with LLM calls)
```

### Scenario 4: Consensus-Driven Bug Classification

**Goal:** Eliminate false PRODUCT_BUG classifications.

```
Test tc-hln7rb: "64-char function name returns 500"

Auditor: "PRODUCT_BUG — Pydantic allows max_length=64 but downstream crashes"
Triage:  "TEST_BUG — maybe 64 is off-by-one, try 63"
Spec:    "PRODUCT_BUG — 500 is never acceptable for valid input"

mcp__ruflo__consensus_init(algorithm="bft", voters=3)
mcp__ruflo__consensus_vote(voter="auditor", classification="PRODUCT_BUG", evidence="...")
mcp__ruflo__consensus_vote(voter="triage", classification="TEST_BUG", evidence="...")
mcp__ruflo__consensus_vote(voter="spec-checker", classification="PRODUCT_BUG", evidence="...")
mcp__ruflo__consensus_result()
→ PRODUCT_BUG (2/3 supermajority)

mcp__ruflo__memory_store(pattern="64-char-function-name-500", classification="PRODUCT_BUG")
```

### Scenario 5: Intelligent Test Prioritization

**Goal:** Run highest-risk tests first.

```
mcp__ruflo__aqe_test_prioritize(route_group="/v1/auth", criteria={
  failure_frequency: "last_5_runs",
  code_change_proximity: true,
  bug_severity_history: true,
  time_since_last_run: true
})

Returns prioritized order:
1. tc-hln7rb (function tool calling — known 500 bug)      Risk: 0.95
2. tc-84kdsc (128 tools boundary — known 500 bug)         Risk: 0.92
3. tc-jv8jek (consecutive dots validation — known bug)    Risk: 0.85
4. tc-tgxg98 (Google callback invalid code)               Risk: 0.80
...
200. tc-xxxxx (login happy path — always passes)           Risk: 0.02

Runner executes in this order, fails fast on critical issues.
```

### Scenario 6: Mutation Testing for "Right Reason" Validation

**Goal:** Verify tests pass because the assertion is correct, not because an earlier layer blocked the request.

```
mcp__ruflo__aqe_mutation_test(test_case="tc-abc123", mutations=[
  {type: "status_code", from: 401, to: 200},     // Would test still catch the bug?
  {type: "remove_assertion", field: "body.error"}, // Does removing this matter?
  {type: "change_url", from: "/register", to: "/login"} // Wrong endpoint still fails?
])

Results:
- Mutation 1: KILLED (test correctly fails when status changes) ✓
- Mutation 2: SURVIVED (test passes even without body assertion) ✗ — weak test!
- Mutation 3: KILLED (test correctly fails on wrong endpoint) ✓

Mutation score: 2/3 (66%) — body assertion should be strengthened
```

### Scenario 7: API Fuzzing for Edge Case Discovery

**Goal:** Discover edge cases that human-designed tests miss.

```
mcp__ruflo__aqe_api_fuzz(endpoint="/v1/auth/register", iterations=1000, focus=[
  "boundary_values",    // max-length strings, empty strings, unicode
  "type_confusion",     // int where string expected, array where object
  "injection",          // SQL, XSS, command injection payloads
  "encoding",           // URL encoding, base64, double encoding
  "rate_limiting"       // rapid sequential requests
])

Discoveries:
- Consecutive dots in email accepted (already known: tc-jv8jek)
- Unicode normalization bypass: `ⓐdmin@aitronos.com` → `admin@aitronos.com` (NEW)
- 10MB request body accepted without 413 (NEW — potential DoS)
- Rate limiting absent on register endpoint (NEW — brute force risk)
```

---

## 9. Architecture After Integration

### 9.1 Full System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         Claude Code CLI                           │
│                                                                   │
│  Skills & Commands                                                │
│  ├── /run-test-orchestration   (existing, unchanged)              │
│  ├── /detect-bugs              (existing, enhanced with ruflo)    │
│  └── /swarm-test               (NEW — ruflo-powered parallel)     │
│                                                                   │
│  Agent Definitions (.claude/agents/)                              │
│  ├── omni-test-orchestrator    (enhanced: uses ruflo swarm)       │
│  ├── omni-scan-scout           (enhanced: uses aqe/api-fuzz)      │
│  ├── strategic-test-architect  (enhanced: uses ruflo memory)      │
│  ├── sdet-builder              (enhanced: uses aqe/generate-tests)│
│  ├── execution-runner          (enhanced: uses aqe/test-prioritize│
│  ├── quality-auditor           (enhanced: uses aqe/mutation-test) │
│  └── test-triage-repair        (enhanced: uses booster + memory)  │
│                                                                   │
│  MCP Servers                                                      │
│  ├── api-testing        (existing — test CRUD & execution)        │
│  ├── bug-detector       (existing — error analysis & tickets)     │
│  └── ruflo              (NEW — orchestration + memory + QE)       │
│                                                                   │
│  Data Layer                                                       │
│  ├── test-suites/*.json        (test definitions — unchanged)     │
│  ├── flows/*.py                (Python flow tests — unchanged)    │
│  ├── test-results/             (execution output — unchanged)     │
│  ├── .claude/agent-memory/     (existing flat memory — kept)      │
│  └── ruflo vector store        (NEW semantic memory — primary)    │
└───────────────────────────────────────────────────────────────────┘
```

### 9.2 Data Flow — Swarm-Powered Pipeline

```
1. User triggers /swarm-test {route_groups: ["auth", "spaces", "icons"]}
                    │
2. ruflo.swarm_init(topology="star", consensus="crdt")
                    │
3. ruflo.memory_search("prior patterns for Freddy Backend")
   → Returns: domain requirements, WAF patterns, known bugs
                    │
4. ruflo.task_orchestrate(parallel=true):
   ┌────────────────┼────────────────┐
   v                v                v
   Pipeline(auth)  Pipeline(spaces) Pipeline(icons)    ← 3 parallel pipelines
   │                │                │
   ├─ Scout         ├─ Scout         ├─ Scout
   ├─ aqe/fuzz      ├─ aqe/fuzz      ├─ aqe/fuzz     ← API fuzzing
   ├─ Architect     ├─ Architect     ├─ Architect
   ├─ aqe/gen-tests ├─ aqe/gen-tests ├─ aqe/gen-tests ← AQE test gen
   ├─ SDET          ├─ SDET          ├─ SDET
   ├─ aqe/prioritize├─ aqe/prioritize├─ aqe/prioritize ← Risk ordering
   ├─ Runner        ├─ Runner        ├─ Runner
   └─ Triage+Boost  └─ Triage+Boost  └─ Triage+Boost  ← WASM fixes
   │                │                │
   └────────────────┼────────────────┘
                    v
5. ruflo.consensus(algorithm="crdt") → merge results
                    │
6. Auditor reviews unified results
   ├─ aqe/analyze-coverage → quantitative coverage report
   ├─ aqe/mutation-test → verify assertions are strong
   └─ aqe/flake-detect → flag unreliable tests
                    │
7. Bug Detector processes PRODUCT_BUGs
   ├─ mcp__bug-detector__create_bug_tickets → creates tickets in bug-manager
   │   ├─ Fingerprint dedup (skips existing open tickets)
   │   ├─ Smart grouping (related failures → single ticket)
   │   └─ Ledger tracking (execution_id → ticket_number)
   └─ ruflo.memory_store → record patterns for future regression testing
                    │
8. ruflo.memory_store(all_learnings) → persist for next run
                    │
9. Quality Certificate generated
   ├─ Coverage score (from aqe)
   ├─ Mutation score (from aqe)
   ├─ Flake count (from aqe)
   ├─ Bugs filed (from bug-detector → bug-manager)
   └─ Verdict: SHIP / CONDITIONAL_SHIP / NO-SHIP
```

### 9.3 Memory Architecture After Integration

```
┌───────────────────────────────────────────────────────────────┐
│                    Dual Memory System                         │
│                                                               │
│  ┌─────────────────────────────┐  ┌────────────────────────┐ │
│  │   Existing Agent Memory     │  │   Ruflo Vector Memory  │ │
│  │   (.claude/agent-memory/)   │  │   (RuVector + AgentDB) │ │
│  │                             │  │                        │ │
│  │  - Per-agent MEMORY.md      │  │  - Shared across all   │ │
│  │  - Human-readable           │  │  - Semantic search     │ │
│  │  - Manual read at startup   │  │  - Auto-queried        │ │
│  │  - Text-only                │  │  - Vector embeddings   │ │
│  │                             │  │  - 3-tier hierarchy    │ │
│  │  ROLE: Audit trail,         │  │  - Sub-ms retrieval    │ │
│  │  human review,              │  │                        │ │
│  │  agent-specific notes       │  │  ROLE: Live knowledge  │ │
│  │                             │  │  base, cross-agent     │ │
│  │                             │  │  sharing, pattern      │ │
│  │                             │  │  matching              │ │
│  └─────────────────────────────┘  └────────────────────────┘ │
│                                                               │
│  AutoMemoryBridge: bidirectional sync between both systems    │
└───────────────────────────────────────────────────────────────┘
```

---

## 10. Risks, Limitations & Considerations

### 10.1 Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Ruflo is alpha** (`v3alpha`) — breaking changes possible | HIGH | Start with core server only; don't make it a hard dependency. Keep existing pipeline as fallback. |
| **Additional API costs** — ruflo's own LLM calls consume Anthropic credits | MEDIUM | Use `CLAUDE_FLOW_TOOL_MODE=develop` to limit tools. Agent Booster reduces LLM calls for simple tasks. Monitor token usage. |
| **Three MCP servers simultaneously** — resource overhead | MEDIUM | Start with just `ruflo` core. Add `ruv-swarm` only if parallel execution shows benefit. `flow-nexus` is optional. |
| **Tool count explosion** — 175+ tools may confuse model routing | MEDIUM | Use `CLAUDE_FLOW_TOOL_GROUPS` to load only `test,memory,security`. |
| **npx startup latency** — first run downloads package | LOW | ~30-60s on first run, then cached. Use global install for faster starts. |
| **Vector memory requires seeding** — cold start problem | LOW | Migrate existing MEMORY.md contents into ruflo vector store during Phase 2. |
| **PostgreSQL dependency for RuVector** — optional but powerful | LOW | Default `hybrid` backend works without PostgreSQL. Add pgvector later if needed. |

### 10.2 Architectural Concerns

1. **Dual orchestration problem:** Our omni-test-orchestrator and ruflo's swarm manager could conflict. **Solution:** Clear boundaries — ruflo handles parallelism, memory, and routing. Our orchestrator handles domain-specific test logic and quality decisions.

2. **Memory migration:** Existing MEMORY.md files contain valuable learnings (222 auth test patterns, WAF behavior, runner limitations). These must be seeded into ruflo's vector store, not abandoned. Keep MEMORY.md as human-readable audit trail.

3. **Vendor dependency:** Adding ruflo creates dependency on external open-source project. **Mitigation:** Keep existing pipeline functional as fallback. Ruflo enhances but doesn't replace.

4. **Complexity budget:** Third MCP server + swarm + vector memory + AQE = significant complexity. Only justified if parallelism and memory benefits materialize. Phase-gated rollout with decision gates controls this risk.

5. **Performance claims verification:** Numbers like "84.8% SWE-Bench solve rate" and "150x vector search" should be validated against our actual workload before relying on them.

### 10.3 What Ruflo Does NOT Replace

| Component | Status |
|---|---|
| Our `api-testing` MCP server (test CRUD, execution, history) | **Keep** — ruflo has no equivalent |
| Our `bug-detector` MCP server (error analysis, ticket creation) | **Keep** — ruflo orchestrates when to call it, but bug-detector handles all ticket logic |
| Our `bug-manager` plugin (Backstage UI, backend, database) | **Keep** — this is our ticket system; ruflo's GitHub tools are NOT used for tickets |
| Our agent definitions and domain-specific prompts | **Keep** — ruflo's agents are generic; ours are specialized |
| Our test suite JSON format and Python flow tests | **Keep** — ruflo doesn't define test formats |
| Our Backstage UI frontend for test management | **Keep** — ruflo is CLI/MCP only |
| TypeScript test runner (`run-tests.ts`) | **Keep** — ruflo doesn't run tests |

### 10.4 What Ruflo Does NOT Solve

| Gap | Why Ruflo Can't Help |
|---|---|
| TypeScript runner can't do multipart uploads | Ruflo doesn't modify our runner. Still need Python flow tests for uploads. |
| `{{api_key}}` variable unsupported in runner | Runner limitation, not orchestration. |
| Flow test registration decoupled from MCP | Our MCP server design, not ruflo's concern. |
| Orchestrator runs stored in-memory only | Our backend implementation, not ruflo's scope. |

### 10.5 Known Ruflo Limitations

| Limitation | Impact |
|---|---|
| Working Memory: 1MB max before LRU eviction | May lose active context during large test runs |
| HNSW effective up to ~10M embeddings | Not a concern for us (we have thousands, not millions) |
| Byzantine consensus requires n >= 3f+1 agents | Need at least 4 agents for BFT |
| Mesh topology needs 4+ agents | Small test suites don't benefit |
| Cursor IDE: max 40 MCP tools | Use `TOOL_GROUPS` to limit if using Cursor |
| Agent Teams: experimental feature | May change in future versions |
| RuVector PostgreSQL: alpha | Use default hybrid backend instead |

---

## 11. Recommended Rollout Plan

### Phase 1: Evaluate (1-2 days)

**Goal:** Verify ruflo works in our environment.

**Steps:**
1. Add ruflo core server to `.claude/settings.json`
2. Restart Claude Code and verify tools appear
3. Run basic operations:
   - `swarm_init` — does it initialize?
   - `memory_store` / `memory_search` — does vector memory work?
   - `agent_spawn` — does agent creation work?
4. Measure startup time and memory usage
5. Test with one simple route group

**Decision gate:** Does it work reliably? Are tools responsive? Is resource usage acceptable?

**Exit criteria:** Ruflo starts in <30s, tools respond in <2s, memory usage <500MB additional.

### Phase 2: Memory Integration (2-3 days)

**Goal:** Replace isolated MEMORY.md with shared vector memory.

**Steps:**
1. Seed ruflo vector memory with contents of all `.claude/agent-memory/*/MEMORY.md` files
2. Modify quality-auditor agent prompt to query ruflo memory before analysis
3. Modify strategic-test-architect to store discoveries in ruflo memory
4. Run test pipeline for `/v1/auth` — verify agents find patterns from memory
5. Run test pipeline for `/v1/spaces` — verify auth patterns transfer

**Decision gate:** Does semantic search improve agent accuracy? Do agents find relevant patterns without being explicitly told?

**Success metric:** First-run pass rate for a new route group increases from ~70% to ~85%+ due to pattern reuse.

### Phase 3: Parallel Execution (3-5 days)

**Goal:** Test multiple route groups simultaneously.

**Steps:**
1. Create new `/swarm-test` command that uses ruflo swarm coordination
2. Run 2 route groups in parallel as proof of concept
3. Scale to 3 route groups if successful
4. Add CRDT-based result merging
5. Compare execution time and test quality vs sequential pipeline

**Decision gate:** Is parallel execution faster and equally accurate?

**Success metric:** 3 route groups complete in ≤ time of slowest individual route (not 3x).

### Phase 4: AQE Integration (3-5 days)

**Goal:** Add automated test generation, coverage analysis, and mutation testing.

**Steps:**
1. Integrate `aqe/generate-tests` into SDET Builder phase
2. Add `aqe/analyze-coverage` to Auditor phase
3. Add `aqe/mutation-test` for "right reason" validation
4. Add `aqe/flake-detect` to identify unreliable tests
5. Add `aqe/security-scan` to Scout phase
6. Compare test quality with and without AQE

**Decision gate:** Does AQE improve test quality measurably?

**Success metric:** Coverage gaps detected that manual process missed; mutation score >80%.

### Phase 5: Optimization (ongoing)

**Goal:** Reduce cost and increase speed.

**Steps:**
1. Compile known triage patterns into Agent Booster rules
2. Add consensus voting for ambiguous bug classifications
3. Wire ruflo swarm completion to auto-trigger `mcp__bug-detector__create_bug_tickets` for seamless test→ticket pipeline
4. Enable background workers (`testgaps`, `predict`, `consolidate`)
5. Monitor token usage reduction

**Success metric:** 30%+ token reduction; triage fixes for known patterns are instant.

### Phase 6: Full Integration (optional, future)

**Goal:** Ruflo becomes the primary orchestration layer.

**Steps:**
1. Replace omni-test-orchestrator with ruflo swarm-native orchestration
2. Migrate all agent-memory to ruflo vector store (keep MEMORY.md as read-only archive)
3. Add neural ranking for test prioritization
4. Set up `flow-nexus` for cloud-based CI/CD execution
5. Add `ruv-swarm` for WASM acceleration

**Decision gate:** Only proceed if Phases 1-5 have proven value and ruflo has graduated from alpha.

---

## Appendix A — Complete Tool Reference

### Core Orchestration Tools

| Tool | Purpose |
|---|---|
| `swarm_init` | Initialize a new swarm with specified topology |
| `swarm_status` | Get real-time swarm status and metrics |
| `agent_spawn` | Create a new specialized agent |
| `agent_list` | List all active agents |
| `agent_metrics` | Performance data for agents |
| `task_orchestrate` | Distribute tasks across swarm agents |
| `task_status` | Check task progress |

### Memory & Search Tools

| Tool | Purpose |
|---|---|
| `memory_store` | Store data in vector memory |
| `memory_search` | Semantic similarity search |
| `memory_usage` | Memory utilization stats |
| `memory_list` | List stored memories |
| `memory_delete` | Remove specific memories |
| `neural_status` | Neural network status |
| `neural_train` | Train on new patterns |
| `neural_patterns` | List learned patterns |

### AgentDB Tools (20+)

| Tool | Purpose |
|---|---|
| `agentdb_hierarchical-store` | Store in tiered memory |
| `agentdb_hierarchical-recall` | Recall from tiered memory |
| `agentdb_consolidate` | Promote memory tiers |
| `agentdb_batch` | Bulk memory operations |
| `agentdb_semantic-route` | Route queries to right tier |
| `agentdb_context-synthesize` | Combine memories for context |
| `agentdb_pattern-store` | Store reusable patterns |
| `agentdb_pattern-search` | Search pattern library |
| `agentdb_causal-edge` | Track cause-effect relationships |

### RuVector Tools (PostgreSQL, optional)

| Tool | Purpose |
|---|---|
| `ruvector_search` | Vector similarity search (cosine/euclidean/dot) |
| `ruvector_insert` | Insert embeddings (batch/upsert) |
| `ruvector_update` | Update existing embeddings |
| `ruvector_delete` | Remove embeddings |
| `ruvector_create_index` | Create HNSW/IVF index |
| `ruvector_index_stats` | Index performance stats |
| `ruvector_batch_search` | Parallel multi-query search |
| `ruvector_health` | Vector store health check |

### Agentic QE Tools (16)

| Tool | Purpose |
|---|---|
| `aqe/generate-tests` | Generate tests from specs/code |
| `aqe/tdd-cycle` | Run TDD red-green-refactor cycle |
| `aqe/analyze-coverage` | Identify coverage gaps |
| `aqe/security-scan` | Security-focused test generation |
| `aqe/chaos-inject` | Chaos engineering / fault injection |
| `aqe/mutation-test` | Mutation testing for assertion quality |
| `aqe/load-test` | Performance/load test generation |
| `aqe/api-fuzz` | API fuzzing for edge cases |
| `aqe/contract-test` | Contract testing between services |
| `aqe/regression-suite` | Build regression suites from bugs |
| `aqe/flake-detect` | Identify flaky tests |
| `aqe/test-prioritize` | Prioritize tests by risk/impact |
| `aqe/snapshot-test` | Snapshot/golden file testing |
| `aqe/a11y-test` | Accessibility testing |
| `aqe/visual-regression` | Visual regression testing |
| `aqe/e2e-orchestrate` | End-to-end test orchestration |

### GitHub Integration Tools (9) — NOT used for bug tracking

> **Note:** We use our Backstage **bug-manager plugin** for ticket/issue management, not GitHub Issues. These ruflo tools are available but are **not part of our bug tracking workflow**. They may be useful for other purposes (e.g., `repo_analyze` for Scout phase, `code_review` for test code review).

| Tool | Purpose | Relevance to Us |
|---|---|---|
| `github_swarm` | Multi-agent GitHub coordination | Low — not needed |
| `repo_analyze` | Repository analysis | Medium — could enhance Scout |
| `pr_enhance` | PR enhancement/review | Low — optional |
| `issue_triage` | Issue classification | **Not used** — we use bug-manager |
| `code_review` | Multi-agent code review | Medium — review generated tests |
| `github_pr` | PR management | Low — optional |
| `github_issues` | Issue CRUD | **Not used** — we use bug-manager |
| `github_workflows` | CI/CD workflow management | Low — optional |
| `github_multi-repo` | Cross-repo operations | Low — single repo |

### Analysis & Routing Tools (9)

| Tool | Purpose |
|---|---|
| `route/task` | Route task to appropriate agent |
| `route/explain` | Explain routing decision |
| `route/coverage` | Routing coverage analysis |
| `analyze/diff` | Analyze code diffs |
| `analyze/risk` | Risk assessment |
| `analyze/classify` | Classify task type |
| `analyze/reviewers` | Suggest code reviewers |
| `analyze/file-risk` | Per-file risk scoring |
| `analyze/stats` | Analysis statistics |

### Consensus Tools

| Tool | Purpose |
|---|---|
| `consensus_init` | Initialize consensus protocol |
| `consensus_vote` | Submit a vote |
| `consensus_result` | Get consensus outcome |

### Issue Management Tools (10)

| Tool | Purpose |
|---|---|
| `issues/list` | List all issues |
| `issues/claim` | Claim an issue for work |
| `issues/release` | Release claimed issue |
| `issues/handoff` | Hand off issue to another agent |
| `issues/status` | Update issue status |
| `issues/stealable` | List issues that can be reassigned |
| `issues/steal` | Take over another agent's issue |
| `issues/load` | Check agent workload |
| `issues/rebalance` | Redistribute work |
| `issues/board` | Kanban-style board view |

### Background Workers (12)

| Worker | Priority | Purpose |
|---|---|---|
| `ultralearn` | Highest | Accelerated pattern learning |
| `optimize` | High | Code/config optimization |
| `audit` | High | Background security auditing |
| `testgaps` | High | Missing test coverage identification |
| `consolidate` | Medium | Memory tier promotion |
| `predict` | Medium | Predict likely test failures |
| `deepdive` | Medium | Deep analysis of complex issues |
| `refactor` | Medium | Code improvement suggestions |
| `map` | Low | Dependency mapping |
| `preload` | Low | Pre-cache likely needed data |
| `document` | Low | Auto-documentation |
| `benchmark` | Low | Performance benchmarking |

---

## Appendix B — Agent Type Catalog

Ruflo provides 60+ specialized agent types. The most relevant for our API testing platform:

### Directly Relevant

| Agent Type | Role | How We'd Use It |
|---|---|---|
| `tester` | Test execution and validation | Enhance our execution-runner |
| `reviewer` | Code review | Review generated test code |
| `planner` | Task planning | Enhance our strategic-test-architect |
| `researcher` | Information gathering | Enhance our omni-scan-scout |
| `security-architect` | Security analysis | WAF and injection pattern discovery |
| `coder` | Code generation | Enhance our SDET builder |

### Potentially Useful

| Agent Type | Role | Potential Use |
|---|---|---|
| `queen-coordinator` | Swarm leader | Replace manual orchestrator coordination |
| `memory-specialist` | Memory management | Optimize knowledge persistence |
| `byzantine-coordinator` | Fault-tolerant coordination | Consensus for bug classification |
| `performance-benchmarker` | Performance analysis | API load testing |
| `pr-manager` | PR lifecycle | Auto-PR for test improvements |
| `release-manager` | Release coordination | Track which bugs block releases |
| `code-review-swarm` | Multi-agent review | Multiple reviewers for test quality |

---

## Summary

Ruflo is a powerful orchestration layer that complements our existing API testing infrastructure. The highest-value integration points, in priority order:

1. **Shared vector memory** (Phase 2) — eliminates redundant pattern discovery across agents. Immediate ROI.
2. **Parallel pipeline execution** (Phase 3) — test multiple route groups simultaneously. 2-3x time savings.
3. **Agentic QE tools** (Phase 4) — automated coverage analysis, mutation testing, fuzzing. Quality improvement.
4. **Agent Booster** (Phase 5) — instant fixes for known test bugs. Cost reduction.
5. **Consensus engine** (Phase 5) — more reliable bug classification. Accuracy improvement.
6. **Automated ticket pipeline** (Phase 5) — swarm completion auto-triggers bug-detector → bug-manager. No manual step.

**Start with Phase 1 (evaluate)** before committing to deeper integration. The alpha status means ruflo should be treated as an enhancement, not a dependency. Keep the existing pipeline as a fully functional fallback.
