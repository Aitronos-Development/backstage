# v2 Phase 4: Authentication & Identity Integration

**Goal:** Lock all write operations to the authenticated Backstage user — reporter is auto-populated from the token, comments are authored by the caller, and user display names and avatars are resolved from the Backstage Catalog. The placeholder `user:default/current` strings from Phase 3 are fully replaced.

**Depends on:** Phase 3 (BackendClient wired and rendering live data)

---

## What this phase delivers

**Backend changes:**
- `POST /bugs`: removes `reporterId` from the accepted request body; reads it from the Backstage auth token instead
- `POST /bugs/:id/comments`: removes `userId` from the accepted request body; reads it from the token instead
- All write endpoints (`POST`, `PATCH`, `DELETE`) return `401 Unauthorized` for unauthenticated requests
- `GET /users`: returns resolved display names and avatar URLs by querying the Backstage Catalog via the `catalogClient`

**Frontend changes:**
- `useCurrentUser` hook: resolves the logged-in user's entity ref, display name, and avatar via `IdentityApi`
- `useUserProfile` hook: resolves any user entity ref to a `User` object via the Catalog API
- `BackendClient` removes the hardcoded `reporterId` and `userId` from request bodies
- `BackendClient.mapBug` and `mapComment` resolve display names from the catalog
- `CommentSection`: shows the current user's avatar in the comment input row
- `CreateBugDialog`: shows "Reporting as: [current user]" below the form
- Admin role check: `useIsAdmin` hook using `usePermission` or catalog group membership

---

## Technical design

### Backend: enforce authentication on write endpoints

**`src/router.ts`** — add auth enforcement via `httpAuth`:

```typescript
// Helper — throws 401 if the request is not from an authenticated user
async function requireUser(
  req: Request,
  res: Response,
  httpAuth: HttpAuthService,
  userInfo: UserInfoService,
): Promise<string | null> {
  try {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const info = await userInfo.getUserInfo(credentials);
    return info.userEntityRef;
  } catch {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
}
```

Apply to `POST /bugs`:

```typescript
router.post('/bugs', async (req, res) => {
  const reporterId = await requireUser(req, res, httpAuth, userInfo);
  if (!reporterId) return; // 401 already sent

  const { heading, description, assigneeId, statusId, priority } = req.body;
  // reporterId is no longer read from req.body

  if (!heading?.trim()) return badRequest(res, 'heading is required');
  if (!statusId)        return badRequest(res, 'statusId is required');

  const ticketNumber = await store.nextTicketNumber();
  const bug = await store.createBug({
    id: uuid(),
    ticket_number: ticketNumber,
    heading: heading.trim(),
    description: description ?? '',
    priority: priority ?? 'medium',
    status_id: statusId,
    assignee_id: assigneeId ?? null,
    reporter_id: reporterId,   // ← from token, not body
    is_closed: false,
  });
  return res.status(201).json(bug);
});
```

Apply to `POST /bugs/:id/comments`:

```typescript
router.post('/bugs/:id/comments', async (req, res) => {
  const userId = await requireUser(req, res, httpAuth, userInfo);
  if (!userId) return;

  const bug = await store.getBugById(req.params.id);
  if (!bug) return notFound(res, 'Bug');

  const { commentBody, parentCommentId } = req.body;
  if (!commentBody?.trim()) return badRequest(res, 'commentBody is required');
  // userId is no longer read from req.body

  const comment = await store.addComment({
    id: uuid(),
    bug_id: req.params.id,
    user_id: userId,           // ← from token, not body
    comment_body: commentBody.trim(),
    parent_comment_id: parentCommentId ?? null,
  });
  return res.status(201).json(comment);
});
```

Apply `requireUser` as a guard to `PATCH /bugs/:id`, `POST /statuses`, `PATCH /statuses/:id`, and `DELETE /statuses/:id` as well — any write endpoint.

### Backend: enrich `GET /users` with catalog data

Add `catalogClient` as a router dep. In `plugin.ts`, inject the `catalogServiceRef`:

