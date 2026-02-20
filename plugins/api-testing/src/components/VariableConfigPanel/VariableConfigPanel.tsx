import { useState } from 'react';
import {
  makeStyles,
  Box,
  Typography,
  IconButton,
  Chip,
  Button,
  Dialog,
  DialogContent,
  Tooltip,
  InputBase,
} from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import type { ResolvedVariable } from '../../api/types';

const useStyles = makeStyles(theme => ({
  paper: {
    borderRadius: 12,
    overflow: 'hidden',
  },

  /* ---- Header ---- */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2.5, 3),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: '1.05rem',
  },
  envChip: {
    fontFamily: 'monospace',
    fontSize: '0.72rem',
    height: 22,
    borderColor: theme.palette.primary.main,
    color: theme.palette.primary.main,
  },

  /* ---- Content ---- */
  content: {
    padding: '0 !important',
  },

  /* ---- Variable list ---- */
  listContainer: {
    maxHeight: 340,
    overflowY: 'auto',
  },
  variableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0, 3),
    minHeight: 48,
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  variableKey: {
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
    width: 140,
    flexShrink: 0,
  },
  variableValueWrap: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
  },
  variableValue: {
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    color: theme.palette.text.secondary,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.06)'
        : theme.palette.grey[100],
    borderRadius: 6,
    padding: theme.spacing(0.75, 1.25),
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'background-color 120ms',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255,255,255,0.1)'
          : theme.palette.grey[200],
    },
  },
  emptyValue: {
    fontStyle: 'italic',
    opacity: 0.4,
  },
  editInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.06)'
        : theme.palette.grey[100],
    borderRadius: 6,
    padding: theme.spacing(0.75, 1.25),
  },
  sourceChip: {
    fontSize: '0.6rem',
    height: 18,
    fontWeight: 500,
    letterSpacing: '0.02em',
    flexShrink: 0,
    marginLeft: theme.spacing(1),
  },
  sourceConfig: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(100, 181, 246, 0.15)'
        : 'rgba(33, 150, 243, 0.08)',
    color: theme.palette.type === 'dark' ? '#90caf9' : '#1565c0',
  },
  sourceLocal: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255, 183, 77, 0.15)'
        : 'rgba(255, 152, 0, 0.08)',
    color: theme.palette.type === 'dark' ? '#ffb74d' : '#e65100',
  },
  sourceRuntime: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(129, 199, 132, 0.15)'
        : 'rgba(76, 175, 80, 0.08)',
    color: theme.palette.type === 'dark' ? '#81c784' : '#2e7d32',
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    marginLeft: theme.spacing(0.5),
    flexShrink: 0,
  },

  /* ---- Add form ---- */
  addSection: {
    padding: theme.spacing(2.5, 3),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  addTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
    marginBottom: theme.spacing(2),
  },
  formRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(1.5),
    '&:last-child': {
      marginBottom: 0,
    },
  },
  formLabel: {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
    width: 80,
    flexShrink: 0,
  },
  formInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.06)'
        : theme.palette.grey[100],
    borderRadius: 6,
    padding: theme.spacing(1, 1.5),
  },
  addActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: theme.spacing(2),
  },
  addButton: {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.82rem',
    borderRadius: 6,
    padding: theme.spacing(0.75, 2.5),
  },

  /* ---- Empty state ---- */
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(5, 3),
  },
  emptyText: {
    color: theme.palette.text.secondary,
    fontSize: '0.85rem',
    textAlign: 'center',
    lineHeight: 1.6,
  },

  /* ---- Footer ---- */
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: theme.spacing(1.5, 3),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  doneButton: {
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: 6,
  },
}));

interface VariableConfigPanelProps {
  open: boolean;
  onClose: () => void;
  resolvedVariables: ResolvedVariable[];
  activeEnvironment: string;
  onSetLocalOverride: (key: string, value: string) => void;
  onRemoveLocalOverride: (key: string) => void;
}

