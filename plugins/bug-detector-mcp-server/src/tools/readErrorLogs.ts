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
import { z } from 'zod';
import path from 'node:path';
import type { ExecutionRecord } from '../common/types';
import {
  HISTORY_DIR,
  routeGroupToDirName,
  readJsonlFile,
  readAllFilesInDir,
} from '../common/history';
import { redactSensitiveFields } from '../common/redaction';

const MAX_RESPONSE_BODY_LENGTH = 5000;

function parseExpectedStatus(failureReason: string | null): number | null {
  if (!failureReason) return null;
  const match = failureReason.match(/expected\s+(?:status\s+)?(\d{3})/i);
  return match ? parseInt(match[1], 10) : null;
}

function truncateResponseBody(body: unknown): unknown {
  if (body === null || body === undefined) return body;
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  if (serialized.length > MAX_RESPONSE_BODY_LENGTH) {
    return `${serialized.slice(0, MAX_RESPONSE_BODY_LENGTH)}... [truncated]`;
  }
  return body;
}

function mapFailure(record: ExecutionRecord) {
  return {
    execution_id: record.id,
    timestamp: record.timestamp,
    test_case_id: record.test_case_id,
    test_case_name: record.test_case_name,
    endpoint: record.request.url,
    method: record.request.method,
    expected_status: parseExpectedStatus(record.failure_reason),
    actual_status: record.response.status_code,
    failure_reason: record.failure_reason ?? 'Unknown failure',
    request: {
      method: record.request.method,
      url: record.request.url,
      headers: record.request.headers,
      ...(record.request.body !== undefined && {
        body: redactSensitiveFields(record.request.body, '***'),
      }),
    },
    response: {
      status_code: record.response.status_code,
      headers: record.response.headers,
      ...(record.response.body !== undefined && {
        body: truncateResponseBody(record.response.body),
      }),
    },
    ...(record.flow_step_log && { flow_step_log: record.flow_step_log }),
  };
}

export function registerReadErrorLogs(server: McpServer) {
  server.tool(
    'read_error_logs',
    'Read execution history error logs from the API testing history store and return structured failure data',
    {
      route_group: z.string().describe('API route group, e.g. "/v1/auth"'),
      test_case_id: z
        .string()
        .optional()
        .describe('Filter to a single test case / endpoint'),
      run_id: z
        .string()
        .optional()
        .describe('Filter to a specific execution ID'),
      limit: z
        .number()
        .optional()
        .describe('Max records to return (default 50)'),
    },
    async ({ route_group, test_case_id, run_id, limit }) => {
      const queryLimit = limit ?? 50;

      let records: ExecutionRecord[];

      if (test_case_id) {
        const filePath = path.join(
          HISTORY_DIR,
          routeGroupToDirName(route_group),
          `${test_case_id}.jsonl`,
        );
        records = readJsonlFile(filePath);
      } else {
        const dirPath = path.join(
          HISTORY_DIR,
          routeGroupToDirName(route_group),
        );
        records = readAllFilesInDir(dirPath);
      }

      // Filter to failures only
      let failures = records.filter(r => r.result === 'fail');

      // Filter by run_id if provided
      if (run_id) {
        failures = failures.filter(r => r.id === run_id);
      }

      // Sort by timestamp descending (most recent first)
      failures.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      // Apply limit
      failures = failures.slice(0, queryLimit);

      const output = {
        route_group,
        total_failures: failures.length,
        failures: failures.map(mapFailure),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
  );
}
