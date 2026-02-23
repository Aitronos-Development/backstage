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
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server';
import { registerInClaudeSettings } from './registration';
import path from 'node:path';

async function main() {
  // eslint-disable-next-line no-restricted-syntax -- resolving project root relative to package source
  const projectRoot = path.resolve(__dirname, '../../../');

  // Auto-register in .claude/settings.json
  await registerInClaudeSettings(projectRoot);

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  console.error('[api-testing-mcp] Starting MCP server...');
  await server.connect(transport);
  console.error('[api-testing-mcp] MCP server running on stdio');
}

main().catch(err => {
  console.error('[api-testing-mcp] Fatal error:', err);
  process.exit(1);
});
