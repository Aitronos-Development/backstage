/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Request, Response } from 'express';
import { Logger } from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import { listTestCases } from './fileStore';
import { buildMcpVariables } from './variableResolver';
import * as historyStore from './historyStore';
import type { TestCase, ExecutionResult } from './types';

interface SimplifiedOrchestratorRun {
  runId: string;
  routeGroup: string;
  timestamp: Date;
  duration?: number;
  status: 'running' | 'completed' | 'failed';
  phases: {
    execution: 'pending' | 'running' | 'completed';
    audit: 'pending' | 'running' | 'completed';
    report: 'pending' | 'running' | 'completed';
  };
  results?: {
    totalTests: number;
    passed: number;
    failed: number;
    errors: any[];
  };
  metadata?: any;
}

/**
 * Run tests with simplified orchestrator flow
 */
export async function runTestsWithOrchestrator(
  req: Request,
  res: Response,
  logger: Logger,
  config: any
) {
  const routeGroup = `/${req.params.routeGroup}`;
  const { environment = 'develop', metadata = {} } = req.body || {};

  // Generate run ID
  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const startTime = Date.now();

  const run: SimplifiedOrchestratorRun = {
    runId,
    routeGroup,
    timestamp: new Date(),
    status: 'running',
    phases: {
      execution: 'pending',
      audit: 'pending',
      report: 'pending',
    },
    metadata: {
      ...metadata,
      environment,
      triggeredBy: 'manual-ui',
    },
  };

  logger.info(`[Orchestrator ${runId}] Starting simplified test run for ${routeGroup}`);

  // Start async execution
  executeTestsAsync(run, routeGroup, environment, config, logger);

  // Return immediately with run ID
  res.json({
    runId,
    routeGroup,
    status: 'started',
    message: 'Test orchestration initiated',
  });
}

/**
 * Execute tests asynchronously
 */
async function executeTestsAsync(
  run: SimplifiedOrchestratorRun,
  routeGroup: string,
  environment: string,
  config: any,
  logger: Logger
) {
  const startTime = Date.now();

  try {
    // Phase 1: EXECUTION - Run all tests
    run.phases.execution = 'running';
    logger.info(`[Orchestrator ${run.runId}] Phase 1: Running tests...`);

    const testCases = await listTestCases(routeGroup);
    const variables = await buildMcpVariables(config, environment, logger);

    const results: ExecutionResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
      try {
        const result = await executeTestCase(testCase, variables, config, environment);

        if (result.result === 'pass') {
          passed++;
        } else {
          failed++;
        }

        results.push(result);

        // Save to history
        await saveTestExecution(routeGroup, testCase.id, result);

      } catch (error) {
        logger.error(`[Orchestrator ${run.runId}] Test ${testCase.id} failed:`, error);
        failed++;
        results.push({
          testCaseId: testCase.id,
          testCaseName: testCase.name,
          result: 'fail',
          error: error instanceof Error ? error.message : String(error),
        } as ExecutionResult);
      }
    }

    run.phases.execution = 'completed';
    run.results = {
      totalTests: testCases.length,
      passed,
      failed,
      errors: results.filter(r => r.result === 'fail'),
    };

    // Phase 2: AUDIT - Analyze results
    run.phases.audit = 'running';
    logger.info(`[Orchestrator ${run.runId}] Phase 2: Auditing results...`);

    const auditSummary = {
      totalTests: testCases.length,
      passed,
      failed,
      passRate: Math.round((passed / testCases.length) * 100),
      performanceGrade: getPerformanceGrade(passed, testCases.length),
      criticalFailures: results.filter(r => r.result === 'fail' && r.statusCode >= 500),
    };

    run.phases.audit = 'completed';

    // Phase 3: REPORT - Generate and save report
    run.phases.report = 'running';
    logger.info(`[Orchestrator ${run.runId}] Phase 3: Generating report...`);

    const duration = Date.now() - startTime;
    run.duration = duration;
    run.status = 'completed';

    // Save orchestrator history
    await saveOrchestratorHistory(run, auditSummary);

    run.phases.report = 'completed';

    logger.info(`[Orchestrator ${run.runId}] Completed in ${duration}ms. Passed: ${passed}/${testCases.length}`);

  } catch (error) {
    logger.error(`[Orchestrator ${run.runId}] Failed:`, error);
    run.status = 'failed';
    run.duration = Date.now() - startTime;
  }
}

/**
 * Execute a single test case
 */
