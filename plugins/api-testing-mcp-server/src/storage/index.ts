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
export type { TestCase, RouteGroupFile } from './types';
export type { EditableField, EditTestCaseInput } from './fileStore';
export {
  listTestCases,
  readTestCase,
  createTestCase,
  editTestCase,
  deleteTestCase,
  loadRouteGroup,
  invalidateCache,
  routeGroupExists,
  getApiTestsDir,
} from './fileStore';
export { watcher } from './watcher';
export type { TestCaseChangeEvent } from './watcher';

export type { ExecutionRecord } from './historyTypes';
export * as historyStore from './historyStore';
export { buildExecutionRecord } from './historyStore';
