import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApiTestingClient } from './useTestCases';
import type { ExecutionRecord } from '../api/types';

export function useExecutionHistory(
  routeGroup: string,
  testCaseId: string,
) {
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
      const data = await client.getEndpointHistory(
        routeGroup,
        testCaseId,
        { limit: pageSize, offset: 0 },
      );
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
      const data = await client.getEndpointHistory(
        routeGroup,
        testCaseId,
        { limit: pageSize, offset: allRecords.length },
      );
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
  }, [routeGroup, testCaseId]);

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
