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
import { useState, useCallback } from 'react';
import type { ExecutionResult, TestStatus } from '../api/types';
import { useApiTestingClient } from './useTestCases';

interface TestExecutionState {
  status: TestStatus;
  result?: ExecutionResult;
  executionId?: string;
  error?: string;
}

export function useTestExecution() {
  const client = useApiTestingClient();
  const [states, setStates] = useState<Record<string, TestExecutionState>>({});

  const getState = useCallback(
    (testCaseId: string): TestExecutionState =>
      states[testCaseId] || { status: 'idle' },
    [states],
  );

  const execute = useCallback(
    async (
      testCaseId: string,
      routeGroup: string,
      variables?: Record<string, string>,
      environment?: string,
    ) => {
      setStates(prev => ({
        ...prev,
        [testCaseId]: { status: 'running' },
      }));

      try {
        const result = await client.executeTestCase(
          testCaseId,
          routeGroup,
          variables,
          environment,
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
      const state = states[testCaseId];
      if (state?.executionId) {
        await client.stopExecution(state.executionId);
      }
      setStates(prev => ({
        ...prev,
        [testCaseId]: { status: 'idle' },
      }));
    },
    [client, states],
  );

  const reset = useCallback((testCaseId: string) => {
    setStates(prev => ({
      ...prev,
      [testCaseId]: { status: 'idle' },
    }));
  }, []);

  return { getState, execute, stop, reset, states };
}
