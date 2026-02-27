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
import http from 'node:http';
import { createMcpServer } from './server';
import { registerInClaudeSettings } from './registration';
import { processTestRun } from './tools/processTestRun';
import { pruneLedger } from './common/ledger';
import path from 'node:path';

const HTTP_PORT = parseInt(process.env.BUG_DETECTOR_PORT || '7009', 10);

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function main() {
  // eslint-disable-next-line no-restricted-syntax -- resolving project root relative to package source
  const projectRoot = path.resolve(__dirname, '../../../');

  await registerInClaudeSettings(projectRoot);

  // Prune ledger entries older than 30 days at startup
  try {
    pruneLedger();
    console.error('[bug-detector-mcp] Ledger pruned');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bug-detector-mcp] Ledger prune warning: ${msg}`);
  }

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  console.error('[bug-detector-mcp] Starting MCP server...');
  await server.connect(transport);
  console.error('[bug-detector-mcp] MCP server running on stdio');

  // Start HTTP server for programmatic access (Phase 4)
  const httpServer = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/process') {
      try {
        const body = await readBody(req);
        const { route_group, run_ids } = JSON.parse(body);

        if (!route_group) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'route_group is required' }));
          return;
        }

        const result = await processTestRun({ route_group, run_ids });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[bug-detector-mcp] HTTP /process error:', message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
    console.error(
      `[bug-detector-mcp] HTTP server listening on http://127.0.0.1:${HTTP_PORT}`,
    );
  });
}

main().catch(err => {
  console.error('[bug-detector-mcp] Fatal error:', err);
  process.exit(1);
});
