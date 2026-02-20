import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getApiTestsDir } from './fileStore';
import type { ExecutionRecord } from './historyTypes';

function getHistoryDir(): string {
  return path.join(getApiTestsDir(), '.history');
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

function maskHeaders(
  headers: Record<string, string>,
): Record<string, string> {
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
  const line = JSON.stringify(record) + '\n';
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

  // Apply filters
  if (filters?.initiator) {
    records = records.filter(r => r.initiator === filters.initiator);
  }
  if (filters?.result) {
    records = records.filter(r => r.result === filters.result);
  }

  // Apply pagination
  const offset = filters?.offset ?? 0;
  const limit = filters?.limit ?? 50;
  return records.slice(offset, offset + limit);
}

/** Get the last N records for a specific endpoint (reads from end of file) */
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

  // Take the last `count` lines and parse them
  const recent = lines.slice(-count);
  const records: ExecutionRecord[] = recent.map(line => JSON.parse(line));

  // Return most recent first
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

  // Sort by timestamp descending
  allRecords.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Apply filters
  if (filters?.initiator) {
    allRecords = allRecords.filter(r => r.initiator === filters.initiator);
  }
  if (filters?.result) {
    allRecords = allRecords.filter(r => r.result === filters.result);
  }

  // Apply pagination
  const offset = filters?.offset ?? 0;
  const limit = filters?.limit ?? 50;
  return allRecords.slice(offset, offset + limit);
}
