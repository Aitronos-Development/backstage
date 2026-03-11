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

import { Request, Response } from 'express';
import { Logger } from 'winston';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';

interface OrchestratorRun {
  runId: string;
  routeGroup: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  phases?: {
    reconnaissance?: 'pending' | 'running' | 'completed' | 'failed';
    strategy?: 'pending' | 'running' | 'completed' | 'failed';
    construction?: 'pending' | 'running' | 'completed' | 'failed';
    execution?: 'pending' | 'running' | 'completed' | 'failed';
    audit?: 'pending' | 'running' | 'completed' | 'failed';
    bugFiling?: 'pending' | 'running' | 'completed' | 'failed';
  };
  certificate?: any;
  error?: string;
}

// Store active orchestrator runs in memory
const activeRuns = new Map<string, OrchestratorRun>();

/**
 * Trigger the Omni-Test Chief Orchestrator for a route group
 */
export async function triggerOrchestrator(req: Request, res: Response, logger: Logger) {
  const routeGroup = `/${req.params.routeGroup}`;
  const { metadata } = req.body || {};

  // Check if an orchestrator run is already in progress for this route
  const existingRun = Array.from(activeRuns.values()).find(
    run => run.routeGroup === routeGroup && run.status === 'running'
  );

  if (existingRun) {
    return res.status(409).json({
      error: 'Orchestrator already running for this route group',
      runId: existingRun.runId,
    });
  }

  // Generate run ID
  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Create run record
  const run: OrchestratorRun = {
    runId,
    routeGroup,
    status: 'pending',
    startTime: new Date(),
    phases: {
      reconnaissance: 'pending',
      strategy: 'pending',
      construction: 'pending',
      execution: 'pending',
      audit: 'pending',
      bugFiling: 'pending',
    },
  };

  activeRuns.set(runId, run);

  // Start orchestrator in background
  startOrchestratorProcess(run, metadata, logger);

  res.json({
    runId,
    routeGroup,
    status: 'started',
    message: 'Orchestrator mission initiated',
  });
}

/**
 * Get status of an orchestrator run
 */
export async function getOrchestratorStatus(req: Request, res: Response) {
  const { runId } = req.params;

  const run = activeRuns.get(runId);
  if (!run) {
    // Try to load from history
    const historyPath = path.join(
      process.cwd(),
      'api-tests/.history',
      run?.routeGroup?.replace(/\//g, '-') || '',
      `${runId}.json`
    );

    if (fs.existsSync(historyPath)) {
      const history = JSON.parse(await fsp.readFile(historyPath, 'utf8'));
      return res.json(history);
    }

    return res.status(404).json({ error: 'Run not found' });
  }

  res.json(run);
}

/**
 * Get orchestrator history for a route group
 */
export async function getOrchestratorHistory(req: Request, res: Response) {
  const routeGroup = `/${req.params.routeGroup}`;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  const historyDir = path.join(
    process.cwd(),
    'api-tests/.history',
    routeGroup.replace(/\//g, '-')
  );

  if (!fs.existsSync(historyDir)) {
    return res.json({ history: [] });
  }

  try {
    const historyFile = path.join(historyDir, 'history.jsonl');

    if (!fs.existsSync(historyFile)) {
      return res.json({ history: [] });
    }

    const content = await fsp.readFile(historyFile, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);
    const history = lines
      .slice(-limit)
      .map(line => JSON.parse(line))
      .reverse();

    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load history' });
  }
}

/**
 * Start the orchestrator process in the background
 */
async function startOrchestratorProcess(
  run: OrchestratorRun,
  metadata: any,
  logger: Logger
) {
  run.status = 'running';

  try {
    // Path to the orchestrator script
    const orchestratorScript = path.join(
      __dirname,
      '../../../../master-mcp-agent/dist/runOrchestrator.js'
    );

    // Spawn the orchestrator process
    const child = spawn('node', [
      orchestratorScript,
      run.routeGroup,
      JSON.stringify({
        ...metadata,
        triggeredBy: 'backstage-ui',
        runId: run.runId,
      }),
    ], {
      detached: false,
      stdio: 'pipe',
    });

    // Track phase progress from stdout
    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      logger.info(`[Orchestrator ${run.runId}] ${output}`);

      // Parse phase updates
      if (output.includes('[RECON]')) {
        run.phases!.reconnaissance = output.includes('100%') ? 'completed' : 'running';
      } else if (output.includes('[STRATEGY]')) {
        run.phases!.strategy = output.includes('100%') ? 'completed' : 'running';
      } else if (output.includes('[BUILD]')) {
        run.phases!.construction = output.includes('100%') ? 'completed' : 'running';
      } else if (output.includes('[EXECUTE]')) {
        run.phases!.execution = output.includes('100%') ? 'completed' : 'running';
      } else if (output.includes('[AUDIT]')) {
        run.phases!.audit = output.includes('100%') ? 'completed' : 'running';
      } else if (output.includes('[FILE_BUGS]')) {
        run.phases!.bugFiling = output.includes('100%') ? 'completed' : 'running';
      } else if (output.includes('QUALITY CERTIFICATE')) {
        // Try to extract certificate data
        try {
          const certMatch = output.match(/Total Tests.*Grade: [A-F]/s);
          if (certMatch) {
            run.certificate = { summary: certMatch[0] };
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      logger.error(`[Orchestrator ${run.runId}] ERROR: ${data.toString()}`);
    });

    child.on('exit', async (code) => {
      run.status = code === 0 ? 'completed' : 'failed';
      run.endTime = new Date();

      if (code !== 0) {
        run.error = `Orchestrator process exited with code ${code}`;
      }

      logger.info(`[Orchestrator ${run.runId}] Completed with code ${code}`);

      // Load the full history from file
      try {
        const historyFile = path.join(
          process.cwd(),
          'api-tests/.history',
          run.routeGroup.replace(/\//g, '-'),
          `${run.runId}.json`
        );

        if (fs.existsSync(historyFile)) {
          const history = JSON.parse(await fsp.readFile(historyFile, 'utf8'));
          run.certificate = history.certificate;
        }
      } catch (e) {
        logger.error('Failed to load orchestrator results:', e);
      }

      // Keep in memory for 5 minutes for status queries
      setTimeout(() => {
        activeRuns.delete(run.runId);
      }, 5 * 60 * 1000);
    });

  } catch (error) {
    logger.error('Failed to start orchestrator:', error);
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : String(error);
    run.endTime = new Date();
  }
}

/**
 * Cancel a running orchestrator
 */
export async function cancelOrchestrator(req: Request, res: Response) {
  const { runId } = req.params;

  const run = activeRuns.get(runId);
  if (!run || run.status !== 'running') {
    return res.status(404).json({ error: 'No active run found' });
  }

  // TODO: Implement actual process cancellation
  run.status = 'failed';
  run.error = 'Cancelled by user';
  run.endTime = new Date();

  res.json({ message: 'Orchestrator cancelled', runId });
}