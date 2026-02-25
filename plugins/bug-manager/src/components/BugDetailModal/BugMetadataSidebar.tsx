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
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import ArchiveIcon from '@material-ui/icons/Archive';
import UnarchiveIcon from '@material-ui/icons/Unarchive';
import { Bug, Priority, UpdateBugRequest } from '../../api/types';
import { useBugManagerContext } from '../../context/useBugManagerContext';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { UserAvatar } from '../shared/UserAvatar';
import { formatDateTime } from '../../utils/dateFormatting';
import { PRIORITY_COLORS } from '../../utils/priorities';

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2.5),
    height: '100%',
  },
  sectionTitle: {
    fontWeight: 600,
    textTransform: 'uppercase',
    fontSize: '0.75rem',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
  },
  fieldLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: theme.palette.text.secondary,
  },
  select: {
    fontSize: '0.875rem',
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
  timestamp: {
    fontSize: '0.875rem',
  },
  spacer: {
    flex: 1,
  },
}));

interface BugMetadataSidebarProps {
  bug: Bug;
  onUpdate: (updates: UpdateBugRequest) => void;
}

export const BugMetadataSidebar = ({
  bug,
  onUpdate,
}: BugMetadataSidebarProps) => {
  const classes = useStyles();
  const { statuses, assignees, closeBug, reopenBug, selectBug } = useBugManagerContext();
  const isAdmin = useIsAdmin();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Box className={classes.root}>
      <Typography className={classes.sectionTitle}>Details</Typography>

      {/* Assignee */}
      <Box className={classes.field}>
        <Typography className={classes.fieldLabel}>Assignee</Typography>
        <Select
          value={bug.assignee?.id || ''}
          onChange={e => {
            const assigneeId = (e.target.value as string) || null;
            onUpdate({ assigneeId });
          }}
          displayEmpty
          className={classes.select}
          variant="outlined"
          margin="dense"
          fullWidth
        >
          <MenuItem value="">Unassigned</MenuItem>
          {assignees.map(user => (
            <MenuItem key={user.id} value={user.id}>
              <UserAvatar user={user} showName />
            </MenuItem>
          ))}
        </Select>
      </Box>

      {/* Reporter */}
      <Box className={classes.field}>
        <Typography className={classes.fieldLabel}>Reporter</Typography>
        <UserAvatar user={bug.reporter} />
      </Box>

      {/* Status */}
      <Box className={classes.field}>
        <Typography className={classes.fieldLabel}>Status</Typography>
        <Select
          value={bug.status.id}
          onChange={e => onUpdate({ statusId: e.target.value as string })}
          className={classes.select}
          variant="outlined"
          margin="dense"
          fullWidth
        >
          {statuses.map(s => (
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
      </Box>

      {/* Priority */}
      <Box className={classes.field}>
        <Typography className={classes.fieldLabel}>Priority</Typography>
        <Select
          value={bug.priority}
          onChange={e => onUpdate({ priority: e.target.value as Priority })}
          className={classes.select}
          variant="outlined"
          margin="dense"
          fullWidth
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
      </Box>

      {/* Created */}
      <Box className={classes.field}>
        <Typography className={classes.fieldLabel}>Created</Typography>
        <Typography className={classes.timestamp}>
          {formatDateTime(bug.createdAt)}
        </Typography>
      </Box>

      {/* Updated */}
      <Box className={classes.field}>
        <Typography className={classes.fieldLabel}>Updated</Typography>
        <Typography className={classes.timestamp}>
          {formatDateTime(bug.updatedAt)}
        </Typography>
      </Box>

      <Box className={classes.spacer} />

      {/* Close / Re-open */}
      {!bug.isClosed ? (
        <>
          <Button
            fullWidth
            variant="outlined"
            color="secondary"
            startIcon={<ArchiveIcon />}
            onClick={() => setConfirmOpen(true)}
          >
            Close Ticket
          </Button>

          <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs">
            <DialogTitle>Close {bug.ticketNumber}?</DialogTitle>
            <DialogContent>
              <Typography variant="body2">
                This ticket will be hidden from the active board and list. It can be
                re-opened at any time using the &quot;Include closed&quot; toggle.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button
                color="secondary"
                variant="contained"
                onClick={async () => {
                  setConfirmOpen(false);
                  await closeBug(bug.id);
                }}
              >
                Close Ticket
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : (
        isAdmin && (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<UnarchiveIcon />}
            onClick={async () => {
              await reopenBug(bug.id);
              selectBug(null);
            }}
          >
            Re-open Ticket
          </Button>
        )
      )}
    </Box>
  );
};
