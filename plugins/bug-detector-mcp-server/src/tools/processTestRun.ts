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
import { z } from 'zod';
import type {
  FailureRecord,
  CreatedTicket,
  SkippedDuplicate,
  FailedTicket,
} from '../common/types';
import { readFailures } from '../common/history';
import {
  fetchDefaultOpenStatusId,
  findDuplicateBug,
  createBugViaApi,
} from '../common/bugManagerApi';
import {
  BULK_LIMIT,
  generateHeading,
  derivePriority,
  generateDescription,
  generateBulkSummaryDescription,
  buildDedupSignature,
  buildSafeBulkHeading,
  generateGroupedHeading,
  generateGroupedDescription,
} from '../common/ticketFormatting';
import { computeFailureFingerprint } from '../common/fingerprint';
import { isExecutionProcessed, appendLedger } from '../common/ledger';
import { withLock } from '../common/lock';
import { detectFailureGroups } from '../common/categorization';

/* ────────────────────────────── Types ─────────────────────────────────── */

interface ProcessTestRunOutput {
  route_group: string;
  processed_at: string;
  total_tests_failed: number;
  tickets_created: CreatedTicket[];
  tickets_skipped: SkippedDuplicate[];
  tickets_failed: FailedTicket[];
  bulk_ticket?: {
    ticket_number: string;
    bug_id: string;
    heading: string;
    failure_count: number;
  };
  summary: string;
  dry_run: boolean;
}

/* ──────────────────────── Logging ────────────────────────────────────── */

function log(message: string): void {
  process.stderr.write(`[bug-detector] ${message}\n`);
}

/* ──────────────────── Preview Tickets (Dry Run) ──────────────────────── */

async function previewTickets(
  failures: FailureRecord[],
  routeGroup: string,
): Promise<{
  tickets_created: CreatedTicket[];
  tickets_skipped: SkippedDuplicate[];
  bulk_ticket?: ProcessTestRunOutput['bulk_ticket'];
}> {
  const tickets_created: CreatedTicket[] = [];
  const tickets_skipped: SkippedDuplicate[] = [];

  if (failures.length > BULK_LIMIT) {
    const safeHeading = buildSafeBulkHeading(routeGroup, failures.length);

    return {
      tickets_created: [],
      tickets_skipped: [],
      bulk_ticket: {
        ticket_number: '(dry run)',
        bug_id: '(dry run)',
        heading: safeHeading,
        failure_count: failures.length,
      },
    };
  }

  // Smart grouping preview
  const { groups, ungrouped } = detectFailureGroups(failures);

  for (const group of groups) {
    const heading = generateGroupedHeading(group);
    tickets_created.push({
      ticket_number: '(dry run)',
      bug_id: '(dry run)',
      heading,
      endpoint: `${group.failures.length} endpoints`,
      priority: 'urgent',
    });
  }

  for (const failure of ungrouped) {
    const dedupSignature = buildDedupSignature(failure);
    const fingerprint = computeFailureFingerprint(failure);
    const heading = generateHeading(failure);
    const priority = derivePriority(failure);

    log(
      `Checking deduplication for ${failure.method} ${failure.endpoint}...`,
    );
    try {
      const existingBug = await findDuplicateBug(
        failure.endpoint,
        dedupSignature,
        fingerprint,
      );
      if (existingBug) {
        tickets_skipped.push({
          endpoint: failure.endpoint,
          method: failure.method,
          existing_ticket_number: existingBug.ticket_number,
          reason: `Open bug ${existingBug.ticket_number} already covers this failure`,
        });
        continue;
      }
    } catch {
      // In dry run, if dedup check fails, assume it would be created
    }

    tickets_created.push({
      ticket_number: '(dry run)',
      bug_id: '(dry run)',
      heading,
      endpoint: failure.endpoint,
      priority,
    });
  }

  return { tickets_created, tickets_skipped };
}

/* ──────────────────── Create Tickets ─────────────────────────────────── */

