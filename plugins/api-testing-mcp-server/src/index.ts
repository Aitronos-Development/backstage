import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server';
import { registerInClaudeSettings } from './registration';
import path from 'path';

async function main() {
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
