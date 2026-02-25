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

import { useCallback, useEffect, useState } from 'react';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Switch from '@material-ui/core/Switch';
import TextField from '@material-ui/core/TextField';
import InputAdornment from '@material-ui/core/InputAdornment';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import ToggleButton from '@material-ui/lab/ToggleButton';
import ToggleButtonGroup from '@material-ui/lab/ToggleButtonGroup';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import SearchIcon from '@material-ui/icons/Search';
import SettingsIcon from '@material-ui/icons/Settings';
import ViewListIcon from '@material-ui/icons/ViewList';
import ViewModuleIcon from '@material-ui/icons/ViewModule';
import { useBugManagerContext } from '../../context/useBugManagerContext';
import { Priority } from '../../api/types';
import { CreateBugDialog } from '../CreateBugDialog/CreateBugDialog';
import { StatusManagementDialog } from '../StatusManagement/StatusManagementDialog';
import { useIsAdmin } from '../../hooks/useIsAdmin';

const useStyles = makeStyles(theme => ({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginLeft: 'auto',
  },
  select: {
    minWidth: 140,
  },
  search: {
    minWidth: 220,
  },
}));

export const Toolbar = () => {
  const classes = useStyles();
  const { activeView, setView, filters, setFilters, statuses, includeClosed, setIncludeClosed } =
    useBugManagerContext();
  const isAdmin = useIsAdmin();

  const [searchInput, setSearchInput] = useState(filters.search || '');
  const [createOpen, setCreateOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters({ ...filters, search: searchInput || undefined });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleViewChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, newView: 'list' | 'board' | null) => {
      if (newView) setView(newView);
    },
    [setView],
  );

  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<{ value: unknown }>) => {
      const value = e.target.value as string;
      setFilters({ ...filters, status: value || undefined });
    },
    [filters, setFilters],
  );

  const handlePriorityChange = useCallback(
    (e: React.ChangeEvent<{ value: unknown }>) => {
      const value = e.target.value as string;
      setFilters({
        ...filters,
        priority: (value as Priority) || undefined,
      });
    },
    [filters, setFilters],
  );

  return (
    <>
      <Box className={classes.toolbar}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          New Bug
        </Button>

        <ToggleButtonGroup
          value={activeView}
          exclusive
          onChange={handleViewChange}
          size="small"
        >
          <ToggleButton value="list">
            <ViewListIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="board">
            <ViewModuleIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title={!isAdmin ? 'Admin access required' : ''}>
          <span>
            <Button
              variant="outlined"
              startIcon={<SettingsIcon />}
              onClick={() => setStatusOpen(true)}
              disabled={!isAdmin}
            >
              Statuses
            </Button>
          </span>
        </Tooltip>

        <Box className={classes.filters}>
          <FormControl variant="outlined" size="small" className={classes.select}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status || ''}
              onChange={handleStatusChange}
              label="Status"
            >
              <MenuItem value="">All</MenuItem>
              {statuses.map(s => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl variant="outlined" size="small" className={classes.select}>
            <InputLabel>Priority</InputLabel>
            <Select
              value={filters.priority || ''}
              onChange={handlePriorityChange}
              label="Priority"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="urgent">Urgent</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="low">Low</MenuItem>
            </Select>
          </FormControl>

          <TextField
            className={classes.search}
            variant="outlined"
            size="small"
            placeholder="Search bugs..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={includeClosed}
                onChange={e => setIncludeClosed(e.target.checked)}
              />
            }
            label={
              <Typography variant="caption" color="textSecondary">
                Include closed
              </Typography>
            }
          />
        </Box>
      </Box>

      <CreateBugDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <StatusManagementDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
      />
    </>
  );
};
