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
import express from 'express';
import Router from 'express-promise-router';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Duplex } from 'node:stream';
import { InputError, NotFoundError } from '@backstage/errors';
import {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { WebSocketServer, WebSocket } from 'ws';
import {
  listTestCases,
  readTestCase,
  getApiTestsDir,
  invalidateCache,
} from './fileStore';
import * as historyStore from './historyStore';
import { buildExecutionRecord } from './historyStore';
import {
  resolveVariables,
  extractVariablePlaceholders,
} from './variableResolution';
import type { TestCase } from './types';

export interface RouterOptions {
  logger: LoggerService;
  config: RootConfigService;
}

interface ApiTestingEnvironment {
  baseUrl: string;
  variables: Record<string, string>;
}

interface ApiTestingConfig {
  defaultEnvironment: string;
  environments: Record<string, ApiTestingEnvironment>;
}

function readApiTestingConfig(config: RootConfigService): ApiTestingConfig {
  const result: ApiTestingConfig = {
    defaultEnvironment: 'develop',
    environments: {},
  };

  try {
    const section = config.getOptionalConfig('apiTesting');
    if (!section) return result;

    result.defaultEnvironment =
      section.getOptionalString('defaultEnvironment') ?? 'develop';

    const envsConfig = section.getOptionalConfig('environments');
    if (envsConfig) {
      for (const envName of envsConfig.keys()) {
        const envSection = envsConfig.getConfig(envName);
        const baseUrl = envSection.getOptionalString('baseUrl') ?? '';
        const vars: Record<string, string> = {};

        const varsSection = envSection.getOptionalConfig('variables');
        if (varsSection) {
          for (const key of varsSection.keys()) {
            vars[key] = varsSection.getString(key);
          }
        }

        result.environments[envName] = { baseUrl, variables: vars };
      }
    }
  } catch {
    // Config section missing or malformed — use defaults
  }

  return result;
}

interface ExecutionResult {
  pass: boolean;
  statusCode: number;
  expectedStatusCode: number | undefined;
  responseTime: number;
  details: {
    bodyContainsFailures?: Record<string, { expected: unknown; actual: unknown }>;
    missingFields?: string[];
    responseBody?: unknown;
  };
  // Captured request/response for history recording
  _request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  _response: {
    status_code: number;
    headers: Record<string, string>;
    body?: unknown;
  };
  _failureReason: string | null;
}

// Track running executions for abort support
const runningExecutions = new Map<string, AbortController>();

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;
  const router = Router();
  const apiTestingConfig = readApiTestingConfig(config);
  router.use(express.json());

  // --- WebSocket setup ---
  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    wsClients.add(ws);
    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
  });

  wss.on('error', (error: Error) => {
    logger.error(`WebSocket server error: ${error}`);
  });

  function broadcast(message: object): void {
    const data = JSON.stringify(message);
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // File watcher for real-time updates
  const apiTestsDir = getApiTestsDir();
  if (!fs.existsSync(apiTestsDir)) {
    fs.mkdirSync(apiTestsDir, { recursive: true });
  }

  try {
    fs.watch(apiTestsDir, (_, filename) => {
      if (filename && filename.endsWith('.json') && !filename.endsWith('.tmp')) {
        const routeGroup = `/${  filename.replace(/\.json$/, '').replace(/-/g, '/')}`;
        invalidateCache(routeGroup);
        broadcast({ type: 'test-cases-changed', routeGroup });
      }
    });
  } catch {
    logger.warn('fs.watch not available for api-tests directory');
  }

  // WebSocket upgrade middleware — registers the upgrade handler on the raw HTTP server
  let subscribedToUpgrade = false;

  const handleUpgrade = (
    request: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    // Only handle requests to the api-testing WebSocket endpoint
    if (!request.url || !request.url.includes('/api/api-testing/ws')) {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      wss.emit('connection', ws, request);
    });
  };

  router.use((req, _res, next) => {
    const server: http.Server | undefined = (req.socket as any)?.server;
    if (
      subscribedToUpgrade ||
      !server ||
      !req.headers ||
      req.headers.upgrade === undefined ||
      req.headers.upgrade.toLowerCase() !== 'websocket'
    ) {
      next();
      return;
    }

    subscribedToUpgrade = true;
    server.on('upgrade', handleUpgrade);
    next();
  });

  // --- Health check ---
  router.get('/health', (_, res) => {
    res.json({ status: 'ok' });
  });

  // --- API Testing config (environments + variables) ---
  router.get('/config', (_, res) => {
    res.json(apiTestingConfig);
  });

  // --- Extract variable placeholders from a test case ---
  router.post('/variables/extract', async (req, res) => {
    const { testCaseId, routeGroup } = req.body;
    if (!testCaseId || !routeGroup) {
      throw new InputError('testCaseId and routeGroup are required');
    }
    const testCase = await readTestCase(routeGroup, testCaseId);
    if (!testCase) {
      throw new NotFoundError(
        `Test case '${testCaseId}' not found in '${routeGroup}'`,
      );
    }
    res.json({ variables: extractVariablePlaceholders(testCase) });
  });

  // --- List all route groups ---
  router.get('/route-groups', async (_, res) => {
    const dir = getApiTestsDir();
    if (!fs.existsSync(dir)) {
      res.json([]);
      return;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const routeGroups: string[] = [];

    for (const file of files) {
      const routeGroup = `/${  file.replace(/\.json$/, '').replace(/-/g, '/')}`;
      routeGroups.push(routeGroup);
    }

    res.json(routeGroups);
  });

  // --- Get single test case (must be registered before the wildcard list route) ---
  router.get('/test-cases/:routeGroup(*)/:id', async (req, res) => {
    const routeGroup = `/${  req.params.routeGroup}`;
    const testCase = await readTestCase(routeGroup, req.params.id);
    if (!testCase) {
      throw new NotFoundError(
        `Test case '${req.params.id}' not found in '${routeGroup}'`,
      );
    }
    res.json(testCase);
  });

  // --- List test cases for a route group ---
  router.get('/test-cases/:routeGroup(*)', async (req, res) => {
    const routeGroup = `/${  req.params.routeGroup}`;
    const testCases = await listTestCases(routeGroup);
    res.json(testCases);
  });

  // --- Execute a test case ---
  router.post('/execute', async (req, res) => {
    const { testCaseId, routeGroup, variables, environment } = req.body;

    if (!testCaseId || !routeGroup) {
      throw new InputError('testCaseId and routeGroup are required');
    }

    const testCase = await readTestCase(routeGroup, testCaseId);
    if (!testCase) {
      throw new NotFoundError(
        `Test case '${testCaseId}' not found in '${routeGroup}'`,
      );
    }

    // Build merged variables: app-config environment < caller-provided
    const envName = environment || apiTestingConfig.defaultEnvironment;
    const envConfig = apiTestingConfig.environments[envName];
    const mergedVariables: Record<string, string> = {};
    if (envConfig) {
      if (envConfig.baseUrl) mergedVariables.base_url = envConfig.baseUrl;
      Object.assign(mergedVariables, envConfig.variables);
    }
    Object.assign(mergedVariables, variables || {});

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    runningExecutions.set(executionId, controller);

    try {
      const result = testCase.method === 'FLOW'
        ? await executeFlowTest(testCase, controller.signal)
        : await executeTestCase(testCase, mergedVariables, controller.signal);

      // Write history record
      const record = buildExecutionRecord({
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        routeGroup,
        initiator: 'user',
        durationMs: result.responseTime,
        pass: result.pass,
        failureReason: result._failureReason,
        request: result._request,
        response: result._response,
      });
      await historyStore.append(routeGroup, testCase.id, record);

      // Broadcast execution-completed event
      broadcast({
        type: 'execution-completed',
        routeGroup,
        testCaseId: testCase.id,
        record,
      });

      res.json({ executionId, pass: result.pass, statusCode: result.statusCode, expectedStatusCode: result.expectedStatusCode, responseTime: result.responseTime, details: result.details });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        res.json({ executionId, aborted: true, pass: false, statusCode: 0, responseTime: 0, details: {} });
      } else {
        throw err;
      }
    } finally {
      runningExecutions.delete(executionId);
    }
  });

  // --- Run all test cases for a route group ---
  router.post('/execute-all', async (req, res) => {
    const { routeGroup, variables, environment } = req.body;

    if (!routeGroup) {
      throw new InputError('routeGroup is required');
    }

    // Build merged variables: app-config environment < caller-provided
    const envName = environment || apiTestingConfig.defaultEnvironment;
    const envConfig = apiTestingConfig.environments[envName];
    const mergedVariables: Record<string, string> = {};
    if (envConfig) {
      if (envConfig.baseUrl) mergedVariables.base_url = envConfig.baseUrl;
      Object.assign(mergedVariables, envConfig.variables);
    }
    Object.assign(mergedVariables, variables || {});

    const testCases = await listTestCases(routeGroup);
    const results: Array<{ testCaseId: string; result: { pass: boolean; statusCode: number; expectedStatusCode: number | undefined; responseTime: number; details: ExecutionResult['details'] } }> = [];

    for (const tc of testCases) {
      const controller = new AbortController();
      try {
        const result = tc.method === 'FLOW'
          ? await executeFlowTest(tc, controller.signal)
          : await executeTestCase(tc, mergedVariables, controller.signal);

        // Write history record
        const record = buildExecutionRecord({
          testCaseId: tc.id,
          testCaseName: tc.name,
          routeGroup,
          initiator: 'user',
          durationMs: result.responseTime,
          pass: result.pass,
          failureReason: result._failureReason,
          request: result._request,
          response: result._response,
        });
        await historyStore.append(routeGroup, tc.id, record);

        broadcast({
          type: 'execution-completed',
          routeGroup,
          testCaseId: tc.id,
          record,
        });

        results.push({ testCaseId: tc.id, result: { pass: result.pass, statusCode: result.statusCode, expectedStatusCode: result.expectedStatusCode, responseTime: result.responseTime, details: result.details } });
      } catch {
        results.push({
          testCaseId: tc.id,
          result: {
            pass: false,
            statusCode: 0,
            expectedStatusCode: tc.assertions.status_code,
            responseTime: 0,
            details: { responseBody: 'Execution error' },
          },
        });
      }
    }

    res.json(results);
  });

  // --- Stop a running test ---
  router.post('/stop', async (req, res) => {
    const { executionId } = req.body;
    if (!executionId) {
      throw new InputError('executionId is required');
    }

    const controller = runningExecutions.get(executionId);
    if (controller) {
      controller.abort();
      runningExecutions.delete(executionId);
      res.json({ stopped: true });
    } else {
      res.json({ stopped: false, message: 'Execution not found or already completed' });
    }
  });

  // --- History: per-endpoint ---
  router.get('/history/:routeGroup(*)/:testCaseId', async (req, res) => {
    const routeGroup = `/${  req.params.routeGroup}`;
    const { testCaseId } = req.params;
    const initiator = req.query.initiator as 'user' | 'agent' | undefined;
    const result = req.query.result as 'pass' | 'fail' | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const records = await historyStore.query(routeGroup, testCaseId, {
      initiator,
      result,
      limit,
      offset,
    });
    res.json(records);
  });

  // --- History: route group overview ---
  router.get('/history/:routeGroup(*)', async (req, res) => {
    const routeGroup = `/${  req.params.routeGroup}`;
    const initiator = req.query.initiator as 'user' | 'agent' | undefined;
    const result = req.query.result as 'pass' | 'fail' | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const records = await historyStore.queryGroup(routeGroup, {
      initiator,
      result,
      limit,
      offset,
    });
    res.json(records);
  });

  return router;
}

// eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
const FLOW_TESTS_DIR = path.resolve(__dirname, '../../../../test-repositories/Freddy.Backend.Tests');

async function executeFlowTest(
  testCase: TestCase,
  signal: AbortSignal,
): Promise<ExecutionResult> {
  const pytestNodeId = testCase.path;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const proc = spawn(
      'uv',
      ['run', 'pytest', pytestNodeId, '-v', '--tb=short', '--no-header'],
      { cwd: FLOW_TESTS_DIR, env: { ...process.env } },
    );

    let stdout = '';
    let stderr = '';

    const onAbort = () => proc.kill();
    signal.addEventListener('abort', onAbort);

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('close', code => {
      signal.removeEventListener('abort', onAbort);
      const responseTime = Date.now() - start;
      const pass = code === 0;
      const output = `${stdout}\n${stderr}`.trim();

      // Extract failure lines from pytest output
      const failureLines = output
        .split('\n')
        .filter(
          l =>
            l.includes('FAILED') ||
            l.includes('AssertionError') ||
            l.includes('assert '),
        );
      const failureReason = pass
        ? null
        : failureLines.length > 0
          ? failureLines.join('; ')
          : output.slice(-500);

      resolve({
        pass,
        statusCode: pass ? 200 : 500,
        expectedStatusCode: 200,
        responseTime,
        details: { responseBody: output },
        _request: { method: 'FLOW', url: pytestNodeId, headers: {} },
        _response: {
          status_code: code ?? 1,
          headers: {},
          body: output,
        },
        _failureReason: failureReason,
      });
    });

    proc.on('error', err => {
      signal.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

async function executeTestCase(
  testCase: TestCase,
  variables: Record<string, string>,
  signal: AbortSignal,
): Promise<ExecutionResult> {
  const resolvedPath = resolveVariables(testCase.path, variables) as string;
  const baseUrl = variables.base_url || 'http://localhost:7007';
  const url = `${baseUrl}${resolvedPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (testCase.headers) {
    const resolved = resolveVariables(testCase.headers, variables) as Record<
      string,
      unknown
    >;
    for (const [k, v] of Object.entries(resolved)) {
      headers[k] = String(v);
    }
  }

  const timeoutSignal = AbortSignal.timeout(30_000);
  const combinedSignal = AbortSignal.any([signal, timeoutSignal]);

  let requestBody: unknown;
  const fetchOptions: RequestInit = {
    method: testCase.method,
    headers,
    signal: combinedSignal,
  };

  if (testCase.body && ['POST', 'PUT', 'PATCH'].includes(testCase.method)) {
    requestBody = resolveVariables(
      testCase.body as Record<string, unknown>,
      variables,
    );
    fetchOptions.body = JSON.stringify(requestBody);
  }

  const start = Date.now();
  const response = await fetch(url, fetchOptions);
  const responseTime = Date.now() - start;

  let responseBody: unknown;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    responseBody = await response.json();
  } else {
    responseBody = await response.text();
  }

  // Collect response headers
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  // Evaluate assertions
  let pass = true;
  const failureReasons: string[] = [];
  const details: ExecutionResult['details'] = { responseBody };

  // Status code assertion
  if (testCase.assertions.status_code !== undefined) {
    if (response.status !== testCase.assertions.status_code) {
      pass = false;
      failureReasons.push(
        `Expected status ${testCase.assertions.status_code}, got ${response.status}`,
      );
    }
  }

  // Body contains assertion
  if (testCase.assertions.body_contains && typeof responseBody === 'object' && responseBody !== null) {
    const failures: Record<string, { expected: unknown; actual: unknown }> = {};
    for (const [key, expected] of Object.entries(testCase.assertions.body_contains)) {
      const actual = (responseBody as Record<string, unknown>)[key];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures[key] = { expected, actual };
        pass = false;
        failureReasons.push(
          `Body field '${key}': expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }
    if (Object.keys(failures).length > 0) {
      details.bodyContainsFailures = failures;
    }
  }

  // Body schema assertion
  if (testCase.assertions.body_schema?.required_fields && typeof responseBody === 'object' && responseBody !== null) {
    const missing = testCase.assertions.body_schema.required_fields.filter(
      field => !(field in (responseBody as Record<string, unknown>)),
    );
    if (missing.length > 0) {
      details.missingFields = missing;
      pass = false;
      failureReasons.push(
        `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
    }
  }

  return {
    pass,
    statusCode: response.status,
    expectedStatusCode: testCase.assertions.status_code,
    responseTime,
    details,
    _request: {
      method: testCase.method,
      url,
      headers,
      ...(requestBody !== undefined && { body: requestBody }),
    },
    _response: {
      status_code: response.status,
      headers: responseHeaders,
      ...(responseBody !== undefined && { body: responseBody }),
    },
    _failureReason: failureReasons.length > 0 ? failureReasons.join('; ') : null,
  };
}
