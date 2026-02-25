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
import CloseIcon from '@material-ui/icons/Close';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import CheckIcon from '@material-ui/icons/Check';
import AddIcon from '@material-ui/icons/Add';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import type {
  ApiTestingConfig,
  EnvironmentOverrides,
} from '../../api/types';
import { ApiTestingClient } from '../../api/ApiTestingClient';

const useStyles = makeStyles(theme => ({
  paper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2.5, 3),
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: '1.05rem',
  },
  content: {
    padding: '0 !important',
  },
  listContainer: {
    maxHeight: 380,
    overflowY: 'auto',
  },
  envRow: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1.5, 3),
    borderBottom: `1px solid ${theme.palette.divider}`,
    gap: theme.spacing(1.5),
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  envName: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    fontWeight: 600,
    width: 120,
    flexShrink: 0,
  },
  envUrl: {
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
  },
  sourceConfig: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(100, 181, 246, 0.15)'
        : 'rgba(33, 150, 243, 0.08)',
    color: theme.palette.type === 'dark' ? '#90caf9' : '#1565c0',
  },
  sourceCustom: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(206, 147, 216, 0.15)'
        : 'rgba(156, 39, 176, 0.08)',
    color: theme.palette.type === 'dark' ? '#ce93d8' : '#7b1fa2',
  },
  sourceSaved: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255, 183, 77, 0.15)'
        : 'rgba(255, 152, 0, 0.08)',
    color: theme.palette.type === 'dark' ? '#ffb74d' : '#e65100',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  defaultStar: {
    color: theme.palette.warning.main,
    fontSize: '1.1rem',
  },
  defaultStarEmpty: {
    color: theme.palette.text.disabled,
    fontSize: '1.1rem',
  },
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

interface EnvironmentSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  config: ApiTestingConfig | null;
  overrides: EnvironmentOverrides | null;
  activeEnvironment?: string;
  client: ApiTestingClient;
  onSave: () => void;
}

