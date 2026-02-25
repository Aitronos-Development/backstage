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

import { BugManagerApi } from './BugManagerApi';
import {
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
import { getNextTicketNumber } from '../utils/ticketNumber';

const KEYS = {
  bugs: 'bug-manager:bugs',
  statuses: 'bug-manager:statuses',
  comments: (bugId: string) => `bug-manager:comments:${bugId}`,
};

const MOCK_USERS: User[] = [
  { id: 'user:default/jane', displayName: 'Jane Doe' },
  { id: 'user:default/john', displayName: 'John Smith' },
];

function generateId(): string {
  return window.crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function defaultStatuses(): Status[] {
  return [
    { id: generateId(), name: 'Open', order: 0, color: '#2196F3' },
    { id: generateId(), name: 'In Progress', order: 1, color: '#FF9800' },
    { id: generateId(), name: 'In Review', order: 2, color: '#9C27B0' },
    { id: generateId(), name: 'Resolved', order: 3, color: '#4CAF50' },
    { id: generateId(), name: 'Closed', order: 4, color: '#9E9E9E' },
  ];
}

function seedBugs(statuses: Status[]): Bug[] {
  const [jane, john] = MOCK_USERS;
  const [open, inProgress, inReview, resolved, closed] = statuses;
  const now = nowISO();

  const bugs: Bug[] = [
    {
      id: generateId(),
      ticketNumber: 'BUG-001',
      heading: 'Login fails on Safari when using SSO authentication',
      description:
        'When a user attempts to log in via SSO on Safari 17.x, the callback URL fails to resolve.\n\nSteps to reproduce:\n1. Open Safari\n2. Navigate to /login\n3. Click "Sign in with SSO"\n4. Observe error in console',
      assignee: jane,
      reporter: john,
      status: inProgress,
      priority: 'urgent',
      isClosed: false,
      createdAt: '2026-02-20T09:15:00.000Z',
      updatedAt: '2026-02-24T14:30:00.000Z',
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-002',
      heading: 'Typo on settings page title',
      description: 'The settings page title reads "Settigns" instead of "Settings".',
      assignee: john,
      reporter: jane,
      status: open,
      priority: 'low',
      isClosed: false,
      createdAt: '2026-02-21T10:00:00.000Z',
      updatedAt: '2026-02-21T10:00:00.000Z',
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-003',
      heading: 'API timeout on large payload submissions',
      description:
        'Submitting a form with more than 50 items causes a 504 Gateway Timeout. The backend request exceeds the default 30s timeout.',
      assignee: null,
      reporter: jane,
      status: inReview,
      priority: 'medium',
      isClosed: false,
      createdAt: '2026-02-19T08:30:00.000Z',
      updatedAt: '2026-02-23T16:45:00.000Z',
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-004',
      heading: 'CSS grid layout breaks on Firefox 120',
      description:
        'The dashboard grid layout is misaligned on Firefox 120. Cards overlap and the sidebar collapses unexpectedly.',
      assignee: john,
      reporter: john,
      status: inProgress,
      priority: 'medium',
      isClosed: false,
      createdAt: '2026-02-22T11:20:00.000Z',
      updatedAt: '2026-02-24T09:00:00.000Z',
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-005',
      heading: 'Performance degradation on catalog page with 1000+ entities',
      description:
        'The catalog page takes over 8 seconds to load when there are more than 1000 entities. Profiling shows excessive re-renders in the entity table component.',
      assignee: null,
      reporter: jane,
      status: open,
      priority: 'urgent',
      isClosed: false,
      createdAt: '2026-02-18T14:00:00.000Z',
      updatedAt: '2026-02-18T14:00:00.000Z',
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-006',
      heading: 'Stale cache after entity deletion',
      description:
        'After deleting an entity from the catalog, it still appears in search results until the page is hard-refreshed.',
      assignee: jane,
      reporter: john,
      status: closed,
      priority: 'low',
      isClosed: true,
      createdAt: '2026-02-15T09:00:00.000Z',
      updatedAt: '2026-02-20T17:30:00.000Z',
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-007',
      heading: 'Error boundary not catching async component failures',
      description:
        'Lazy-loaded components that fail to load crash the entire app instead of being caught by the error boundary.',
      assignee: null,
      reporter: jane,
      status: open,
      priority: 'urgent',
      isClosed: false,
      createdAt: '2026-02-23T07:45:00.000Z',
      updatedAt: '2026-02-23T07:45:00.000Z',
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-008',
      heading: 'Notification badge count incorrect after marking all as read',
      description:
        'After clicking "Mark all as read", the notification badge still shows the previous count until the next polling interval.',
      assignee: john,
      reporter: jane,
      status: resolved,
      priority: 'low',
      isClosed: false,
      createdAt: '2026-02-17T13:10:00.000Z',
      updatedAt: '2026-02-22T11:00:00.000Z',
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-009',
      heading: 'Dark mode colors not applied to code blocks',
      description:
        'When switching to dark mode, inline code blocks and syntax-highlighted code retain the light mode background, making text unreadable.',
      assignee: jane,
      reporter: john,
      status: inReview,
      priority: 'medium',
      isClosed: false,
      createdAt: '2026-02-21T15:30:00.000Z',
      updatedAt: now,
    },
    {
      id: generateId(),
      ticketNumber: 'BUG-010',
      heading: 'Search index not rebuilding after config change',
      description:
        'Changing the search collator configuration requires a full backend restart. Hot-reload does not trigger index rebuilding.',
      assignee: null,
      reporter: john,
      status: open,
      priority: 'medium',
      isClosed: false,
      createdAt: '2026-02-24T08:00:00.000Z',
      updatedAt: '2026-02-24T08:00:00.000Z',
    },
  ];

  return bugs;
}

function seedComments(bugs: Bug[]): Map<string, Comment[]> {
  const [jane, john] = MOCK_USERS;
  const comments = new Map<string, Comment[]>();

  // Comments for BUG-001
  const bug001Comment1Id = generateId();
  comments.set(bugs[0].id, [
    {
      id: bug001Comment1Id,
      author: jane,
      content: 'Reproduced on Safari 17.2. The OAuth callback drops the state parameter. Working on a fix.',
      createdAt: '2026-02-22T10:30:00.000Z',
    },
    {
      id: generateId(),
      author: john,
      content: 'This is blocking the v2.0 release. Please prioritize.',
      createdAt: '2026-02-23T09:15:00.000Z',
    },
    {
      id: generateId(),
      author: jane,
      content: 'Fix is in review — the issue was a missing URL encoding step for the redirect URI.',
      createdAt: '2026-02-24T14:30:00.000Z',
    },
    {
      id: generateId(),
      author: john,
      content: 'Thanks, can you share the browser logs from the failed OAuth flow? That would help me verify the fix.',
      createdAt: '2026-02-22T11:45:00.000Z',
      parentCommentId: bug001Comment1Id,
    },
  ]);

  // Comments for BUG-003
  comments.set(bugs[2].id, [
    {
      id: generateId(),
      author: jane,
      content: 'Increasing the timeout to 60s is a band-aid. We should implement chunked uploads instead.',
      createdAt: '2026-02-20T11:00:00.000Z',
    },
    {
      id: generateId(),
      author: john,
      content: 'Agreed. I can take this on after BUG-004 is done.',
      createdAt: '2026-02-21T14:20:00.000Z',
    },
  ]);

  // Comments for BUG-005
  comments.set(bugs[4].id, [
    {
      id: generateId(),
      author: jane,
      content: 'Profiling shows the EntityTable re-renders 47 times on initial load. We need to memoize the row components.',
      createdAt: '2026-02-19T09:00:00.000Z',
    },
  ]);

  return comments;
}

/**
 * @deprecated Use BackendClient for production. This client is kept for
 * local-only development without a backend. To use it, override the API
 * factory in your test setup or app config.
 */
export class LocalStorageClient implements BugManagerApi {
  constructor() {
    this.seedIfNeeded();
  }

  private seedIfNeeded(): void {
    const existing = localStorage.getItem(KEYS.statuses);
    if (existing) return;

    const statuses = defaultStatuses();
    const bugs = seedBugs(statuses);
    const comments = seedComments(bugs);

    localStorage.setItem(KEYS.statuses, JSON.stringify(statuses));
    localStorage.setItem(KEYS.bugs, JSON.stringify(bugs));

    comments.forEach((commentList, bugId) => {
      localStorage.setItem(KEYS.comments(bugId), JSON.stringify(commentList));
    });
  }

  // --- Bugs ---

  async getBugs(filters?: BugFilters): Promise<Bug[]> {
    let bugs = this.readBugs();

    if (!filters?.includeClosed) {
      bugs = bugs.filter(b => !b.isClosed);
    }
    if (filters?.status) {
      bugs = bugs.filter(b => b.status.id === filters.status);
    }
    if (filters?.priority) {
      bugs = bugs.filter(b => b.priority === filters.priority);
    }
    if (filters?.assignees?.length) {
      bugs = bugs.filter(b => b.assignee && filters.assignees!.includes(b.assignee.id));
    } else if (filters?.assignee) {
      bugs = bugs.filter(b => b.assignee?.id === filters.assignee);
    }
    if (filters?.search) {
      const term = filters.search.toLowerCase();
      bugs = bugs.filter(
        b =>
          b.heading.toLowerCase().includes(term) ||
          b.ticketNumber.toLowerCase().includes(term),
      );
    }

    return bugs;
  }

  async getBugById(id: string): Promise<Bug> {
    const bug = this.readBugs().find(b => b.id === id);
    if (!bug) throw new Error(`Bug not found: ${id}`);
    return bug;
  }

  async createBug(req: CreateBugRequest): Promise<Bug> {
    const bugs = this.readBugs();
    const statuses = this.readStatuses();
    const status = statuses.find(s => s.id === req.statusId);
    if (!status) throw new Error(`Status not found: ${req.statusId}`);

    const assignee = req.assigneeId
      ? MOCK_USERS.find(u => u.id === req.assigneeId) || null
      : null;

    const ticketNumber = getNextTicketNumber(bugs);
    const now = nowISO();

    const bug: Bug = {
      id: generateId(),
      ticketNumber,
      heading: req.heading,
      description: req.description || '',
      assignee,
      reporter: MOCK_USERS[0], // Default reporter for prototype
      status,
      priority: req.priority,
      isClosed: false,
      createdAt: now,
      updatedAt: now,
    };

    bugs.push(bug);
    this.writeBugs(bugs);
    return bug;
  }

  async updateBug(id: string, updates: UpdateBugRequest): Promise<Bug> {
    const bugs = this.readBugs();
    const index = bugs.findIndex(b => b.id === id);
    if (index === -1) throw new Error(`Bug not found: ${id}`);

    const bug = bugs[index];
    const now = nowISO();

    if (updates.heading !== undefined) bug.heading = updates.heading;
    if (updates.description !== undefined) bug.description = updates.description;
    if (updates.priority !== undefined) bug.priority = updates.priority;
    if (updates.isClosed !== undefined) bug.isClosed = updates.isClosed;

    if (updates.statusId !== undefined) {
      const status = this.readStatuses().find(s => s.id === updates.statusId);
      if (!status) throw new Error(`Status not found: ${updates.statusId}`);
      bug.status = status;
    }

    if (updates.assigneeId !== undefined) {
      bug.assignee = updates.assigneeId
        ? MOCK_USERS.find(u => u.id === updates.assigneeId) || null
        : null;
    }

    bug.updatedAt = now;
    bugs[index] = bug;
    this.writeBugs(bugs);
    return bug;
  }

  async closeBug(id: string): Promise<Bug> {
    return this.updateBug(id, { isClosed: true });
  }

  // --- Statuses ---

  async getStatuses(): Promise<Status[]> {
    return this.readStatuses().sort((a, b) => a.order - b.order);
  }

  async createStatus(req: CreateStatusRequest): Promise<Status> {
    const statuses = this.readStatuses();
    const status: Status = {
      id: generateId(),
      name: req.name,
      order: req.order,
      color: req.color,
    };
    statuses.push(status);
    this.writeStatuses(statuses);
    return status;
  }

  async updateStatus(id: string, updates: UpdateStatusRequest): Promise<Status> {
    const statuses = this.readStatuses();
    const index = statuses.findIndex(s => s.id === id);
    if (index === -1) throw new Error(`Status not found: ${id}`);

    const status = statuses[index];
    if (updates.name !== undefined) status.name = updates.name;
    if (updates.order !== undefined) status.order = updates.order;
    if (updates.color !== undefined) status.color = updates.color;

    statuses[index] = status;
    this.writeStatuses(statuses);

    // Update status references in all bugs
    const bugs = this.readBugs();
    let bugsChanged = false;
    bugs.forEach(bug => {
      if (bug.status.id === id) {
        bug.status = { ...status };
        bugsChanged = true;
      }
    });
    if (bugsChanged) this.writeBugs(bugs);

    return status;
  }

  async deleteStatus(
    id: string,
    replacementStatusId?: string,
  ): Promise<void> {
    // Reassign bugs with the deleted status to the replacement
    if (replacementStatusId) {
      const replacement = this.readStatuses().find(
        s => s.id === replacementStatusId,
      );
      if (replacement) {
        const bugs = this.readBugs();
        let changed = false;
        bugs.forEach(bug => {
          if (bug.status.id === id) {
            bug.status = { ...replacement };
            bug.updatedAt = nowISO();
            changed = true;
          }
        });
        if (changed) this.writeBugs(bugs);
      }
    }

    const statuses = this.readStatuses().filter(s => s.id !== id);
    this.writeStatuses(statuses);
  }

  // --- Comments ---

  async getComments(bugId: string): Promise<Comment[]> {
    const raw = localStorage.getItem(KEYS.comments(bugId));
    return raw ? JSON.parse(raw) : [];
  }

  async addComment(bugId: string, content: string, parentCommentId?: string): Promise<Comment> {
    const comments = await this.getComments(bugId);
    const comment: Comment = {
      id: generateId(),
      author: MOCK_USERS[0], // Default author for prototype
      content,
      createdAt: nowISO(),
      parentCommentId,
    };
    comments.push(comment);
    localStorage.setItem(KEYS.comments(bugId), JSON.stringify(comments));
    return comment;
  }

  async updateComment(bugId: string, commentId: string, content: string): Promise<Comment> {
    const comments = await this.getComments(bugId);
    const comment = comments.find(c => c.id === commentId);
    if (!comment) throw new Error(`Comment not found: ${commentId}`);
    comment.content = content;
    comment.updatedAt = nowISO();
    localStorage.setItem(KEYS.comments(bugId), JSON.stringify(comments));
    return { ...comment };
  }

  async deleteComment(bugId: string, commentId: string): Promise<void> {
    let comments = await this.getComments(bugId);
    comments = comments
      .filter(c => c.id !== commentId)
      .map(c =>
        c.parentCommentId === commentId ? { ...c, parentCommentId: undefined } : c,
      );
    localStorage.setItem(KEYS.comments(bugId), JSON.stringify(comments));
  }

  async getDistinctAssignees(): Promise<User[]> {
    const bugs = await this.getBugs({ includeClosed: true });
    const seen = new Map<string, User>();
    for (const bug of bugs) {
      if (bug.assignee && !seen.has(bug.assignee.id)) {
        seen.set(bug.assignee.id, bug.assignee);
      }
    }
    return [...seen.values()];
  }

  // --- Helpers ---

  getMockUsers(): User[] {
    return [...MOCK_USERS];
  }

  private readBugs(): Bug[] {
    const raw = localStorage.getItem(KEYS.bugs);
    return raw ? JSON.parse(raw) : [];
  }

  private writeBugs(bugs: Bug[]): void {
    localStorage.setItem(KEYS.bugs, JSON.stringify(bugs));
  }

  private readStatuses(): Status[] {
    const raw = localStorage.getItem(KEYS.statuses);
    return raw ? JSON.parse(raw) : [];
  }

  private writeStatuses(statuses: Status[]): void {
    localStorage.setItem(KEYS.statuses, JSON.stringify(statuses));
  }
}
