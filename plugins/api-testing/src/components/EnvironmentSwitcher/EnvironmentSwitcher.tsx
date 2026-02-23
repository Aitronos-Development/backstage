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
  makeStyles,
} from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  formControl: {
    minWidth: 160,
    marginRight: theme.spacing(2),
  },
  select: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  },
}));

interface EnvironmentSwitcherProps {
  environments: string[];
  activeEnvironment: string;
  onEnvironmentChange: (env: string) => void;
}

export function EnvironmentSwitcher({
  environments,
  activeEnvironment,
  onEnvironmentChange,
}: EnvironmentSwitcherProps) {
  const classes = useStyles();

  if (environments.length === 0) return null;

  return (
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
  );
}
