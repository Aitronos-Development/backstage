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

import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { CatalogApi } from '@backstage/catalog-client';
import type { BugManagerApi } from './BugManagerApi';
import type {
  Bug,
  BugFilters,
  Comment,
  CreateBugRequest,
  CreateStatusRequest,
  Status,
  UpdateBugRequest,
  UpdateStatusRequest,
  User,
} from './types';

export class BackendClient implements BugManagerApi {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
    private readonly catalogApi: CatalogApi,
  ) {}

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('bug-manager');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed with status ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  // ── User resolution ───────────────────────────────────────────────────────

  private async resolveUsers(refs: string[]): Promise<Map<string, User>> {
    const unique = [...new Set(refs.filter(Boolean))];
    const map = new Map<string, User>();

    await Promise.all(
      unique.map(async ref => {
        try {
          const entity = await this.catalogApi.getEntityByRef(ref);
          const profile = (entity?.spec?.profile as any) ?? {};
          map.set(ref, {
            id:          ref,
            displayName: profile.displayName ?? ref,
            avatarUrl:   profile.picture ?? undefined,
          });
        } catch {
          map.set(ref, { id: ref, displayName: ref });
        }
      }),
    );

    return map;
  }

  // ── Response mappers ──────────────────────────────────────────────────────
  // The backend returns snake_case row shapes. Map them to camelCase for the UI.

  private mapBug(row: any, statuses: Status[], users: Map<string, User>): Bug {
    return {
      id:           row.id,
      ticketNumber: row.ticket_number,
      heading:      row.heading,
      description:  row.description ?? '',
      priority:     row.priority,
      isClosed:     row.is_closed,
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
      status:       statuses.find(s => s.id === row.status_id) ?? {
        id: row.status_id, name: row.status_id, order: 0,
      },
      assignee:     row.assignee_id ? (users.get(row.assignee_id) ?? {
        id: row.assignee_id, displayName: row.assignee_id,
      }) : null,
      reporter:     users.get(row.reporter_id) ?? {
        id: row.reporter_id, displayName: row.reporter_id,
      },
    };
  }

  private mapStatus(row: any): Status {
    return {
      id:    row.id,
      name:  row.label,
      order: row.order,
      color: row.color,
    };
  }

  private mapComment(row: any, users: Map<string, User>): Comment {
    return {
      id:              row.id,
      content:         row.comment_body,
      createdAt:       row.timestamp,
      parentCommentId: row.parent_comment_id ?? undefined,
      author:          users.get(row.user_id) ?? {
        id: row.user_id, displayName: row.user_id,
      },
    };
  }

  // ── Bugs ──────────────────────────────────────────────────────────────────

  async getBugs(filters?: BugFilters): Promise<Bug[]> {
    const params = new URLSearchParams();
    if (filters?.status)            params.set('status', filters.status);
    if (filters?.priority)          params.set('priority', filters.priority);
    if (filters?.assignees?.length) params.set('assignee', filters.assignees.join(','));
    else if (filters?.assignee)     params.set('assignee', filters.assignee);
    if (filters?.search)            params.set('search', filters.search);
    if (filters?.includeClosed)     params.set('includeClosed', 'true');

    const qs = params.toString();
    const [rows, statusRows] = await Promise.all([
      this.request<any[]>(`/bugs${qs ? `?${qs}` : ''}`),
      this.request<any[]>('/statuses'),
    ]);
    const statuses = statusRows.map(r => this.mapStatus(r));
    const userRefs = [
      ...rows.map((r: any) => r.reporter_id),
      ...rows.map((r: any) => r.assignee_id).filter(Boolean),
    ];
    const users = await this.resolveUsers(userRefs);
    return rows.map(r => this.mapBug(r, statuses, users));
  }

  async getBugById(id: string): Promise<Bug> {
    const [row, statusRows] = await Promise.all([
      this.request<any>(`/bugs/${id}`),
      this.request<any[]>('/statuses'),
    ]);
    const statuses = statusRows.map(r => this.mapStatus(r));
    const userRefs = [row.reporter_id, row.assignee_id].filter(Boolean);
    const users = await this.resolveUsers(userRefs);
    return this.mapBug(row, statuses, users);
  }

  async createBug(bug: CreateBugRequest): Promise<Bug> {
    const row = await this.request<any>('/bugs', {
      method: 'POST',
      body: JSON.stringify({
        heading:     bug.heading,
        description: bug.description,
        assigneeId:  bug.assigneeId,
        statusId:    bug.statusId,
        priority:    bug.priority,
      }),
    });
    const statuses = await this.getStatuses();
    const userRefs = [row.reporter_id, row.assignee_id].filter(Boolean);
    const users = await this.resolveUsers(userRefs);
    return this.mapBug(row, statuses, users);
  }

  async updateBug(id: string, updates: UpdateBugRequest): Promise<Bug> {
    const body: Record<string, any> = {};
    if (updates.heading     !== undefined) body.heading     = updates.heading;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.assigneeId  !== undefined) body.assigneeId  = updates.assigneeId;
    if (updates.statusId    !== undefined) body.statusId    = updates.statusId;
    if (updates.priority    !== undefined) body.priority    = updates.priority;
    if (updates.isClosed    !== undefined) body.isClosed    = updates.isClosed;

    const row = await this.request<any>(`/bugs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    const statuses = await this.getStatuses();
    const userRefs = [row.reporter_id, row.assignee_id].filter(Boolean);
    const users = await this.resolveUsers(userRefs);
    return this.mapBug(row, statuses, users);
  }

  async closeBug(id: string): Promise<Bug> {
    return this.updateBug(id, { isClosed: true });
  }

  // ── Statuses ──────────────────────────────────────────────────────────────

  async getStatuses(): Promise<Status[]> {
    const rows = await this.request<any[]>('/statuses');
    return rows.map(r => this.mapStatus(r));
  }

  async createStatus(status: CreateStatusRequest): Promise<Status> {
    const row = await this.request<any>('/statuses', {
      method: 'POST',
      body: JSON.stringify({ label: status.name, color: status.color, order: status.order }),
    });
    return this.mapStatus(row);
  }

  async updateStatus(id: string, updates: UpdateStatusRequest): Promise<Status> {
    const body: Record<string, any> = {};
    if (updates.name  !== undefined) body.label = updates.name;
    if (updates.color !== undefined) body.color = updates.color;
    if (updates.order !== undefined) body.order = updates.order;

    const row = await this.request<any>(`/statuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return this.mapStatus(row);
  }

  async deleteStatus(id: string, replacementStatusId?: string): Promise<void> {
    const qs = replacementStatusId
      ? `?replacementStatusId=${encodeURIComponent(replacementStatusId)}`
      : '';
    await this.request<void>(`/statuses/${id}${qs}`, { method: 'DELETE' });
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async getComments(bugId: string): Promise<Comment[]> {
    const rows = await this.request<any[]>(`/bugs/${bugId}/comments`);
    const userRefs = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))];
    const users = await this.resolveUsers(userRefs);
    return rows.map(r => this.mapComment(r, users));
  }

  async addComment(
    bugId: string,
    content: string,
    parentCommentId?: string,
  ): Promise<Comment> {
    const row = await this.request<any>(`/bugs/${bugId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        commentBody: content,
        parentCommentId,
      }),
    });
    const users = await this.resolveUsers([row.user_id]);
    return this.mapComment(row, users);
  }

  async updateComment(bugId: string, commentId: string, content: string): Promise<Comment> {
    throw new Error(`updateComment not yet supported by backend (bugId: ${bugId}, commentId: ${commentId}, content: ${content})`);
  }

  async deleteComment(bugId: string, commentId: string): Promise<void> {
    throw new Error(`deleteComment not yet supported by backend (bugId: ${bugId}, commentId: ${commentId})`);
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getDistinctAssignees(): Promise<User[]> {
    return this.request<User[]>('/users');
  }
}
