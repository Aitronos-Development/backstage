import { useEffect, useRef, useCallback, useState } from 'react';
import { useApi, discoveryApiRef } from '@backstage/core-plugin-api';
import type { ExecutionRecord } from '../api/types';

interface WebSocketMessage {
  type: string;
  routeGroup: string;
  testCaseId?: string;
  record?: ExecutionRecord;
}

export function useWebSocket(
  onTestCasesChanged: (routeGroup: string) => void,
  onExecutionCompleted?: (
    routeGroup: string,
    testCaseId: string,
    record: ExecutionRecord,
  ) => void,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef(onTestCasesChanged);
  callbackRef.current = onTestCasesChanged;
  const execCallbackRef = useRef(onExecutionCompleted);
  execCallbackRef.current = onExecutionCompleted;

  const connect = useCallback(async () => {
    try {
      const baseUrl = await discoveryApi.getBaseUrl('api-testing');
      const wsUrl = baseUrl
        .replace(/^http/, 'ws')
        .replace(/\/$/, '') + '/ws';

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          if (message.type === 'test-cases-changed') {
            callbackRef.current(message.routeGroup);
          } else if (
            message.type === 'execution-completed' &&
            message.testCaseId &&
            message.record
          ) {
            execCallbackRef.current?.(
              message.routeGroup,
              message.testCaseId,
              message.record,
            );
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Reconnect with exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // Retry connection
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, [discoveryApi]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}
