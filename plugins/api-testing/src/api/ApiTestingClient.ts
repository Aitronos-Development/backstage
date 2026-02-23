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
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type {
  TestCase,
  ExecutionResult,
  ExecutionRecord,
  ApiTestingConfig,
} from './types';

export class ApiTestingClient {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('api-testing');
  }

  /** Encode a route group for use in URL paths: `/v1/health` → `v1-health` */
  private encodeRouteGroup(routeGroup: string): string {
    return routeGroup.replace(/^\//, '').replace(/\//g, '-');
  }

  async getRouteGroups(): Promise<string[]> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/route-groups`);
    if (!response.ok) {
      throw new Error(`Failed to fetch route groups: ${response.statusText}`);
    }
    return response.json();
  }

  async getConfig(): Promise<ApiTestingConfig> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/config`);
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.statusText}`);
    }
    return response.json();
  }

  async extractVariables(
    testCaseId: string,
    routeGroup: string,
  ): Promise<string[]> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/variables/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCaseId, routeGroup }),
    });
    if (!response.ok) {
      throw new Error(`Failed to extract variables: ${response.statusText}`);
    }
    const data = await response.json();
    return data.variables;
  }

  async getTestCases(routeGroup: string): Promise<TestCase[]> {
    const base = await this.baseUrl();
    const encoded = this.encodeRouteGroup(routeGroup);
    const response = await this.fetchApi.fetch(`${base}/test-cases/${encoded}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch test cases: ${response.statusText}`);
    }
    return response.json();
  }

  async executeTestCase(
    testCaseId: string,
    routeGroup: string,
    variables?: Record<string, string>,
    environment?: string,
  ): Promise<ExecutionResult> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCaseId, routeGroup, variables, environment }),
    });
    if (!response.ok) {
      throw new Error(`Failed to execute test case: ${response.statusText}`);
    }
    return response.json();
  }

  async executeAll(
    routeGroup: string,
    variables?: Record<string, string>,
    environment?: string,
  ): Promise<Array<{ testCaseId: string; result: Omit<ExecutionResult, 'executionId'> }>> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/execute-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeGroup, variables, environment }),
    });
    if (!response.ok) {
      throw new Error(`Failed to execute all tests: ${response.statusText}`);
    }
    return response.json();
  }

  async stopExecution(executionId: string): Promise<{ stopped: boolean }> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executionId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to stop execution: ${response.statusText}`);
    }
    return response.json();
  }

  async getEndpointHistory(
    routeGroup: string,
    testCaseId: string,
    options?: {
      initiator?: 'user' | 'agent';
      result?: 'pass' | 'fail';
      limit?: number;
      offset?: number;
    },
  ): Promise<ExecutionRecord[]> {
    const base = await this.baseUrl();
    const encoded = this.encodeRouteGroup(routeGroup);
    const params = new URLSearchParams();
    if (options?.initiator) params.set('initiator', options.initiator);
    if (options?.result) params.set('result', options.result);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const qs = params.toString();
    const url = `${base}/history/${encoded}/${testCaseId}${qs ? `?${qs}` : ''}`;
    const response = await this.fetchApi.fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch endpoint history: ${response.statusText}`);
    }
    return response.json();
  }

  async getRouteGroupHistory(
    routeGroup: string,
    options?: {
      initiator?: 'user' | 'agent';
      result?: 'pass' | 'fail';
      limit?: number;
      offset?: number;
    },
  ): Promise<ExecutionRecord[]> {
    const base = await this.baseUrl();
    const encoded = this.encodeRouteGroup(routeGroup);
    const params = new URLSearchParams();
    if (options?.initiator) params.set('initiator', options.initiator);
    if (options?.result) params.set('result', options.result);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const qs = params.toString();
    const url = `${base}/history/${encoded}${qs ? `?${qs}` : ''}`;
    const response = await this.fetchApi.fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch route group history: ${response.statusText}`);
    }
    return response.json();
  }

  getWebSocketUrl(): string {
    // WebSocket URL derives from the discovery base URL
    // Replace http(s) with ws(s)
    return '';
  }
}
