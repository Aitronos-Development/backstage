/*
 * Copyright 2023 The Backstage Authors
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

import { createApp } from '@backstage/frontend-defaults';
import notFoundErrorPage from './examples/notFoundErrorPageExtension';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import homePlugin from '@backstage/plugin-home/alpha';

import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { HomePageLayoutBlueprint } from '@backstage/plugin-home-react/alpha';
import { Content, Header, Page } from '@backstage/core-components';
import {
  WelcomeTitle,
  HomePageStarredEntities,
  HomePageToolkit,
} from '@backstage/plugin-home';
import Grid from '@material-ui/core/Grid';
import CategoryIcon from '@material-ui/icons/Category';
import LibraryBooksIcon from '@material-ui/icons/LibraryBooks';
import BuildIcon from '@material-ui/icons/Build';
import {
  techdocsPlugin,
  TechDocsIndexPage,
  TechDocsReaderPage,
  EntityTechdocsContent,
} from '@backstage/plugin-techdocs';
import { convertLegacyAppRoot } from '@backstage/core-compat-api';
import { FlatRoutes } from '@backstage/core-app-api';
import { Route, Navigate } from 'react-router';
import { CatalogImportPage } from '@backstage/plugin-catalog-import';
import { ApiTestingPage } from './components/ApiTestingPage';
import kubernetesPlugin from '@backstage/plugin-kubernetes/alpha';
import { convertLegacyPlugin } from '@backstage/core-compat-api';
import { convertLegacyPageExtension } from '@backstage/core-compat-api';
import { convertLegacyEntityContentExtension } from '@backstage/plugin-catalog-react/alpha';
import { pluginInfoResolver } from './pluginInfoResolver';
import { appModuleNav, HeaderThemeToggle } from './modules/appModuleNav';
import { entityExtensionsModule } from './modules/entityExtensions';
import { googleSignInModule } from './modules/googleSignInPage';
import devtoolsPlugin from '@backstage/plugin-devtools/alpha';
import { unprocessedEntitiesDevToolsContent } from '@backstage/plugin-catalog-unprocessed-entities/alpha';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import InfoIcon from '@material-ui/icons/Info';

/*

# Notes

TODO:
 - proper createApp
 - connect extensions and plugins, provide method?
 - higher level API for creating standard extensions + higher order framework API for creating those?
 - extension config schema + validation
 - figure out how to resolve configured extension ref to runtime value, e.g. '@backstage/plugin-graphiql#GraphiqlPage'
 - make sure all shorthands work + tests
 - figure out package structure / how to ship, frontend-plugin-api/frontend-app-api
 - figure out routing, useRouteRef in the new system
 - Legacy plugins / interop
 - dynamic updates, runtime API

*/

/* core */

// const discoverPackages = async () => {
//   // stub for now, deferring package discovery til later
//   return ['@backstage/plugin-graphiql'];
// };

/* graphiql package */

/* app.tsx */

/**
 * TechDocs does support the new frontend system so this conversion is not
 * strictly necessary, but it's left here to provide a demo of the utilities for
 * converting legacy plugins.
 */
const convertedTechdocsPlugin = convertLegacyPlugin(techdocsPlugin, {
  extensions: [
    // TODO: We likely also need a way to convert an entire <Route> tree similar to collectLegacyRoutes
    convertLegacyPageExtension(TechDocsIndexPage, {
      name: 'index',
      path: '/docs',
    }),
    convertLegacyPageExtension(TechDocsReaderPage, {
      path: '/docs/:namespace/:kind/:name/*',
    }),
    convertLegacyEntityContentExtension(EntityTechdocsContent),
  ],
});

const quickAccessTools = [
  { url: '/catalog', label: 'Catalog', icon: <CategoryIcon /> },
  { url: '/docs', label: 'Docs', icon: <LibraryBooksIcon /> },
  { url: '/devtools', label: 'DevTools', icon: <BuildIcon /> },
];

