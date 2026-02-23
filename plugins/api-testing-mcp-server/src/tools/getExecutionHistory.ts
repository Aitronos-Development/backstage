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
import { historyStore } from '../storage';

export function registerGetExecutionHistory(server: McpServer) {
  server.tool(
    'get_execution_history',
    'Get the execution history for a test case or route group',
    {
      route_group: z.string().optional().describe('Filter by route group'),
      test_case_id: z.string().optional().describe('Filter by test case ID'),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of results to return (default 20)'),
    },
    async ({ route_group, test_case_id, limit }) => {
      if (!route_group) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'route_group is required',
              }),
            },
          ],
          isError: true,
        };
      }

      const queryLimit = limit ?? 20;

      let executions;
      if (test_case_id) {
        executions = await historyStore.query(route_group, test_case_id, {
          limit: queryLimit,
        });
      } else {
        executions = await historyStore.queryGroup(route_group, {
          limit: queryLimit,
        });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              route_group,
              test_case_id: test_case_id ?? null,
              count: executions.length,
              executions,
            }),
          },
        ],
      };
    },
  );
}
