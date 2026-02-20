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

export interface RouteGroupFile {
  route_group: string;
  test_cases: TestCase[];
}
