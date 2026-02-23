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
  const disposedRef = useRef(false);
  const callbackRef = useRef(onTestCasesChanged);
  callbackRef.current = onTestCasesChanged;
  const execCallbackRef = useRef(onExecutionCompleted);
  execCallbackRef.current = onExecutionCompleted;

  const connect = useCallback(async () => {
    if (disposedRef.current) return;

    try {
      const baseUrl = await discoveryApi.getBaseUrl('api-testing');
      if (disposedRef.current) return;

      const wsUrl = `${baseUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!disposedRef.current) {
          setConnected(true);
        }
      };

      ws.onmessage = event => {
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
        if (!disposedRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      if (!disposedRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      }
    }
  }, [discoveryApi]);

  useEffect(() => {
    disposedRef.current = false;
    connect();

    return () => {
      disposedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { connected };
}