```typescript
// plugin.ts
deps: {
  httpRouter:    coreServices.httpRouter,
  database:      coreServices.database,
  httpAuth:      coreServices.httpAuth,
  userInfo:      coreServices.userInfo,
  logger:        coreServices.logger,
  catalogClient: catalogServiceRef,   // NEW
},
async init({ httpRouter, database, httpAuth, userInfo, logger, catalogClient }) {
  const router = await createRouter({
    database, httpAuth, userInfo, logger, catalogClient,
  });
  // ...
}
```

Update `GET /users`:

```typescript
router.get('/users', async (_req, res) => {
  const refs = await store.getDistinctAssignees();

  const users = await Promise.all(
    refs.map(async ref => {
      try {
        const entity = await catalogClient.getEntityByRef(ref);
        return {
          id:          ref,
          displayName: (entity?.spec?.profile as any)?.displayName ?? ref,
          avatarUrl:   (entity?.spec?.profile as any)?.picture ?? undefined,
        };
      } catch {
        return { id: ref, displayName: ref, avatarUrl: undefined };
      }
    }),
  );

  res.json(users);
});
```

---

### Frontend: useCurrentUser hook

**`src/hooks/useCurrentUser.ts`**

```typescript
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { useAsync } from 'react-use';

export interface CurrentUser {
  userEntityRef: string;
  displayName: string;
  email?: string;
  picture?: string;
}

export function useCurrentUser() {
  const identityApi = useApi(identityApiRef);

  return useAsync(async (): Promise<CurrentUser> => {
    const [identity, profile] = await Promise.all([
      identityApi.getBackstageIdentity(),
      identityApi.getProfileInfo(),
    ]);
    return {
      userEntityRef: identity.userEntityRef,
      displayName:   profile.displayName ?? identity.userEntityRef,
      email:         profile.email,
      picture:       profile.picture,
    };
  }, []);
}
```

**Usage in `CreateBugDialog`:**

```tsx
const { value: currentUser } = useCurrentUser();

// Below the form fields:
{currentUser && (
  <Box display="flex" alignItems="center" gap={1} mt={1}>
    <Avatar src={currentUser.picture} style={{ width: 20, height: 20 }}>
      {currentUser.displayName.slice(0, 1)}
    </Avatar>
    <Typography variant="caption" color="textSecondary">
      Reporting as {currentUser.displayName}
    </Typography>
  </Box>
)}
```

### Frontend: useUserProfile hook

**`src/hooks/useUserProfile.ts`**

Resolves a single Backstage `userEntityRef` to a display name and avatar URL. Used by `mapBug` and `mapComment` — or called directly from components that receive a raw entity ref.

```typescript
import { useApi, catalogApiRef } from '@backstage/core-plugin-api';
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
      const profile = entity.spec?.profile as any;
      return {
        id:          entityRef,
        displayName: profile?.displayName ?? entityRef,
        avatarUrl:   profile?.picture ?? undefined,
      };
    } catch {
      return { id: entityRef, displayName: entityRef };
    }
  }, [entityRef]);

  return { user: value ?? null, loading };
}
```

### Frontend: resolving users in BackendClient

Update `BackendClient` to batch-resolve user entity refs via the catalog when mapping bug responses. Use a per-request in-memory cache to avoid redundant catalog calls within a single `getBugs` fetch:

```typescript
// In BackendClient — add a method to resolve users in bulk
private async resolveUsers(refs: string[]): Promise<Map<string, User>> {
  const unique = [...new Set(refs.filter(Boolean))];
  const map = new Map<string, User>();

  await Promise.all(
    unique.map(async ref => {
      try {
        const entity = await this.catalogApi.getEntityByRef(ref);
        const profile = entity?.spec?.profile as any;
        map.set(ref, {
          id:          ref,
          displayName: profile?.displayName ?? ref,
          avatarUrl:   profile?.picture ?? undefined,
        });
      } catch {
        map.set(ref, { id: ref, displayName: ref });
      }
    }),
  );

  return map;
}
```

Add `catalogApi` as a constructor dependency:

