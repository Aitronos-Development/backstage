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
import { Content, Header, Page } from '@backstage/core-components';
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
import LinearProgress from '@material-ui/core/LinearProgress';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Tooltip from '@material-ui/core/Tooltip';
import CircularProgress from '@material-ui/core/CircularProgress';
import { makeStyles } from '@material-ui/core/styles';
import {
  useRouteGroups,
  useTestCases,
  useTestExecution,
  useWebSocket,
  useVariables,
  useApiTestingClient,
  TestCaseRow,
  EnvironmentSwitcher,
  VariableConfigPanel,
  EnvironmentSettingsPanel,
  ExecutionHistoryContext,
} from '@internal/plugin-api-testing';
import type { ExecutionRecord } from '@internal/plugin-api-testing';
import { HeaderThemeToggle } from '../modules/appModuleNav';

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(2),
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  title: {
    fontWeight: 600,
    fontSize: '1.1rem',
  },
  variablesButton: {
    marginLeft: theme.spacing(1),
  },
  routeAccordion: {
    '&:before': {
      display: 'none',
    },
    boxShadow: 'none',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '4px !important',
    marginBottom: theme.spacing(1),
  },
  routeSummary: {
    fontWeight: 500,
    fontFamily: 'monospace',
    fontSize: '0.95rem',
  },
  badge: {
    marginLeft: theme.spacing(1),
    fontSize: '0.75rem',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  statusPass: {
    backgroundColor: theme.palette.type === 'dark' ? '#66bb6a' : '#4caf50',
  },
  statusFail: {
    backgroundColor: theme.palette.error.main,
  },
  statusRunning: {
    backgroundColor: theme.palette.info.main,
  },
  statusNeutral: {
    backgroundColor: theme.palette.grey[400],
  },
  runAllButton: {
    padding: theme.spacing(0.25),
    color: theme.palette.success?.main || '#4caf50',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(76,175,80,0.15)'
          : 'rgba(76,175,80,0.08)',
    },
  },
  routeGroupFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 0, 0, 0),
  },
  emptyState: {
    padding: theme.spacing(3),
    textAlign: 'center',
    color: theme.palette.text.secondary,
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

/* ── Route Group Accordion ── */

interface RouteGroupAccordionProps {
  routeGroup: string;
  refreshKey: number;
  variablesCtx: VariablesContext;
}

function RouteGroupAccordion({
  routeGroup,
  refreshKey,
  variablesCtx,
}: RouteGroupAccordionProps) {
  const classes = useStyles();
  const { testCases, loading, refresh } = useTestCases(routeGroup);
  const execution = useTestExecution();
  const [runningAll, setRunningAll] = useState(false);

  const prevRefreshKeyRef = useRef(refreshKey);
  if (prevRefreshKeyRef.current !== refreshKey) {
    prevRefreshKeyRef.current = refreshKey;
    refresh();
  }

  const overallStatus: OverallStatus = useMemo(() => {
    if (loading) return 'neutral';
    const statuses = testCases.map(tc => execution.getState(tc.id).status);
    if (statuses.some(s => s === 'running') || runningAll) return 'running';
    if (statuses.some(s => s === 'fail')) return 'fail';
    if (statuses.length > 0 && statuses.every(s => s === 'pass')) return 'pass';
    return 'neutral';
  }, [testCases, execution, runningAll, loading]);

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
      for (const tc of testCases) {
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
    [testCases, routeGroup, execution, variablesCtx],
  );

  return (
    <Accordion
      className={classes.routeAccordion}
      TransitionProps={{ unmountOnExit: true }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography className={classes.routeSummary}>{routeGroup}</Typography>
        <Chip
          label={`${testCases.length} test${testCases.length !== 1 ? 's' : ''}`}
          size="small"
          className={classes.badge}
        />
        <Typography
          component="span"
          className={`${classes.statusDot} ${statusDotClass}`}
          style={{ marginLeft: 8, alignSelf: 'center' }}
        />
      </AccordionSummary>
      <AccordionDetails style={{ display: 'block', paddingTop: 0 }}>
        {loading && <LinearProgress />}
        {!loading && testCases.length === 0 && (
          <Typography variant="body2" color="textSecondary">
            No test cases
          </Typography>
        )}
        {testCases.length > 0 && (
          <Table size="small">
            <TableBody>
              {testCases.map(tc => {
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
        )}
        {testCases.length > 0 && (
          <Box className={classes.routeGroupFooter}>
            <Tooltip title="Run all tests in this group">
              <Box component="span">
                <IconButton
                  size="small"
                  className={classes.runAllButton}
                  onClick={handleRunAll}
                  disabled={runningAll || loading}
                >
                  <PlayArrowIcon fontSize="small" />
                </IconButton>
              </Box>
            </Tooltip>
            <Typography variant="caption" color="textSecondary">
              Run all {testCases.length} test
              {testCases.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

/* ── Main Page ── */

export function ApiTestingPage() {
  const classes = useStyles();
  const { routeGroups, loading, error } = useRouteGroups();
  const variables = useVariables();
  const client = useApiTestingClient();

  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [envSettingsOpen, setEnvSettingsOpen] = useState(false);
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
      <Page themeId="tool">
        <Header title="API Testing">
          <HeaderThemeToggle />
        </Header>
        <Content>
          <Box className={classes.loadingContainer}>
            <CircularProgress />
          </Box>
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page themeId="tool">
        <Header title="API Testing">
          <HeaderThemeToggle />
        </Header>
        <Content>
          <Typography className={classes.emptyState}>
            Failed to load test suites: {error?.message}
          </Typography>
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="tool">
      <Header title="API Testing" subtitle="All test suites">
        <HeaderThemeToggle />
      </Header>
      <Content>
        <ExecutionHistoryContext.Provider value={historyCtxValue}>
          <Box className={classes.root}>
            <Box className={classes.titleRow}>
              <Typography className={classes.title}>
                Test Suites
                <Chip
                  label={`${routeGroups.length} route group${
                    routeGroups.length !== 1 ? 's' : ''
                  }`}
                  size="small"
                  className={classes.badge}
                />
              </Typography>
              <Box
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <EnvironmentSwitcher
                  environments={variables.environments}
                  activeEnvironment={variables.activeEnvironment}
                  onEnvironmentChange={variables.setSelectedEnvironment}
                  onSettingsOpen={() => setEnvSettingsOpen(true)}
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
              onSetOverride={variables.setSavedOverride}
              onRemoveOverride={variables.removeSavedOverride}
            />
            <EnvironmentSettingsPanel
              open={envSettingsOpen}
              onClose={() => setEnvSettingsOpen(false)}
              config={variables.config}
              overrides={variables.overrides}
              activeEnvironment={variables.activeEnvironment}
              client={client}
              onSave={variables.refreshConfig}
            />
            {routeGroups.length === 0 ? (
              <Typography className={classes.emptyState}>
                No test suites found
              </Typography>
            ) : (
              routeGroups.map(group => (
                <RouteGroupAccordion
                  key={group}
                  routeGroup={group}
                  refreshKey={refreshKeys[group] ?? 0}
                  variablesCtx={variablesCtx}
                />
              ))
            )}
          </Box>
        </ExecutionHistoryContext.Provider>
      </Content>
    </Page>
  );
}
