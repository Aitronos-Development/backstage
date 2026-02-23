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
import { useState, useMemo, useEffect } from 'react';
import {
  makeStyles,
  TableRow,
  TableCell,
  IconButton,
  Collapse,
  Box,
  Typography,
  Chip,
  TextField,
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import StopIcon from '@material-ui/icons/Stop';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import TuneIcon from '@material-ui/icons/Tune';
import { TestResultBadge } from '../TestResultBadge/TestResultBadge';
import { EndpointHistory } from '../EndpointHistory/EndpointHistory';
import { FlowStepsPipeline } from '../FlowStepsPipeline/FlowStepsPipeline';
import type { TestCase, ExecutionResult, TestStatus } from '../../api/types';

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/** Extract all `{{var}}` names from a test case */
function extractUsedVariables(testCase: TestCase): string[] {
  const found = new Set<string>();
  function scan(value: unknown): void {
    if (typeof value === 'string') {
      VARIABLE_PATTERN.lastIndex = 0;
      let match = VARIABLE_PATTERN.exec(value);
      while (match !== null) {
        found.add(match[1]);
        match = VARIABLE_PATTERN.exec(value);
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) scan(v);
    }
  }
  scan(testCase.path);
  if (testCase.headers) scan(testCase.headers);
  if (testCase.body) scan(testCase.body);
  return Array.from(found).sort();
}

const MONO_FONT =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace';

const useStyles = makeStyles(theme => ({
  testRow: {
    transition: 'background-color 150ms',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255,255,255,0.03)'
          : 'rgba(0,0,0,0.02)',
    },
    '& > td': {
      borderBottom: `1px solid ${theme.palette.divider}`,
      padding: theme.spacing(1, 1.5),
    },
  },
  methodChip: {
    fontWeight: 700,
    fontFamily: MONO_FONT,
    fontSize: '0.72rem',
    minWidth: 64,
    height: 24,
    borderRadius: 6,
    letterSpacing: '0.02em',
  },
  get: { backgroundColor: '#61affe', color: '#fff' },
  post: { backgroundColor: '#49cc90', color: '#fff' },
  put: { backgroundColor: '#fca130', color: '#fff' },
  patch: { backgroundColor: '#50e3c2', color: '#fff' },
  delete: { backgroundColor: '#f93e3e', color: '#fff' },
  flow: { backgroundColor: '#9c27b0', color: '#fff' },
  nameCell: {
    fontWeight: 500,
    fontSize: '0.85rem',
  },
  pathCell: {
    fontFamily: MONO_FONT,
    fontSize: '0.82rem',
    color: theme.palette.text.secondary,
  },
  runButton: {
    color: theme.palette.success?.main || '#4caf50',
    transition: 'all 150ms',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(76,175,80,0.15)'
          : 'rgba(76,175,80,0.08)',
    },
  },
  stopButton: {
    color: theme.palette.error.main,
  },
  tuneButton: {
    opacity: 0.6,
    '&:hover': { opacity: 1 },
    transition: 'opacity 150ms',
  },
  detailsBox: {
    padding: theme.spacing(2),
    margin: theme.spacing(0.5, 0),
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.02)'
        : 'rgba(0,0,0,0.015)',
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
  },
  detailLabel: {
    fontWeight: 600,
    fontSize: '0.82rem',
    marginBottom: theme.spacing(0.5),
  },
  pre: {
    fontFamily: MONO_FONT,
    fontSize: '0.78rem',
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[900]
        : theme.palette.grey[100],
    color: theme.palette.text.primary,
    padding: theme.spacing(1.5),
    borderRadius: 8,
    overflow: 'auto',
    maxHeight: 300,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
    border: `1px solid ${theme.palette.divider}`,
  },
  failureItem: {
    marginBottom: theme.spacing(1.5),
  },
  runtimeSection: {
    padding: theme.spacing(1.5, 2),
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.02)'
        : 'rgba(0,0,0,0.01)',
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  runtimeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    marginBottom: theme.spacing(1),
  },
  runtimeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.75),
  },
  runtimeKey: {
    fontFamily: MONO_FONT,
    fontSize: '0.78rem',
    fontWeight: 600,
    minWidth: 130,
    color: theme.palette.text.secondary,
  },
  runtimeInput: {
    '& input': {
      fontFamily: MONO_FONT,
      fontSize: '0.78rem',
      padding: theme.spacing(0.75, 1),
    },
    '& .MuiOutlinedInput-root': {
      borderRadius: 6,
    },
  },
}));