const customHomePageModule = createFrontendModule({
  pluginId: 'home',
  extensions: [
    HomePageLayoutBlueprint.make({
      params: {
        loader: async () =>
          function CustomHomePageLayout() {
            return (
              <Page themeId="home">
                <Header title={<WelcomeTitle />} pageTitleOverride="Home">
                  <HeaderThemeToggle />
                </Header>
                <Content>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                      <HomePageToolkit tools={quickAccessTools} />
                    </Grid>
                    <Grid item xs={12} md={8}>
                      <HomePageStarredEntities />
                    </Grid>
                  </Grid>
                </Content>
              </Page>
            );
          },
      },
    }),
  ],
});

// customize catalog example
const customizedCatalog = catalogPlugin.withOverrides({
  extensions: [
    catalogPlugin.getExtension('entity-content:catalog/overview').override({
      params: {
        icon: <InfoIcon />,
        filter: _entity => true,
      },
    }),
  ],
});

const notFoundErrorPageModule = createFrontendModule({
  pluginId: 'app',
  extensions: [notFoundErrorPage],
});

const devtoolsPluginUnprocessed = createFrontendModule({
  pluginId: 'catalog-unprocessed-entities',
  extensions: [unprocessedEntitiesDevToolsContent],
});

const collectedLegacyPlugins = convertLegacyAppRoot(
  <FlatRoutes>
    <Route path="/" element={<Navigate to="/home" replace />} />
    <Route path="/catalog-import" element={<CatalogImportPage />} />
    <Route path="/api-testing" element={<ApiTestingPage />} />
  </FlatRoutes>,
);

const app = createApp({
  features: [
    customizedCatalog,
    convertedTechdocsPlugin,
    userSettingsPlugin,
    homePlugin,
    kubernetesPlugin,
    notFoundErrorPageModule,
    appModuleNav,
    entityExtensionsModule,
    customHomePageModule,
    devtoolsPlugin,
    devtoolsPluginUnprocessed,
    googleSignInModule,
    ...collectedLegacyPlugins,
  ],
  advanced: {
    pluginInfoResolver,
  },
  /* Handled through config instead */
  // bindRoutes({ bind }) {
  //   bind(pagesPlugin.externalRoutes, { pageX: pagesPlugin.routes.pageX });
  // },
});

// const legacyApp = createLegacyApp({ plugins: [legacyGraphiqlPlugin] });

export default app.createRoot();

// const routes = (
//   <FlatRoutes>
//     {/* <Route path="/" element={<Navigate to="catalog" />} />
//     <Route path="/catalog" element={<CatalogIndexPage />} />
//     <Route
//       path="/catalog/:namespace/:kind/:name"
//       element={<CatalogEntityPage />}
//     >
//       <EntityLayout>
//         <EntityLayout.Route path="/" title="Overview">
//           <Grid container spacing={3} alignItems="stretch">
//             <Grid item md={6} xs={12}>
//               <EntityAboutCard variant="gridItem" />
//             </Grid>

//             <Grid item md={4} xs={12}>
//               <EntityLinksCard />
//             </Grid>
//           </Grid>
//         </EntityLayout.Route>

//         <EntityLayout.Route path="/todos" title="TODOs">
//           <EntityTodoContent />
//         </EntityLayout.Route>
//       </EntityLayout>
//     </Route>
//     <Route
//       path="/catalog-import"
//       element={
//           <CatalogImportPage />
//       }
//     /> */}
//     {/* <Route
//       path="/tech-radar"
//       element={<TechRadarPage width={1500} height={800} />}
//     /> */}
//     <Route path="/graphiql" element={<GraphiQLPage />} />
//   </FlatRoutes>
// );

// export default app.createRoot(
//   <>
//     {/* <AlertDisplay transientTimeoutMs={2500} />
//     <OAuthRequestDialog /> */}
//     <AppRouter>{routes}</AppRouter>
//   </>,
// );