async function executeTestCase(
  testCase: TestCase,
  variables: Record<string, string>,
  config: any,
  environment: string
): Promise<ExecutionResult> {
  // This is a simplified version - in reality you'd call the actual test executor
  // For now, we'll simulate it
  const startTime = Date.now();

  try {
    // Build request URL
    const envConfig = config.environments[environment];
    const baseUrl = envConfig?.baseUrl || 'http://localhost:8000';
    const url = `${baseUrl}${testCase.path}`;

    // Make HTTP request
    const response = await fetch(url, {
      method: testCase.method,
      headers: {
        ...testCase.headers,
        'Content-Type': 'application/json',
      },
      body: testCase.body ? JSON.stringify(testCase.body) : undefined,
    });

    const responseBody = await response.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(responseBody);
    } catch {
      parsedBody = responseBody;
    }

    const duration = Date.now() - startTime;

    // Check assertions
    const passed = response.status === (testCase.assertions?.status_code || 200);

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      result: passed ? 'pass' : 'fail',
      statusCode: response.status,
      responseTimeMs: duration,
      response: parsedBody,
      error: passed ? undefined : `Expected status ${testCase.assertions?.status_code}, got ${response.status}`,
    };

  } catch (error) {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      result: 'fail',
      error: error instanceof Error ? error.message : String(error),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Save test execution to history
 */
async function saveTestExecution(
  routeGroup: string,
  testCaseId: string,
  result: ExecutionResult
): Promise<void> {
  const record = {
    id: `exec-${Math.random().toString(36).substring(2)}`,
    timestamp: new Date().toISOString(),
    initiator: 'orchestrator' as const,
    test_case_id: testCaseId,
    test_case_name: result.testCaseName,
    route_group: routeGroup,
    result: result.result,
    duration_ms: result.responseTimeMs,
    request: {
      method: 'GET', // Would come from test case
      url: '', // Would be constructed
      headers: {},
    },
    response: {
      status_code: result.statusCode || 0,
      headers: {},
      body: result.response,
    },
    failure_reason: result.error || null,
  };

  await historyStore.append(routeGroup, testCaseId, record);
}

/**
 * Save orchestrator run history
 */
async function saveOrchestratorHistory(
  run: SimplifiedOrchestratorRun,
  auditSummary: any
): Promise<void> {
  const historyPath = path.join(process.cwd(), 'api-tests/.history');
  const routeDir = path.join(historyPath, run.routeGroup.replace(/\//g, '-'));

  // Ensure directory exists
  await fsp.mkdir(routeDir, { recursive: true });

  // Prepare history entry
  const historyEntry = {
    runId: run.runId,
    route: run.routeGroup,
    timestamp: run.timestamp,
    duration: run.duration,
    phases: {
      execution: {
        completed: true,
        totalTests: run.results?.totalTests,
        passed: run.results?.passed,
        failed: run.results?.failed,
      },
      audit: {
        completed: true,
        ...auditSummary,
      },
    },
    certificate: {
      route: run.routeGroup,
      timestamp: run.timestamp,
      totalTests: run.results?.totalTests || 0,
      passed: run.results?.passed || 0,
      failed: run.results?.failed || 0,
      passRate: auditSummary.passRate,
      performanceGrade: auditSummary.performanceGrade,
      criticalIssues: auditSummary.criticalFailures,
    },
    metadata: run.metadata,
  };

  // Save to JSONL
  const historyFile = path.join(routeDir, 'history.jsonl');
  await fsp.appendFile(historyFile, JSON.stringify(historyEntry) + '\n', 'utf8');

  // Save individual run
  const runFile = path.join(routeDir, `${run.runId}.json`);
  await fsp.writeFile(runFile, JSON.stringify(historyEntry, null, 2), 'utf8');

  // Update latest
  const latestFile = path.join(routeDir, 'latest.json');
  await fsp.writeFile(latestFile, JSON.stringify(historyEntry, null, 2), 'utf8');
}

/**
 * Get performance grade based on pass rate
 */
function getPerformanceGrade(passed: number, total: number): string {
  const rate = (passed / total) * 100;
  if (rate >= 90) return 'A';
  if (rate >= 80) return 'B';
  if (rate >= 70) return 'C';
  if (rate >= 60) return 'D';
  return 'F';
}

/**
 * Get status of a simplified orchestrator run
 */
export async function getSimplifiedOrchestratorStatus(
  req: Request,
  res: Response
): Promise<void> {
  const { runId } = req.params;
  const routeGroup = req.query.routeGroup as string;

  if (!routeGroup) {
    res.status(400).json({ error: 'routeGroup query parameter required' });
    return;
  }

  const historyPath = path.join(
    process.cwd(),
    'api-tests/.history',
    routeGroup.replace(/\//g, '-'),
    `${runId}.json`
  );

  if (fs.existsSync(historyPath)) {
    const history = JSON.parse(await fsp.readFile(historyPath, 'utf8'));
    res.json(history);
  } else {
    res.status(404).json({ error: 'Run not found' });
  }
}