import { useState, useMemo } from 'react';
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
import type { TestCase, ExecutionResult, TestStatus } from '../../api/types';

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/** Extract all `{{var}}` names from a test case */
function extractUsedVariables(testCase: TestCase): string[] {
  const found = new Set<string>();
  function scan(value: unknown): void {
    if (typeof value === 'string') {
      let match;
      VARIABLE_PATTERN.lastIndex = 0;
      while ((match = VARIABLE_PATTERN.exec(value)) !== null) {
        found.add(match[1]);
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

const useStyles = makeStyles(theme => ({
  testRow: {
    '&:nth-of-type(odd)': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255,255,255,0.02)'
          : 'rgba(0,0,0,0.02)',
    },
    '& > td': {
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
  },
  methodChip: {
    fontWeight: 700,
    fontFamily: 'monospace',
    minWidth: 60,
  },
  get: { backgroundColor: '#61affe', color: '#fff' },
  post: { backgroundColor: '#49cc90', color: '#fff' },
  put: { backgroundColor: '#fca130', color: '#fff' },
  patch: { backgroundColor: '#50e3c2', color: '#fff' },
  delete: { backgroundColor: '#f93e3e', color: '#fff' },
  nameCell: {
    fontWeight: 500,
  },
  pathCell: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  },
  runButton: {
    color: theme.palette.success?.main || '#4caf50',
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
  detailsBox: {
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
  },
  detailLabel: {
    fontWeight: 600,
    marginBottom: theme.spacing(0.5),
  },
  pre: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[900]
        : theme.palette.grey[100],
    color: theme.palette.text.primary,
    padding: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    overflow: 'auto',
    maxHeight: 300,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  failureItem: {
    marginBottom: theme.spacing(1),
  },
  runtimeSection: {
    padding: theme.spacing(1, 2),
    backgroundColor: theme.palette.background.default,
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  runtimeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
  runtimeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  },
  runtimeKey: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    fontWeight: 600,
    minWidth: 120,
  },
  runtimeInput: {
    '& input': {
      fontFamily: 'monospace',
      fontSize: '0.8rem',
      padding: theme.spacing(0.5, 1),
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

  const methodClass = classes[testCase.method.toLowerCase() as keyof typeof classes] || '';
  const showDetails = status === 'fail' && (result || error);

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
        <TableCell className={classes.pathCell}>{testCase.path}</TableCell>
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
              onClick={() => setShowVars(prev => !prev)}
              title="Runtime variable overrides"
            >
              <TuneIcon fontSize="small" />
            </IconButton>
          )}
          {status === 'running' ? (
            <IconButton size="small" className={classes.stopButton} onClick={onStop} title="Stop">
              <StopIcon />
            </IconButton>
          ) : (
            <IconButton size="small" className={classes.runButton} onClick={onExecute} title="Run">
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
                      <Typography className={classes.detailLabel} variant="body2">
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
                        <Typography className={classes.detailLabel} variant="body2">
                          Body Assertion Failures
                        </Typography>
                        <pre className={classes.pre}>
                          {JSON.stringify(result.details.bodyContainsFailures, null, 2)}
                        </pre>
                      </Box>
                    )}
                    {result.details.missingFields && (
                      <Box className={classes.failureItem}>
                        <Typography className={classes.detailLabel} variant="body2">
                          Missing Required Fields
                        </Typography>
                        <Typography variant="body2">
                          {result.details.missingFields.join(', ')}
                        </Typography>
                      </Box>
                    )}
                    {result.details.responseBody !== undefined && (
                      <Box className={classes.failureItem}>
                        <Typography className={classes.detailLabel} variant="body2">
                          Response Body
                        </Typography>
                        <pre className={classes.pre}>
                          {typeof result.details.responseBody === 'string'
                            ? result.details.responseBody
                            : JSON.stringify(result.details.responseBody, null, 2)}
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
          <EndpointHistory
            routeGroup={routeGroup}
            testCaseId={testCase.id}
          />
        </TableCell>
      </TableRow>
    </>
  );
}
