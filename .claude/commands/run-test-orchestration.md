# Multi-Agent API Testing Framework: `{{route_group}}`

> This document outlines the specialized agent roles and workflows required to test the **`{{route_group}}`** route group.

---

## 🕵️ 1. Omni Scan Scout Agent — Discovery & Analysis

**Role:** The Scout serves as the initial reconnaissance layer.

**Responsibilities:**
- Scan the target test repository for existing code patterns and legacy test implementations.
- Discover existing documentation, OpenAPI/Swagger specifications, or READMEs related to `{{route_group}}`.
- Extract and list all technical requirements, boundary conditions, and edge cases needed to create a comprehensive test suite.

---

## 📐 2. Strategic Test Architect Agent — Design & Strategy

**Role:** The Architect defines the structural integrity and strategic approach of the test plan.

**Responsibilities:**
- Ingest the requirements from the Scout to design a robust, scalable test architecture.
- Define the test data strategy, dependency mocking, and environment configuration.
- Create a high-level test plan ensuring all `{{route_group}}` endpoints are covered with modularity, reusability, and maintenance in mind.

---

## 🛠️ 3. Test Builder Agent — Code Generation

**Role:** The Builder is the primary developer responsible for the technical implementation of the suite.

**Responsibilities:**
- Implement the actual test logic based on the Architect's design using designated frameworks (e.g., `pytest`).
- Generate executable code, utility functions, and integration scripts.
- Create necessary data payloads and configuration files (e.g., JSON schemas) specifically tailored for `{{route_group}}` requests.

---

## 🚀 4. Execution Runner Agent — Operations

**Role:** The Runner manages the lifecycle of the test execution environment.

**Responsibilities:**
- Trigger the execution of the test suite created by the Builder in the target environment.
- Manage environment variables, authentication tokens, and session states during the run.
- Capture and stream all output data, including status codes, response headers, and performance metrics.

---
---
## 🚀 4. Test Triage Repair Agent — Operations

**Role:** Responsible for fixing the test if there is any issue with the test code

**Responsibilities:**
- Check if the test are failing
- If the test are failing check if they are failing due to a syntax or logic issue in the test implementation
- If the test is failing due to a bug in the actual implementation i.e the tested code then report it to Auditor
- If there is any bugs in the test implementation then fix the test implementation and rerun the test
---
## ⚖️ 5. Auditor Agent — Validation & Quality Assurance

**Role:** The Auditor is the final gatekeeper and reporting specialist.

**Responsibilities:**
- Cross-validate test results against the initial requirements identified by the Scout.
- Perform a static and dynamic quality check on the test code and execution logs.
- Generate a formal **Test Audit Report** summarizing the health, coverage, and performance of the `{{route_group}}` route group.

---

## Agent Workflow Summary

```
Scout → Architect → Test Builder → Execution Runner-> Test Triage Repair Agent → Auditor
  ↓          ↓            ↓               ↓                     ↓                  ↓
Discovery  Design    Code Gen         Run Tests          Test issues fixed     QA of test Report                                                      Actual bugs
```
