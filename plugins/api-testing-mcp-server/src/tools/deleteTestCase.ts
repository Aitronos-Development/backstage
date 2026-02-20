import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { deleteTestCase } from '../storage';

export function registerDeleteTestCase(server: McpServer) {
  server.tool(
    'delete_test_case',
    'Delete a test case by ID',
    {
      route_group: z.string().describe('API route group, e.g. /v1/rules'),
      test_case_id: z.string().describe('Unique identifier of the test case'),
    },
    async ({ route_group, test_case_id }) => {
      try {
        await deleteTestCase(route_group, test_case_id);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                test_case_id,
                route_group,
                deleted: true,
              }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error deleting test case: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
