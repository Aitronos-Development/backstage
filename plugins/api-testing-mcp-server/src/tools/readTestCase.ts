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
import { readTestCase, routeGroupExists } from '../storage';

export function registerReadTestCase(server: McpServer) {
  server.tool(
    'read_test_case',
    'Read a single test case by ID',
    {
      route_group: z.string().describe('API route group, e.g. /v1/rules'),
      test_case_id: z.string().describe('Unique identifier of the test case'),
    },
    async ({ route_group, test_case_id }) => {
      try {
        if (!routeGroupExists(route_group)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No test cases found for route group '${route_group}'`,
              },
            ],
            isError: true,
          };
        }
        const testCase = await readTestCase(route_group, test_case_id);
        if (!testCase) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Test case '${test_case_id}' not found in route group '${route_group}'`,
              },
            ],
            isError: true,
          };
        }
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
              text: `Error reading test case: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
