import type { Knex } from 'knex';
import type {
  BugRow,
  StatusRow,
  CommentRow,
  BugQueryFilters,
  NewBugRow,
  NewCommentRow,
} from '../types';

export class BugManagerStore {
  private constructor(private readonly db: Knex) {}

  static async create(
    getClient: () => Promise<Knex>,
  ): Promise<BugManagerStore> {
    const db = await getClient();
    await db.migrate.latest({
      directory: `${__dirname}/migrations`,
    });
    return new BugManagerStore(db);
  }

  // ── Statuses ────────────────────────────────────────────────────────────

  async getStatuses(): Promise<StatusRow[]> {
    return this.db<StatusRow>('bug_statuses').orderBy('order', 'asc');
  }

  async countStatuses(): Promise<number> {
    const [{ count }] = await this.db('bug_statuses').count('id as count');
    return Number(count);
  }

  async createStatus(
    data: Omit<StatusRow, 'created_at' | 'updated_at'>,
  ): Promise<StatusRow> {
    const now = new Date().toISOString();
    const row = { ...data, created_at: now, updated_at: now };
    await this.db<StatusRow>('bug_statuses').insert(row);
    return row as StatusRow;
  }

  async updateStatus(
    id: string,
    patch: Partial<Pick<StatusRow, 'label' | 'color' | 'order'>>,
  ): Promise<StatusRow | undefined> {
    const updated_at = new Date().toISOString();
    await this.db<StatusRow>('bug_statuses')
      .where({ id })
      .update({ ...patch, updated_at });
    return this.db<StatusRow>('bug_statuses').where({ id }).first();
  }

  async deleteStatus(id: string, replacementId: string): Promise<void> {
    await this.db.transaction(async trx => {
      // Reassign ALL bugs (open and closed) — the FK has no ON DELETE clause,
      // so any remaining reference would cause a FK violation on delete.
      await trx('bugs')
        .where({ status_id: id })
        .update({ status_id: replacementId, updated_at: new Date().toISOString() });
      await trx('bug_statuses').where({ id }).delete();
    });
  }

  // ── Bugs ─────────────────────────────────────────────────────────────────

  async nextTicketNumber(): Promise<string> {
    // MAX() on a string column breaks at BUG-1000 (lexicographic 'BUG-999' > 'BUG-1000').
    // Order by length first so longer numbers always win.
    const row = await this.db('bugs')
      .select('ticket_number')
      .orderByRaw('LENGTH(ticket_number) DESC, ticket_number DESC')
      .first();
    if (!row) return 'BUG-001';
    const num = parseInt(row.ticket_number.replace('BUG-', ''), 10);
    return `BUG-${String(num + 1).padStart(3, '0')}`;
  }

  async getBugs(filters: BugQueryFilters): Promise<BugRow[]> {
    let query = this.db<BugRow>('bugs');

    if (!filters.includeClosed) {
      query = query.where('is_closed', false);
    }
    if (filters.statusId) {
      query = query.where('status_id', filters.statusId);
    }
    if (filters.priority) {
      query = query.where('priority', filters.priority);
    }
    if (filters.assigneeIds?.length) {
      query = query.whereIn('assignee_id', filters.assigneeIds);
    }
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      query = query.where(builder =>
        builder
          .whereRaw('LOWER(heading) LIKE ?', [term])
          .orWhereRaw('LOWER(ticket_number) LIKE ?', [term]),
      );
    }

    return query.orderBy('ticket_number', 'desc');
  }

  async getBugById(id: string): Promise<BugRow | undefined> {
    return this.db<BugRow>('bugs').where({ id }).first();
  }

  async createBug(data: NewBugRow): Promise<BugRow> {
    const now = new Date().toISOString();
    const row: BugRow = { ...data, created_at: now, updated_at: now };
    await this.db<BugRow>('bugs').insert(row);
    return row;
  }

  async updateBug(
    id: string,
    patch: Partial<Omit<BugRow, 'id' | 'ticket_number' | 'reporter_id' | 'created_at'>>,
  ): Promise<BugRow> {
    const updated_at = new Date().toISOString();
    await this.db<BugRow>('bugs').where({ id }).update({ ...patch, updated_at });
    const updated = await this.db<BugRow>('bugs').where({ id }).first();
    if (!updated) throw new Error(`Bug ${id} not found after update`);
    return updated;
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async getComments(bugId: string): Promise<CommentRow[]> {
    return this.db<CommentRow>('bug_comments')
      .where({ bug_id: bugId })
      .orderBy('timestamp', 'asc');
  }

  async addComment(data: NewCommentRow): Promise<CommentRow> {
    const now = new Date().toISOString();
    const row: CommentRow = { ...data, timestamp: now };
    await this.db<CommentRow>('bug_comments').insert(row);
    return row;
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getDistinctAssignees(): Promise<string[]> {
    const rows = await this.db('bugs')
      .distinct('assignee_id')
      .whereNotNull('assignee_id')
      .where('is_closed', false);
    return rows.map((r: { assignee_id: string }) => r.assignee_id);
  }
}
