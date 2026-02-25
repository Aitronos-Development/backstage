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
import IconButton from '@material-ui/core/IconButton';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import CheckIcon from '@material-ui/icons/Check';
import ClearIcon from '@material-ui/icons/Clear';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import { makeStyles } from '@material-ui/core/styles';
import { Status } from '../../api/types';

const STATUS_COLORS = [
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#9C27B0', // Purple
  '#4CAF50', // Green
  '#9E9E9E', // Gray
  '#F44336', // Red
  '#00BCD4', // Cyan
  '#795548', // Brown
];

const useStyles = makeStyles(theme => ({
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
    maxWidth: 180,
  },
  displaySwatch: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
}));

interface StatusRowProps {
  status: Status;
  bugCount: number;
  onDelete: (id: string) => void;
  onSave: (id: string, name: string, color: string) => Promise<void>;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  canDelete: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export const StatusRow = ({
  status,
  bugCount,
  onDelete,
  onSave,
  onReorder,
  canDelete,
  isFirst,
  isLast,
}: StatusRowProps) => {
  const classes = useStyles();
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(status.name);
  const [editColor, setEditColor] = useState(status.color || STATUS_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleEditStart = () => {
    setEditName(status.name);
    setEditColor(status.color || STATUS_COLORS[0]);
    setEditMode(true);
  };

  const handleCancel = () => {
    setEditMode(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await onSave(status.id, editName.trim(), editColor);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  if (editMode) {
    return (
      <TableRow>
        <TableCell>{status.order}</TableCell>
        <TableCell>
          <TextField
            value={editName}
            onChange={e => setEditName(e.target.value)}
            size="small"
            variant="outlined"
            style={{ minWidth: 140 }}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
          />
        </TableCell>
        <TableCell>
          <Box className={classes.colorPalette}>
            {STATUS_COLORS.map(c => (
              <Box
                key={c}
                className={`${classes.colorSwatch} ${editColor === c ? classes.colorSwatchSelected : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setEditColor(c)}
              />
            ))}
          </Box>
        </TableCell>
        <TableCell>{bugCount}</TableCell>
        <TableCell>
          <IconButton size="small" onClick={handleSave} disabled={saving || !editName.trim()}>
            <CheckIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={handleCancel} disabled={saving}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <Typography variant="body2" color="textSecondary">
          {status.order}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">{status.name}</Typography>
      </TableCell>
      <TableCell>
        <Box
          className={classes.displaySwatch}
          style={{ backgroundColor: status.color }}
        />
      </TableCell>
      <TableCell>{bugCount}</TableCell>
      <TableCell>
        <Tooltip title="Move up">
          <Box component="span">
            <IconButton
              size="small"
              disabled={isFirst}
              onClick={() => onReorder(status.id, 'up')}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </Box>
        </Tooltip>
        <Tooltip title="Move down">
          <Box component="span">
            <IconButton
              size="small"
              disabled={isLast}
              onClick={() => onReorder(status.id, 'down')}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
          </Box>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton size="small" onClick={handleEditStart}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={canDelete ? 'Delete' : 'Cannot delete: must have exactly 5 statuses'}>
          <Box component="span">
            <IconButton
              size="small"
              disabled={!canDelete}
              onClick={() => onDelete(status.id)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
};
