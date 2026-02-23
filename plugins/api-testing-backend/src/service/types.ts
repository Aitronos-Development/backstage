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

export interface RouteGroupFile {
  route_group: string;
  test_cases: TestCase[];
}
