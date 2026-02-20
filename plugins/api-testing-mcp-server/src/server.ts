import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListTestCases } from './tools/listTestCases';
import { registerReadTestCase } from './tools/readTestCase';
import { registerCreateTestCase } from './tools/createTestCase';
import { registerEditTestCase } from './tools/editTestCase';
import { registerDeleteTestCase } from './tools/deleteTestCase';
import { registerRunTestCases } from './tools/runTestCases';
import { registerGetExecutionHistory } from './tools/getExecutionHistory';
import { watcher } from './storage';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'api-testing',
    version: '0.1.0',
  });

  registerListTestCases(server);
  registerReadTestCase(server);
  registerCreateTestCase(server);
  registerEditTestCase(server);
  registerDeleteTestCase(server);
  registerRunTestCases(server);
  registerGetExecutionHistory(server);

  // Start file watcher for api-tests/ directory
  watcher.start();
  watcher.on('test-cases-changed', event => {
    console.error(
      `[api-testing-mcp] File changed: ${event.filename} (route: ${event.routeGroup})`,
    );
  });

  return server;
}
