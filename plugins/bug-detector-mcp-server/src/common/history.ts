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
import type { ExecutionRecord, FailureRecord } from './types';

// eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
// eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
export const HISTORY_DIR = path.resolve(
  __dirname,
  '../../../../.api-testing-history',
);

export function routeGroupToDirName(routeGroup: string): string {
  return routeGroup.replace(/^\//, '').replace(/\//g, '-');
}

export function readJsonlFile(
  filePath: string,
  onCorruptLine?: (filePath: string) => void,
): ExecutionRecord[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  const records: ExecutionRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      onCorruptLine?.(filePath);
    }
  }
  return records;
}

export function readAllFilesInDir(
  dirPath: string,
  onCorruptLine?: (filePath: string) => void,
): ExecutionRecord[] {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
  const records: ExecutionRecord[] = [];
  for (const file of files) {
    records.push(
      ...readJsonlFile(path.join(dirPath, file), onCorruptLine),
    );
  }
  return records;
}

export function mapExecutionToFailure(r: ExecutionRecord): FailureRecord {
  return {
    execution_id: r.id,
    timestamp: r.timestamp,
    test_case_id: r.test_case_id,
    test_case_name: r.test_case_name,
    endpoint: r.request.url,
    method: r.request.method,
    actual_status: r.response.status_code,
    failure_reason: r.failure_reason ?? 'Unknown failure',
    route_group: r.route_group,
    request: r.request,
    response: r.response,
    duration_ms: r.duration_ms,
  };
}

export function readFailures(
  routeGroup: string,
  testCaseId?: string,
  runId?: string,
  onCorruptLine?: (filePath: string) => void,
): FailureRecord[] {
  const dirName = routeGroupToDirName(routeGroup);

  let records: ExecutionRecord[];
  if (testCaseId) {
    const filePath = path.join(
      HISTORY_DIR,
      dirName,
      `${testCaseId}.jsonl`,
    );
    records = readJsonlFile(filePath, onCorruptLine);
  } else {
    const dirPath = path.join(HISTORY_DIR, dirName);
    records = readAllFilesInDir(dirPath, onCorruptLine);
  }

  let failures = records.filter(r => r.result === 'fail');

  if (runId) {
    failures = failures.filter(r => r.id === runId);
  }

  failures.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return failures.map(mapExecutionToFailure);
}