```typescript
import { catalogApiRef } from '@backstage/plugin-catalog-react';

export class BackendClient implements BugManagerApi {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
    private readonly catalogApi: CatalogApi,  // NEW
  ) {}
```

Update `plugin.ts` factory:

```typescript
createApiFactory({
  api: bugManagerApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    fetchApi:     fetchApiRef,
    catalogApi:   catalogApiRef,
  },
  factory: ({ discoveryApi, fetchApi, catalogApi }) =>
    new BackendClient(discoveryApi, fetchApi, catalogApi),
})
```

Update `getBugs` to pass resolved users into `mapBug`:

```typescript
async getBugs(filters?: BugFilters): Promise<Bug[]> {
  // ... build params ...
  const [rows, statusRows] = await Promise.all([
    this.request<any[]>(`/bugs${qs ? `?${qs}` : ''}`),
    this.request<any[]>('/statuses'),
  ]);
  const statuses = statusRows.map(this.mapStatus);

  // Collect all user refs from this page of bugs
  const userRefs = [
    ...rows.map(r => r.reporter_id),
    ...rows.map(r => r.assignee_id).filter(Boolean),
  ];
  const users = await this.resolveUsers(userRefs);

  return rows.map(r => this.mapBug(r, statuses, users));
}
```

### Frontend: CommentSection authenticated input

The comment input row now shows the current user's avatar on the left:

```tsx
// In CommentSection.tsx
const { value: currentUser } = useCurrentUser();

// Input row:
<Box display="flex" alignItems="flex-start" gap={1} mt={2}>
  <Avatar src={currentUser?.picture} style={{ width: 32, height: 32, flexShrink: 0 }}>
    {currentUser?.displayName.slice(0, 1)}
  </Avatar>
  <TextField
    fullWidth
    multiline
    minRows={2}
    placeholder="Add a comment..."
    value={commentText}
    onChange={e => setCommentText(e.target.value)}
    variant="outlined"
    size="small"
  />
  <IconButton
    color="primary"
    disabled={!commentText.trim()}
    onClick={handleSubmit}
  >
    <SendIcon />
  </IconButton>
</Box>
```

`BackendClient.addComment` no longer sends `userId` in the request body:

```typescript
async addComment(bugId: string, content: string, parentCommentId?: string): Promise<Comment> {
  const row = await this.request<any>(`/bugs/${bugId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      commentBody: content,
      parentCommentId,
      // userId removed — derived from auth token on the backend
    }),
  });
  const users = await this.resolveUsers([row.user_id]);
  return this.mapComment(row, users);
}
```

Similarly, `createBug` removes the placeholder `reporterId`:

```typescript
async createBug(bug: CreateBugRequest): Promise<Bug> {
  const row = await this.request<any>('/bugs', {
    method: 'POST',
    body: JSON.stringify({
      heading:     bug.heading,
      description: bug.description,
      assigneeId:  bug.assigneeId,
      statusId:    bug.statusId,
      priority:    bug.priority,
      // reporterId removed
    }),
  });
  // ...
}
```

### Frontend: useIsAdmin hook

Admin-only surfaces (Status Management dialog button) check whether the current user has admin access. Two approaches — use whichever is configured in the Backstage instance:

**Option A: Backstage permission framework**

```typescript
// src/hooks/useIsAdmin.ts (Option A)
import { usePermission } from '@backstage/plugin-permission-react';
import { createPermission } from '@backstage/plugin-permission-common';

export const bugManagerAdminPermission = createPermission({
  name: 'bug-manager.admin',
  attributes: { action: 'use' },
});

export function useIsAdmin(): boolean {
  const { allowed } = usePermission({ permission: bugManagerAdminPermission });
  return allowed;
}
```

**Option B: Catalog group membership (fallback)**

```typescript
// src/hooks/useIsAdmin.ts (Option B — no permission framework required)
import { useApi, catalogApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { useAsync } from 'react-use';

export function useIsAdmin(): boolean {
  const identityApi = useApi(identityApiRef);
  const catalogApi  = useApi(catalogApiRef);

  const { value } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    // Check if user belongs to the 'admins' group
    const groups = await catalogApi.getEntities({
      filter: {
        kind: 'Group',
        'spec.members': identity.userEntityRef,
      },
    });
    return groups.items.some(
      g => g.metadata.name === 'admins',
    );
  }, []);

  return value ?? false;
}
```

Use in `Toolbar.tsx`:

```tsx
const isAdmin = useIsAdmin();