async function createTickets(
  failures: FailureRecord[],
  routeGroup: string,
): Promise<{
  tickets_created: CreatedTicket[];
  tickets_skipped: SkippedDuplicate[];
  tickets_failed: FailedTicket[];
  bulk_ticket?: ProcessTestRunOutput['bulk_ticket'];
}> {
  const tickets_created: CreatedTicket[] = [];
  const tickets_skipped: SkippedDuplicate[] = [];
  const tickets_failed: FailedTicket[] = [];

  const statusId = await fetchDefaultOpenStatusId();

  // Bulk limit: create a single summary ticket when too many failures
  if (failures.length > BULK_LIMIT) {
    const safeHeading = buildSafeBulkHeading(routeGroup, failures.length);
    const description = generateBulkSummaryDescription(
      failures,
      routeGroup,
    );

    log(`Creating bulk summary ticket: ${safeHeading}`);
    const bug = await createBugViaApi(
      safeHeading,
      description,
      statusId,
      'urgent',
    );
    log(`Created ${bug.ticket_number}`);

    // Record all failures in the ledger
    for (const f of failures) {
      appendLedger({
        execution_id: f.execution_id,
        processed_at: new Date().toISOString(),
        ticket_number: bug.ticket_number,
        fingerprint: computeFailureFingerprint(f),
      });
    }

    return {
      tickets_created: [],
      tickets_skipped: [],
      tickets_failed: [],
      bulk_ticket: {
        ticket_number: bug.ticket_number,
        bug_id: bug.id,
        heading: safeHeading,
        failure_count: failures.length,
      },
    };
  }

  // Smart grouping: detect related failures with same root cause
  const { groups, ungrouped } = detectFailureGroups(failures);

  // Create grouped tickets (3+ failures with same 5xx/connection status)
  for (const group of groups) {
    const heading = generateGroupedHeading(group);
    log(
      `Creating grouped ticket for ${group.failures.length} endpoints with status ${group.actual_status}`,
    );

    try {
      const description = generateGroupedDescription(group, routeGroup);
      const bug = await createBugViaApi(
        heading,
        description,
        statusId,
        'urgent',
      );
      log(`Created grouped ticket ${bug.ticket_number}`);
      tickets_created.push({
        ticket_number: bug.ticket_number,
        bug_id: bug.id,
        heading,
        endpoint: `${group.failures.length} endpoints (grouped)`,
        priority: 'urgent',
      });

      // Record all grouped failures in the ledger
      for (const f of group.failures) {
        appendLedger({
          execution_id: f.execution_id,
          processed_at: new Date().toISOString(),
          ticket_number: bug.ticket_number,
          fingerprint: computeFailureFingerprint(f),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      log(`Failed to create grouped ticket: ${message}`);
      for (const f of group.failures) {
        tickets_failed.push({
          endpoint: f.endpoint,
          method: f.method,
          error: message,
        });
      }
    }
  }

  // Process remaining ungrouped failures individually
  for (const failure of ungrouped) {
    const dedupSignature = buildDedupSignature(failure);
    const fingerprint = computeFailureFingerprint(failure);
    const heading = generateHeading(failure);
    const priority = derivePriority(failure);

    log(
      `Checking deduplication for ${failure.method} ${failure.endpoint}...`,
    );

    try {
      const existingBug = await findDuplicateBug(
        failure.endpoint,
        dedupSignature,
        fingerprint,
      );
      if (existingBug) {
        log(
          `Skipping ${failure.method} ${failure.endpoint} \u2014 duplicate of ${existingBug.ticket_number}`,
        );
        tickets_skipped.push({
          endpoint: failure.endpoint,
          method: failure.method,
          existing_ticket_number: existingBug.ticket_number,
          reason: `Open bug ${existingBug.ticket_number} already covers this failure`,
        });
        continue;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      log(
        `Dedup check failed for ${failure.method} ${failure.endpoint}: ${message}`,
      );
    }

    log(`Creating ticket: ${heading}`);

    try {
      const description = generateDescription(failure, routeGroup);
      const bug = await createBugViaApi(
        heading,
        description,
        statusId,
        priority,
      );
      log(`Created ${bug.ticket_number}`);
      tickets_created.push({
        ticket_number: bug.ticket_number,
        bug_id: bug.id,
        heading,
        endpoint: failure.endpoint,
        priority,
      });

      // Record in the ledger
      appendLedger({
        execution_id: failure.execution_id,
        processed_at: new Date().toISOString(),
        ticket_number: bug.ticket_number,
        fingerprint,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      log(
        `Failed to create ticket for ${failure.method} ${failure.endpoint}: ${message}`,
      );
      tickets_failed.push({
        endpoint: failure.endpoint,
        method: failure.method,
        error: message,
      });
    }
  }

  return { tickets_created, tickets_skipped, tickets_failed };
}

/* ──────────────────── Summary Builder ────────────────────────────────── */

function buildSummary(output: ProcessTestRunOutput): string {
  if (output.total_tests_failed === 0) {
    return `No failures found for ${output.route_group}. All tests passed.`;
  }

  if (output.bulk_ticket) {
    const prefix = output.dry_run ? '(dry run) Would create' : 'Created';
    return `${prefix} 1 summary ticket for ${output.bulk_ticket.failure_count} failures (bulk limit exceeded)`;
  }

  const parts: string[] = [];
  if (output.tickets_created.length > 0) {
    const verb = output.dry_run ? 'Would create' : 'Created';
    parts.push(
      `${verb} ${output.tickets_created.length} ticket${output.tickets_created.length > 1 ? 's' : ''}`,
    );
  }
  if (output.tickets_skipped.length > 0) {
    const verb = output.dry_run ? 'would skip' : 'skipped';
    parts.push(
      `${verb} ${output.tickets_skipped.length} duplicate${output.tickets_skipped.length > 1 ? 's' : ''}`,
    );
  }
  if (output.tickets_failed.length > 0) {
    parts.push(`${output.tickets_failed.length} failed to create`);
  }

  return parts.join(', ') || 'No failures to process';
}

/* ──────────────────── Core Logic (reusable) ───────────────────────────── */

export interface ProcessTestRunParams {
  route_group: string;
  test_case_id?: string;
  run_id?: string;
  run_ids?: string[];
  dry_run?: boolean;
}

export async function processTestRun(
  params: ProcessTestRunParams,
): Promise<ProcessTestRunOutput> {
  const { route_group, test_case_id, run_id, run_ids, dry_run } = params;
  const isDryRun = dry_run ?? false;

  // Wrap in file lock to prevent concurrent runs from creating duplicates
  return withLock(async () => {
    try {
      // Step 1: Read failures
      log(`Reading error logs for ${route_group}...`);
      let failures = readFailures(
        route_group,
        test_case_id,
        run_id,
        filePath =>
          log(`Warning: Skipping corrupt JSONL line in ${filePath}`),
      );

      // Filter by multiple run_ids if provided
      if (run_ids && run_ids.length > 0) {
        const idSet = new Set(run_ids);
        failures = failures.filter(f => idSet.has(f.execution_id));
      }

      // Filter out already-processed execution IDs via the local ledger
      if (!isDryRun) {
        const beforeCount = failures.length;
        failures = failures.filter(
          f => !isExecutionProcessed(f.execution_id),
        );
        const ledgerSkipped = beforeCount - failures.length;
        if (ledgerSkipped > 0) {
          log(
            `Skipped ${ledgerSkipped} already-processed execution${ledgerSkipped > 1 ? 's' : ''} (ledger)`,
          );
        }
      }

      log(
        `Found ${failures.length} failure${failures.length !== 1 ? 's' : ''}`,
      );

      // Step 2: No failures — return early
      if (failures.length === 0) {
        return {
          route_group,
          processed_at: new Date().toISOString(),
          total_tests_failed: 0,
          tickets_created: [],
          tickets_skipped: [],
          tickets_failed: [],
          summary: `No failures found for ${route_group}. All tests passed.`,
          dry_run: isDryRun,
        };
      }

      // Step 3: Create tickets (or preview in dry run)
      let tickets_created: CreatedTicket[] = [];
      let tickets_skipped: SkippedDuplicate[] = [];
      let tickets_failed: FailedTicket[] = [];
      let bulk_ticket: ProcessTestRunOutput['bulk_ticket'];

      if (isDryRun) {
        log('Dry run mode — previewing tickets...');
        const preview = await previewTickets(failures, route_group);
        tickets_created = preview.tickets_created;
        tickets_skipped = preview.tickets_skipped;
        bulk_ticket = preview.bulk_ticket;
      } else {
        const result = await createTickets(failures, route_group);
        tickets_created = result.tickets_created;
        tickets_skipped = result.tickets_skipped;
        tickets_failed = result.tickets_failed;
        bulk_ticket = result.bulk_ticket;
      }

      const output: ProcessTestRunOutput = {
        route_group,
        processed_at: new Date().toISOString(),
        total_tests_failed: failures.length,
        tickets_created,
        tickets_skipped,
        tickets_failed,
        ...(bulk_ticket && { bulk_ticket }),
        summary: '',
        dry_run: isDryRun,
      };
      output.summary = buildSummary(output);

      const createdCount =
        tickets_created.length + (bulk_ticket ? 1 : 0);
      const skippedCount = tickets_skipped.length;
      log(
        `Done: ${createdCount} created, ${skippedCount} skipped${tickets_failed.length > 0 ? `, ${tickets_failed.length} failed` : ''}`,
      );

      return output;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      log(`Error: ${message}`);

      return {
        route_group,
        processed_at: new Date().toISOString(),
        total_tests_failed: 0,
        tickets_created: [],
        tickets_skipped: [],
        tickets_failed: [],
        summary: `Error: ${message}`,
        dry_run: isDryRun,
      };
    }
  });
}

/* ──────────────────── Tool Registration ───────────────────────────────── */

export function registerProcessTestRun(server: McpServer) {
  server.tool(
    'process_test_run',
    'Process a test run and detect bugs. Orchestrates the full flow: read error logs → filter failures → create bug tickets. Single-call entry point for automated bug creation after a test run completes.',
    {
      route_group: z
        .string()
        .describe('API route group, e.g. "/v1/auth"'),
      test_case_id: z
        .string()
        .optional()
        .describe('Optional — process a single endpoint only'),
      run_id: z
        .string()
        .optional()
        .describe('Optional — process a specific execution only'),
      dry_run: z
        .boolean()
        .optional()
        .describe(
          'Optional — if true, returns what WOULD be created without creating',
        ),
    },
    async ({ route_group, test_case_id, run_id, dry_run }) => {
      const output = await processTestRun({
        route_group,
        test_case_id,
        run_id,
        dry_run,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
  );
}
