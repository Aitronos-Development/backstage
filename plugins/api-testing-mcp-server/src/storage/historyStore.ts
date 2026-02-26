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
import crypto from 'node:crypto';
import type { ExecutionRecord, FlowStepLog } from './historyTypes';

// eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
const HISTORY_DIR = path.resolve(__dirname, '../../../../.api-testing-history');

function getHistoryDir(): string {
  return HISTORY_DIR;
}

function routeGroupToDirName(routeGroup: string): string {
  return routeGroup.replace(/^\//, '').replace(/\//g, '-');
}

function getEndpointHistoryPath(
  routeGroup: string,
  testCaseId: string,
): string {
  const dir = path.join(getHistoryDir(), routeGroupToDirName(routeGroup));
  return path.join(dir, `${testCaseId}.jsonl`);
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function generateExecutionId(): string {
  const bytes = crypto.randomBytes(4);
  return `exec-${bytes.toString('hex')}`;
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked = { ...headers };
  for (const key of Object.keys(masked)) {
    if (key.toLowerCase() === 'authorization') {
      masked[key] = 'Bearer ***';
    }
  }
  return masked;
}

export function buildExecutionRecord(opts: {
  testCaseId: string;
  testCaseName: string;
  routeGroup: string;
  initiator: 'user' | 'agent';
  agentIdentity?: string;
  durationMs: number;
  pass: boolean;
  failureReason: string | null;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  response: {
    status_code: number;
    headers: Record<string, string>;
    body?: unknown;
  };
  flowStepLog?: FlowStepLog;
}): ExecutionRecord {
  return {
    id: generateExecutionId(),
    timestamp: new Date().toISOString(),
    initiator: opts.initiator,
    ...(opts.agentIdentity && { agent_identity: opts.agentIdentity }),
    test_case_id: opts.testCaseId,
    test_case_name: opts.testCaseName,
    route_group: opts.routeGroup,
    result: opts.pass ? 'pass' : 'fail',
    duration_ms: opts.durationMs,
    request: {
      method: opts.request.method,
      url: opts.request.url,
      headers: maskHeaders(opts.request.headers),
      ...(opts.request.body !== undefined && { body: opts.request.body }),
    },
    response: {
      status_code: opts.response.status_code,
      headers: opts.response.headers,
      ...(opts.response.body !== undefined && { body: opts.response.body }),
    },
    failure_reason: opts.failureReason,
    ...(opts.flowStepLog && { flow_step_log: opts.flowStepLog }),
  };
}

/** Append a single execution record for a specific endpoint */
export async function append(
  routeGroup: string,
  testCaseId: string,
  record: ExecutionRecord,
): Promise<void> {
  const filePath = getEndpointHistoryPath(routeGroup, testCaseId);
  ensureDir(path.dirname(filePath));
  const line = `${JSON.stringify(record)}\n`;
  fs.appendFileSync(filePath, line, 'utf-8');
}

/** Query history for a specific endpoint with filters, returns most recent first */
export async function query(
  routeGroup: string,
  testCaseId: string,
  filters?: {
    initiator?: 'user' | 'agent';
    result?: 'pass' | 'fail';
    limit?: number;
    offset?: number;
  },
): Promise<ExecutionRecord[]> {
  const filePath = getEndpointHistoryPath(routeGroup, testCaseId);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  let records: ExecutionRecord[] = lines.map(line => JSON.parse(line));

  // Sort by timestamp descending (most recent first)
  records.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (filters?.initiator) {
    records = records.filter(r => r.initiator === filters.initiator);
  }
  if (filters?.result) {
    records = records.filter(r => r.result === filters.result);
  }

  const offset = filters?.offset ?? 0;
  const limit = filters?.limit ?? 50;
  return records.slice(offset, offset + limit);
}

/** Get the last N records for a specific endpoint */
export async function tail(
  routeGroup: string,
  testCaseId: string,
  count: number,
): Promise<ExecutionRecord[]> {
  const filePath = getEndpointHistoryPath(routeGroup, testCaseId);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  const recent = lines.slice(-count);
  const records: ExecutionRecord[] = recent.map(line => JSON.parse(line));
  records.reverse();
  return records;
}

/** Query history across all endpoints in a route group */
export async function queryGroup(
  routeGroup: string,
  filters?: {
    initiator?: 'user' | 'agent';
    result?: 'pass' | 'fail';
    limit?: number;
    offset?: number;
  },
): Promise<ExecutionRecord[]> {
  const dirPath = path.join(getHistoryDir(), routeGroupToDirName(routeGroup));
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
  let allRecords: ExecutionRecord[] = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      allRecords.push(JSON.parse(line));
    }
  }

  allRecords.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (filters?.initiator) {
    allRecords = allRecords.filter(r => r.initiator === filters.initiator);
  }
  if (filters?.result) {
    allRecords = allRecords.filter(r => r.result === filters.result);
  }

  const offset = filters?.offset ?? 0;
  const limit = filters?.limit ?? 50;
  return allRecords.slice(offset, offset + limit);
}
