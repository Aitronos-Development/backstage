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
import type { FailureRecord } from './types';

export type FailureCategory =
  | 'server-error'
  | 'auth-failure'
  | 'validation-error'
  | 'timeout'
  | 'connection-error'
  | 'unexpected-status';

/**
 * Categorize a failure based on its status code and error reason.
 */
export function categorizeFailure(failure: FailureRecord): FailureCategory {
  const { actual_status, failure_reason } = failure;
  const reason = failure_reason.toLowerCase();

  if (actual_status >= 500 && actual_status < 600) {
    return 'server-error';
  }
  if (actual_status === 401 || actual_status === 403) {
    return 'auth-failure';
  }
  if (/schema/i.test(failure_reason) || /body_contains/i.test(failure_reason)) {
    return 'validation-error';
  }
  if (/timeout/i.test(reason) || /etimedout/i.test(reason)) {
    return 'timeout';
  }
  if (/econnrefused/i.test(reason) || /econnreset/i.test(reason)) {
    return 'connection-error';
  }

  return 'unexpected-status';
}

/** The minimum number of failures with the same root cause to trigger grouping. */
export const GROUPING_THRESHOLD = 3;

export interface FailureGroup {
  key: string;
  category: FailureCategory;
  actual_status: number;
  failures: FailureRecord[];
}

/**
 * Detect groups of related failures that share the same root cause.
 * Only groups 5xx and connection-related failures when 3+ share the same status.
 * Returns grouped failures and the remaining ungrouped ones.
 */
export function detectFailureGroups(failures: FailureRecord[]): {
  groups: FailureGroup[];
  ungrouped: FailureRecord[];
} {
  // Only group 5xx and connection-related failures
  const groupable: FailureRecord[] = [];
  const ungrouped: FailureRecord[] = [];

  for (const f of failures) {
    const cat = categorizeFailure(f);
    if (
      cat === 'server-error' ||
      cat === 'connection-error' ||
      cat === 'timeout'
    ) {
      groupable.push(f);
    } else {
      ungrouped.push(f);
    }
  }

  // Group by actual_status
  const byStatus = new Map<number, FailureRecord[]>();
  for (const f of groupable) {
    const existing = byStatus.get(f.actual_status) ?? [];
    existing.push(f);
    byStatus.set(f.actual_status, existing);
  }

  const groups: FailureGroup[] = [];
  for (const [status, members] of byStatus) {
    if (members.length >= GROUPING_THRESHOLD) {
      groups.push({
        key: `status-${status}`,
        category: categorizeFailure(members[0]),
        actual_status: status,
        failures: members,
      });
    } else {
      // Not enough to group — treat individually
      ungrouped.push(...members);
    }
  }

  return { groups, ungrouped };
}
