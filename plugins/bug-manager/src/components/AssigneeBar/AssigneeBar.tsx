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

import { Avatar, Box, Chip, Tooltip, makeStyles } from '@material-ui/core';
import clsx from 'clsx';
import type { User } from '../../api/types';
import { useTheme } from '@material-ui/core/styles';

const VISIBLE_MAX = 7;

const useStyles = makeStyles(theme => ({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    flexWrap: 'nowrap',
    overflowX: 'auto',
    minHeight: 52,
  },
  avatar: {
    width: 32,
    height: 32,
    fontSize: 12,
    flexShrink: 0,
  },
  clearChip: {
    marginRight: theme.spacing(0.5),
  },
  overflowAvatar: {
    backgroundColor: theme.palette.grey[400],
    color: theme.palette.common.white,
    fontSize: 11,
    cursor: 'default',
  },
}));

interface AssigneeBarProps {
  assignees: User[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function AssigneeBar({
  assignees,
  selectedIds,
  onToggle,
  onClear,
}: AssigneeBarProps) {
  const theme = useTheme();
  const classes = useStyles();

  if (assignees.length === 0) return null;

  const visible = assignees.slice(0, VISIBLE_MAX);
  const overflow = assignees.length - VISIBLE_MAX;

  return (
    <Box className={classes.bar}>
      {selectedIds.length > 0 && (
        <Tooltip title="Clear filter">
          <Chip
            label="All"
            size="small"
            onDelete={onClear}
            onClick={onClear}
            className={classes.clearChip}
          />
        </Tooltip>
      )}

      {visible.map(user => {
        const isSelected = selectedIds.includes(user.id);
        return (
          <Tooltip key={user.id} title={user.displayName}>
            <Avatar
              src={user.avatarUrl}
              className={classes.avatar}
              onClick={() => onToggle(user.id)}
              style={{
                border: isSelected
                  ? `2px solid ${theme.palette.primary.main}`
                  : '2px solid transparent',
                borderRadius: '50%',
                boxSizing: 'border-box',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                boxShadow: isSelected
                  ? `0 0 0 2px ${theme.palette.primary.light}`
                  : 'none',
              }}
            >
              {user.displayName.slice(0, 2).toUpperCase()}
            </Avatar>
          </Tooltip>
        );
      })}

      {overflow > 0 && (
        <Tooltip title={`${overflow} more assignee${overflow === 1 ? '' : 's'} (not shown)`}>
          <Avatar className={clsx(classes.avatar, classes.overflowAvatar)}>
            +{overflow}
          </Avatar>
        </Tooltip>
      )}
    </Box>
  );
}
