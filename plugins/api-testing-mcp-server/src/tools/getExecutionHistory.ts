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
