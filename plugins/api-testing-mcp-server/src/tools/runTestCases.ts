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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';
import {
  listTestCases,
  readTestCase,
  historyStore,
  buildExecutionRecord,
} from '../storage';
import type { TestCase } from '../storage';
import {
  resolveVariables,
  buildMcpVariables,
} from '../variableResolution';

interface InternalExecutionResult {
  pass: boolean;
  statusCode: number;
  responseTime: number;
  failureReason: string | null;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  response: {
    status_code: number;
    headers: Record<string, string>;
    body?: unknown;
  };
}

// eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
const FLOW_TESTS_DIR = path.resolve(__dirname, '../../../../test-repositories/Freddy.Backend.Tests');

async function executeFlowTest(
  testCase: TestCase,
): Promise<InternalExecutionResult> {
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

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('close', code => {
      const responseTime = Date.now() - start;
      const pass = code === 0;
      const output = `${stdout}\n${stderr}`.trim();

      const failureLines = output
        .split('\n')
        .filter(
          l =>
            l.includes('FAILED') ||
            l.includes('AssertionError') ||
            l.includes('assert '),
        );

      resolve({
        pass,
        statusCode: pass ? 200 : 500,
        responseTime,
        failureReason: pass
          ? null
          : failureLines.length > 0
            ? failureLines.join('; ')
            : output.slice(-500),
        request: { method: 'FLOW', url: pytestNodeId, headers: {} },
        response: {
          status_code: code ?? 1,
          headers: {},
          body: output,
        },
      });
    });

    proc.on('error', err => reject(err));
  });
}

async function executeTestCase(
  testCase: TestCase,
  variables: Record<string, string>,
): Promise<InternalExecutionResult> {
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

  let requestBody: unknown;
  const fetchOptions: RequestInit = {
    method: testCase.method,
    headers,
    signal: AbortSignal.timeout(30_000),
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

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  // Evaluate assertions
  let pass = true;
  const failureReasons: string[] = [];

  if (testCase.assertions.status_code !== undefined) {
    if (response.status !== testCase.assertions.status_code) {
      pass = false;
      failureReasons.push(
        `Expected status ${testCase.assertions.status_code}, got ${response.status}`,
      );
    }
  }

  if (
    testCase.assertions.body_contains &&
    typeof responseBody === 'object' &&
    responseBody !== null
  ) {
    for (const [key, expected] of Object.entries(testCase.assertions.body_contains)) {
      const actual = (responseBody as Record<string, unknown>)[key];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        pass = false;
        failureReasons.push(
          `Body field '${key}': expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }
  }

  if (
    testCase.assertions.body_schema?.required_fields &&
    typeof responseBody === 'object' &&
    responseBody !== null
  ) {
    const missing = testCase.assertions.body_schema.required_fields.filter(
      field => !(field in (responseBody as Record<string, unknown>)),
    );
    if (missing.length > 0) {
      pass = false;
      failureReasons.push(
        `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
    }
  }

  return {
    pass,
    statusCode: response.status,
    responseTime,
    failureReason: failureReasons.length > 0 ? failureReasons.join('; ') : null,
    request: {
      method: testCase.method,
      url,
      headers,
      ...(requestBody !== undefined && { body: requestBody }),
    },
    response: {
      status_code: response.status,
      headers: responseHeaders,
      ...(responseBody !== undefined && { body: responseBody }),
    },
  };
}

export function registerRunTestCases(server: McpServer) {
  server.tool(
    'run_test_cases',
    'Execute test cases for a given API route group',
    {
      route_group: z.string().describe('API route group, e.g. /v1/rules'),
      test_case_ids: z
        .array(z.string())
        .optional()
        .describe(
          'Specific test case IDs to run. If omitted, runs all in the route group.',
        ),
      variable_overrides: z
        .record(z.string())
        .optional()
        .describe(
          'Key-value overrides for template variables in test cases, ' +
            'e.g. { "auth_token": "agent-provided-token" }',
        ),
    },
    async ({ route_group, test_case_ids, variable_overrides }, extra) => {
      // Merge app-config variables with agent-provided overrides
      const variables = buildMcpVariables(variable_overrides);

      // Determine which test cases to run
      let testCases: TestCase[];
      if (test_case_ids && test_case_ids.length > 0) {
        testCases = [];
        for (const id of test_case_ids) {
          const tc = await readTestCase(route_group, id);
          if (!tc) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: `Test case '${id}' not found in '${route_group}'`,
                  }),
                },
              ],
              isError: true,
            };
          }
          testCases.push(tc);
        }
      } else {
        testCases = await listTestCases(route_group);
        if (testCases.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  route_group,
                  results: [],
                  message: 'No test cases found for this route group',
                }),
              },
            ],
          };
        }
      }

      // Execute each test case and record history
      const results: Array<{
        test_case_id: string;
        test_case_name: string;
        result: 'pass' | 'fail';
        status_code: number;
        response_time_ms: number;
        failure_reason: string | null;
      }> = [];

      for (const tc of testCases) {
        try {
          const execResult = tc.method === 'FLOW'
            ? await executeFlowTest(tc)
            : await executeTestCase(tc, variables);

          // Write history record
          const record = buildExecutionRecord({
            testCaseId: tc.id,
            testCaseName: tc.name,
            routeGroup: route_group,
            initiator: 'agent',
            agentIdentity: extra.sessionId ?? 'claude-code-mcp',
            durationMs: execResult.responseTime,
            pass: execResult.pass,
            failureReason: execResult.failureReason,
            request: execResult.request,
            response: execResult.response,
          });
          await historyStore.append(route_group, tc.id, record);

          results.push({
            test_case_id: tc.id,
            test_case_name: tc.name,
            result: execResult.pass ? 'pass' : 'fail',
            status_code: execResult.statusCode,
            response_time_ms: execResult.responseTime,
            failure_reason: execResult.failureReason,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({
            test_case_id: tc.id,
            test_case_name: tc.name,
            result: 'fail',
            status_code: 0,
            response_time_ms: 0,
            failure_reason: `Execution error: ${message}`,
          });
        }
      }

      const passed = results.filter(r => r.result === 'pass').length;
      const failed = results.filter(r => r.result === 'fail').length;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              route_group,
              summary: { total: results.length, passed, failed },
              results,
            }),
          },
        ],
      };
    },
  );
}
