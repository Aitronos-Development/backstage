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

import { useState, useMemo, useCallback, useRef } from 'react';
import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import Chip from '@material-ui/core/Chip';
import Box from '@material-ui/core/Box';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableHead from '@material-ui/core/TableHead';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import LinearProgress from '@material-ui/core/LinearProgress';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import { makeStyles } from '@material-ui/core/styles';
import {
  useRouteGroups,
  useTestCases,
  useTestExecution,
  useWebSocket,
  useVariables,
  TestCaseRow,
  EnvironmentSwitcher,
  VariableConfigPanel,
  ExecutionHistoryContext,
} from '@internal/plugin-api-testing';
import type { ExecutionRecord } from '@internal/plugin-api-testing';

const MONO_FONT =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace';

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(3),
  },
  headerCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    padding: theme.spacing(2, 2.5),
    borderRadius: 12,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.03)'
        : 'rgba(0,0,0,0.015)',
    border: `1px solid ${theme.palette.divider}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  title: {
    fontWeight: 700,
    fontSize: '1.15rem',
    letterSpacing: '-0.01em',
  },
  headerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  variablesButton: {
    textTransform: 'none',
    fontWeight: 500,
    borderRadius: 8,
    fontSize: '0.82rem',
  },
  countChip: {
    fontWeight: 500,
    fontSize: '0.7rem',
    height: 22,
    borderRadius: 6,
  },
  flowChip: {
    backgroundColor: '#9c27b0',
    color: '#fff',
  },
  routeAccordion: {
    '&:before': { display: 'none' },
    boxShadow: 'none',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '10px !important',
    marginBottom: theme.spacing(1.5),
    overflow: 'hidden',
    transition: 'border-color 200ms',
    '&.Mui-expanded': {
      borderColor: '#9c27b0',
    },
  },
  routeSummary: {
    '& .MuiAccordionSummary-content': {
      alignItems: 'center',
      gap: theme.spacing(1.5),
      margin: `${theme.spacing(1)}px 0`,
    },
  },
  routePrefix: {
    fontWeight: 600,
    fontFamily: MONO_FONT,
    fontSize: '0.9rem',
    letterSpacing: '-0.01em',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
    transition: 'background-color 300ms',
  },
  statusPass: {
    backgroundColor: theme.palette.type === 'dark' ? '#66bb6a' : '#4caf50',
    boxShadow: `0 0 6px ${
      theme.palette.type === 'dark'
        ? 'rgba(102,187,106,0.4)'
        : 'rgba(76,175,80,0.3)'
    }`,
  },
  statusFail: {
    backgroundColor: theme.palette.error.main,
    boxShadow: `0 0 6px ${
      theme.palette.type === 'dark'
        ? 'rgba(244,67,54,0.4)'
        : 'rgba(244,67,54,0.3)'
    }`,
  },
  statusRunning: {
    backgroundColor: theme.palette.info.main,
    animation: '$pulse 1.5s ease-in-out infinite',
  },
  statusNeutral: {
    backgroundColor: theme.palette.grey[400],
  },
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.4 },
  },
  accordionDetails: {
    display: 'block',
    padding: theme.spacing(0, 2, 2, 2),
  },
  runAllButton: {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.78rem',
    borderRadius: 8,
    color: '#9c27b0',
    borderColor: '#9c27b0',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(156,39,176,0.12)'
          : 'rgba(156,39,176,0.06)',
      borderColor: '#9c27b0',
    },
  },
  routeGroupFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1.5),
    paddingTop: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(8, 3),
    textAlign: 'center',
  },
  emptyTitle: {
    fontWeight: 600,
    fontSize: '1rem',
    marginBottom: theme.spacing(1),
  },
  emptySubtitle: {
    color: theme.palette.text.secondary,
    fontSize: '0.85rem',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: theme.spacing(4),
  },
}));

type OverallStatus = 'neutral' | 'pass' | 'fail' | 'running';

interface VariablesContext {
  mergedVariables: Record<string, string>;
  activeEnvironment: string;
  runtimeOverrides: Record<string, Record<string, string>>;
  setRuntimeOverride: (testCaseId: string, key: string, value: string) => void;
  removeRuntimeOverride: (testCaseId: string, key: string) => void;
}

/* ── Flow Route Group Accordion ── */

interface FlowRouteGroupAccordionProps {
  routeGroup: string;
  refreshKey: number;
  variablesCtx: VariablesContext;
}

function FlowRouteGroupAccordion({
  routeGroup,
  refreshKey,
  variablesCtx,
}: FlowRouteGroupAccordionProps) {
  const classes = useStyles();
  const { testCases, loading, refresh } = useTestCases(routeGroup);
  const execution = useTestExecution();
  const [runningAll, setRunningAll] = useState(false);

  const prevRefreshKeyRef = useRef(refreshKey);
  if (prevRefreshKeyRef.current !== refreshKey) {
    prevRefreshKeyRef.current = refreshKey;
    refresh();
  }

  const flowTests = useMemo(
    () => testCases.filter(tc => tc.method === 'FLOW'),
    [testCases],
  );

  const overallStatus: OverallStatus = useMemo(() => {
    if (loading) return 'neutral';
    const statuses = flowTests.map(tc => execution.getState(tc.id).status);
    if (statuses.some(s => s === 'running') || runningAll) return 'running';
    if (statuses.some(s => s === 'fail')) return 'fail';
    if (statuses.length > 0 && statuses.every(s => s === 'pass')) return 'pass';
    return 'neutral';
  }, [flowTests, execution, runningAll, loading]);

  const statusDotClass = {
    neutral: classes.statusNeutral,
    pass: classes.statusPass,
    fail: classes.statusFail,
    running: classes.statusRunning,
  }[overallStatus];

  const handleRunAll = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setRunningAll(true);
      for (const tc of flowTests) {
        const tcRuntime = variablesCtx.runtimeOverrides[tc.id] ?? {};
        const tcMerged = { ...variablesCtx.mergedVariables, ...tcRuntime };
        await execution.execute(
          tc.id,
          routeGroup,
          tcMerged,
          variablesCtx.activeEnvironment,
        );
      }
      setRunningAll(false);
    },
    [flowTests, routeGroup, execution, variablesCtx],
  );

  // Don't render if this route group has no flow tests
  if (!loading && flowTests.length === 0) return null;

  return (
    <Accordion
      className={classes.routeAccordion}
      TransitionProps={{ unmountOnExit: true }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        className={classes.routeSummary}
      >
        <Typography
          component="span"
          className={`${classes.statusIndicator} ${statusDotClass}`}
        />
        <Typography className={classes.routePrefix}>{routeGroup}</Typography>
        <Chip
          label={`${flowTests.length} flow${flowTests.length !== 1 ? 's' : ''}`}
          size="small"
          className={`${classes.countChip} ${classes.flowChip}`}
        />
      </AccordionSummary>
      <AccordionDetails className={classes.accordionDetails}>
        {loading && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>File</TableCell>
              <TableCell>Result</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {flowTests.map(tc => {
              const state = execution.getState(tc.id);
              const tcRuntime = variablesCtx.runtimeOverrides[tc.id] ?? {};
              const tcMerged = {
                ...variablesCtx.mergedVariables,
                ...tcRuntime,
              };
              return (
                <TestCaseRow
                  key={tc.id}
                  testCase={tc}
                  routeGroup={routeGroup}
                  status={state.status}
                  result={state.result}
                  error={state.error}
                  onExecute={() =>
                    execution.execute(
                      tc.id,
                      routeGroup,
                      tcMerged,
                      variablesCtx.activeEnvironment,
                    )
                  }
                  onStop={() => execution.stop(tc.id)}
                  runtimeOverrides={tcRuntime}
                  onSetRuntimeOverride={(key, value) =>
                    variablesCtx.setRuntimeOverride(tc.id, key, value)
                  }
                  onRemoveRuntimeOverride={key =>
                    variablesCtx.removeRuntimeOverride(tc.id, key)
                  }
                  mergedVariables={variablesCtx.mergedVariables}
                />
              );
            })}
          </TableBody>
        </Table>
        {flowTests.length > 0 && (
          <Box className={classes.routeGroupFooter}>
            <Button
              variant="outlined"
              size="small"
              className={classes.runAllButton}
              onClick={handleRunAll}
              disabled={runningAll || loading}
              startIcon={<PlayArrowIcon style={{ fontSize: 16 }} />}
            >
              Run all {flowTests.length} flow{flowTests.length !== 1 ? 's' : ''}
            </Button>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

/* ── Main Content ── */

export function FlowTestContent() {
  const classes = useStyles();
  const { routeGroups, loading, error } = useRouteGroups();
  const variables = useVariables();

  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [runtimeOverrides, setRuntimeOverrides] = useState<
    Record<string, Record<string, string>>
  >({});

  const setRuntimeOverride = useCallback(
    (testCaseId: string, key: string, value: string) => {
      setRuntimeOverrides(prev => ({
        ...prev,
        [testCaseId]: { ...(prev[testCaseId] ?? {}), [key]: value },
      }));
    },
    [],
  );

  const removeRuntimeOverride = useCallback(
    (testCaseId: string, key: string) => {
      setRuntimeOverrides(prev => {
        const next = { ...prev };
        if (next[testCaseId]) {
          const updated = { ...next[testCaseId] };
          delete updated[key];
          if (Object.keys(updated).length === 0) {
            delete next[testCaseId];
          } else {
            next[testCaseId] = updated;
          }
        }
        return next;
      });
    },
    [],
  );

  const variablesCtx: VariablesContext = useMemo(
    () => ({
      mergedVariables: variables.mergedVariables,
      activeEnvironment: variables.activeEnvironment,
      runtimeOverrides,
      setRuntimeOverride,
      removeRuntimeOverride,
    }),
    [
      variables.mergedVariables,
      variables.activeEnvironment,
      runtimeOverrides,
      setRuntimeOverride,
      removeRuntimeOverride,
    ],
  );

  const handleTestCasesChanged = useCallback((routeGroup: string) => {
    setRefreshKeys(prev => ({
      ...prev,
      [routeGroup]: (prev[routeGroup] ?? 0) + 1,
    }));
  }, []);

  const historyListenersRef = useRef<
    Map<string, (record: ExecutionRecord) => void>
  >(new Map());

  const handleExecutionCompleted = useCallback(
    (_routeGroup: string, testCaseId: string, record: ExecutionRecord) => {
      const listener = historyListenersRef.current.get(testCaseId);
      if (listener) {
        listener(record);
      }
    },
    [],
  );

  useWebSocket(handleTestCasesChanged, handleExecutionCompleted);

  const historyCtxValue = useMemo(
    () => ({
      registerListener: (
        testCaseId: string,
        callback: (record: ExecutionRecord) => void,
      ) => {
        historyListenersRef.current.set(testCaseId, callback);
      },
      unregisterListener: (testCaseId: string) => {
        historyListenersRef.current.delete(testCaseId);
      },
    }),
    [],
  );

  if (loading) {
    return (
      <Box className={classes.root}>
        <Box className={classes.loadingContainer}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className={classes.root}>
        <Box className={classes.emptyState}>
          <Typography className={classes.emptyTitle}>
            Failed to load flow tests
          </Typography>
          <Typography className={classes.emptySubtitle}>
            {error?.message}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (routeGroups.length === 0) {
    return (
      <Box className={classes.root}>
        <Box className={classes.emptyState}>
          <Typography className={classes.emptyTitle}>
            No flow tests found
          </Typography>
          <Typography className={classes.emptySubtitle}>
            Flow tests are multi-step API sequences. Create flow test cases via
            the MCP server to see them here.
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <ExecutionHistoryContext.Provider value={historyCtxValue}>
      <Box className={classes.root}>
        {/* Header card */}
        <Box className={classes.headerCard}>
          <Box className={classes.headerLeft}>
            <Typography className={classes.title}>Flow Testing</Typography>
            <Chip
              label={`${routeGroups.length} group${
                routeGroups.length !== 1 ? 's' : ''
              }`}
              size="small"
              variant="outlined"
              className={classes.countChip}
            />
          </Box>
          <Box className={classes.headerControls}>
            <EnvironmentSwitcher
              environments={variables.environments}
              activeEnvironment={variables.activeEnvironment}
              onEnvironmentChange={variables.setSelectedEnvironment}
            />
            <Button
              variant="outlined"
              size="small"
              className={classes.variablesButton}
              onClick={() => setVariablesOpen(true)}
            >
              Variables ({variables.resolvedVariables.length})
            </Button>
          </Box>
        </Box>
        <VariableConfigPanel
          open={variablesOpen}
          onClose={() => setVariablesOpen(false)}
          resolvedVariables={variables.resolvedVariables}
          activeEnvironment={variables.activeEnvironment}
          onSetLocalOverride={variables.setLocalOverride}
          onRemoveLocalOverride={variables.removeLocalOverride}
        />
        {routeGroups.map(group => (
          <FlowRouteGroupAccordion
            key={group}
            routeGroup={group}
            refreshKey={refreshKeys[group] ?? 0}
            variablesCtx={variablesCtx}
          />
        ))}
      </Box>
    </ExecutionHistoryContext.Provider>
  );
}
