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

import React, { useState } from 'react';
import Avatar from '@material-ui/core/Avatar';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { Comment } from '../../api/types';
import { formatRelativeTime } from '../../utils/dateFormatting';

const CURRENT_USER_ID = 'user:default/jane';

type Mode = 'display' | 'edit' | 'delete-confirm';

const useStyles = makeStyles(theme => ({
  comment: {
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
  },
  commentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  },
  commentAuthor: {
    fontWeight: 600,
    fontSize: '0.875rem',
    flex: 1,
  },
  commentTime: {
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  editedTag: {
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  commentContent: {
    whiteSpace: 'pre-line',
    fontSize: '0.875rem',
  },
  quoteBox: {
    borderLeft: `3px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.action.hover,
    borderRadius: `0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0`,
    padding: theme.spacing(1, 1.5),
    marginBottom: theme.spacing(1),
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
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  deleteText: {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
}));

interface CommentItemProps {
  comment: Comment;
  parentComment?: Comment;
  isOwn: boolean;
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReply?: (parentCommentId: string) => void;
  isReply?: boolean;
}

export const CommentItem = ({
  comment,
  parentComment,
  isOwn,
  onEdit,
  onDelete,
  onReply,
  isReply,
}: CommentItemProps) => {
  const classes = useStyles();
  const [mode, setMode] = useState<Mode>('display');
  const [editContent, setEditContent] = useState(comment.content);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const hasActions = isOwn || !isReply;

  const initials = comment.author.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  const quoteExcerpt = parentComment
    ? parentComment.content.length > 100
      ? `${parentComment.content.slice(0, 100)}...`
      : parentComment.content
    : null;

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget);
  const handleMenuClose = () => setMenuAnchor(null);

  const handleEditClick = () => {
    setEditContent(comment.content);
    setMode('edit');
    handleMenuClose();
  };

  const handleDeleteClick = () => {
    setMode('delete-confirm');
    handleMenuClose();
  };

  const handleReplyClick = () => {
    onReply?.(comment.id);
    handleMenuClose();
  };

  const handleSaveEdit = async () => {
    await onEdit(comment.id, editContent.trim());
    setMode('display');
  };

  const handleCancelEdit = () => {
    setEditContent(comment.content);
    setMode('display');
  };

  return (
    <Box
      className={classes.comment}
      style={isReply ? { marginLeft: 32 } : undefined}
    >
      {quoteExcerpt && (
        <Box className={classes.quoteBox}>
          <Typography className={classes.quoteAuthor}>
            {parentComment!.author.displayName}
          </Typography>
          <Typography className={classes.quoteContent}>{quoteExcerpt}</Typography>
        </Box>
      )}

      <Box className={classes.commentHeader}>
        <Avatar
          src={comment.author.avatarUrl}
          style={{ width: 24, height: 24, fontSize: 10 }}
        >
          {initials}
        </Avatar>
        <Typography className={classes.commentAuthor}>
          {comment.author.displayName}
        </Typography>
        <Typography className={classes.commentTime}>
          {formatRelativeTime(comment.createdAt)}
          {comment.updatedAt && <span className={classes.editedTag}> (edited)</span>}
        </Typography>
        {hasActions && (
          <>
            <IconButton size="small" onClick={handleMenuOpen}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={handleMenuClose}
            >
              {isOwn && <MenuItem onClick={handleEditClick}>Edit</MenuItem>}
              {isOwn && <MenuItem onClick={handleDeleteClick}>Delete</MenuItem>}
              {!isReply && <MenuItem onClick={handleReplyClick}>Reply</MenuItem>}
            </Menu>
          </>
        )}
      </Box>

      {mode === 'display' && (
        <Typography className={classes.commentContent}>{comment.content}</Typography>
      )}

      {mode === 'edit' && (
        <>
          <TextField
            fullWidth
            multiline
            minRows={2}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            variant="outlined"
            size="small"
          />
          <Box className={classes.actionRow}>
            <Button size="small" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              color="primary"
              disabled={!editContent.trim()}
              onClick={handleSaveEdit}
            >
              Save
            </Button>
          </Box>
        </>
      )}

      {mode === 'delete-confirm' && (
        <>
          <Typography className={classes.deleteText}>Delete this comment?</Typography>
          <Box className={classes.actionRow}>
            <Button size="small" onClick={() => setMode('display')}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              color="secondary"
              onClick={() => onDelete(comment.id)}
            >
              Delete
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};
