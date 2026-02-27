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
import type { StatusRow, BugRow } from './types';
import { extractFingerprint } from './fingerprint';

export const BUG_MANAGER_BASE_URL =
  'http://localhost:7007/api/bug-manager';

export async function fetchDefaultOpenStatusId(): Promise<string> {
  const res = await fetch(`${BUG_MANAGER_BASE_URL}/statuses`);
  if (!res.ok) {
    throw new Error(
      `Bug manager unreachable at ${BUG_MANAGER_BASE_URL}: ${res.status} ${res.statusText}`,
    );
  }
  const statuses: StatusRow[] = (await res.json()) as StatusRow[];
  if (statuses.length === 0) {
    throw new Error('No statuses found in bug manager');
  }
  // Statuses come back ordered by `order` ASC from the API
  return statuses[0].id;
}

/**
 * Find a duplicate open bug by fingerprint (preferred) or heading match (fallback).
 * Phase 5 fingerprint-based dedup: extracts the fingerprint marker from bug descriptions
 * and compares against the computed fingerprint for the current failure.
 */
export async function findDuplicateBug(
  endpoint: string,
  dedupSignature: string,
  fingerprint?: string,
): Promise<BugRow | null> {
  const searchUrl = new URL(`${BUG_MANAGER_BASE_URL}/bugs`);
  searchUrl.searchParams.set('search', endpoint);
  searchUrl.searchParams.set('includeClosed', 'false');

  const res = await fetch(searchUrl.toString());
  if (!res.ok) {
    throw new Error(
      `Failed to search bugs: ${res.status} ${res.statusText}`,
    );
  }
  const bugs: BugRow[] = (await res.json()) as BugRow[];

  // Fingerprint-based match (more robust)
  if (fingerprint) {
    const fpMatch = bugs.find(bug => {
      const existing = extractFingerprint(bug.description);
      return existing === fingerprint;
    });
    if (fpMatch) return fpMatch;
  }

  // Fallback: heading-based match
  return bugs.find(bug => bug.heading.includes(dedupSignature)) ?? null;
}

export async function createBugViaApi(
  heading: string,
  description: string,
  statusId: string,
  priority: 'urgent' | 'medium' | 'low',
): Promise<BugRow> {
  const res = await fetch(`${BUG_MANAGER_BASE_URL}/bugs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      heading,
      description,
      statusId,
      priority,
      assigneeId: null,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Failed to create bug: ${res.status} ${res.statusText} \u2014 ${errBody}`,
    );
  }
  return res.json() as Promise<BugRow>;
}
