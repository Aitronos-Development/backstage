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
  EnvironmentOverride,
  EnvironmentOverrides,
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

  /** Read error detail from a non-ok response body, falling back to statusText */
  private async extractResponseError(
    response: Response,
    fallbackPrefix: string,
  ): Promise<string> {
    try {
      const body = await response.json();
      const msg =
        body?.error?.message || body?.message || body?.error || undefined;
      if (typeof msg === 'string') return `${fallbackPrefix}: ${msg}`;
    } catch {
      // body not JSON — ignore
    }
    return `${fallbackPrefix}: ${response.statusText}`;
  }

  async getRouteGroups(): Promise<string[]> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/route-groups`);
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to fetch route groups'),
      );
    }
    return response.json();
  }

  async getConfig(): Promise<ApiTestingConfig> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/config`);
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to fetch config'),
      );
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
      throw new Error(
        await this.extractResponseError(response, 'Failed to extract variables'),
      );
    }
    const data = await response.json();
    return data.variables;
  }

  async getTestCases(routeGroup: string): Promise<TestCase[]> {
    const base = await this.baseUrl();
    const encoded = this.encodeRouteGroup(routeGroup);
    const response = await this.fetchApi.fetch(`${base}/test-cases/${encoded}`);
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to fetch test cases'),
      );
    }
    return response.json();
  }

  async executeTestCase(
    testCaseId: string,
    routeGroup: string,
    variables?: Record<string, string>,
    environment?: string,
    initiator?: 'user' | 'agent',
    executionId?: string,
  ): Promise<ExecutionResult> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCaseId, routeGroup, variables, environment, initiator, executionId }),
    });
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to execute test case'),
      );
    }
    return response.json();
  }

  async executeAll(
    routeGroup: string,
    variables?: Record<string, string>,
    environment?: string,
    initiator?: 'user' | 'agent',
    testCaseIds?: string[],
  ): Promise<
    Array<{ testCaseId: string; result: Omit<ExecutionResult, 'executionId'> }>
  > {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/execute-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeGroup, variables, environment, initiator, testCaseIds }),
    });
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to execute all tests'),
      );
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
      throw new Error(
        await this.extractResponseError(response, 'Failed to stop execution'),
      );
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
      throw new Error(
        await this.extractResponseError(response, 'Failed to fetch endpoint history'),
      );
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
      throw new Error(
        await this.extractResponseError(response, 'Failed to fetch route group history'),
      );
    }
    return response.json();
  }

  async getConfigOverrides(): Promise<EnvironmentOverrides> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(`${base}/config/overrides`);
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to fetch config overrides'),
      );
    }
    return response.json();
  }

  async putEnvironment(
    envName: string,
    override: EnvironmentOverride,
  ): Promise<void> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(
      `${base}/config/environments/${encodeURIComponent(envName)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(override),
      },
    );
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to save environment'),
      );
    }
  }

  async deleteEnvironment(envName: string): Promise<void> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(
      `${base}/config/environments/${encodeURIComponent(envName)}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to delete environment'),
      );
    }
  }

  async setDefaultEnvironment(envName: string): Promise<void> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(
      `${base}/config/default-environment`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: envName }),
      },
    );
    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to set default environment'),
      );
    }
  }

  getWebSocketUrl(): string {
    // WebSocket URL derives from the discovery base URL
    // Replace http(s) with ws(s)
    return '';
  }

  // Orchestrator methods
  async runWithOrchestrator(
    routeGroup: string,
    variables?: Record<string, string>,
    environment?: string
  ): Promise<{ runId: string; status: string; summary: any; duration: number }> {
    const base = await this.baseUrl();
    const encoded = this.encodeRouteGroup(routeGroup);
    const response = await this.fetchApi.fetch(
      `${base}/orchestrator/run/${encoded}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables, environment }),
      }
    );

    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to run orchestrator')
      );
    }

    return response.json();
  }

  async getOrchestratorStatus(runId: string): Promise<any> {
    const base = await this.baseUrl();
    const response = await this.fetchApi.fetch(
      `${base}/orchestrator/status/${runId}`
    );

    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to get orchestrator status')
      );
    }

    return response.json();
  }

  async getOrchestratorHistory(
    routeGroup: string,
    limit?: number
  ): Promise<{ history: any[] }> {
    const base = await this.baseUrl();
    const encoded = this.encodeRouteGroup(routeGroup);
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());

    const response = await this.fetchApi.fetch(
      `${base}/orchestrator/history/${encoded}?${params}`
    );

    if (!response.ok) {
      throw new Error(
        await this.extractResponseError(response, 'Failed to get orchestrator history')
      );
    }

    return response.json();
  }
}
