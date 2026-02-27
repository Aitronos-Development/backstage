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

import React, { useRef, useState, useCallback } from 'react';
import Box from '@material-ui/core/Box';
import Divider from '@material-ui/core/Divider';
import IconButton from '@material-ui/core/IconButton';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import ToggleButton from '@material-ui/lab/ToggleButton';
import ToggleButtonGroup from '@material-ui/lab/ToggleButtonGroup';
import FormatBoldIcon from '@material-ui/icons/FormatBold';
import FormatItalicIcon from '@material-ui/icons/FormatItalic';
import FormatUnderlinedIcon from '@material-ui/icons/FormatUnderlined';
import LooksOneIcon from '@material-ui/icons/LooksOne';
import LooksTwoIcon from '@material-ui/icons/LooksTwo';
import FormatListBulletedIcon from '@material-ui/icons/FormatListBulleted';
import FormatListNumberedIcon from '@material-ui/icons/FormatListNumbered';
import CodeIcon from '@material-ui/icons/Code';
import LinkIcon from '@material-ui/icons/Link';
import EditIcon from '@material-ui/icons/Edit';
import VisibilityIcon from '@material-ui/icons/Visibility';
import { MarkdownContent } from '@backstage/core-components';
import {
  ToolbarAction,
  TOOLBAR_ACTIONS,
  TOOLBAR_GROUPS,
  applyFormatting,
} from './markdownEditorUtils';

const ICON_MAP: Record<string, React.ComponentType<{ fontSize?: 'small' | 'inherit' | 'default' | 'large' }>> = {
  FormatBold: FormatBoldIcon,
  FormatItalic: FormatItalicIcon,
  FormatUnderlined: FormatUnderlinedIcon,
  LooksOne: LooksOneIcon,
  LooksTwo: LooksTwoIcon,
  FormatListBulleted: FormatListBulletedIcon,
  FormatListNumbered: FormatListNumberedIcon,
  Code: CodeIcon,
  Link: LinkIcon,
};

const SHORTCUT_MAP: Record<string, ToolbarAction> = {};
for (const action of TOOLBAR_ACTIONS) {
  if (action.shortcutKey) {
    SHORTCUT_MAP[action.shortcutKey] = action;
  }
}

const useStyles = makeStyles(theme => ({
  root: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    '&:focus-within': {
      borderColor: theme.palette.primary.main,
    },
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0.5, 1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
    flexWrap: 'wrap',
    gap: theme.spacing(0.25),
  },
  toolbarGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.25),
  },
  toolbarButton: {
    padding: theme.spacing(0.5),
  },
  divider: {
    margin: theme.spacing(0, 0.5),
    height: 24,
  },
  textField: {
    '& .MuiOutlinedInput-notchedOutline': {
      border: 'none',
    },
    '& .MuiOutlinedInput-root': {
      borderRadius: 0,
    },
  },
  previewArea: {
    padding: theme.spacing(1.5),
    minHeight: 100,
    maxHeight: 300,
    overflowY: 'auto',
  },
  modeToggle: {
    marginLeft: 'auto',
  },
  label: {
    marginBottom: theme.spacing(0.5),
  },
}));

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  autoFocus?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export const MarkdownEditor = ({
  value,
  onChange,
  label,
  placeholder,
  minRows = 4,
  maxRows,
  autoFocus,
  onBlur,
  onKeyDown,
}: MarkdownEditorProps) => {
  const classes = useStyles();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  const handleToolbarAction = useCallback(
    (action: ToolbarAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd } = textarea;
      const result = applyFormatting(value, selectionStart, selectionEnd, action);

      onChange(result.newValue);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.newSelectionStart, result.newSelectionEnd);
      });
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (ctrlOrMeta) {
        const action = SHORTCUT_MAP[e.key];
        if (action) {
          e.preventDefault();
          handleToolbarAction(action);
          return;
        }
      }
      onKeyDown?.(e);
    },
    [handleToolbarAction, onKeyDown],
  );

  return (
    <Box>
      {label && (
        <Typography variant="body2" color="textSecondary" className={classes.label}>
          {label}
        </Typography>
      )}
      <Box className={classes.root}>
        <Box className={classes.toolbar}>
          {TOOLBAR_GROUPS.map((groupIds, groupIndex) => (
            <Box key={groupIds.join(',')} className={classes.toolbarGroup}>
              {groupIndex > 0 && (
                <Divider orientation="vertical" flexItem className={classes.divider} />
              )}
              {groupIds.map(actionId => {
                const action = TOOLBAR_ACTIONS.find(a => a.id === actionId)!;
                const Icon = ICON_MAP[action.icon];
                const shortcutHint = action.shortcutKey
                  ? ` (Ctrl+${action.shortcutKey.toUpperCase()})`
                  : '';
                return (
                  <Tooltip key={action.id} title={`${action.label}${shortcutHint}`}>
                    <IconButton
                      size="small"
                      className={classes.toolbarButton}
                      disabled={mode === 'preview'}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleToolbarAction(action)}
                    >
                      <Icon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                );
              })}
            </Box>
          ))}
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, newMode) => {
              if (newMode) setMode(newMode);
            }}
            size="small"
            className={classes.modeToggle}
          >
            <ToggleButton value="write">
              <Tooltip title="Write">
                <EditIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="preview">
              <Tooltip title="Preview">
                <VisibilityIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {mode === 'write' ? (
          <TextField
            fullWidth
            multiline
            minRows={minRows}
            maxRows={maxRows}
            variant="outlined"
            placeholder={placeholder}
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            inputRef={textareaRef}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={autoFocus}
            className={classes.textField}
          />
        ) : (
          <Box className={classes.previewArea}>
            {value ? (
              <MarkdownContent content={value} />
            ) : (
              <Typography variant="body2" color="textSecondary">
                Nothing to preview
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
