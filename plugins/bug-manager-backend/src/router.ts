import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { v4 as uuid } from 'uuid';
import type {
  DatabaseService,
  HttpAuthService,
  LoggerService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { BugManagerStore } from './database/BugManagerStore';

export interface RouterOptions {
  database: DatabaseService;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  logger: LoggerService;
  catalogClient: CatalogService;
}

// Helper — returns the caller's user entity ref.
// Falls back to 'user:default/guest' when there are no user credentials
// (unauthenticated dev sessions running with dangerouslyDisableDefaultAuthPolicy).
async function requireUser(
  req: Request,
  httpAuth: HttpAuthService,
  userInfo: UserInfoService,
): Promise<string> {
  try {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const info = await userInfo.getUserInfo(credentials);
    return info.userEntityRef;
  } catch {
    return 'user:default/guest';
  }
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { database, httpAuth, userInfo, logger, catalogClient } = options;
  const store = await BugManagerStore.create(() => database.getClient());

  const router = Router();
  router.use(express.json());

  // ── Health ────────────────────────────────────────────────────────────────

  router.get('/healthz', async (_req, res) => {
    await store.getStatuses();
    res.json({ status: 'ok' });
  });

  // ── Bugs ──────────────────────────────────────────────────────────────────

  router.get('/bugs', async (req, res) => {
    const { assignee, priority, status, search, includeClosed } =
      req.query as Record<string, string>;
    const bugs = await store.getBugs({
      assigneeIds: assignee ? assignee.split(',') : undefined,
      priority: priority as any,
      statusId: status,
      search,
      includeClosed: includeClosed === 'true',
    });
    res.json(bugs);
  });

  router.get('/bugs/:id', async (req, res) => {
    const bug = await store.getBugById(req.params.id);
    if (!bug) return notFound(res, 'Bug');
    return res.json(bug);
  });

  router.post('/bugs', async (req, res) => {
    const reporterId = await requireUser(req, httpAuth, userInfo);

    const { heading, description, assigneeId, statusId, priority } = req.body;

    if (!heading?.trim()) return badRequest(res, 'heading is required');
    if (!statusId) return badRequest(res, 'statusId is required');

    const statusExists = await store
      .getStatuses()
      .then(ss => ss.some(s => s.id === statusId));
    if (!statusExists) return badRequest(res, `Status ${statusId} does not exist`);

    const ticketNumber = await store.nextTicketNumber();
    const bug = await store.createBug({
      id: uuid(),
      ticket_number: ticketNumber,
      heading: heading.trim(),
      description: description ?? '',
      priority: priority ?? 'medium',
      status_id: statusId,
      assignee_id: assigneeId ?? null,
      reporter_id: reporterId,
      is_closed: false,
    });
    return res.status(201).json(bug);
  });

  router.patch('/bugs/:id', async (req, res) => {
    await requireUser(req, httpAuth, userInfo);

    const existing = await store.getBugById(req.params.id);
    if (!existing) return notFound(res, 'Bug');

    const { heading, description, assigneeId, statusId, priority, isClosed } =
      req.body;
    const patch: Record<string, any> = {};
    if (heading !== undefined) patch.heading = heading.trim();
    if (description !== undefined) patch.description = description;
    if (assigneeId !== undefined) patch.assignee_id = assigneeId;
    if (statusId !== undefined) patch.status_id = statusId;
    if (priority !== undefined) patch.priority = priority;
    if (isClosed !== undefined) patch.is_closed = isClosed;

    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'No fields to update');
    }

    const updated = await store.updateBug(req.params.id, patch);
    return res.json(updated);
  });

  // ── Statuses ──────────────────────────────────────────────────────────────

  router.get('/statuses', async (_req, res) => {
    const statuses = await store.getStatuses();
    res.json(statuses);
  });

  router.post('/statuses', async (req, res) => {
    await requireUser(req, httpAuth, userInfo);

    const count = await store.countStatuses();
    if (count >= 5) {
      return conflict(res, 'Maximum of 5 active statuses allowed');
    }
    const { label, color, order } = req.body;
    if (!label?.trim()) return badRequest(res, 'label is required');

    const status = await store.createStatus({
      id: uuid(),
      label: label.trim(),
      color: color ?? '#9E9E9E',
      order: order ?? count,
    });
    return res.status(201).json(status);
  });

  router.patch('/statuses/:id', async (req, res) => {
    await requireUser(req, httpAuth, userInfo);

    const { label, color, order } = req.body;
    const patch: Record<string, any> = {};
    if (label !== undefined) patch.label = label.trim();
    if (color !== undefined) patch.color = color;
    if (order !== undefined) patch.order = order;

    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'No fields to update');
    }

    const status = await store.updateStatus(req.params.id, patch);
    if (!status) return notFound(res, 'Status');
    return res.json(status);
  });

  router.delete('/statuses/:id', async (req, res) => {
    await requireUser(req, httpAuth, userInfo);

    // replacementStatusId is passed as a query param (not body) — some proxies strip DELETE bodies.
    const count = await store.countStatuses();
    if (count <= 5) {
      return conflict(
        res,
        'Cannot delete: minimum of 5 statuses required. Add a replacement status first.',
      );
    }
    const replacementStatusId = req.query.replacementStatusId as string | undefined;
    if (!replacementStatusId) {
      return badRequest(res, 'replacementStatusId query param is required');
    }
    await store.deleteStatus(req.params.id, replacementStatusId);
    return res.status(204).send();
  });

  // ── Comments ──────────────────────────────────────────────────────────────

  router.get('/bugs/:id/comments', async (req, res) => {
    const bug = await store.getBugById(req.params.id);
    if (!bug) return notFound(res, 'Bug');
    const comments = await store.getComments(req.params.id);
    res.json(comments);
  });

  router.post('/bugs/:id/comments', async (req, res) => {
    const userId = await requireUser(req, httpAuth, userInfo);

    const bug = await store.getBugById(req.params.id);
    if (!bug) return notFound(res, 'Bug');

    const { commentBody, parentCommentId } = req.body;
    if (!commentBody?.trim()) return badRequest(res, 'commentBody is required');

    const comment = await store.addComment({
      id: uuid(),
      bug_id: req.params.id,
      user_id: userId,
      comment_body: commentBody.trim(),
      parent_comment_id: parentCommentId ?? null,
    });
    return res.status(201).json(comment);
  });

  // ── Users ─────────────────────────────────────────────────────────────────

  router.get('/users', async (_req, res) => {
    const refs = await store.getDistinctAssignees();

    const users = await Promise.all(
      refs.map(async ref => {
        try {
          const entity = await catalogClient.getEntityByRef(ref);
          const profile = (entity?.spec?.profile as any) ?? {};
          return {
            id:          ref,
            displayName: profile.displayName ?? ref,
            avatarUrl:   profile.picture ?? undefined,
          };
        } catch {
          return { id: ref, displayName: ref, avatarUrl: undefined };
        }
      }),
    );

    res.json(users);
  });

  // ── Global error handler ──────────────────────────────────────────────────

  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err.message, err);
    res.status(500).json({ error: err.message });
  });

  return router;
}

// ── Response helpers ──────────────────────────────────────────────────────────

function notFound(res: Response, entity: string) {
  return res.status(404).json({ error: `${entity} not found` });
}

function badRequest(res: Response, message: string) {
  return res.status(400).json({ error: message });
}

function conflict(res: Response, message: string) {
  return res.status(409).json({ error: message });
}
