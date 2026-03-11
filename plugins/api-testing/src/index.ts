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

export {
  useTestCases,
  useApiTestingClient,
  useRouteGroups,
} from './hooks/useTestCases';
export { useTestExecution } from './hooks/useTestExecution';
export { useWebSocket } from './hooks/useWebSocket';
export { useExecutionHistory } from './hooks/useExecutionHistory';
export { useVariables } from './hooks/useVariables';
export { useErrorAnalysis } from './hooks/useErrorAnalysis';

// Components
export { TestCaseRow } from './components/TestCaseRow/TestCaseRow';
export { TestResultBadge } from './components/TestResultBadge/TestResultBadge';
export { EndpointHistory } from './components/EndpointHistory/EndpointHistory';
export { ExecutionHistoryContext } from './components/EndpointHistory/ExecutionHistoryContext';
export type { ExecutionHistoryContextValue } from './components/EndpointHistory/ExecutionHistoryContext';
export { EnvironmentSwitcher } from './components/EnvironmentSwitcher/EnvironmentSwitcher';
export { VariableConfigPanel } from './components/VariableConfigPanel/VariableConfigPanel';
export { EnvironmentSettingsPanel } from './components/EnvironmentSettingsPanel/EnvironmentSettingsPanel';
export { FlowStepsPipeline } from './components/FlowStepsPipeline/FlowStepsPipeline';
export { TestHistoryComponent } from './components/TestHistory/TestHistoryComponent';

// Types
export type {
  TestCase,
  ExecutionResult,
  TestStatus,
  ExecutionRecord,
  ApiTestingConfig,
  ApiTestingEnvironment,
  ResolvedVariable,
  VariableSource,
  EnvironmentOverride,
  EnvironmentOverrides,
} from './api/types';
