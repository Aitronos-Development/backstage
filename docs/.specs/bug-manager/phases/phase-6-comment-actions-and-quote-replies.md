# Phase 6: Comment Edit, Delete & Quote Replies

**Goal:** Extend the comment system with edit/delete capabilities for the comment author and a threaded quote-reply mechanism, allowing users to reply to specific comments with visual quoting — creating lightweight discussion threads within a bug ticket.

**Depends on:** Phase 4 (Bug Detail Modal with Comments)

---

## What this phase delivers

- Edit and delete actions on comments, restricted to the comment's author
- A quote-reply system where any user can reply to a specific comment
- Quote replies visually display the original comment they reference
- Quote replies are themselves editable and deletable by their author
- A single comment can have one or more quote replies
- Updated `Comment` type with `updatedAt` and reply reference fields
- New API methods: `updateComment`, `deleteComment`
- Updated `LocalStorageClient` with edit, delete, and reply storage logic
- Updated `useComments` hook with edit, delete, and reply actions
- Redesigned `CommentSection` UI with action menus, inline editing, and nested reply display

---

## Data schema changes

### Updated Comment entity

```typescript
export interface Comment {
  id: string;
  author: User;
  content: string;
  createdAt: string;
  updatedAt?: string;          // NEW — set on edit, undefined until first edit
  parentCommentId?: string;    // NEW — if set, this is a quote reply to the referenced comment
}
```

| Field             | Type               | Required | Description                                                     |
| ----------------- | ------------------ | -------- | --------------------------------------------------------------- |
| `id`              | `string`           | Yes      | UUID, auto-generated                                            |
| `author`          | `User`             | Yes      | Comment author                                                  |
| `content`         | `string`           | Yes      | Comment body                                                    |
| `createdAt`       | `string`           | Yes      | ISO 8601 timestamp                                              |
| `updatedAt`       | `string`           | No       | ISO 8601 timestamp, set on edit. Displays "(edited)" indicator  |
| `parentCommentId` | `string`           | No       | If present, this comment is a quote reply to the parent comment |

**Storage:** Comments remain stored flat in `bug-manager:comments:{bugId}`. Both top-level comments and quote replies live in the same array. The UI groups them for display using `parentCommentId`.

### Why flat storage (not nested)?

- Keeps the storage format simple and backward-compatible with existing seeded data
- Avoids recursive data structures in localStorage
- Rendering logic handles grouping — replies are displayed indented beneath their parent
- Deleting a parent comment does not cascade-delete replies; orphaned replies promote to top-level (see behavior rules below)

---

## API changes

### Updated BugManagerApi interface

Add three new methods:

```typescript
export interface BugManagerApi {
  // ... existing methods unchanged ...

  getComments(bugId: string): Promise<Comment[]>;
  addComment(bugId: string, content: string, parentCommentId?: string): Promise<Comment>;
  updateComment(bugId: string, commentId: string, content: string): Promise<Comment>;
  deleteComment(bugId: string, commentId: string): Promise<void>;
}
```

| Method          | Parameters                                          | Returns            | Description                                      |
| --------------- | --------------------------------------------------- | ------------------ | ------------------------------------------------ |
| `addComment`    | `bugId, content, parentCommentId?`                  | `Promise<Comment>` | Creates a comment. If `parentCommentId` is provided, it's a quote reply. |
| `updateComment` | `bugId, commentId, content`                         | `Promise<Comment>` | Updates the comment content and sets `updatedAt`. |
| `deleteComment` | `bugId, commentId`                                  | `Promise<void>`    | Removes the comment from storage. Orphaned replies promote to top-level. |

### LocalStorageClient implementation

**`addComment` — updated signature:**

