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
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  makeStyles,
} from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    alignItems: 'center',
  },
  formControl: {
    minWidth: 150,
    marginRight: theme.spacing(0.5),
    '& .MuiOutlinedInput-root': {
      borderRadius: 8,
    },
  },
  select: {
    fontFamily:
      '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace',
    fontSize: '0.82rem',
  },
  settingsButton: {
    padding: 6,
    marginRight: theme.spacing(0.5),
  },
}));

interface EnvironmentSwitcherProps {
  environments: string[];
  activeEnvironment: string;
  onEnvironmentChange: (env: string) => void;
  onSettingsOpen?: () => void;
}

export function EnvironmentSwitcher({
  environments,
  activeEnvironment,
  onEnvironmentChange,
  onSettingsOpen,
}: EnvironmentSwitcherProps) {
  const classes = useStyles();

  if (environments.length === 0) return null;

  return (
    <div className={classes.root}>
      <FormControl
        variant="outlined"
        size="small"
        className={classes.formControl}
      >
        <InputLabel id="env-switcher-label">Environment</InputLabel>
        <Select
          labelId="env-switcher-label"
          value={activeEnvironment}
          onChange={e => onEnvironmentChange(e.target.value as string)}
          label="Environment"
          className={classes.select}
        >
          {environments.map(env => (
            <MenuItem key={env} value={env}>
              {env}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {onSettingsOpen && (
        <Tooltip title="Environment settings">
          <IconButton
            size="small"
            className={classes.settingsButton}
            onClick={onSettingsOpen}
          >
            <SettingsIcon style={{ fontSize: '1.1rem' }} />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
}
