export interface BugRow {
  id: string;
  ticket_number: string;
  heading: string;
  description: string | null;
  priority: 'urgent' | 'medium' | 'low';
  status_id: string;
  assignee_id: string | null;
  reporter_id: string;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

export interface StatusRow {
  id: string;
  label: string;
  color: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  bug_id: string;
  user_id: string;
  comment_body: string;
  parent_comment_id: string | null;
  timestamp: string;
}

export interface BugQueryFilters {
  assigneeIds?: string[];
  priority?: 'urgent' | 'medium' | 'low';
  statusId?: string;
  search?: string;
  includeClosed?: boolean;
}

export interface NewBugRow extends Omit<BugRow, 'created_at' | 'updated_at'> {}
export interface NewCommentRow extends Omit<CommentRow, 'timestamp'> {}
