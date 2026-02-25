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

export type Priority = 'urgent' | 'medium' | 'low';

export interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Status {
  id: string;
  name: string;
  order: number;
  color?: string;
}

export interface Comment {
  id: string;
  author: User;
  content: string;
  createdAt: string;
  updatedAt?: string;
  parentCommentId?: string;
}

export interface Bug {
  id: string;
  ticketNumber: string;
  heading: string;
  description: string;
  assignee: User | null;
  reporter: User;
  status: Status;
  priority: Priority;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BugFilters {
  status?: string;
  priority?: Priority;
  assignee?: string;
  assignees?: string[];
  search?: string;
  includeClosed?: boolean;
}

export interface CreateBugRequest {
  heading: string;
  description?: string;
  assigneeId?: string;
  statusId: string;
  priority: Priority;
}

export interface UpdateBugRequest {
  heading?: string;
  description?: string;
  assigneeId?: string | null;
  statusId?: string;
  priority?: Priority;
  isClosed?: boolean;
}

export interface CreateStatusRequest {
  name: string;
  order: number;
  color?: string;
}

export interface UpdateStatusRequest {
  name?: string;
  order?: number;
  color?: string;
}
