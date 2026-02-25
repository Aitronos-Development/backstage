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

import React, { useMemo, useState } from 'react';
import Avatar from '@material-ui/core/Avatar';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import { useComments } from '../../hooks/useComments';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { CommentItem } from './CommentItem';
import { ReplyInput } from './ReplyInput';

const useStyles = makeStyles(theme => ({
  section: {
    marginTop: theme.spacing(4),
  },
  commentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    marginTop: theme.spacing(2),
  },
  addComment: {
    marginTop: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  sendButton: {
    alignSelf: 'flex-end',
  },
}));

interface CommentSectionProps {
  bugId: string;
}

export const CommentSection = ({ bugId }: CommentSectionProps) => {
  const classes = useStyles();
  const { comments, addComment, updateComment, deleteComment, loading } = useComments(bugId);
  const { value: currentUser } = useCurrentUser();
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

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

  const handleAddComment = async () => {
    const content = newComment.trim();
    if (!content) return;
    await addComment(content);
    setNewComment('');
  };

  return (
    <Box className={classes.section}>
      <Typography variant="h6">Comments ({comments.length})</Typography>

      {loading ? (
        <Box display="flex" justifyContent="center" py={2}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box className={classes.commentList}>
          {comments.length === 0 && (
            <Typography variant="body2" color="textSecondary">
              No comments yet.
            </Typography>
          )}
          {groupedComments.map(({ comment, replies }) => (
            <React.Fragment key={comment.id}>
              <CommentItem
                comment={comment}
                isOwn={comment.author.id === currentUser?.userEntityRef}
                onEdit={updateComment}
                onDelete={deleteComment}
                onReply={parentId => setReplyingTo(parentId)}
              />
              {replies.map(reply => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  parentComment={comment}
                  isOwn={reply.author.id === currentUser?.userEntityRef}
                  onEdit={updateComment}
                  onDelete={deleteComment}
                  isReply
                />
              ))}
              {replyingTo === comment.id && (
                <ReplyInput
                  parentAuthorName={comment.author.displayName}
                  onSend={content => {
                    addComment(content, comment.id);
                    setReplyingTo(null);
                  }}
                  onCancel={() => setReplyingTo(null)}
                />
              )}
            </React.Fragment>
          ))}
        </Box>
      )}

      <Box className={classes.addComment}>
        <Box display="flex" alignItems="flex-start" style={{ gap: 8 }}>
          <Avatar src={currentUser?.picture} style={{ width: 32, height: 32, flexShrink: 0, marginTop: 4 }}>
            {currentUser?.displayName.slice(0, 1)}
          </Avatar>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            placeholder="Add a comment..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            variant="outlined"
            size="small"
          />
        </Box>
        <Button
          variant="contained"
          color="primary"
          size="small"
          disabled={!newComment.trim()}
          onClick={handleAddComment}
          className={classes.sendButton}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
};
