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
import { useState, useEffect } from 'react';
import {
  makeStyles,
  Box,
  Typography,
  Chip,
  Button,
  IconButton,
  Collapse,
  Table,
  TableBody,
  TableRow,
  TableCell,
  ButtonGroup,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import HistoryIcon from '@material-ui/icons/History';
import PersonIcon from '@material-ui/icons/Person';
import AndroidIcon from '@material-ui/icons/Android';
import type { ExecutionRecord } from '../../api/types';
import { useExecutionHistory } from '../../hooks/useExecutionHistory';
import { useExecutionHistoryContext } from './ExecutionHistoryContext';

const MONO_FONT =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace';

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(0.5, 2),
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    cursor: 'pointer',
    padding: theme.spacing(0.5, 0.75),
    borderRadius: 6,
    transition: 'background-color 150ms, opacity 150ms',
    opacity: 0.8,
    '&:hover': {
      opacity: 1,
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(0,0,0,0.03)',
    },
  },
  headerIcon: {
    fontSize: '0.95rem',
    color: theme.palette.text.secondary,
  },
  headerText: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: theme.palette.text.secondary,
  },
  filterBar: {
    display: 'flex',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  filterButton: {
    fontSize: '0.7rem',
    padding: theme.spacing(0.25, 1),
    textTransform: 'none',
  },
  activeFilter: {
    backgroundColor: theme.palette.primary.main,
    color: '#fff',
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
    },
  },
  historyRow: {
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(0,0,0,0.025)',
    },
  },
  timestamp: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
  },
  initiatorChip: {
    fontSize: '0.7rem',
    height: 20,
  },
  userChip: {
    backgroundColor: theme.palette.info.main,
    color: '#fff',
  },
  agentChip: {
    backgroundColor: theme.palette.warning.main,
    color: '#fff',
  },
  passChip: {
    backgroundColor: theme.palette.success?.main || '#4caf50',
    color: '#fff',
    fontSize: '0.7rem',
    height: 20,
  },
  failChip: {
    backgroundColor: theme.palette.error.main,
    color: '#fff',
    fontSize: '0.7rem',
    height: 20,
  },
  duration: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    fontFamily: MONO_FONT,
  },
  detailBox: {
    padding: theme.spacing(2),
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.02)'
        : 'rgba(0,0,0,0.015)',
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
    margin: theme.spacing(0.5, 0),
  },
  detailLabel: {
    fontWeight: 600,
    fontSize: '0.8rem',
    marginBottom: theme.spacing(0.5),
  },
  detailSection: {
    marginBottom: theme.spacing(1),
  },
  pre: {
    fontFamily: MONO_FONT,
    fontSize: '0.75rem',
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[900]
        : theme.palette.grey[100],
    color: theme.palette.text.primary,
    padding: theme.spacing(1.5),
    borderRadius: 8,
    overflow: 'auto',
    maxHeight: 200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
    border: `1px solid ${theme.palette.divider}`,
  },
  showMore: {
    textAlign: 'center',
    padding: theme.spacing(1),
  },
  emptyState: {
    textAlign: 'center',
    padding: theme.spacing(2),
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
  },
}));

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ExecutionDetailRow({ record }: { record: ExecutionRecord }) {
  const classes = useStyles();

  return (
    <TableRow>
      <TableCell colSpan={5} style={{ paddingTop: 0, paddingBottom: 0 }}>
        <Box className={classes.detailBox}>
          {/* Request */}
          <Box className={classes.detailSection}>
            <Typography className={classes.detailLabel} variant="body2">
              Request
            </Typography>
            <pre className={classes.pre}>
              {`${record.request.method} ${record.request.url}\n`}
              {Object.entries(record.request.headers).map(
                ([k, v]) => `${k}: ${v}\n`,
              )}
              {record.request.body !== undefined &&
                `\n${JSON.stringify(record.request.body, null, 2)}`}
            </pre>
          </Box>

          {/* Response */}
          <Box className={classes.detailSection}>
            <Typography className={classes.detailLabel} variant="body2">
              Response ({record.response.status_code})
            </Typography>
            <pre className={classes.pre}>
              {Object.entries(record.response.headers).map(
                ([k, v]) => `${k}: ${v}\n`,
              )}
              {record.response.body !== undefined
                ? `\n${JSON.stringify(record.response.body, null, 2)}`
                : '\n(empty body)'}
            </pre>
          </Box>

          {/* Failure reason */}
          {record.failure_reason && (
            <Box className={classes.detailSection}>
              <Typography
                className={classes.detailLabel}
                variant="body2"
                color="error"
              >
                Failure Reason
              </Typography>
              <Typography variant="body2" color="error">
                {record.failure_reason}
              </Typography>
            </Box>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
}

function HistoryRow({ record }: { record: ExecutionRecord }) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className={classes.historyRow}
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell padding="none" style={{ width: 80 }}>
          <Typography className={classes.timestamp}>
            {relativeTime(record.timestamp)}
          </Typography>
        </TableCell>
        <TableCell padding="none" style={{ width: 60 }}>
          <Chip
            size="small"
            className={`${classes.initiatorChip} ${
              record.initiator === 'user' ? classes.userChip : classes.agentChip
            }`}
            icon={
              record.initiator === 'user' ? (
                <PersonIcon style={{ fontSize: 14, color: 'inherit' }} />
              ) : (
                <AndroidIcon style={{ fontSize: 14, color: 'inherit' }} />
              )
            }
            label={record.initiator === 'user' ? 'User' : 'Agent'}
          />
        </TableCell>
        <TableCell padding="none" style={{ width: 50 }}>
          <Chip
            size="small"
            className={
              record.result === 'pass' ? classes.passChip : classes.failChip
            }
            label={record.result === 'pass' ? 'Pass' : 'Fail'}
          />
        </TableCell>
        <TableCell padding="none" style={{ width: 60 }}>
          <Typography className={classes.duration}>
            {record.duration_ms}ms
          </Typography>
        </TableCell>
        <TableCell padding="none" style={{ width: 30 }} align="right">
          <IconButton size="small">
            {expanded ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            )}
          </IconButton>
        </TableCell>
      </TableRow>
      {expanded && <ExecutionDetailRow record={record} />}
    </>
  );
}

