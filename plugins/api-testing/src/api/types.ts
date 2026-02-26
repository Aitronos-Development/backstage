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
export interface FlowMetadata {
  file: string;
  steps: string[];
  markers: string[];
}

export interface TestCase {
  id: string;
  name: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  assertions: {
    status_code?: number;
    body_contains?: Record<string, unknown>;
    body_schema?: {
      required_fields?: string[];
    };
  };
  flow_metadata?: FlowMetadata;
  created_at: string;
  updated_at: string;
}

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

export interface ExecutionResult {
  executionId: string;
  pass: boolean;
  aborted?: boolean;
  statusCode: number;
  expectedStatusCode: number | undefined;
  responseTime: number;
  details: {
    bodyContainsFailures?: Record<
      string,
      { expected: unknown; actual: unknown }
    >;
    missingFields?: string[];
    responseBody?: unknown;
    flowStepLog?: FlowStepLog;
  };
}

export type TestStatus = 'idle' | 'running' | 'pass' | 'fail';

export interface RouteGroupStatus {
  routeGroup: string;
  status: 'neutral' | 'pass' | 'fail' | 'running';
}

export interface ApiTestingEnvironment {
  baseUrl: string;
  variables: Record<string, string>;
}

export interface ApiTestingConfig {
  defaultEnvironment: string;
  environments: Record<string, ApiTestingEnvironment>;
}

export interface EnvironmentOverride {
  baseUrl: string;
  variables: Record<string, string>;
}

export interface EnvironmentOverrides {
  defaultEnvironment?: string;
  environments: Record<string, EnvironmentOverride>;
}

export type VariableSource = 'app-config' | 'saved' | 'runtime';

export interface ResolvedVariable {
  key: string;
  value: string;
  source: VariableSource;
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