```typescript
async addComment(bugId: string, content: string, parentCommentId?: string): Promise<Comment> {
  const comments = await this.getComments(bugId);
  const comment: Comment = {
    id: generateId(),
    author: MOCK_USERS[0], // prototype default
    content,
    createdAt: nowISO(),
    parentCommentId,
  };
  comments.push(comment);
  localStorage.setItem(KEYS.comments(bugId), JSON.stringify(comments));
  return comment;
}
```

**`updateComment` — new method:**

```typescript
async updateComment(bugId: string, commentId: string, content: string): Promise<Comment> {
  const comments = await this.getComments(bugId);
  const comment = comments.find(c => c.id === commentId);
  if (!comment) throw new Error(`Comment not found: ${commentId}`);
  comment.content = content;
  comment.updatedAt = nowISO();
  localStorage.setItem(KEYS.comments(bugId), JSON.stringify(comments));
  return { ...comment };
}
```

**`deleteComment` — new method:**

```typescript
async deleteComment(bugId: string, commentId: string): Promise<void> {
  let comments = await this.getComments(bugId);

  // Promote orphaned replies: clear parentCommentId for any reply pointing to the deleted comment
  comments = comments
    .filter(c => c.id !== commentId)
    .map(c =>
      c.parentCommentId === commentId
        ? { ...c, parentCommentId: undefined }
        : c,
    );

  localStorage.setItem(KEYS.comments(bugId), JSON.stringify(comments));
}
```

---

## Hook changes

### Updated useComments hook

**`src/hooks/useComments.ts`**

```typescript
export function useComments(bugId: string | null) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  // ... existing load logic unchanged ...

  const addComment = useCallback(
    async (content: string, parentCommentId?: string) => {
      if (!bugId) return;
      const comment = await apiClient.addComment(bugId, content, parentCommentId);
      setComments(prev => [...prev, comment]);
    },
    [bugId],
  );

  const updateComment = useCallback(
    async (commentId: string, content: string) => {
      if (!bugId) return;
      const updated = await apiClient.updateComment(bugId, commentId, content);
      setComments(prev =>
        prev.map(c => (c.id === commentId ? updated : c)),
      );
    },
    [bugId],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!bugId) return;
      await apiClient.deleteComment(bugId, commentId);
      setComments(prev => {
        // Remove the deleted comment and promote orphaned replies
        return prev
          .filter(c => c.id !== commentId)
          .map(c =>
            c.parentCommentId === commentId
              ? { ...c, parentCommentId: undefined }
              : c,
          );
      });
    },
    [bugId],
  );

  return { comments, addComment, updateComment, deleteComment, loading };
}
```

---

## UI specification

### Comment display structure

Comments are displayed as a flat list with visual grouping. Top-level comments render at full width; quote replies render indented beneath their parent with a quoted excerpt.

```
Comments (5)

┌──────────────────────────────────────────────┐
│ 👤 Jane Doe · 2h ago                    ··· │  ← action menu (edit, delete, reply)
│ Reproduced on Safari 17.2.                   │
│ Working on a fix.                             │
├──────────────────────────────────────────────┤
│   ┌ Quote: Jane Doe                          │  ← indented reply with quoted header
│   │ "Reproduced on Safari 17.2..."           │  ← truncated quote (max 100 chars)
│   └                                          │
│   👤 John Smith · 1h ago  (edited)   ··· │  ← reply with edited indicator
│   Thanks, I can provide more logs if         │
│   needed.                                     │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 👤 John Smith · 1d ago                   ··· │
│ This is blocking the v2.0 release.           │
│ Please prioritize.                            │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ Add a comment...                              │
│                                        [Send] │
└──────────────────────────────────────────────┘
```

### Comment rendering rules

1. **Top-level comments** (`parentCommentId` is `undefined`): Render in chronological order as they do today.

2. **Quote replies** (`parentCommentId` is set): Render immediately after their parent comment, indented with `marginLeft: theme.spacing(4)`.

3. **Orphaned replies** (parent was deleted, `parentCommentId` is `undefined` after promotion): Render as top-level comments. The quoted excerpt is no longer shown since the parent is gone.

