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
import { makeStyles, Chip, CircularProgress } from '@material-ui/core';
import type { TestStatus } from '../../api/types';

const useStyles = makeStyles(theme => ({
  pass: {
    backgroundColor: theme.palette.success?.main || '#4caf50',
    color: '#fff',
  },
  fail: {
    backgroundColor: theme.palette.error.main,
    color: '#fff',
  },
  running: {
    backgroundColor: theme.palette.info.main,
    color: '#fff',
  },
  idle: {
    backgroundColor: theme.palette.grey[300],
    color: theme.palette.text.secondary,
  },
  spinner: {
    marginRight: theme.spacing(0.5),
  },
}));

interface TestResultBadgeProps {
  status: TestStatus;
  responseTime?: number;
}

export function TestResultBadge({
  status,
  responseTime,
}: TestResultBadgeProps) {
  const classes = useStyles();

  switch (status) {
    case 'pass':
      return (
        <Chip
          size="small"
          className={classes.pass}
          label={responseTime ? `Pass ${responseTime}ms` : 'Pass'}
        />
      );
    case 'fail':
      return (
        <Chip
          size="small"
          className={classes.fail}
          label={responseTime ? `Fail ${responseTime}ms` : 'Fail'}
        />
      );
    case 'running':
      return (
        <Chip
          size="small"
          className={classes.running}
          icon={
            <CircularProgress
              size={14}
              color="inherit"
              className={classes.spinner}
            />
          }
          label="Running"
        />
      );
    default:
      return <Chip size="small" className={classes.idle} label="—" />;
  }
}
