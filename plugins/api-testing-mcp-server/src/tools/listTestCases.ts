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