export function VariableConfigPanel({
  open,
  onClose,
  resolvedVariables,
  activeEnvironment,
  onSetLocalOverride,
  onRemoveLocalOverride,
}: VariableConfigPanelProps) {
  const classes = useStyles();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const sourceChipClass = (source: string) => {
    if (source === 'app-config') return classes.sourceConfig;
    if (source === 'localStorage') return classes.sourceLocal;
    return classes.sourceRuntime;
  };

  const sourceLabel = (source: string) => {
    if (source === 'app-config') return 'config';
    if (source === 'localStorage') return 'local';
    return 'runtime';
  };

  const startEditing = (key: string, currentValue: string) => {
    setEditingKey(key);
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (editingKey) {
      onSetLocalOverride(editingKey, editValue);
      setEditingKey(null);
      setEditValue('');
    }
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const handleAdd = () => {
    const trimmed = newKey.trim();
    if (trimmed) {
      onSetLocalOverride(trimmed, newValue);
      setNewKey('');
      setNewValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') action();
    if (e.key === 'Escape') cancelEdit();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ className: classes.paper }}
    >
      {/* Header */}
      <Box className={classes.header}>
        <Box className={classes.headerLeft}>
          <Typography className={classes.headerTitle}>Variables</Typography>
          {activeEnvironment && (
            <Chip
              label={activeEnvironment}
              size="small"
              variant="outlined"
              className={classes.envChip}
            />
          )}
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <DialogContent className={classes.content}>
        {/* Variable list */}
        {resolvedVariables.length === 0 ? (
          <Box className={classes.emptyState}>
            <Typography className={classes.emptyText}>
              No variables configured yet.
              <br />
              Add one below or define them in <code>app-config.yaml</code>.
            </Typography>
          </Box>
        ) : (
          <Box className={classes.listContainer}>
            {resolvedVariables.map(v => (
              <Box key={v.key} className={classes.variableRow}>
                <Typography className={classes.variableKey}>
                  {v.key}
                </Typography>

                <Box className={classes.variableValueWrap}>
                  {editingKey === v.key ? (
                    <>
                      <InputBase
                        autoFocus
                        fullWidth
                        className={classes.editInput}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => handleKeyDown(e, saveEdit)}
                      />
                      <IconButton size="small" onClick={saveEdit}>
                        <CheckIcon style={{ fontSize: '0.95rem' }} />
                      </IconButton>
                      <IconButton size="small" onClick={cancelEdit}>
                        <CloseIcon style={{ fontSize: '0.95rem' }} />
                      </IconButton>
                    </>
                  ) : (
                    <Tooltip
                      title={v.value || '(empty)'}
                      placement="top"
                      arrow
                    >
                      <Typography
                        component="div"
                        className={`${classes.variableValue} ${!v.value ? classes.emptyValue : ''}`}
                        onClick={() => startEditing(v.key, v.value)}
                      >
                        {v.value || '(empty)'}
                      </Typography>
                    </Tooltip>
                  )}
                </Box>

                <Chip
                  label={sourceLabel(v.source)}
                  size="small"
                  className={`${classes.sourceChip} ${sourceChipClass(v.source)}`}
                />

                <Box className={classes.rowActions}>
                  {editingKey !== v.key && (
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => startEditing(v.key, v.value)}
                      >
                        <EditIcon style={{ fontSize: '0.95rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {v.source === 'localStorage' && (
                    <Tooltip title="Remove">
                      <IconButton
                        size="small"
                        onClick={() => onRemoveLocalOverride(v.key)}
                      >
                        <DeleteIcon style={{ fontSize: '0.95rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Add new variable - form style */}
        <Box className={classes.addSection}>
          <Typography className={classes.addTitle}>
            Add new variable
          </Typography>

          <Box className={classes.formRow}>
            <Typography className={classes.formLabel}>Name</Typography>
            <InputBase
              className={classes.formInput}
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => handleKeyDown(e, handleAdd)}
              placeholder="e.g. auth_token"
            />
          </Box>

          <Box className={classes.formRow}>
            <Typography className={classes.formLabel}>Value</Typography>
            <InputBase
              className={classes.formInput}
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => handleKeyDown(e, handleAdd)}
              placeholder="e.g. Bearer abc123"
            />
          </Box>

          <Box className={classes.addActions}>
            <Button
              variant="contained"
              color="primary"
              className={classes.addButton}
              startIcon={<AddIcon />}
              onClick={handleAdd}
              disabled={!newKey.trim()}
              disableElevation
            >
              Add
            </Button>
          </Box>
        </Box>
      </DialogContent>

      {/* Footer */}
      <Box className={classes.footer}>
        <Button
          onClick={onClose}
          color="primary"
          className={classes.doneButton}
        >
          Done
        </Button>
      </Box>
    </Dialog>
  );
}
