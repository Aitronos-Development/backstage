import { z } from 'zod';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

// Schema for test history query
const TestHistorySchema = z.object({
  route_group: z.string().optional().describe('Route group to filter history (e.g., "/v1/health")'),
  limit: z.number().optional().default(20).describe('Maximum number of records to return'),
  run_id: z.string().optional().describe('Specific run ID to retrieve'),
  summary: z.boolean().optional().default(false).describe('Return summary instead of full history'),
});

interface TestRunHistory {
  runId: string;
  route: string;
  timestamp: Date;
  duration: number;
  phases: any;
  certificate: {
    totalTests: number;
    passed: number;
    bugsFound: number;
    bugIds: string[];
    flakyTests: number;
    invalidTests: number;
    codeCoverage: number;
    performanceGrade: string;
    criticalIssues: any[];
    nextSteps: string[];
  };
  metadata: any;
}

/**
 * Get test history from stored JSONL files
 */
export async function getTestHistory(args: z.infer<typeof TestHistorySchema>) {
  const historyPath = path.join(process.cwd(), 'api-tests/.history');

  try {
    // If specific run_id is requested
    if (args.run_id) {
      const runFile = await findRunFile(historyPath, args.run_id);
      if (runFile) {
        const content = await fsp.readFile(runFile, 'utf8');
        return {
          content: [{
            type: 'text',
            text: content
          }]
        };
      }
      return {
        content: [{
          type: 'text',
          text: `Run ID ${args.run_id} not found`
        }]
      };
    }

    // If summary is requested
    if (args.summary) {
      const summary = await getHistorySummary(historyPath);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(summary, null, 2)
        }]
      };
    }

    // Get history for specific route or all routes
    let history: TestRunHistory[] = [];

    if (args.route_group) {
      const routeDir = path.join(historyPath, args.route_group.replace(/\//g, '-'));
      if (fs.existsSync(routeDir)) {
        history = await loadRouteHistory(routeDir, args.limit || 20);
      }
    } else {
      // Get latest runs from all routes
      history = await getAllLatestRuns(historyPath, args.limit || 20);
    }

    // Format history for display
    const formattedHistory = formatHistory(history);

    return {
      content: [{
        type: 'text',
        text: formattedHistory
      }]
    };
  } catch (error) {
    console.error('Error retrieving test history:', error);
    return {
      content: [{
        type: 'text',
        text: `Error retrieving test history: ${error}`
      }]
    };
  }
}

/**
 * Find a specific run file by ID
 */
async function findRunFile(historyPath: string, runId: string): Promise<string | null> {
  if (!fs.existsSync(historyPath)) return null;

  const routes = await fsp.readdir(historyPath);

  for (const route of routes) {
    const runFile = path.join(historyPath, route, `${runId}.json`);
    if (fs.existsSync(runFile)) {
      return runFile;
    }
  }

  return null;
}

/**
 * Get summary of all test history
 */
async function getHistorySummary(historyPath: string): Promise<any> {
  if (!fs.existsSync(historyPath)) {
    return { totalRuns: 0, routes: [] };
  }

  const routes = await fsp.readdir(historyPath);
  const summary = {
    totalRuns: 0,
    routes: [] as any[]
  };

  for (const routeDir of routes) {
    const latestFile = path.join(historyPath, routeDir, 'latest.json');
    const historyFile = path.join(historyPath, routeDir, 'history.jsonl');

    if (fs.existsSync(latestFile)) {
      const latest = JSON.parse(await fsp.readFile(latestFile, 'utf8'));

      // Count total runs for this route
      let runCount = 0;
      if (fs.existsSync(historyFile)) {
        const content = await fsp.readFile(historyFile, 'utf8');
        runCount = content.trim().split('\n').filter(line => line).length;
      }

      summary.totalRuns += runCount;
      summary.routes.push({
        route: latest.route,
        totalRuns: runCount,
        lastRun: latest.timestamp,
        lastRunId: latest.runId,
        lastDuration: `${(latest.duration / 1000).toFixed(2)}s`,
        passRate: `${Math.round((latest.certificate.passed / latest.certificate.totalTests) * 100)}%`,
        bugsFound: latest.certificate.bugsFound,
        grade: latest.certificate.performanceGrade
      });
    }
  }

  return summary;
}

/**
 * Load history for a specific route
 */
async function loadRouteHistory(routeDir: string, limit: number): Promise<TestRunHistory[]> {
  const historyFile = path.join(routeDir, 'history.jsonl');

  if (!fs.existsSync(historyFile)) {
    return [];
  }

  const content = await fsp.readFile(historyFile, 'utf8');
  const lines = content.trim().split('\n').filter(line => line);
  const history = lines.slice(-limit).map(line => JSON.parse(line));

  return history.reverse(); // Most recent first
}

/**
 * Get latest runs from all routes
 */
async function getAllLatestRuns(historyPath: string, limit: number): Promise<TestRunHistory[]> {
  if (!fs.existsSync(historyPath)) {
    return [];
  }

  const routes = await fsp.readdir(historyPath);
  const allRuns: TestRunHistory[] = [];

  for (const routeDir of routes) {
    const history = await loadRouteHistory(path.join(historyPath, routeDir), limit);
    allRuns.push(...history);
  }

  // Sort by timestamp and return most recent
  return allRuns
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * Format history for display
 */
function formatHistory(history: TestRunHistory[]): string {
  if (history.length === 0) {
    return 'No test history found.';
  }

  let output = '# Test Execution History\n\n';

  for (const run of history) {
    const date = new Date(run.timestamp);
    const passRate = Math.round((run.certificate.passed / run.certificate.totalTests) * 100);

    output += `## ${run.route} - ${run.runId}\n`;
    output += `- **Date:** ${date.toLocaleString()}\n`;
    output += `- **Duration:** ${(run.duration / 1000).toFixed(2)}s\n`;
    output += `- **Tests:** ${run.certificate.totalTests} total\n`;
    output += `- **Passed:** ${run.certificate.passed} (${passRate}%)\n`;
    output += `- **Bugs Found:** ${run.certificate.bugsFound}\n`;
    output += `- **Performance Grade:** ${run.certificate.performanceGrade}\n`;

    if (run.certificate.bugIds && run.certificate.bugIds.length > 0) {
      output += `- **Bug IDs:** ${run.certificate.bugIds.join(', ')}\n`;
    }

    if (run.certificate.criticalIssues && run.certificate.criticalIssues.length > 0) {
      output += `- **Critical Issues:**\n`;
      for (const issue of run.certificate.criticalIssues) {
        output += `  - ${issue.title}\n`;
      }
    }

    output += '\n';
  }

  return output;
}

// Export schema and function for use in server
export const testHistoryTool = {
  name: 'get_test_history',
  description: 'Retrieve test execution history from stored JSONL files',
  schema: TestHistorySchema,
  handler: getTestHistory
};