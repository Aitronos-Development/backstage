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
import path from 'node:path';
import type {
  FailureRecord,
  CreatedTicket,
  SkippedDuplicate,
} from '../common/types';
import {
  HISTORY_DIR,
  routeGroupToDirName,
  readAllFilesInDir,
  mapExecutionToFailure,
} from '../common/history';
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
import { appendLedger } from '../common/ledger';
import { detectFailureGroups } from '../common/categorization';

/* ──────────────────── Orchestration ───────────────────────────────────── */

interface CreateBugTicketsOutput {
  created: CreatedTicket[];
  skipped_duplicates: SkippedDuplicate[];
  summary: string;
}

async function processFailures(
  failures: FailureRecord[],
  routeGroup: string,
): Promise<CreateBugTicketsOutput> {
  const created: CreatedTicket[] = [];
  const skipped_duplicates: SkippedDuplicate[] = [];

  const statusId = await fetchDefaultOpenStatusId();

  // Bulk limit: create a single summary ticket when too many failures
  if (failures.length > BULK_LIMIT) {
    const safeHeading = buildSafeBulkHeading(routeGroup, failures.length);
    const description = generateBulkSummaryDescription(failures, routeGroup);

    const bug = await createBugViaApi(
      safeHeading,
      description,
      statusId,
      'urgent',
    );
    created.push({
      ticket_number: bug.ticket_number,
      bug_id: bug.id,
      heading: safeHeading,
      endpoint: routeGroup,
      priority: 'urgent',
    });

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
      created,
      skipped_duplicates,
      summary: `Created 1 summary ticket for ${failures.length} failures (bulk limit exceeded)`,
    };
  }

  // Smart grouping: detect related failures with same root cause
  const { groups, ungrouped } = detectFailureGroups(failures);

  // Create grouped tickets
  for (const group of groups) {
    const heading = generateGroupedHeading(group);
    const description = generateGroupedDescription(group, routeGroup);
    const bug = await createBugViaApi(heading, description, statusId, 'urgent');
    created.push({
      ticket_number: bug.ticket_number,
      bug_id: bug.id,
      heading,
      endpoint: `${group.failures.length} endpoints (grouped)`,
      priority: 'urgent',
    });

    for (const f of group.failures) {
      appendLedger({
        execution_id: f.execution_id,
        processed_at: new Date().toISOString(),
        ticket_number: bug.ticket_number,
        fingerprint: computeFailureFingerprint(f),
      });
    }
  }

  // Process remaining ungrouped failures individually
  for (const failure of ungrouped) {
    const dedupSignature = buildDedupSignature(failure);
    const fingerprint = computeFailureFingerprint(failure);
    const heading = generateHeading(failure);
    const priority = derivePriority(failure);

    // Fingerprint-based deduplication check (with heading fallback)
    const existingBug = await findDuplicateBug(
      failure.endpoint,
      dedupSignature,
      fingerprint,
    );
    if (existingBug) {
      skipped_duplicates.push({
        endpoint: failure.endpoint,
        method: failure.method,
        existing_ticket_number: existingBug.ticket_number,
        reason: `Open bug ${existingBug.ticket_number} already covers this failure`,
      });
      continue;
    }

    // Create ticket
    const description = generateDescription(failure, routeGroup);
    const bug = await createBugViaApi(heading, description, statusId, priority);
    created.push({
      ticket_number: bug.ticket_number,
      bug_id: bug.id,
      heading,
      endpoint: failure.endpoint,
      priority,
    });

    appendLedger({
      execution_id: failure.execution_id,
      processed_at: new Date().toISOString(),
      ticket_number: bug.ticket_number,
      fingerprint,
    });
  }

  const parts: string[] = [];
  if (created.length > 0)
    parts.push(
      `Created ${created.length} ticket${created.length > 1 ? 's' : ''}`,
    );
  if (skipped_duplicates.length > 0)
    parts.push(
      `skipped ${skipped_duplicates.length} duplicate${skipped_duplicates.length > 1 ? 's' : ''}`,
    );
  const summary = parts.join(', ') || 'No failures to process';

  return { created, skipped_duplicates, summary };
}

/* ──────────────────── Tool Registration ───────────────────────────────── */

export function registerCreateBugTickets(server: McpServer) {
  server.tool(
    'create_bug_tickets',
    'Create bug tickets from detected failures. Reads failure data from the API testing history store, generates formatted tickets with deduplication and sensitive data redaction, and creates them in the bug manager.',
    {
      route_group: z
        .string()
        .describe('API route group, e.g. "/v1/auth"'),
      run_id: z
        .string()
        .optional()
        .describe('Filter to a specific execution run ID'),
    },
    async ({ route_group, run_id }) => {
      try {
        // Read failures from JSONL history
        const dirPath = path.join(
          HISTORY_DIR,
          routeGroupToDirName(route_group),
        );
        const records = readAllFilesInDir(dirPath);

        // Filter to failures only
        let failedRecords = records.filter(r => r.result === 'fail');

        // Filter by run_id if provided
        if (run_id) {
          failedRecords = failedRecords.filter(r => r.id === run_id);
        }

        // Sort by timestamp descending (most recent first)
        failedRecords.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() -
            new Date(a.timestamp).getTime(),
        );

        // Map to FailureRecord format
        const failures: FailureRecord[] =
          failedRecords.map(mapExecutionToFailure);

        if (failures.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    created: [],
                    skipped_duplicates: [],
                    summary:
                      'No failures found for the given route group',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const result = await processFailures(failures, route_group);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: message,
                  created: [],
                  skipped_duplicates: [],
                  summary: `Failed: ${message}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
