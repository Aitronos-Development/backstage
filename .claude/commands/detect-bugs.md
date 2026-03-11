# Detect Bugs - Comprehensive API Testing Workflow

You are the Omni-Test Chief Orchestrator. Execute a comprehensive API testing workflow for the specified route group.

## Mission Parameters
- **Target Route**: {{ROUTE}}
- **Test Mode**: Comprehensive (Happy Path + Sad Path + Security Edge Cases)
- **Auto-Execute**: Yes (no human intervention required)

## Execution Workflow

### Phase 1: RECONNAISSANCE (Scout Agent)
Use the MCP tool `mcp__api-testing__discover_with_scout` to scan all files related to the parent route. The Scout will:
- Identify every endpoint, controller logic, and database model
- Generate a complete API_MANIFEST
- Map file locations and dependencies

### Phase 2: STRATEGY (Architect Agent)
Use the MCP tool `mcp__api-testing__analyze_with_architect` to design the test plan. The Architect will:
- Analyze the API_MANIFEST from Scout
- Design test scenarios for Happy Paths, Sad Paths, and High-Risk Logic Edges
- Map specific if/else blocks to test cases
- Identify potential security vulnerabilities (IDOR, race conditions, etc.)

### Phase 3: CONSTRUCTION (Test Creation)
Use the MCP tool `mcp__api-testing__create_test_case` to implement the Architect's plan:
- Create test scripts based on the strategic plan
- Ensure idempotency and data isolation
- Validate against Scout's discovered endpoints (no hallucinated endpoints)

### Phase 4: EXECUTION (Test Runner)
Use the MCP tool `mcp__api-testing__run_test_cases` to execute the test suite:
- Run all test cases for the route group
- Capture all logs, status codes, and traces
- Document response times and performance metrics

### Phase 5: VERDICT (Quality Auditor)
Analyze the test results to determine:
- **BUGS**: Actual defects in the application code
- **FLAKES**: Environment or timing issues
- **INVALID_TESTS**: Test script errors

### Phase 6: BUG FILING (Bug Manager Integration)
For each confirmed BUG:
1. Create a detailed bug report with:
   - Title: Clear description of the issue
   - Description: Steps to reproduce, expected vs actual behavior
   - Priority: Based on severity and impact
   - Evidence: Logs, traces, and test results
2. File the bug in the Bug Manager plugin
3. Track the bug ID for future reference

## Mission Progress Indicators
Display progress as:
```
[RECON] ████████░░ 80% - Scanning controllers...
[STRATEGY] ██████░░░░ 60% - Analyzing edge cases...
[BUILD] ████░░░░░░ 40% - Creating test scripts...
[EXECUTE] ██░░░░░░░░ 20% - Running tests...
[AUDIT] ░░░░░░░░░░ 0% - Awaiting results...
```

## Error Handling & Feedback Loops
- If Auditor flags [INVALID_TEST]: Auto-fix the test script and re-run
- If Runner fails to start: Attempt port/config fix and retry
- If Scout finds no endpoints: Report back and ask for route verification

## Final Output: Quality Certificate
```
════════════════════════════════════════════
       QUALITY CERTIFICATE
       Route: {{ROUTE}}
════════════════════════════════════════════
Total Tests Executed: X
✅ Passed: X
🐛 Bugs Found: X (Filed: BUG-XXX, BUG-YYY)
🔄 Flaky Tests: X
❌ Invalid Tests: X

Code Coverage: XX%
Performance Grade: A/B/C/D/F

Critical Issues:
• [BUG-XXX] Authentication bypass in /api/v1/users
• [BUG-YYY] Race condition in payment processing

Next Steps:
1. Fix critical bugs (BUG-XXX, BUG-YYY)
2. Re-run flaky tests after environment stabilization
3. Add missing test scenarios for uncovered code

Generated with Claude Code
════════════════════════════════════════════
```

## Important Notes
- Only interrupt the user if there's a fundamental blocker (missing API keys, inaccessible repository)
- Provide continuous progress updates without requiring user input
- Automatically handle retries and error recovery
- Focus on actionable results and clear bug reports