export function EnvironmentSettingsPanel({
  open,
  onClose,
  config,
  overrides,
  client,
  onSave,
}: EnvironmentSettingsPanelProps) {
  const classes = useStyles();
  const [editingEnv, setEditingEnv] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const environments = config ? Object.keys(config.environments) : [];
  const defaultEnv = config?.defaultEnvironment ?? '';

  // Determine if an environment is defined only in the overrides JSON (custom)
  // vs originally from app-config.yaml
  const isCustomOnly = (envName: string): boolean => {
    if (!overrides) return false;
    const inOverrides = envName in (overrides.environments ?? {});
    // If it's in overrides but the config baseUrl matches the override baseUrl
    // exactly, it might still be from app-config. Check if removing the override
    // would leave it in config. Simpler: just track if it only exists in overrides.
    // Since config is merged, we can't perfectly tell from config alone. But we
    // can check: if overrides has it and the base config wouldn't have it.
    // For simplicity: an env that exists in overrides but has no setup steps
    // in the merged config AND wasn't in the original app-config is "custom".
    // Since we can't read the raw app-config from here, we'll mark envs that
    // exist in overrides as having been "modified".
    return inOverrides;
  };

  const getSource = (envName: string): 'config' | 'saved' | 'custom' => {
    if (!overrides) return 'config';
    const inOverrides = envName in (overrides.environments ?? {});
    if (!inOverrides) return 'config';
    // Check if this env has setup steps (only app-config envs have them)
    const envConfig = config?.environments[envName];
    if (envConfig && (envConfig as any).setup) return 'saved';
    // No setup steps and in overrides — could be custom or overridden config
    return inOverrides ? 'saved' : 'config';
  };

  const startEditing = (envName: string) => {
    const url = config?.environments[envName]?.baseUrl ?? '';
    setEditingEnv(envName);
    setEditUrl(url);
  };

  const saveEdit = async () => {
    if (!editingEnv) return;
    setSaving(true);
    try {
      const currentOverride = overrides?.environments[editingEnv];
      await client.putEnvironment(editingEnv, {
        baseUrl: editUrl,
        variables: currentOverride?.variables ?? {},
      });
      await onSave();
    } finally {
      setSaving(false);
      setEditingEnv(null);
      setEditUrl('');
    }
  };

  const cancelEdit = () => {
    setEditingEnv(null);
    setEditUrl('');
  };

  const handleDelete = async (envName: string) => {
    setSaving(true);
    try {
      await client.deleteEnvironment(envName);
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (envName: string) => {
    setSaving(true);
    try {
      await client.setDefaultEnvironment(envName);
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    const trimmedUrl = newUrl.trim();
    if (!trimmedName || !trimmedUrl) return;
    setSaving(true);
    try {
      await client.putEnvironment(trimmedName, {
        baseUrl: trimmedUrl,
        variables: {},
      });
      setNewName('');
      setNewUrl('');
      await onSave();
    } finally {
      setSaving(false);
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
        <Typography className={classes.headerTitle}>
          Environment Settings
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <DialogContent className={classes.content}>
        <Box className={classes.listContainer}>
          {environments.map(envName => {
            const envConfig = config?.environments[envName];
            const source = getSource(envName);
            const isDefault = envName === defaultEnv;
            const isEditing = editingEnv === envName;

            return (
              <Box key={envName} className={classes.envRow}>
                {/* Default star */}
                <Tooltip
                  title={isDefault ? 'Default environment' : 'Set as default'}
                >
                  <IconButton
                    size="small"
                    onClick={() => !isDefault && handleSetDefault(envName)}
                    disabled={saving || isDefault}
                    style={{ padding: 4 }}
                  >
                    {isDefault ? (
                      <StarIcon className={classes.defaultStar} />
                    ) : (
                      <StarBorderIcon className={classes.defaultStarEmpty} />
                    )}
                  </IconButton>
                </Tooltip>

                {/* Environment name */}
                <Typography className={classes.envName}>{envName}</Typography>

                {/* Base URL (view or edit) */}
                {isEditing ? (
                  <>
                    <InputBase
                      autoFocus
                      fullWidth
                      className={classes.editInput}
                      value={editUrl}
                      onChange={e => setEditUrl(e.target.value)}
                      onKeyDown={e => handleKeyDown(e, saveEdit)}
                      disabled={saving}
                    />
                    <IconButton
                      size="small"
                      onClick={saveEdit}
                      disabled={saving}
                    >
                      <CheckIcon style={{ fontSize: '0.95rem' }} />
                    </IconButton>
                    <IconButton size="small" onClick={cancelEdit}>
                      <CloseIcon style={{ fontSize: '0.95rem' }} />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Typography className={classes.envUrl}>
                      {envConfig?.baseUrl || '(no URL)'}
                    </Typography>
                    <Chip
                      label={source}
                      size="small"
                      className={`${classes.sourceChip} ${
                        source === 'config'
                          ? classes.sourceConfig
                          : source === 'saved'
                            ? classes.sourceSaved
                            : classes.sourceCustom
                      }`}
                    />
                    <Box className={classes.actions}>
                      <Tooltip title="Edit base URL">
                        <IconButton
                          size="small"
                          onClick={() => startEditing(envName)}
                          disabled={saving}
                        >
                          <EditIcon style={{ fontSize: '0.95rem' }} />
                        </IconButton>
                      </Tooltip>
                      {isCustomOnly(envName) && (
                        <Tooltip title="Remove override">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(envName)}
                            disabled={saving}
                          >
                            <DeleteIcon style={{ fontSize: '0.95rem' }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Add new environment */}
        <Box className={classes.addSection}>
          <Typography className={classes.addTitle}>
            Add new environment
          </Typography>
          <Box className={classes.formRow}>
            <Typography className={classes.formLabel}>Name</Typography>
            <InputBase
              className={classes.formInput}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => handleKeyDown(e, handleAdd)}
              placeholder="e.g. qa"
              disabled={saving}
            />
          </Box>
          <Box className={classes.formRow}>
            <Typography className={classes.formLabel}>Base URL</Typography>
            <InputBase
              className={classes.formInput}
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => handleKeyDown(e, handleAdd)}
              placeholder="e.g. https://qa-api.example.com"
              disabled={saving}
            />
          </Box>
          <Box className={classes.addActions}>
            <Button
              variant="contained"
              color="primary"
              className={classes.addButton}
              startIcon={<AddIcon />}
              onClick={handleAdd}
              disabled={!newName.trim() || !newUrl.trim() || saving}
              disableElevation
            >
              Add
            </Button>
          </Box>
        </Box>
      </DialogContent>

      {/* Footer */}
      <Box className={classes.footer}>
        <Button onClick={onClose} color="primary" className={classes.doneButton}>
          Done
        </Button>
      </Box>
    </Dialog>
  );
}
