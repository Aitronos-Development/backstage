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
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { ApiTestingClient } from '../api/ApiTestingClient';
import type { TestCase } from '../api/types';

export function useApiTestingClient(): ApiTestingClient {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  return useMemo(
    () => new ApiTestingClient({ discoveryApi, fetchApi }),
    [discoveryApi, fetchApi],
  );
}

export function useRouteGroups() {
  const client = useApiTestingClient();
  const [routeGroups, setRouteGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const groups = await client.getRouteGroups();
      setRouteGroups(groups);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { routeGroups, loading, error, refresh };
}

export function useTestCases(routeGroup: string) {
  const client = useApiTestingClient();
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const cases = await client.getTestCases(routeGroup);
      setTestCases(cases);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, routeGroup]);

  useEffect(() => {
    refresh();
  }, [routeGroup, refresh]);

  return { testCases, loading, error, refresh };
}