<Button
  variant="outlined"
  startIcon={<SettingsIcon />}
  onClick={() => setStatusDialogOpen(true)}
  disabled={!isAdmin}
>
  <Tooltip title={!isAdmin ? 'Admin access required' : ''}>
    <span>Statuses</span>
  </Tooltip>
</Button>
```

---

## Steps

### 4.1 Add `requireUser` helper to router

Write the `requireUser` helper that calls `httpAuth.credentials` and `userInfo.getUserInfo`. Apply it to all write endpoints.

### 4.2 Update `POST /bugs` — remove `reporterId` from body

Remove the `reporterId` field from the body destructuring. Use `requireUser` to obtain it.

### 4.3 Update `POST /bugs/:id/comments` — remove `userId` from body

Remove the `userId` field from the body destructuring. Use `requireUser` to obtain it.

### 4.4 Inject `catalogClient` into router

Add `catalogServiceRef` to plugin deps. Update `GET /users` to resolve display names and avatar URLs via the catalog.

### 4.5 Write `useCurrentUser` hook

Create `src/hooks/useCurrentUser.ts` using `IdentityApi`.

### 4.6 Write `useUserProfile` hook

Create `src/hooks/useUserProfile.ts` using `catalogApiRef`.

### 4.7 Add `catalogApi` to `BackendClient`

Update constructor, `plugin.ts` factory, and add `resolveUsers` batch method. Update `getBugs`, `getBugById`, `getComments`, and `addComment` to resolve user display names.

### 4.8 Remove placeholder identities from `BackendClient`

Remove `reporterId: 'user:default/current'` from `createBug` and `userId: 'user:default/current'` from `addComment`.

### 4.9 Update `CreateBugDialog` — "Reporting as" label

Add `useCurrentUser` call and render the current user's avatar + name below the form fields.

### 4.10 Update `CommentSection` — authenticated input row

Show the current user's avatar next to the comment textarea.

### 4.11 Write `useIsAdmin` hook

Implement using Option A (permission framework) or Option B (catalog group). Wire into `Toolbar` to enable/disable the Statuses button.

### 4.12 Verify

- Create a bug without being logged in → `401 Unauthorized` in the network tab (can test by sending a raw request without the auth header)
- Create a bug while logged in → reporter field in the response matches the logged-in user's entity ref
- Add a comment → author in the comment list shows the logged-in user's real display name and avatar
- Log in as a user in the `admins` group → Statuses button is enabled
- Log in as a non-admin user → Statuses button is disabled with tooltip
- `GET /api/bug-manager/users` → returns objects with real `displayName` and `avatarUrl` values from the catalog
- Bug list assignee avatars show real profile pictures where available in the catalog

---

## What comes out of this phase

Fully authenticated multi-user operation. Every bug created records the real reporter. Every comment is attributed to the real author. The system is safe for shared use — no user can impersonate another by passing a different `reporterId` or `userId` in the request body.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Catalog entity not found for a user entity ref | `displayName` falls back to raw entity ref string | Acceptable fallback — ref is still a valid identifier |
| `resolveUsers` in `BackendClient` fires N catalog requests per bug page | Slow on large pages | Batch with `catalogApi.getEntitiesByRefs` if available, or cache resolved refs in a module-level `Map` |
| `usePermission` requires the permission framework to be configured | `useIsAdmin` always returns `false` | Offer Option B (group membership) as a documented fallback |
| Auth token not forwarded via `FetchApi` | All writes return `401` despite being logged in | Backstage's `FetchApi` automatically injects the user token — ensure the frontend uses `fetchApiRef`, not raw `window.fetch` |
