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
  base: {
    fontWeight: 600,
    fontSize: '0.72rem',
    height: 24,
    borderRadius: 6,
    letterSpacing: '0.02em',
  },
  pass: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(76,175,80,0.2)'
        : 'rgba(76,175,80,0.12)',
    color: theme.palette.type === 'dark' ? '#81c784' : '#2e7d32',
    border: `1px solid ${
      theme.palette.type === 'dark'
        ? 'rgba(76,175,80,0.3)'
        : 'rgba(76,175,80,0.25)'
    }`,
  },
  fail: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(244,67,54,0.2)'
        : 'rgba(244,67,54,0.12)',
    color: theme.palette.type === 'dark' ? '#ef9a9a' : '#c62828',
    border: `1px solid ${
      theme.palette.type === 'dark'
        ? 'rgba(244,67,54,0.3)'
        : 'rgba(244,67,54,0.25)'
    }`,
  },
  running: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(33,150,243,0.2)'
        : 'rgba(33,150,243,0.12)',
    color: theme.palette.type === 'dark' ? '#90caf9' : '#1565c0',
    border: `1px solid ${
      theme.palette.type === 'dark'
        ? 'rgba(33,150,243,0.3)'
        : 'rgba(33,150,243,0.25)'
    }`,
  },
  idle: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.06)'
        : theme.palette.grey[100],
    color: theme.palette.text.disabled,
    border: `1px solid ${theme.palette.divider}`,
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
          className={`${classes.base} ${classes.pass}`}
          label={responseTime ? `Pass ${responseTime}ms` : 'Pass'}
        />
      );
    case 'fail':
      return (
        <Chip
          size="small"
          className={`${classes.base} ${classes.fail}`}
          label={responseTime ? `Fail ${responseTime}ms` : 'Fail'}
        />
      );
    case 'running':
      return (
        <Chip
          size="small"
          className={`${classes.base} ${classes.running}`}
          icon={
            <CircularProgress
              size={12}
              color="inherit"
              className={classes.spinner}
            />
          }
          label="Running"
        />
      );
    default:
      return (
        <Chip
          size="small"
          className={`${classes.base} ${classes.idle}`}
          label="—"
        />
      );
  }
}
