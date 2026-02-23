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
import fs from 'node:fs';
import path from 'node:path';

export async function registerInClaudeSettings(
  projectRoot: string,
): Promise<void> {
  const mcpJsonPath = path.join(projectRoot, '.mcp.json');

  let config: Record<string, unknown> = {};

  if (fs.existsSync(mcpJsonPath)) {
    try {
      const raw = fs.readFileSync(mcpJsonPath, 'utf-8');
      config = JSON.parse(raw);
    } catch (err) {
      console.error(
        '[api-testing-mcp] Failed to parse .mcp.json, skipping registration:',
        err,
      );
      return;
    }
  }

  const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;

  if (mcpServers['api-testing']) {
    console.error('[api-testing-mcp] Already registered in .mcp.json');
    return;
  }

  mcpServers['api-testing'] = {
    command: 'npx',
    args: ['tsx', 'plugins/api-testing-mcp-server/src/index.ts'],
    cwd: projectRoot,
  };

  config.mcpServers = mcpServers;

  fs.writeFileSync(mcpJsonPath, `${JSON.stringify(config, null, 2)  }\n`);
  console.error('[api-testing-mcp] Registered MCP server in .mcp.json');
}
