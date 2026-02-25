import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRouter } from './router';

export const bugManagerPlugin = createBackendPlugin({
  pluginId: 'bug-manager',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter:    coreServices.httpRouter,
        database:      coreServices.database,
        httpAuth:      coreServices.httpAuth,
        userInfo:      coreServices.userInfo,
        logger:        coreServices.logger,
        catalogClient: catalogServiceRef,
      },
      async init({ httpRouter, database, httpAuth, userInfo, logger, catalogClient }) {
        const router = await createRouter({
          database,
          httpAuth,
          userInfo,
          logger,
          catalogClient,
        });
        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/healthz',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
