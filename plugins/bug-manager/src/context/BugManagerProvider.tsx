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

import {
  createContext,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useAsync } from 'react-use';
import {
  Bug,
  BugFilters,
  CreateBugRequest,
  CreateStatusRequest,
  Status,
  UpdateBugRequest,
  UpdateStatusRequest,
  User,
} from '../api/types';
import { useApi } from '@backstage/core-plugin-api';
import { bugManagerApiRef } from '../api/BugManagerApi';

export interface BugManagerContextValue {
  bugs: Bug[];
  statuses: Status[];
  filters: BugFilters;
  activeView: 'list' | 'board';
  selectedBugId: string | null;
  loading: boolean;
  error: string | null;
  includeClosed: boolean;
  setIncludeClosed: (v: boolean) => void;
  assignees: User[];
  selectedAssigneeIds: string[];
  toggleAssignee: (id: string) => void;
  clearAssigneeFilter: () => void;

  createBug: (req: CreateBugRequest) => Promise<void>;
  updateBug: (id: string, updates: UpdateBugRequest) => Promise<void>;
  closeBug: (id: string) => Promise<void>;
  reopenBug: (id: string) => Promise<void>;
  createStatus: (req: CreateStatusRequest) => Promise<void>;
  updateStatus: (id: string, updates: UpdateStatusRequest) => Promise<void>;
  deleteStatus: (id: string, replacementStatusId: string) => Promise<void>;
  addComment: (bugId: string, content: string, parentCommentId?: string) => Promise<void>;
  setFilters: (filters: BugFilters) => void;
  setView: (view: 'list' | 'board') => void;
  selectBug: (id: string | null) => void;
  invalidate: () => void;
}

export const BugManagerContext = createContext<BugManagerContextValue | undefined>(
  undefined,
);

export const BugManagerProvider = ({ children }: { children: ReactNode }) => {
  const api = useApi(bugManagerApiRef);

  const [filters, setFilters] = useState<BugFilters>({});
  const [activeView, setActiveView] = useState<'list' | 'board'>('list');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);

  // Incrementing this triggers all useAsync hooks that depend on it to re-run
  const [fetchKey, setFetchKey] = useState(0);
  const invalidate = useCallback(() => setFetchKey(k => k + 1), []);

  // ── Main data fetch ───────────────────────────────────────────────────────
  // Re-runs whenever filters, selectedAssigneeIds, includeClosed, or fetchKey change
  const {
    value: bugs = [],
    loading: bugsLoading,
    error: bugsError,
  } = useAsync(async () => {
    return api.getBugs({
      ...filters,
      assignees: selectedAssigneeIds.length ? selectedAssigneeIds : undefined,
      includeClosed,
    });
  }, [filters, selectedAssigneeIds, includeClosed, fetchKey, api]);

  // ── Statuses fetch ────────────────────────────────────────────────────────
  const {
    value: statuses = [],
    loading: statusesLoading,
  } = useAsync(async () => {
    return api.getStatuses();
  }, [fetchKey, api]);

  // ── Assignees fetch ───────────────────────────────────────────────────────
  const { value: assignees = [] } = useAsync(async () => {
    return api.getDistinctAssignees();
  }, [includeClosed, fetchKey, api]);

  // ── Window focus re-fetch ─────────────────────────────────────────────────
  useEffect(() => {
    const handleFocus = () => invalidate();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [invalidate]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleAssignee = useCallback((id: string) => {
    setSelectedAssigneeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }, []);

  const clearAssigneeFilter = useCallback(() => {
    setSelectedAssigneeIds([]);
  }, []);

  const createBug = useCallback(async (req: CreateBugRequest) => {
    await api.createBug(req);
    invalidate();
  }, [api, invalidate]);

  const updateBug = useCallback(async (id: string, updates: UpdateBugRequest) => {
    await api.updateBug(id, updates);
    invalidate();
  }, [api, invalidate]);

  const closeBug = useCallback(async (id: string) => {
    await api.closeBug(id);
    setSelectedBugId(null);
    invalidate();
  }, [api, invalidate]);

  const reopenBug = useCallback(async (id: string) => {
    await api.updateBug(id, { isClosed: false });
    invalidate();
  }, [api, invalidate]);

  const createStatus = useCallback(async (req: CreateStatusRequest) => {
    await api.createStatus(req);
    invalidate();
  }, [api, invalidate]);

  const updateStatus = useCallback(async (id: string, updates: UpdateStatusRequest) => {
    await api.updateStatus(id, updates);
    invalidate();
  }, [api, invalidate]);

  const deleteStatus = useCallback(async (id: string, replacementStatusId: string) => {
    await api.deleteStatus(id, replacementStatusId);
    invalidate();
  }, [api, invalidate]);

  const addComment = useCallback(async (
    bugId: string,
    content: string,
    parentCommentId?: string,
  ) => {
    await api.addComment(bugId, content, parentCommentId);
    // Comments are fetched per-bug in the modal — no global invalidate needed
  }, [api]);

  const value: BugManagerContextValue = {
    bugs,
    statuses,
    filters,
    activeView,
    selectedBugId,
    loading: bugsLoading || statusesLoading,
    error: bugsError?.message ?? null,
    includeClosed,
    setIncludeClosed,
    assignees,
    selectedAssigneeIds,
    toggleAssignee,
    clearAssigneeFilter,
    createBug,
    updateBug,
    closeBug,
    reopenBug,
    createStatus,
    updateStatus,
    deleteStatus,
    addComment,
    setFilters,
    setView: setActiveView,
    selectBug: setSelectedBugId,
    invalidate,
  };

  return (
    <BugManagerContext.Provider value={value}>
      {children}
    </BugManagerContext.Provider>
  );
};
