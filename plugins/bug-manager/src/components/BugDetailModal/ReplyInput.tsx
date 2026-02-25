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

import { useState } from 'react';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  container: {
    marginLeft: theme.spacing(4),
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
  },
  replyingTo: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
}));

interface ReplyInputProps {
  parentAuthorName: string;
  onSend: (content: string) => void;
  onCancel: () => void;
}

export const ReplyInput = ({ parentAuthorName, onSend, onCancel }: ReplyInputProps) => {
  const classes = useStyles();
  const [content, setContent] = useState('');

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setContent('');
  };

  return (
    <Box className={classes.container}>
      <Typography className={classes.replyingTo}>
        Replying to {parentAuthorName}
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={2}
        maxRows={4}
        placeholder="Your reply here..."
        value={content}
        onChange={e => setContent(e.target.value)}
        variant="outlined"
        size="small"
      />
      <Box className={classes.actionRow}>
        <Button size="small" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          color="primary"
          disabled={!content.trim()}
          onClick={handleSend}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
};
