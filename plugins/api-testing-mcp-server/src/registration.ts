import fs from 'fs';
import path from 'path';

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

  fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + '\n');
  console.error('[api-testing-mcp] Registered MCP server in .mcp.json');
}
