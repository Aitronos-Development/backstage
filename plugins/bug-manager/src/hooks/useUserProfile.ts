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

import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useAsync } from 'react-use';
import type { User } from '../api/types';

export function useUserProfile(entityRef: string | null | undefined): {
  user: User | null;
  loading: boolean;
} {
  const catalogApi = useApi(catalogApiRef);

  const { value, loading } = useAsync(async (): Promise<User | null> => {
    if (!entityRef) return null;
    try {
      const entity = await catalogApi.getEntityByRef(entityRef);
      if (!entity) return { id: entityRef, displayName: entityRef };
      const profile = (entity.spec?.profile as any) ?? {};
      return {
        id:          entityRef,
        displayName: profile.displayName ?? entityRef,
        avatarUrl:   profile.picture ?? undefined,
      };
    } catch {
      return { id: entityRef, displayName: entityRef };
    }
  }, [entityRef]);

  return { user: value ?? null, loading };
}
