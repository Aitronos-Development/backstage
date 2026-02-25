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

export { bugManagerPlugin, BugManagerPage } from './plugin';

// Context
export { BugManagerProvider } from './context/BugManagerProvider';
export { useBugManagerContext } from './context/useBugManagerContext';

// API
export { bugManagerApiRef } from './api/BugManagerApi';
export type { BugManagerApi } from './api/BugManagerApi';
export { LocalStorageClient } from './api/LocalStorageClient';

// Types
export type {
  Bug,
  BugFilters,
  Comment,
  CreateBugRequest,
  CreateStatusRequest,
  Priority,
  Status,
  UpdateBugRequest,
  UpdateStatusRequest,
  User,
} from './api/types';

// Utils
export { PRIORITY_COLORS, PRIORITY_ORDER, getPriorityColor } from './utils/priorities';
export { getNextTicketNumber } from './utils/ticketNumber';
