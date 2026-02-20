import { useState, useEffect, useCallback } from 'react';
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
  return new ApiTestingClient({ discoveryApi, fetchApi });
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
  }, []);

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
  }, [routeGroup]);

  return { testCases, loading, error, refresh };
}
