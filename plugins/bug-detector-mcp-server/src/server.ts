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
import { registerReadErrorLogs } from './tools/readErrorLogs';
import { registerCreateBugTickets } from './tools/createBugTickets';
import { registerProcessTestRun } from './tools/processTestRun';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'bug-detector',
    version: '0.1.0',
  });

  registerReadErrorLogs(server);
  registerCreateBugTickets(server);
  registerProcessTestRun(server);

  return server;
}
