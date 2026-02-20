import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { editTestCase } from '../storage';
import type { EditableField } from '../storage';

export function registerEditTestCase(server: McpServer) {
  server.tool(
    'edit_test_case',
    'Edit an existing test case using a file-editing-style interface. ' +
      'Supports full field replacement, find-and-replace within a field, ' +
      'and deep merge for object fields. Use old_value for optimistic concurrency.',
    {
      route_group: z.string().describe('API route group, e.g. /v1/rules'),
      test_case_id: z.string().describe('Unique identifier of the test case'),
      field: z
        .enum(['name', 'method', 'path', 'headers', 'body', 'assertions'])
        .describe('The field to edit'),
      new_value: z.unknown().describe('The new value for the field'),
      old_value: z
        .unknown()
        .optional()
        .describe(
          'The expected current value (or partial value for merge). ' +
            'If provided and current value does not match, the edit is rejected.',
        ),
      replace_all: z
        .boolean()
        .optional()
        .describe(
          'When using find-replace mode (old_value without merge), ' +
            'replace all occurrences instead of just the first',
        ),
      merge: z
        .boolean()
        .optional()
        .describe(
          'Deep-merge new_value into the existing field value ' +
            'instead of replacing it. Field must be an object.',
        ),
    },
    async ({ route_group, test_case_id, field, new_value, old_value, replace_all, merge }) => {
      try {
        const updated = await editTestCase(route_group, test_case_id, {
          field: field as EditableField,
          new_value,
          old_value,
          replace_all,
          merge,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(updated, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error editing test case: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
