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
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Typography from '@material-ui/core/Typography';
import WarningIcon from '@material-ui/icons/Warning';
import { makeStyles } from '@material-ui/core/styles';
import { Status } from '../../api/types';

const useStyles = makeStyles(theme => ({
  warning: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    color: theme.palette.warning.main,
    marginTop: theme.spacing(2),
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

interface DeleteStatusDialogProps {
  open: boolean;
  status: Status;
  bugCount: number;
  otherStatuses: Status[];
  onClose: () => void;
  onConfirm: (replacementStatusId: string) => Promise<void>;
}

export const DeleteStatusDialog = ({
  open,
  status,
  bugCount,
  otherStatuses,
  onClose,
  onConfirm,
}: DeleteStatusDialogProps) => {
  const classes = useStyles();
  const [replacementId, setReplacementId] = useState(
    otherStatuses[0]?.id || '',
  );
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!replacementId) return;
    setDeleting(true);
    try {
      await onConfirm(replacementId);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Status: &ldquo;{status.name}&rdquo;</DialogTitle>
      <DialogContent>
        {bugCount > 0 && (
          <Typography variant="body2" gutterBottom>
            {bugCount} {bugCount === 1 ? 'bug is' : 'bugs are'} currently in
            &ldquo;{status.name}&rdquo;. Reassign {bugCount === 1 ? 'it' : 'them'} to:
          </Typography>
        )}
        {bugCount === 0 && (
          <Typography variant="body2" gutterBottom>
            No bugs are currently in &ldquo;{status.name}&rdquo;. Select a
            replacement status:
          </Typography>
        )}
        <FormControl variant="outlined" fullWidth size="small">
          <InputLabel>Reassign to</InputLabel>
          <Select
            value={replacementId}
            onChange={e => setReplacementId(e.target.value as string)}
            label="Reassign to"
          >
            {otherStatuses.map(s => (
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
        <Box className={classes.warning}>
          <WarningIcon fontSize="small" />
          <Typography variant="body2">This action cannot be undone.</Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          color="secondary"
          variant="contained"
          disabled={deleting || !replacementId}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};