4. **Ordering:** Top-level comments are sorted by `createdAt` ascending. Replies under each parent are also sorted by `createdAt` ascending.

### Grouping logic (in CommentSection)

```typescript
const groupedComments = useMemo(() => {
  const topLevel = comments
    .filter(c => !c.parentCommentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return topLevel.map(parent => ({
    comment: parent,
    replies: comments
      .filter(c => c.parentCommentId === parent.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));
}, [comments]);
```

### Action menu (three-dot icon)

Each comment and reply displays a `···` (`MoreVertIcon`) button in the header row. Clicking it opens a Material-UI `<Menu>` with:

| Action   | Visible When                              | Behavior                                    |
| -------- | ----------------------------------------- | ------------------------------------------- |
| Edit     | Current user is the comment author        | Toggles inline edit mode                    |
| Delete   | Current user is the comment author        | Opens delete confirmation                   |
| Reply    | Always (on top-level comments only)       | Opens reply input beneath the comment       |

**Author check (prototype):** Since all comments default to `MOCK_USERS[0]` (Jane Doe), the prototype treats the current user as Jane Doe. All comments authored by Jane show Edit/Delete; John's comments only show Reply. For a real implementation, this would use `identityApiRef`.

```typescript
const CURRENT_USER_ID = 'user:default/jane'; // prototype hardcoded

const isOwnComment = comment.author.id === CURRENT_USER_ID;
```

### Inline edit mode

When the user clicks "Edit" from the action menu:

1. The comment content replaces with a `<TextField multiline>` pre-filled with the current content.
2. Two buttons appear below: **Save** and **Cancel**.
3. **Save:** Calls `updateComment(commentId, newContent)`. Comment updates in place. `(edited)` indicator appears next to the timestamp.
4. **Cancel:** Reverts to display mode, discards changes.
5. Empty content is not saveable (Save button disabled).

```
┌──────────────────────────────────────────────┐
│ 👤 Jane Doe · 2h ago                        │
│ ┌──────────────────────────────────────────┐ │
│ │ Reproduced on Safari 17.2.               │ │  ← editable TextField
│ │ Working on a fix.                        │ │
│ └──────────────────────────────────────────┘ │
│                          [Cancel] [Save]     │
└──────────────────────────────────────────────┘
```

### Delete confirmation

When the user clicks "Delete" from the action menu, a small inline confirmation appears (not a full Dialog — keeps context):

```
┌──────────────────────────────────────────────┐
│ 👤 Jane Doe · 2h ago                        │
│ Delete this comment?                         │
│                  [Cancel] [Delete]            │
└──────────────────────────────────────────────┘
```

- **Delete button:** Red/secondary color.
- If the comment has replies, they become orphaned (promoted to top-level). No warning needed — the replies remain visible.

### Quote reply input

When the user clicks "Reply" from the action menu:

1. A reply input appears below the comment (and below any existing replies).
2. The input shows a quoted header: `Replying to [Author Name]`.
3. A `<TextField multiline minRows={2} maxRows={4}>` for the reply content.
4. **Send** and **Cancel** buttons.
5. On send, calls `addComment(bugId, content, parentCommentId)`.
6. The new reply appears immediately beneath the parent.

```
┌──────────────────────────────────────────────┐
│ 👤 Jane Doe · 2h ago                    ··· │
│ Reproduced on Safari 17.2.                   │
│                                               │
│  ┌─ Replying to Jane Doe ──────────────────┐ │
│  │ [Your reply here...]                     │ │
│  │                         [Cancel] [Send]  │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Quote excerpt display (on replies)

Each reply shows a quoted excerpt of the parent comment:

```typescript
const quoteExcerpt = parentComment
  ? parentComment.content.length > 100
    ? `${parentComment.content.slice(0, 100)}...`
    : parentComment.content
  : null;
