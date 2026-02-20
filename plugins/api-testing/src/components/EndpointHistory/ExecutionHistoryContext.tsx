import { createContext, useContext } from 'react';
import type { ExecutionRecord } from '../../api/types';

export interface ExecutionHistoryContextValue {
  registerListener: (
    testCaseId: string,
    callback: (record: ExecutionRecord) => void,
  ) => void;
  unregisterListener: (testCaseId: string) => void;
}

export const ExecutionHistoryContext =
  createContext<ExecutionHistoryContextValue | null>(null);

export function useExecutionHistoryContext(): ExecutionHistoryContextValue | null {
  return useContext(ExecutionHistoryContext);
}
