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
