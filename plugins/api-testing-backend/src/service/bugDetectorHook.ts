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
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface BugDetectorConfig {
  enabled: boolean;
  url: string;
}

export interface BugDetectorTicket {
  ticket_number: string;
  heading: string;
}

export interface BugDetectorResult {
  tickets_created: Array<{
    ticket_number: string;
    heading: string;
    endpoint: string;
    priority: string;
  }>;
  tickets_skipped: Array<{
    endpoint: string;
    existing_ticket_number: string;
  }>;
  tickets_failed: Array<{
    endpoint: string;
    error: string;
  }>;
  summary: string;
}

export async function fireBugDetectorHook(
  config: BugDetectorConfig,
  routeGroup: string,
  failedRunIds: string[],
  logger: LoggerService,
): Promise<BugDetectorResult | undefined> {
  if (!config.enabled) return undefined;

  try {
    const response = await fetch(`${config.url}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route_group: routeGroup,
        run_ids: failedRunIds,
      }),
    });

    if (!response.ok) {
      logger.warn(
        `Bug detector returned ${response.status}: ${await response.text()}`,
      );
      return undefined;
    }

    const result = (await response.json()) as BugDetectorResult;
    logger.info(
      `Bug detector: ${result.tickets_created?.length ?? 0} tickets created, ` +
        `${result.tickets_skipped?.length ?? 0} duplicates skipped`,
    );

    return result;
  } catch (err) {
    logger.warn(
      'Bug detector hook failed — is the MCP server running?',
      err as Error,
    );
    return undefined;
  }
}
