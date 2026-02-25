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

import { useCallback, useMemo } from 'react';
import Box from '@material-ui/core/Box';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import BugReportIcon from '@material-ui/icons/BugReport';
import CloseIcon from '@material-ui/icons/Close';
import { UpdateBugRequest } from '../../api/types';
import { useBugManagerContext } from '../../context/useBugManagerContext';
import { BugContent } from './BugContent';
import { BugMetadataSidebar } from './BugMetadataSidebar';

const useStyles = makeStyles(theme => ({
  dialogTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  dialogContent: {
    padding: 0,
    minHeight: 500,
  },
  ticketNumber: {
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  leftPanel: {
    padding: theme.spacing(3),
    borderRight: `1px solid ${theme.palette.divider}`,
    overflowY: 'auto',
    maxHeight: '70vh',
  },
  rightPanel: {
    padding: theme.spacing(3),
    backgroundColor: '#FAFAFA',
    overflowY: 'auto',
    maxHeight: '70vh',
  },
}));

export const BugDetailModal = () => {
  const classes = useStyles();
  const { bugs, selectedBugId, selectBug, updateBug } =
    useBugManagerContext();

  const bug = useMemo(
    () => bugs.find(b => b.id === selectedBugId) ?? null,
    [bugs, selectedBugId],
  );

  const handleDismiss = useCallback(() => selectBug(null), [selectBug]);

  const handleUpdate = useCallback(
    (updates: UpdateBugRequest) => {
      if (selectedBugId) {
        updateBug(selectedBugId, updates);
      }
    },
    [selectedBugId, updateBug],
  );

  if (!bug) return null;

  return (
    <Dialog
      open={!!selectedBugId}
      onClose={handleDismiss}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle disableTypography className={classes.dialogTitle}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <BugReportIcon />
          <Typography
            variant="h6"
            component="span"
            className={classes.ticketNumber}
          >
            {bug.ticketNumber}
          </Typography>
        </Box>
        <IconButton onClick={handleDismiss} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent className={classes.dialogContent}>
        <Grid container spacing={0}>
          <Grid item xs={8} className={classes.leftPanel}>
            <BugContent bug={bug} onUpdate={handleUpdate} />
          </Grid>
          <Grid item xs={4} className={classes.rightPanel}>
            <BugMetadataSidebar bug={bug} onUpdate={handleUpdate} />
          </Grid>
        </Grid>
      </DialogContent>
    </Dialog>
  );
};
