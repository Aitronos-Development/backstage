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

import { createApiRef } from '@backstage/core-plugin-api';
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

export const bugManagerApiRef = createApiRef<BugManagerApi>({
  id: 'plugin.bug-manager.api',
});

export interface BugManagerApi {
  getBugs(filters?: BugFilters): Promise<Bug[]>;
  getBugById(id: string): Promise<Bug>;
  createBug(bug: CreateBugRequest): Promise<Bug>;
  updateBug(id: string, updates: UpdateBugRequest): Promise<Bug>;
  closeBug(id: string): Promise<Bug>;

  getStatuses(): Promise<Status[]>;
  createStatus(status: CreateStatusRequest): Promise<Status>;
  updateStatus(id: string, updates: UpdateStatusRequest): Promise<Status>;
  deleteStatus(id: string, replacementStatusId?: string): Promise<void>;

  getComments(bugId: string): Promise<Comment[]>;
  addComment(bugId: string, content: string, parentCommentId?: string): Promise<Comment>;
  updateComment(bugId: string, commentId: string, content: string): Promise<Comment>;
  deleteComment(bugId: string, commentId: string): Promise<void>;

  getDistinctAssignees(): Promise<User[]>;
}
