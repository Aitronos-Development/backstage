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
import { useState, useCallback, useRef, useMemo } from 'react';
import type { ExecutionResult, TestStatus } from '../api/types';
import { useApiTestingClient } from './useTestCases';

interface TestExecutionState {
  status: TestStatus;
  result?: ExecutionResult;
  executionId?: string;
  error?: string;
}

const IDLE_STATE: TestExecutionState = { status: 'idle' };

export function useTestExecution() {
  const client = useApiTestingClient();
  const [states, setStates] = useState<Record<string, TestExecutionState>>({});

  // Keep a ref to the latest states so callbacks don't need states in their
  // dependency arrays (which would recreate the callbacks on every state change
  // and destabilize the returned object).
  const statesRef = useRef(states);
  statesRef.current = states;

  const getState = useCallback(
    (testCaseId: string): TestExecutionState =>
      statesRef.current[testCaseId] || IDLE_STATE,
    [],
  );

  const execute = useCallback(
    async (
      testCaseId: string,
      routeGroup: string,
      variables?: Record<string, string>,
      environment?: string,
    ) => {
      // Generate executionId upfront so stop() can use it immediately
      const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setStates(prev => ({
        ...prev,
        [testCaseId]: { status: 'running', executionId },
      }));

      try {
        const result = await client.executeTestCase(
          testCaseId,
          routeGroup,
          variables,
          environment,
          undefined,
          executionId,
        );
        setStates(prev => ({
          ...prev,
          [testCaseId]: {
            status: result.pass ? 'pass' : 'fail',
            result,
            executionId: result.executionId,
          },
        }));
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStates(prev => ({
          ...prev,
          [testCaseId]: { status: 'fail', error: message },
        }));
        return undefined;
      }
    },
    [client],
  );

  const stop = useCallback(
    async (testCaseId: string) => {
      const state = statesRef.current[testCaseId];
      if (state?.executionId) {
        await client.stopExecution(state.executionId);
      }
      setStates(prev => ({
        ...prev,
        [testCaseId]: { status: 'idle' },
      }));
    },
    [client],
  );

  const executeAll = useCallback(
    async (
      testCaseIds: string[],
      routeGroup: string,
      variables?: Record<string, string>,
      environment?: string,
    ) => {
      // Mark all tests as running
      setStates(prev => {
        const next = { ...prev };
        for (const id of testCaseIds) {
          next[id] = { status: 'running' };
        }
        return next;
      });

      try {
        const results = await client.executeAll(
          routeGroup,
          variables,
          environment,
          undefined,
          testCaseIds,
        );

        // Update states from batch response
        setStates(prev => {
          const next = { ...prev };
          for (const entry of results) {
            next[entry.testCaseId] = {
              status: entry.result.pass ? 'pass' : 'fail',
              result: entry.result as ExecutionResult,
            };
          }
          return next;
        });

        return results;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStates(prev => {
          const next = { ...prev };
          for (const id of testCaseIds) {
            next[id] = { status: 'fail', error: message };
          }
          return next;
        });
        return undefined;
      }
    },
    [client],
  );

  const reset = useCallback((testCaseId: string) => {
    setStates(prev => ({
      ...prev,
      [testCaseId]: { status: 'idle' },
    }));
  }, []);

  // Return a stable object reference that only changes when states changes.
  // The callbacks above are stable (they use refs instead of states in deps),
  // so this memo only re-fires when states actually changes.
  return useMemo(
    () => ({ getState, execute, executeAll, stop, reset, states }),
    [getState, execute, executeAll, stop, reset, states],
  );
}
