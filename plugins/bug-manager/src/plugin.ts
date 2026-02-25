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
  createPlugin,
  createRoutableExtension,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { rootRouteRef } from './routes';
import { bugManagerApiRef } from './api/BugManagerApi';
import { BackendClient } from './api/BackendClient';

export const bugManagerPlugin = createPlugin({
  id: 'bug-manager',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: bugManagerApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi:     fetchApiRef,
        catalogApi:   catalogApiRef,
      },
      factory: ({ discoveryApi, fetchApi, catalogApi }) =>
        new BackendClient(discoveryApi, fetchApi, catalogApi),
    }),
  ],
});

export const BugManagerPage = bugManagerPlugin.provide(
  createRoutableExtension({
    name: 'BugManagerPage',
    component: () =>
      import('./components/BugManagerPage/BugManagerPage').then(
        m => m.BugManagerPage,
      ),
    mountPoint: rootRouteRef,
  }),
);