```

**Styling:**

```typescript
quoteBox: {
  borderLeft: `3px solid ${theme.palette.divider}`,
  paddingLeft: theme.spacing(1.5),
  marginBottom: theme.spacing(1),
  backgroundColor: theme.palette.action.hover,
  borderRadius: `0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0`,
  padding: theme.spacing(1, 1.5),
},
quoteAuthor: {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: theme.palette.text.secondary,
},
quoteContent: {
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  fontStyle: 'italic',
},
```

### "(edited)" indicator

When `updatedAt` is set on a comment, display `(edited)` next to the relative timestamp:

```tsx
<Typography className={classes.commentTime}>
  {formatRelativeTime(comment.createdAt)}
  {comment.updatedAt && (
    <span className={classes.editedTag}> (edited)</span>
  )}
</Typography>
```

**Styling:** Same color as timestamp (`text.secondary`), normal weight.

---

## Component structure

### New: CommentItem component

Extract from `CommentSection` into a dedicated component:

**`src/components/BugDetailModal/CommentItem.tsx`**

```typescript
interface CommentItemProps {
  comment: Comment;
  parentComment?: Comment;          // the quoted parent, if this is a reply
  isOwn: boolean;                   // whether the current user authored this comment
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReply?: (parentCommentId: string) => void;  // undefined for replies (no nested replies)
  isReply?: boolean;                // controls indentation
}
```

Handles:
- Display mode (avatar, author, time, edited indicator, content, quote excerpt)
- Action menu (edit, delete, reply)
- Inline edit mode (TextField + Save/Cancel)
- Inline delete confirmation

### Updated: CommentSection

Orchestrates the grouped rendering:

```tsx
{groupedComments.map(({ comment, replies }) => (
  <React.Fragment key={comment.id}>
    <CommentItem
      comment={comment}
      isOwn={comment.author.id === CURRENT_USER_ID}
      onEdit={updateComment}
      onDelete={deleteComment}
      onReply={(parentId) => setReplyingTo(parentId)}
    />

    {/* Replies indented */}
    {replies.map(reply => (
      <CommentItem
        key={reply.id}
        comment={reply}
        parentComment={comment}
        isOwn={reply.author.id === CURRENT_USER_ID}
        onEdit={updateComment}
        onDelete={deleteComment}
        isReply
      />
    ))}

    {/* Reply input (shown when replying to this comment) */}
    {replyingTo === comment.id && (
      <ReplyInput
        parentAuthorName={comment.author.displayName}
        onSend={(content) => {
          addComment(content, comment.id);
          setReplyingTo(null);
        }}
        onCancel={() => setReplyingTo(null)}
      />
    )}
  </React.Fragment>
))}
```

### New: ReplyInput component

**`src/components/BugDetailModal/ReplyInput.tsx`**

A small, focused component for the reply input:

```typescript
interface ReplyInputProps {
  parentAuthorName: string;
  onSend: (content: string) => void;
  onCancel: () => void;
}
```

Renders: "Replying to [Name]" header + multiline TextField + Send/Cancel buttons. Indented with `marginLeft: theme.spacing(4)`.

### Package structure additions

```
src/components/BugDetailModal/
├── BugDetailModal.tsx          (unchanged)
├── BugContent.tsx              (unchanged)
├── BugMetadataSidebar.tsx      (unchanged)
├── CommentSection.tsx          (updated — grouping logic, reply state)
├── CommentItem.tsx             (new — individual comment with actions)
└── ReplyInput.tsx              (new — reply input with quote header)
```

---

## Behavior rules

| Scenario                              | Behavior                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| User edits own comment                | Content updates in place, `updatedAt` set, `(edited)` shown                     |
| User edits own quote reply            | Same as above — reply content updates in place                                   |
| User deletes own comment (no replies) | Comment removed from list                                                        |
| User deletes own comment (has replies)| Comment removed; replies lose `parentCommentId` and promote to top-level        |
| User deletes own quote reply          | Reply removed from list; parent comment unaffected                              |
| User replies to a comment             | New comment created with `parentCommentId` set; appears indented below parent   |
| Reply to a reply                      | **Not supported.** Reply action only appears on top-level comments. This keeps threads one level deep. |
| Other user's comment                  | Only "Reply" action shown; no Edit or Delete                                    |
| Empty edit content                    | Save button disabled; cannot save empty comment                                  |

---

## Steps

### 6.1 Update the Comment type

Add `updatedAt?: string` and `parentCommentId?: string` to the `Comment` interface in `src/api/types.ts`.

### 6.2 Update the API interface

Add `updateComment` and `deleteComment` to `BugManagerApi`. Update `addComment` signature to accept optional `parentCommentId`.

### 6.3 Implement LocalStorageClient methods

Add `updateComment` and `deleteComment`. Update `addComment` to pass through `parentCommentId`. Implement orphan promotion on delete.

### 6.4 Update the useComments hook

Add `updateComment`, `deleteComment` to the hook return. Update `addComment` to accept `parentCommentId`. Implement local state updates for edit, delete, and orphan promotion.

### 6.5 Build CommentItem component

Create `CommentItem.tsx` with display mode, action menu, inline edit mode, inline delete confirmation, quote excerpt display, and `(edited)` indicator.

### 6.6 Build ReplyInput component

Create `ReplyInput.tsx` with "Replying to [Name]" header, multiline TextField, Send/Cancel buttons.

### 6.7 Update CommentSection

Refactor to use grouping logic (`groupedComments` memo), render `CommentItem` for each comment and its replies, manage `replyingTo` state, and wire all actions.

### 6.8 Seed a quote reply in mock data

Add 1–2 quote replies to the existing seeded comments so the feature is visible on first load. For example, add a reply from John Smith to Jane Doe's first comment on BUG-001.

### 6.9 Verify

- Open a bug with existing comments
- Click `···` on own comment → menu shows Edit, Delete, Reply
- Click `···` on another user's comment → menu shows only Reply
- **Edit:** Click Edit → inline TextField appears with current content → modify → Save → content updates, `(edited)` shows
- **Edit Cancel:** Click Edit → modify → Cancel → reverts to original content
- **Delete (no replies):** Click Delete → inline confirmation → Delete → comment disappears
- **Delete (with replies):** Click Delete → confirmation → Delete → comment gone, replies promoted to top-level (quote excerpt disappears)
- **Reply:** Click Reply → reply input appears below comment with "Replying to [Name]" → type → Send → reply appears indented with quoted excerpt
- **Reply Cancel:** Click Reply → Cancel → input disappears
- Reply shows quoted excerpt (truncated at 100 chars) with left border
- Reply shows edit/delete actions for its author
- Reply does NOT show a Reply action (no nesting beyond one level)
- New top-level comments still work via the bottom input
- Seeded mock data includes at least one quote reply visible on load

---

## What comes out of this phase

A fully interactive comment system with edit, delete, and single-level quote replies. Users can have focused discussions on specific comments, track edits via the `(edited)` indicator, and manage their own contributions. The flat storage model keeps implementation simple while the UI presents a clean threaded view.

---

## Risks

| Risk                                        | Impact                          | Mitigation                                                              |
| ------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Orphan promotion changes visual order       | Promoted replies appear in unexpected position | Acceptable — they sort by `createdAt`, maintaining temporal order |
| Action menu on many comments clutters UI    | Visual noise                    | Menu is a single small icon, consistent with Jira/ClickUp patterns      |
| Inline edit + inline delete in same component | Complex state management      | Mutually exclusive states: display / edit / delete-confirm              |
| Quote excerpt stale after parent edit       | Shows old content               | Excerpt is computed live from parent comment object — always current    |
| Rapid edit/delete operations                | Race conditions                 | LocalStorageClient is synchronous; state updates are sequential         |