interface TestCaseRowProps {
  testCase: TestCase;
  routeGroup: string;
  status: TestStatus;
  result?: ExecutionResult;
  error?: string;
  onExecute: () => void;
  onStop: () => void;
  runtimeOverrides?: Record<string, string>;
  onSetRuntimeOverride?: (key: string, value: string) => void;
  onRemoveRuntimeOverride?: (key: string) => void;
  mergedVariables?: Record<string, string>;
}

export function TestCaseRow({
  testCase,
  routeGroup,
  status,
  result,
  error,
  onExecute,
  onStop,
  runtimeOverrides,
  onSetRuntimeOverride,
  onRemoveRuntimeOverride,
  mergedVariables,
}: TestCaseRowProps) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(false);
  const [showVars, setShowVars] = useState(false);

  const methodClass =
    classes[testCase.method.toLowerCase() as keyof typeof classes] || '';
  const isFlow = testCase.method === 'FLOW';
  const hasFlowSteps =
    isFlow && (testCase.flow_metadata?.steps?.length ?? 0) > 0;
  const showDetails = isFlow || (status === 'fail' && (result || error));

  // Auto-expand flow tests when they start running so user sees step animation
  useEffect(() => {
    if (hasFlowSteps && status === 'running') {
      setExpanded(true);
    }
  }, [hasFlowSteps, status]);

  const usedVariables = useMemo(
    () => extractUsedVariables(testCase),
    [testCase],
  );
  const hasVariables = usedVariables.length > 0 && onSetRuntimeOverride;

  return (
    <>
      <TableRow className={classes.testRow}>
        <TableCell>
          <Chip
            size="small"
            label={testCase.method}
            className={`${classes.methodChip} ${methodClass}`}
          />
        </TableCell>
        <TableCell className={classes.nameCell}>{testCase.name}</TableCell>
        <TableCell className={classes.pathCell}>
          {isFlow
            ? testCase.flow_metadata?.file ?? testCase.path
            : testCase.path}
        </TableCell>
        <TableCell>
          <TestResultBadge
            status={status}
            responseTime={result?.responseTime}
          />
        </TableCell>
        <TableCell align="right">
          {hasVariables && (
            <IconButton
              size="small"
              className={classes.tuneButton}
              onClick={() => setShowVars(prev => !prev)}
              title="Runtime variable overrides"
            >
              <TuneIcon fontSize="small" />
            </IconButton>
          )}
          {status === 'running' ? (
            <IconButton
              size="small"
              className={classes.stopButton}
              onClick={onStop}
              title="Stop"
            >
              <StopIcon />
            </IconButton>
          ) : (
            <IconButton
              size="small"
              className={classes.runButton}
              onClick={onExecute}
              title="Run"
            >
              <PlayArrowIcon />
            </IconButton>
          )}
          {showDetails && (
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Hide details' : 'Show details'}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          )}
        </TableCell>
      </TableRow>
      {/* Runtime variable overrides */}
      {hasVariables && showVars && (
        <TableRow>
          <TableCell colSpan={5} style={{ paddingTop: 0, paddingBottom: 0 }}>
            <Box className={classes.runtimeSection}>
              <Box className={classes.runtimeHeader}>
                <TuneIcon
                  fontSize="small"
                  color="action"
                  style={{ fontSize: '0.9rem' }}
                />
                <Typography variant="caption" color="textSecondary">
                  Runtime overrides (this execution only)
                </Typography>
              </Box>
              {usedVariables.map(varName => {
                const runtimeValue = runtimeOverrides?.[varName] ?? '';
                const resolvedValue = mergedVariables?.[varName] ?? '';
                return (
                  <Box key={varName} className={classes.runtimeRow}>
                    <Typography className={classes.runtimeKey}>
                      {`{{${varName}}}`}
                    </Typography>
                    <TextField
                      size="small"
                      variant="outlined"
                      className={classes.runtimeInput}
                      placeholder={resolvedValue || 'not set'}
                      value={runtimeValue}
                      onChange={e => {
                        const val = e.target.value;
                        if (val) {
                          onSetRuntimeOverride!(varName, val);
                        } else {
                          onRemoveRuntimeOverride?.(varName);
                        }
                      }}
                      style={{ flex: 1, maxWidth: 400 }}
                    />
                    {!runtimeValue && resolvedValue && (
                      <Chip
                        label={
                          resolvedValue.length > 30
                            ? `${resolvedValue.slice(0, 30)}...`
                            : resolvedValue
                        }
                        size="small"
                        variant="outlined"
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          </TableCell>
        </TableRow>
      )}
      {showDetails && (
        <TableRow>
          <TableCell colSpan={5} style={{ paddingTop: 0, paddingBottom: 0 }}>
            <Collapse in={expanded} timeout="auto" unmountOnExit>
              <Box className={classes.detailsBox}>
                {isFlow && testCase.flow_metadata?.steps && (
                  <Box className={classes.failureItem}>
                    <Typography className={classes.detailLabel} variant="body2">
                      Flow Steps
                    </Typography>
                    <FlowStepsPipeline
                      steps={testCase.flow_metadata.steps}
                      status={status}
                      result={result}
                    />
                  </Box>
                )}
                {error && (
                  <Box className={classes.failureItem}>
                    <Typography className={classes.detailLabel} variant="body2">
                      Error
                    </Typography>
                    <pre className={classes.pre}>{error}</pre>
                  </Box>
                )}
                {result && (
                  <>
                    <Box className={classes.failureItem}>
                      <Typography
                        className={classes.detailLabel}
                        variant="body2"
                      >
                        Status Code
                      </Typography>
                      <Typography variant="body2">
                        Received: {result.statusCode}
                        {result.expectedStatusCode !== undefined &&
                          ` (expected: ${result.expectedStatusCode})`}
                      </Typography>
                    </Box>
                    {result.details.bodyContainsFailures && (
                      <Box className={classes.failureItem}>
                        <Typography
                          className={classes.detailLabel}
                          variant="body2"
                        >
                          Body Assertion Failures
                        </Typography>
                        <pre className={classes.pre}>
                          {JSON.stringify(
                            result.details.bodyContainsFailures,
                            null,
                            2,
                          )}
                        </pre>
                      </Box>
                    )}
                    {result.details.missingFields && (
                      <Box className={classes.failureItem}>
                        <Typography
                          className={classes.detailLabel}
                          variant="body2"
                        >
                          Missing Required Fields
                        </Typography>
                        <Typography variant="body2">
                          {result.details.missingFields.join(', ')}
                        </Typography>
                      </Box>
                    )}
                    {result.details.responseBody !== undefined && (
                      <Box className={classes.failureItem}>
                        <Typography
                          className={classes.detailLabel}
                          variant="body2"
                        >
                          Response Body
                        </Typography>
                        <pre className={classes.pre}>
                          {typeof result.details.responseBody === 'string'
                            ? result.details.responseBody
                            : JSON.stringify(
                                result.details.responseBody,
                                null,
                                2,
                              )}
                        </pre>
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
      {/* Per-endpoint execution history */}
      <TableRow>
        <TableCell colSpan={5} style={{ paddingTop: 0, paddingBottom: 0 }}>
          <EndpointHistory routeGroup={routeGroup} testCaseId={testCase.id} />
        </TableCell>
      </TableRow>
    </>
  );
}
