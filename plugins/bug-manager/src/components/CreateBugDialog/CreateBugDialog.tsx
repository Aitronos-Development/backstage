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

import { useState, useCallback } from 'react';
import Avatar from '@material-ui/core/Avatar';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import IconButton from '@material-ui/core/IconButton';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import CloseIcon from '@material-ui/icons/Close';
import { makeStyles } from '@material-ui/core/styles';
import { Priority } from '../../api/types';
import { useBugManagerContext } from '../../context/useBugManagerContext';
import { PRIORITY_COLORS } from '../../utils/priorities';
import { UserAvatar } from '../shared/UserAvatar';
import { useCurrentUser } from '../../hooks/useCurrentUser';

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const useStyles = makeStyles(theme => ({
  dialogTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    paddingTop: theme.spacing(1),
  },
  row: {
    display: 'flex',
    gap: theme.spacing(2),
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  menuItemContent: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
}));

interface CreateBugDialogProps {
  open: boolean;
  onClose: () => void;
}

export const CreateBugDialog = ({ open, onClose }: CreateBugDialogProps) => {
  const classes = useStyles();
  const { statuses, assignees, createBug } = useBugManagerContext();
  const { value: currentUser } = useCurrentUser();

  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);

  const [heading, setHeading] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [headingError, setHeadingError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const effectiveStatusId = statusId || sortedStatuses[0]?.id || '';

  const handleClose = useCallback(() => {
    setHeading('');
    setDescription('');
    setAssigneeId('');
    setStatusId('');
    setPriority('medium');
    setHeadingError('');
    setSubmitError('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!heading.trim()) {
      setHeadingError('Heading is required');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await createBug({
        heading: heading.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        statusId: effectiveStatusId,
        priority,
      });
      handleClose();
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Failed to create bug. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [heading, description, assigneeId, effectiveStatusId, priority, createBug, handleClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle disableTypography className={classes.dialogTitle}>
        <Typography variant="h6">Create New Bug</Typography>
        <IconButton size="small" onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box className={classes.content}>
          <TextField
            label="Heading"
            required
            fullWidth
            variant="outlined"
            value={heading}
            onChange={e => {
              setHeading(e.target.value);
              if (headingError) setHeadingError('');
            }}
            error={!!headingError}
            helperText={headingError}
            inputProps={{ maxLength: 200 }}
          />

          <TextField
            label="Description"
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          <Box className={classes.row}>
            <FormControl variant="outlined" fullWidth>
              <InputLabel>Assignee</InputLabel>
              <Select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value as string)}
                label="Assignee"
              >
                <MenuItem value="">Unassigned</MenuItem>
                {assignees.map(user => (
                  <MenuItem key={user.id} value={user.id}>
                    <UserAvatar user={user} showName />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl variant="outlined" fullWidth required>
              <InputLabel>Status</InputLabel>
              <Select
                value={effectiveStatusId}
                onChange={e => setStatusId(e.target.value as string)}
                label="Status"
              >
                {sortedStatuses.map(s => (
                  <MenuItem key={s.id} value={s.id}>
                    <Box className={classes.menuItemContent}>
                      <Box
                        component="span"
                        className={classes.colorDot}
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <FormControl variant="outlined" style={{ maxWidth: '50%' }} required>
            <InputLabel>Priority</InputLabel>
            <Select
              value={priority}
              onChange={e => setPriority(e.target.value as Priority)}
              label="Priority"
            >
              {PRIORITY_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Box className={classes.menuItemContent}>
                    <Box
                      component="span"
                      className={classes.colorDot}
                      style={{ backgroundColor: PRIORITY_COLORS[opt.value] }}
                    />
                    {opt.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {currentUser && (
            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
              <Avatar src={currentUser.picture} style={{ width: 20, height: 20 }}>
                {currentUser.displayName.slice(0, 1)}
              </Avatar>
              <Typography variant="caption" color="textSecondary">
                Reporting as {currentUser.displayName}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      {submitError && (
        <Box px={3} pb={1}>
          <Typography variant="body2" color="error">
            {submitError}
          </Typography>
        </Box>
      )}
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={submitting}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};
