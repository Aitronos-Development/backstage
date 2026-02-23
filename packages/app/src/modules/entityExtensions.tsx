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

import { createFrontendModule } from '@backstage/frontend-plugin-api';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';

/**
 * Health check card displayed on the Overview tab for service components.
 */
const healthCheckEntityCard = EntityCardBlueprint.make({
  name: 'health-check',
  params: {
    filter: entity =>
      entity.kind === 'Component' && (entity.spec as any)?.type === 'service',
    loader: () =>
      import('../components/HealthCheckCard').then(m => <m.HealthCheckCard />),
  },
});

/**
 * Provided APIs summary card — clicking navigates to the API tab.
 */
const providedApisSummaryCard = EntityCardBlueprint.make({
  name: 'provided-apis-summary',
  params: {
    filter: entity =>
      entity.kind === 'Component' && (entity.spec as any)?.type === 'service',
    loader: () =>
      import('../components/ApiSummaryCards').then(m => (
        <m.ProvidedApisSummaryCard />
      )),
  },
});

/**
 * Consumed APIs summary card — clicking navigates to the API entity docs.
 */
const consumedApisSummaryCard = EntityCardBlueprint.make({
  name: 'consumed-apis-summary',
  params: {
    filter: entity =>
      entity.kind === 'Component' && (entity.spec as any)?.type === 'service',
    loader: () =>
      import('../components/ApiSummaryCards').then(m => (
        <m.ConsumedApisSummaryCard />
      )),
  },
});

/**
 * API Testing tab — shows route groups with test cases and execution controls.
 * Fetches the OpenAPI spec directly from the live Freddy backend.
 */
const apiRouteDefinitionContent = EntityContentBlueprint.make({
  name: 'api-route-definition',
  params: {
    path: '/testing',
    title: 'API Testing',
    filter: entity =>
      (entity.kind === 'Component' &&
        (entity.spec as any)?.type === 'service') ||
      entity.kind === 'API',
    loader: async () =>
      import('../components/ApiRouteDefinitionContent').then(m => (
        <m.ApiRouteDefinitionContent />
      )),
  },
});

export const entityExtensionsModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    healthCheckEntityCard,
    providedApisSummaryCard,
    consumedApisSummaryCard,
    apiRouteDefinitionContent,
  ],
});
