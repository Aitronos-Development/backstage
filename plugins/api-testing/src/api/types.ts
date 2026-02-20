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
  created_at: string;
  updated_at: string;
}

export interface ExecutionResult {
  executionId: string;
  pass: boolean;
  aborted?: boolean;
  statusCode: number;
  expectedStatusCode: number | undefined;
  responseTime: number;
  details: {
    bodyContainsFailures?: Record<string, { expected: unknown; actual: unknown }>;
    missingFields?: string[];
    responseBody?: unknown;
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

export type VariableSource = 'app-config' | 'localStorage' | 'runtime';

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
}
