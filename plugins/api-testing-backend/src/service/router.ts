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
import * as environmentStore from './environmentStore';
import { buildExecutionRecord } from './historyStore';
import type { FlowStepLog } from './historyTypes';
import {
  resolveVariables,
  extractVariablePlaceholders,
} from './variableResolution';
import type { TestCase } from './types';

export interface RouterOptions {
  logger: LoggerService;
  config: RootConfigService;
}

interface SetupStep {
  name: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  capture: Record<string, string>; // varName -> responseJsonPath
  allowFailure?: boolean; // if true, step failure is logged but doesn't abort
}

interface ApiTestingEnvironment {
  baseUrl: string;
  variables: Record<string, string>;
  setup?: SetupStep[];
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

  const section = config.getOptionalConfig('apiTesting');
  if (!section) return result;

  result.defaultEnvironment =
    section.getOptionalString('defaultEnvironment') ?? 'develop';

  const envsConfig = section.getOptionalConfig('environments');
  if (!envsConfig) return result;

  for (const envName of envsConfig.keys()) {
    try {
      const envSection = envsConfig.getConfig(envName);
      const baseUrl = envSection.getOptionalString('baseUrl') ?? '';
      const vars: Record<string, string> = {};

      const varsSection = envSection.getOptionalConfig('variables');
      if (varsSection) {
        for (const key of varsSection.keys()) {
          const raw = varsSection.getOptional(key);
          vars[key] = raw != null ? String(raw) : '';
        }
      }

      // Parse setup steps
      const setupSteps: SetupStep[] = [];
      const setupConfig = envSection.getOptionalConfigArray('setup');
      if (setupConfig) {
        for (const stepSection of setupConfig) {
          const capture: Record<string, string> = {};
          const captureSection =
            stepSection.getOptionalConfig('capture');
          if (captureSection) {
            for (const k of captureSection.keys()) {
              capture[k] = captureSection.getString(k);
            }
          }

          const body: Record<string, unknown> = {};
          const bodySection = stepSection.getOptionalConfig('body');
          if (bodySection) {
            for (const k of bodySection.keys()) {
              // Use raw accessor to avoid Backstage config type coercion errors
              const raw = bodySection.getOptional(k);
              if (raw !== undefined) {
                body[k] = raw; // preserves native types (number, boolean, string)
              }
            }
          }

          const stepHeaders: Record<string, string> = {};
          const headersSection =
            stepSection.getOptionalConfig('headers');
          if (headersSection) {
            for (const k of headersSection.keys()) {
              stepHeaders[k] = headersSection.getString(k);
            }
          }

          const allowFailure =
            stepSection.getOptionalBoolean('allowFailure') ?? false;

          setupSteps.push({
            name: stepSection.getString('name'),
            method: stepSection.getString('method'),
            path: stepSection.getString('path'),
            ...(Object.keys(stepHeaders).length > 0 && {
              headers: stepHeaders,
            }),
            ...(Object.keys(body).length > 0 && { body }),
            capture,
            ...(allowFailure && { allowFailure }),
          });
        }
      }

      result.environments[envName] = {
        baseUrl,
        variables: vars,
        ...(setupSteps.length > 0 && { setup: setupSteps }),
      };
    } catch (err) {
      // Log but continue parsing other environments
      console.error(
        `[api-testing] Failed to parse environment '${envName}':`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}

/**
 * Extract a value from a JSON object using a dot-notation path.
 * e.g. "access_token" → obj.access_token
 *      "data.org_id"  → obj.data.org_id
 */
function extractJsonPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const segment of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// Cache setup results per environment to avoid re-authenticating on every run
const SETUP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const setupCache = new Map<
  string,
  { variables: Record<string, string>; expiresAt: number }
>();

/**
 * Execute environment-level setup steps (e.g. authenticate, create test data).
 * Each step is an HTTP call whose response values can be captured as variables.
 * Steps run sequentially; later steps can use variables captured by earlier ones.
 * Results are cached per environment for SETUP_CACHE_TTL_MS.
 */
async function executeSetupSteps(
  envName: string,
  steps: SetupStep[],
  baseUrl: string,
  baseVariables: Record<string, string>,
  logger: LoggerService,
): Promise<Record<string, string>> {
  // Check cache
  const cached = setupCache.get(envName);
  if (cached && Date.now() < cached.expiresAt) {
    logger.info(`Using cached setup variables for environment '${envName}'`);
    return { ...cached.variables };
  }

  const variables = { ...baseVariables };

  for (const step of steps) {
    const resolvedPath = resolveVariables(step.path, variables) as string;
    const url = `${baseUrl}${resolvedPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (step.headers) {
      const resolved = resolveVariables(step.headers, variables) as Record<
        string,
        unknown
      >;
      for (const [k, v] of Object.entries(resolved)) {
        headers[k] = String(v);
      }
    }

    const fetchOptions: RequestInit = {
      method: step.method,
      headers,
    };

    if (step.body && ['POST', 'PUT', 'PATCH'].includes(step.method)) {
      const resolvedBody = resolveVariables(
        step.body as Record<string, unknown>,
        variables,
      );
      fetchOptions.body = JSON.stringify(resolvedBody);
    }

    try {
      logger.info(`Setup step '${step.name}': ${step.method} ${url}`);
      const response = await fetch(url, {
        ...fetchOptions,
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${text.slice(0, 200)}`,
        );
      }

      const body = await response.json();

      // Capture values from response
      for (const [varName, jsonPath] of Object.entries(step.capture)) {
        const value = extractJsonPath(body, jsonPath);
        if (value !== undefined && value !== null) {
          variables[varName] = String(value);
          logger.info(
            `Setup step '${step.name}': captured '${varName}' from '${jsonPath}'`,
          );
        } else {
          logger.warn(
            `Setup step '${step.name}': path '${jsonPath}' not found in response for variable '${varName}'`,
          );
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      if (step.allowFailure) {
        logger.warn(
          `Setup step '${step.name}' failed (allowFailure=true, continuing): ${message}`,
        );
      } else {
        logger.error(`Setup step '${step.name}' failed: ${message}`);
        throw new Error(
          `Environment setup step '${step.name}' failed: ${message}`,
        );
      }
    }
  }

  // Cache the result
  setupCache.set(envName, {
    variables: { ...variables },
    expiresAt: Date.now() + SETUP_CACHE_TTL_MS,
  });

  return variables;
}

interface ExecutionResult {
  pass: boolean;
  statusCode: number;
  expectedStatusCode: number | undefined;
  responseTime: number;
  details: {
    bodyContainsFailures?: Record<
      string,
      { expected: unknown; actual: unknown }
    >;
    missingFields?: string[];
    responseBody?: unknown;
    flowStepLog?: FlowStepLog;
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
  // Re-read on every call so app-config.yaml changes (e.g. new setup steps)
  // are picked up without a backend restart. Reads from the in-memory config
  // service, so the overhead is negligible.
  // Merges: app-config.yaml (base) → environments.json (user overrides)
  const getApiTestingConfig = (): ApiTestingConfig => {
    const base = readApiTestingConfig(config);
    const overrides = environmentStore.readOverrides();

    const result: ApiTestingConfig = {
      defaultEnvironment: overrides.defaultEnvironment ?? base.defaultEnvironment,
      environments: {},
    };

    // Start with all app-config environments (includes setup steps)
    for (const [name, env] of Object.entries(base.environments)) {
      result.environments[name] = { ...env };
    }

    // Apply JSON overrides on top (baseUrl + variables only, never setup)
    for (const [name, override] of Object.entries(overrides.environments)) {
      if (result.environments[name]) {
        if (override.baseUrl) {
          result.environments[name].baseUrl = override.baseUrl;
        }
        result.environments[name].variables = {
          ...result.environments[name].variables,
          ...override.variables,
        };
      } else {
        // New environment from JSON only (no setup steps)
        result.environments[name] = {
          baseUrl: override.baseUrl,
          variables: override.variables,
        };
      }
    }

    return result;
  };
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
      if (
        filename &&
        filename.endsWith('.json') &&
        !filename.endsWith('.tmp')
      ) {
        const routeGroup = `/${filename
          .replace(/\.json$/, '')
          .replace(/-/g, '/')}`;
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
    res.json(getApiTestingConfig());
  });

  // --- Environment overrides CRUD ---
  router.get('/config/overrides', (_, res) => {
    res.json(environmentStore.readOverrides());
  });

  router.put('/config/environments/:envName', (req, res) => {
    const { envName } = req.params;
    const { baseUrl, variables } = req.body;
    if (typeof baseUrl !== 'string') {
      throw new InputError('baseUrl is required and must be a string');
    }
    environmentStore.putEnvironment(envName, {
      baseUrl,
      variables: variables ?? {},
    });
    res.json({ ok: true });
  });

  router.delete('/config/environments/:envName', (req, res) => {
    const { envName } = req.params;
    environmentStore.deleteEnvironment(envName);
    res.json({ ok: true });
  });

  router.put('/config/default-environment', (req, res) => {
    const { environment } = req.body;
    if (typeof environment !== 'string' || !environment) {
      throw new InputError('environment is required');
    }
    environmentStore.setDefaultEnvironment(environment);
    res.json({ ok: true });
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
      const routeGroup = `/${file.replace(/\.json$/, '').replace(/-/g, '/')}`;
      routeGroups.push(routeGroup);
    }

    res.json(routeGroups);
  });

  // --- Get single test case (must be registered before the wildcard list route) ---
  router.get('/test-cases/:routeGroup(*)/:id', async (req, res) => {
    const routeGroup = `/${req.params.routeGroup}`;
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
    const routeGroup = `/${req.params.routeGroup}`;
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

    // Build merged variables: app-config environment < setup captures < caller-provided
    const currentConfig = getApiTestingConfig();
    const envName = environment || currentConfig.defaultEnvironment;
    const envConfig = currentConfig.environments[envName];
    let mergedVariables: Record<string, string> = {};
    if (envConfig) {
      if (envConfig.baseUrl) mergedVariables.base_url = envConfig.baseUrl;
      Object.assign(mergedVariables, envConfig.variables);

      // Run environment setup steps (e.g. authenticate)
      if (envConfig.setup && envConfig.setup.length > 0) {
        mergedVariables = await executeSetupSteps(
          envName,
          envConfig.setup,
          envConfig.baseUrl,
          mergedVariables,
          logger,
        );
      }
    }
    Object.assign(mergedVariables, variables || {});

    const executionId = `exec-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const controller = new AbortController();
    runningExecutions.set(executionId, controller);

    try {
      const result =
        testCase.method === 'FLOW'
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
        flowStepLog: result.details.flowStepLog,
      });
      await historyStore.append(routeGroup, testCase.id, record);

      // Broadcast execution-completed event
      broadcast({
        type: 'execution-completed',
        routeGroup,
        testCaseId: testCase.id,
        record,
      });

      res.json({
        executionId,
        pass: result.pass,
        statusCode: result.statusCode,
        expectedStatusCode: result.expectedStatusCode,
        responseTime: result.responseTime,
        details: result.details,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        res.json({
          executionId,
          aborted: true,
          pass: false,
          statusCode: 0,
          responseTime: 0,
          details: {},
        });
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

    // Build merged variables: app-config environment < setup captures < caller-provided
    const currentConfig = getApiTestingConfig();
    const envName = environment || currentConfig.defaultEnvironment;
    const envConfig = currentConfig.environments[envName];
    let mergedVariables: Record<string, string> = {};
    if (envConfig) {
      if (envConfig.baseUrl) mergedVariables.base_url = envConfig.baseUrl;
      Object.assign(mergedVariables, envConfig.variables);

      // Run environment setup steps (e.g. authenticate)
      if (envConfig.setup && envConfig.setup.length > 0) {
        mergedVariables = await executeSetupSteps(
          envName,
          envConfig.setup,
          envConfig.baseUrl,
          mergedVariables,
          logger,
        );
      }
    }
    Object.assign(mergedVariables, variables || {});

    const testCases = await listTestCases(routeGroup);
    const results: Array<{
      testCaseId: string;
      result: {
        pass: boolean;
        statusCode: number;
        expectedStatusCode: number | undefined;
        responseTime: number;
        details: ExecutionResult['details'];
      };
    }> = [];

    for (const tc of testCases) {
      const controller = new AbortController();
      try {
        const result =
          tc.method === 'FLOW'
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
          flowStepLog: result.details.flowStepLog,
        });
        await historyStore.append(routeGroup, tc.id, record);

        broadcast({
          type: 'execution-completed',
          routeGroup,
          testCaseId: tc.id,
          record,
        });

        results.push({
          testCaseId: tc.id,
          result: {
            pass: result.pass,
            statusCode: result.statusCode,
            expectedStatusCode: result.expectedStatusCode,
            responseTime: result.responseTime,
            details: result.details,
          },
        });
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
      res.json({
        stopped: false,
        message: 'Execution not found or already completed',
      });
    }
  });

  // --- History: per-endpoint ---
  router.get('/history/:routeGroup(*)/:testCaseId', async (req, res) => {
    const routeGroup = `/${req.params.routeGroup}`;
    const { testCaseId } = req.params;
    const initiator = req.query.initiator as 'user' | 'agent' | undefined;
    const result = req.query.result as 'pass' | 'fail' | undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;
    const offset = req.query.offset
      ? parseInt(req.query.offset as string, 10)
      : 0;

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
    const routeGroup = `/${req.params.routeGroup}`;
    const initiator = req.query.initiator as 'user' | 'agent' | undefined;
    const result = req.query.result as 'pass' | 'fail' | undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;
    const offset = req.query.offset
      ? parseInt(req.query.offset as string, 10)
      : 0;

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

const FLOW_TESTS_DIR = path.resolve(
  // eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
  __dirname,
  '../../../../test-repositories/Freddy.Backend.Tests',
);

const FLOW_LOG_BEGIN = '---FLOW_STEP_LOG_BEGIN---';
const FLOW_LOG_END = '---FLOW_STEP_LOG_END---';

function extractFlowStepLog(output: string): FlowStepLog | null {
  const beginIdx = output.indexOf(FLOW_LOG_BEGIN);
  const endIdx = output.indexOf(FLOW_LOG_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    return null;
  }
  const jsonStr = output
    .slice(beginIdx + FLOW_LOG_BEGIN.length, endIdx)
    .trim();
  try {
    return JSON.parse(jsonStr) as FlowStepLog;
  } catch {
    return null;
  }
}

function stripFlowStepLog(output: string): string {
  const beginIdx = output.indexOf(FLOW_LOG_BEGIN);
  const endIdx = output.indexOf(FLOW_LOG_END);
  if (beginIdx === -1 || endIdx === -1) return output;
  return (
    output.slice(0, beginIdx) + output.slice(endIdx + FLOW_LOG_END.length)
  ).trim();
}

async function executeFlowTest(
  testCase: TestCase,
  signal: AbortSignal,
): Promise<ExecutionResult> {
  const pytestNodeId = testCase.path;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const proc = spawn(
      'uv',
      ['run', 'pytest', pytestNodeId, '-v', '--tb=short', '--no-header', '-s'],
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
      const rawOutput = `${stdout}\n${stderr}`.trim();

      // Extract structured step log and strip it from display output
      const flowStepLog = extractFlowStepLog(rawOutput);
      const output = flowStepLog ? stripFlowStepLog(rawOutput) : rawOutput;

      // Extract failure lines from pytest output
      const failureLines = output
        .split('\n')
        .filter(
          l =>
            l.includes('FAILED') ||
            l.includes('AssertionError') ||
            l.includes('assert '),
        );
      let failureReason: string | null = null;
      if (!pass) {
        failureReason =
          failureLines.length > 0
            ? failureLines.join('; ')
            : output.slice(-500);
      }

      resolve({
        pass,
        statusCode: pass ? 200 : 500,
        expectedStatusCode: 200,
        responseTime,
        details: {
          responseBody: output,
          ...(flowStepLog && { flowStepLog }),
        },
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

/** Deep-equal comparison that handles key ordering differences in objects. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(key => key in bObj && deepEqual(aObj[key], bObj[key]));
  }
  return false;
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
  if (
    testCase.assertions.body_contains &&
    typeof responseBody === 'object' &&
    responseBody !== null
  ) {
    const failures: Record<string, { expected: unknown; actual: unknown }> = {};
    for (const [key, expected] of Object.entries(
      testCase.assertions.body_contains,
    )) {
      const actual = (responseBody as Record<string, unknown>)[key];
      if (!deepEqual(actual, expected)) {
        failures[key] = { expected, actual: actual ?? null };
        pass = false;
        const actualDisplay =
          actual === undefined ? '<missing>' : JSON.stringify(actual);
        failureReasons.push(
          `Body field '${key}': expected ${JSON.stringify(
            expected,
          )}, got ${actualDisplay}`,
        );
      }
    }
    if (Object.keys(failures).length > 0) {
      details.bodyContainsFailures = failures;
    }
  }

  // Body schema assertion
  if (
    testCase.assertions.body_schema?.required_fields &&
    typeof responseBody === 'object' &&
    responseBody !== null
  ) {
    const missing = testCase.assertions.body_schema.required_fields.filter(
      field => !(field in (responseBody as Record<string, unknown>)),
    );
    if (missing.length > 0) {
      details.missingFields = missing;
      pass = false;
      failureReasons.push(
        `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(
          ', ',
        )}`,
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
    _failureReason:
      failureReasons.length > 0 ? failureReasons.join('; ') : null,
  };
}
