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
import { listTestCases } from '../storage';

export function registerListTestCases(server: McpServer) {
  server.tool(
    'list_test_cases',
    'List all test cases for a given API route group',
    {
      route_group: z.string().describe('API route group, e.g. /v1/rules'),
    },
    async ({ route_group }) => {
      try {
        const testCases = await listTestCases(route_group);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  route_group,
                  count: testCases.length,
                  test_cases: testCases,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing test cases: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
