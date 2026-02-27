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

export interface FlowHttpCall {
  method: string;
  url: string;
  status_code: number;
  duration_ms: number;
  request_body_excerpt: string | null;
  response_body_excerpt: string | null;
}

export interface FlowStepDetail {
  name: string;
  status: 'pass' | 'fail';
  duration_ms: number;
  error?: string;
  http_calls: FlowHttpCall[];
}

export interface FlowStepLog {
  steps: FlowStepDetail[];
}

export interface ExecutionRecord {
  id: string;
  timestamp: string;
  initiator: 'user' | 'agent';
  agent_identity?: string;
  test_case_id: string;
  test_case_name: string;
  route_group: string;
  result: 'pass' | 'fail';
  duration_ms: number;
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
  failure_reason: string | null;
  flow_step_log?: FlowStepLog;
}

export interface FailureRecord {
  execution_id: string;
  timestamp: string;
  test_case_id: string;
  test_case_name: string;
  endpoint: string;
  method: string;
  actual_status: number;
  failure_reason: string;
  route_group: string;
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
  duration_ms?: number;
}

export interface CreatedTicket {
  ticket_number: string;
  bug_id: string;
  heading: string;
  endpoint: string;
  priority: 'urgent' | 'medium' | 'low';
}

export interface SkippedDuplicate {
  endpoint: string;
  method: string;
  existing_ticket_number: string;
  reason: string;
}

export interface FailedTicket {
  endpoint: string;
  method: string;
  error: string;
}

export interface StatusRow {
  id: string;
  label: string;
  color: string;
  order: number;
}

export interface BugRow {
  id: string;
  ticket_number: string;
  heading: string;
  description: string | null;
  priority: 'urgent' | 'medium' | 'low';
  status_id: string;
  assignee_id: string | null;
  reporter_id: string;
  is_closed: boolean;
}
