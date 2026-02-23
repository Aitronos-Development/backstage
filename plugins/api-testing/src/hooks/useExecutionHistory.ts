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
import { useApiTestingClient } from './useTestCases';
import type { ExecutionRecord } from '../api/types';

export function useExecutionHistory(routeGroup: string, testCaseId: string) {
  const client = useApiTestingClient();
  // allRecords stores the full unfiltered data from the server
  const [allRecords, setAllRecords] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState<{
    initiator?: 'user' | 'agent';
    result?: 'pass' | 'fail';
  }>({});

  const pageSize = 20;

  // Initial load (no filters — fetch all recent records)
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await client.getEndpointHistory(routeGroup, testCaseId, {
        limit: pageSize,
        offset: 0,
      });
      setAllRecords(data);
      setHasMore(data.length >= pageSize);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, routeGroup, testCaseId]);

  const loadMore = useCallback(async () => {
    try {
      const data = await client.getEndpointHistory(routeGroup, testCaseId, {
        limit: pageSize,
        offset: allRecords.length,
      });
      setAllRecords(prev => [...prev, ...data]);
      setHasMore(data.length >= pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [client, routeGroup, testCaseId, allRecords.length]);

  const prependRecord = useCallback((record: ExecutionRecord) => {
    setAllRecords(prev => [record, ...prev]);
  }, []);

  useEffect(() => {
    refresh();
  }, [routeGroup, testCaseId, refresh]);

  // Client-side filtering — no server round-trip on filter toggle
  const records = useMemo(() => {
    return allRecords.filter(r => {
      if (filters.initiator && r.initiator !== filters.initiator) return false;
      if (filters.result && r.result !== filters.result) return false;
      return true;
    });
  }, [allRecords, filters]);

  return {
    records,
    loading,
    error,
    hasMore,
    filters,
    setFilters,
    refresh,
    loadMore,
    prependRecord,
  };
}