interface EndpointHistoryProps {
  routeGroup: string;
  testCaseId: string;
}

export function EndpointHistory({
  routeGroup,
  testCaseId,
}: EndpointHistoryProps) {
  const classes = useStyles();
  const [open, setOpen] = useState(false);
  const {
    records,
    loading,
    hasMore,
    filters,
    setFilters,
    loadMore,
    prependRecord,
  } = useExecutionHistory(routeGroup, testCaseId);

  // Register with parent context for real-time WebSocket updates
  const historyCtx = useExecutionHistoryContext();
  useEffect(() => {
    if (!historyCtx) return undefined;
    historyCtx.registerListener(testCaseId, prependRecord);
    return () => historyCtx.unregisterListener(testCaseId);
  }, [historyCtx, testCaseId, prependRecord]);

  return (
    <Box className={classes.root}>
      <Box className={classes.header} onClick={() => setOpen(!open)}>
        <HistoryIcon className={classes.headerIcon} />
        <Typography className={classes.headerText}>
          History{records.length > 0 ? ` (${records.length})` : ''}
        </Typography>
        {open ? (
          <ExpandLessIcon className={classes.headerIcon} />
        ) : (
          <ExpandMoreIcon className={classes.headerIcon} />
        )}
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        {/* Filter bar */}
        <Box className={classes.filterBar}>
          <Typography className={classes.filterLabel}>Initiator:</Typography>
          <ButtonGroup size="small" variant="outlined">
            <Button
              className={`${classes.filterButton} ${
                !filters.initiator ? classes.activeFilter : ''
              }`}
              onClick={() => setFilters(f => ({ ...f, initiator: undefined }))}
            >
              All
            </Button>
            <Button
              className={`${classes.filterButton} ${
                filters.initiator === 'user' ? classes.activeFilter : ''
              }`}
              onClick={() => setFilters(f => ({ ...f, initiator: 'user' }))}
            >
              User
            </Button>
            <Button
              className={`${classes.filterButton} ${
                filters.initiator === 'agent' ? classes.activeFilter : ''
              }`}
              onClick={() => setFilters(f => ({ ...f, initiator: 'agent' }))}
            >
              Agent
            </Button>
          </ButtonGroup>

          <Typography className={classes.filterLabel}>Result:</Typography>
          <ButtonGroup size="small" variant="outlined">
            <Button
              className={`${classes.filterButton} ${
                !filters.result ? classes.activeFilter : ''
              }`}
              onClick={() => setFilters(f => ({ ...f, result: undefined }))}
            >
              All
            </Button>
            <Button
              className={`${classes.filterButton} ${
                filters.result === 'pass' ? classes.activeFilter : ''
              }`}
              onClick={() => setFilters(f => ({ ...f, result: 'pass' }))}
            >
              Pass
            </Button>
            <Button
              className={`${classes.filterButton} ${
                filters.result === 'fail' ? classes.activeFilter : ''
              }`}
              onClick={() => setFilters(f => ({ ...f, result: 'fail' }))}
            >
              Fail
            </Button>
          </ButtonGroup>
        </Box>

        {loading && records.length === 0 && (
          <Typography className={classes.emptyState}>Loading...</Typography>
        )}
        {!loading && records.length === 0 && (
          <Typography className={classes.emptyState}>
            No execution history yet
          </Typography>
        )}
        {records.length > 0 && (
          <>
            <Table size="small">
              <TableBody>
                {records.map(record => (
                  <HistoryRow key={record.id} record={record} />
                ))}
              </TableBody>
            </Table>
            {hasMore && (
              <Box className={classes.showMore}>
                <Button size="small" variant="text" onClick={loadMore}>
                  Show more
                </Button>
              </Box>
            )}
          </>
        )}
      </Collapse>
    </Box>
  );
}
