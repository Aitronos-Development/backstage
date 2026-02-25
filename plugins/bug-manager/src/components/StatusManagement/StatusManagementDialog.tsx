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
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import IconButton from '@material-ui/core/IconButton';
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import AddIcon from '@material-ui/icons/Add';
import CheckIcon from '@material-ui/icons/Check';
import ClearIcon from '@material-ui/icons/Clear';
import CloseIcon from '@material-ui/icons/Close';
import InfoIcon from '@material-ui/icons/Info';
import { makeStyles } from '@material-ui/core/styles';
import { useBugManagerContext } from '../../context/useBugManagerContext';
import { StatusRow } from './StatusRow';
import { DeleteStatusDialog } from './DeleteStatusDialog';

const STATUS_COLORS = [
  '#2196F3',
  '#FF9800',
  '#9C27B0',
  '#4CAF50',
  '#9E9E9E',
  '#F44336',
  '#00BCD4',
  '#795548',
];

const useStyles = makeStyles(theme => ({
  dialogTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  infoBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    backgroundColor: theme.palette.info.light,
    color: theme.palette.info.contrastText,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5),
    marginTop: theme.spacing(2),
  },
  addRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  colorSwatch: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    cursor: 'pointer',
    border: '2px solid transparent',
    flexShrink: 0,
    transition: 'border-color 0.1s',
  },
  colorSwatchSelected: {
    borderColor: theme.palette.text.primary,
  },
  colorPalette: {
    display: 'flex',
    gap: theme.spacing(0.5),
    flexWrap: 'wrap',
  },
}));

interface StatusManagementDialogProps {
  open: boolean;
  onClose: () => void;
}

export const StatusManagementDialog = ({
  open,
  onClose,
}: StatusManagementDialogProps) => {
  const classes = useStyles();
  const { statuses, bugs, createStatus, updateStatus, deleteStatus } =
    useBugManagerContext();

  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addName, setAddName] = useState('');
  const [addColor, setAddColor] = useState(STATUS_COLORS[0]);
  const [addSaving, setAddSaving] = useState(false);

  const bugCountByStatus = Object.fromEntries(
    statuses.map(s => [s.id, bugs.filter(b => b.status.id === s.id).length]),
  );

  const canDelete = statuses.length >= 5;
  const canAdd = statuses.length < 5;

  const handleSave = async (id: string, name: string, color: string) => {
    await updateStatus(id, { name, color });
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = sortedStatuses.findIndex(s => s.id === id);
    if (direction === 'up' && idx > 0) {
      const current = sortedStatuses[idx];
      const prev = sortedStatuses[idx - 1];
      await updateStatus(current.id, { order: prev.order });
      await updateStatus(prev.id, { order: current.order });
    } else if (direction === 'down' && idx < sortedStatuses.length - 1) {
      const current = sortedStatuses[idx];
      const next = sortedStatuses[idx + 1];
      await updateStatus(current.id, { order: next.order });
      await updateStatus(next.id, { order: current.order });
    }
  };

  const handleDeleteConfirm = async (replacementStatusId: string) => {
    if (!deleteTargetId) return;
    await deleteStatus(deleteTargetId, replacementStatusId);
    setDeleteTargetId(null);
  };

  const handleAddSave = async () => {
    if (!addName.trim()) return;
    setAddSaving(true);
    try {
      await createStatus({
        name: addName.trim(),
        color: addColor,
        order: statuses.length,
      });
      setAddName('');
      setAddColor(STATUS_COLORS[0]);
      setAddMode(false);
    } finally {
      setAddSaving(false);
    }
  };

  const deleteTarget = deleteTargetId
    ? statuses.find(s => s.id === deleteTargetId)
    : null;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle disableTypography className={classes.dialogTitle}>
          <Typography variant="h6">Manage Statuses</Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell style={{ width: 40 }}>#</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell style={{ width: 120 }}>Color</TableCell>
                  <TableCell style={{ width: 60 }}>Bugs</TableCell>
                  <TableCell style={{ width: 160 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedStatuses.map((status, idx) => (
                  <StatusRow
                    key={status.id}
                    status={status}
                    bugCount={bugCountByStatus[status.id] ?? 0}
                    onDelete={setDeleteTargetId}
                    onSave={handleSave}
                    onReorder={handleReorder}
                    canDelete={canDelete}
                    isFirst={idx === 0}
                    isLast={idx === sortedStatuses.length - 1}
                  />
                ))}
                {addMode && (
                  <TableRow>
                    <TableCell>{statuses.length}</TableCell>
                    <TableCell>
                      <TextField
                        value={addName}
                        onChange={e => setAddName(e.target.value)}
                        placeholder="New Status"
                        size="small"
                        variant="outlined"
                        style={{ minWidth: 140 }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddSave();
                          if (e.key === 'Escape') setAddMode(false);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box className={classes.colorPalette}>
                        {STATUS_COLORS.map(c => (
                          <Box
                            key={c}
                            className={`${classes.colorSwatch} ${addColor === c ? classes.colorSwatchSelected : ''}`}
                            style={{ backgroundColor: c }}
                            onClick={() => setAddColor(c)}
                          />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell />
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={handleAddSave}
                        disabled={addSaving || !addName.trim()}
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setAddMode(false);
                          setAddName('');
                          setAddColor(STATUS_COLORS[0]);
                        }}
                        disabled={addSaving}
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          {!addMode && (
            <Box mt={1}>
              <Button
                startIcon={<AddIcon />}
                onClick={() => setAddMode(true)}
                disabled={!canAdd}
                size="small"
              >
                Add Status
              </Button>
            </Box>
          )}

          <Box className={classes.infoBanner}>
            <InfoIcon fontSize="small" />
            <Typography variant="body2">
              Exactly 5 statuses are required. Deleting a status requires
              reassigning existing bugs to another status.
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <DeleteStatusDialog
          open={!!deleteTargetId}
          status={deleteTarget}
          bugCount={bugCountByStatus[deleteTarget.id] ?? 0}
          otherStatuses={statuses.filter(s => s.id !== deleteTargetId)}
          onClose={() => setDeleteTargetId(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </>
  );
};
