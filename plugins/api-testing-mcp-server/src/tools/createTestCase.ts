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
import { createTestCase } from '../storage';

export function registerCreateTestCase(server: McpServer) {
  server.tool(
    'create_test_case',
    'Create a new test case for an API endpoint',
    {
      route_group: z.string().describe('API route group, e.g. /v1/rules'),
      name: z.string().describe('Human-readable name for the test case'),
      method: z
        .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
        .describe('HTTP method'),
      path: z.string().describe('API path, e.g. /v1/rules/:id'),
      headers: z
        .record(z.string())
        .optional()
        .describe('Request headers as key-value pairs'),
      body: z
        .record(z.unknown())
        .optional()
        .describe('Request body as JSON object'),
      assertions: z
        .object({
          status_code: z.number().optional().describe('Expected HTTP status code'),
          body_contains: z
            .record(z.unknown())
            .optional()
            .describe('Key-value pairs the response body must contain'),
          body_schema: z
            .object({
              required_fields: z
                .array(z.string())
                .optional()
                .describe('Fields that must be present in the response'),
            })
            .optional()
            .describe('Schema validation for the response body'),
        })
        .describe('Assertions to validate the response'),
    },
    async ({ route_group, name, method, path, headers, body, assertions }) => {
      try {
        const testCase = await createTestCase(route_group, {
          name,
          method,
          path,
          headers,
          body,
          assertions,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(testCase, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating test case: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
