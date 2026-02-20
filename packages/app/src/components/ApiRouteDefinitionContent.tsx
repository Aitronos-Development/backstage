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

import { useMemo, useState, useCallback, useRef } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import Chip from '@material-ui/core/Chip';
import Box from '@material-ui/core/Box';
import Collapse from '@material-ui/core/Collapse';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import LinearProgress from '@material-ui/core/LinearProgress';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Tooltip from '@material-ui/core/Tooltip';
import { makeStyles } from '@material-ui/core/styles';
import {
  useTestCases,
  useTestExecution,
  useWebSocket,
  useVariables,
  TestCaseRow,
  EnvironmentSwitcher,
  VariableConfigPanel,
  ExecutionHistoryContext,
} from '@internal/plugin-api-testing';
import type { TestCase, TestStatus, ExecutionRecord } from '@internal/plugin-api-testing';

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
  endpointRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.75, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  endpointRowClickable: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  methodChip: {
    fontWeight: 700,
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    minWidth: 60,
    justifyContent: 'center',
  },
  get: { backgroundColor: '#61affe', color: '#fff' },
  post: { backgroundColor: '#49cc90', color: '#fff' },
  put: { backgroundColor: '#fca130', color: '#fff' },
  delete: { backgroundColor: '#f93e3e', color: '#fff' },
  patch: { backgroundColor: '#50e3c2', color: '#fff' },
  default: { backgroundColor: theme.palette.grey[500], color: '#fff' },
  pathText: {
    fontFamily: 'monospace',
    fontSize: '0.9rem',
  },
  summary: {
    color: theme.palette.text.secondary,
    fontSize: '0.85rem',
    marginLeft: theme.spacing(1),
    flex: 1,
  },
  emptyState: {
    padding: theme.spacing(3),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
  badge: {
    marginLeft: theme.spacing(1),
    fontSize: '0.75rem',
  },
  testCountBadge: {
    marginLeft: 'auto',
    fontSize: '0.7rem',
  },
  testCasesContainer: {
    padding: theme.spacing(0.5, 0, 0.5, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
    '& .MuiTableHead-root .MuiTableCell-head': {
      fontWeight: 600,
      fontSize: '0.75rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: theme.palette.text.secondary,
      paddingTop: theme.spacing(0.5),
      paddingBottom: theme.spacing(0.5),
    },
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
  expandIcon: {
    transition: 'transform 150ms',
    fontSize: '1rem',
    color: theme.palette.text.secondary,
  },
  expandIconOpen: {
    transform: 'rotate(180deg)',
  },
  routeGroupFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 0, 0, 0),
  },
}));

interface RouteGroup {
  prefix: string;
  endpoints: Array<{
    method: string;
    path: string;
    summary?: string;
    operationId?: string;
  }>;
}

type OverallStatus = 'neutral' | 'pass' | 'fail' | 'running';

/** Normalize path params so OpenAPI `{id}` matches test case `:id` */
function normalizePath(p: string): string {
  return p.replace(/\{[^}]+\}/g, ':param').replace(/:[\w]+/g, ':param');
}

function parseOpenApiRoutes(definition: string): RouteGroup[] {
  try {
    const spec = JSON.parse(definition);
    const paths = spec.paths ?? {};
    const groupMap = new Map<string, RouteGroup['endpoints']>();

    for (const [path, methods] of Object.entries<Record<string, any>>(paths)) {
      const segments = path.split('/').filter(Boolean);
      const prefix =
        segments.length >= 2
          ? `/${segments[0]}/${segments[1]}`
          : `/${segments[0] ?? ''}`;

      if (!groupMap.has(prefix)) {
        groupMap.set(prefix, []);
      }

      for (const [method, details] of Object.entries<any>(methods)) {
        if (
          ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(
            method.toLowerCase(),
          )
        ) {
          groupMap.get(prefix)!.push({
            method: method.toUpperCase(),
            path,
            summary: details?.summary,
            operationId: details?.operationId,
          });
        }
      }
    }

    return Array.from(groupMap.entries())
      .map(([prefix, endpoints]) => ({ prefix, endpoints }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix));
  } catch {
    return [];
  }
}

function getStatusForTests(
  tests: TestCase[],
  getState: (id: string) => { status: TestStatus },
): OverallStatus {
  const statuses = tests.map(tc => getState(tc.id).status);
  if (statuses.some(s => s === 'running')) return 'running';
  if (statuses.some(s => s === 'fail')) return 'fail';
  if (statuses.length > 0 && statuses.every(s => s === 'pass')) return 'pass';
  return 'neutral';
}

interface VariablesContext {
  mergedVariables: Record<string, string>;
  activeEnvironment: string;
  runtimeOverrides: Record<string, Record<string, string>>;
  setRuntimeOverride: (testCaseId: string, key: string, value: string) => void;
  removeRuntimeOverride: (testCaseId: string, key: string) => void;
}

interface EndpointWithTestsProps {
  endpoint: RouteGroup['endpoints'][number];
  testCases: TestCase[];
  execution: ReturnType<typeof useTestExecution>;
  routeGroup: string;
  methodColorClass: (method: string) => string;
  variablesCtx: VariablesContext;
}

function EndpointWithTests({
  endpoint,
  testCases,
  execution,
  routeGroup,
  methodColorClass,
  variablesCtx,
}: EndpointWithTestsProps) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(false);
  const hasTests = testCases.length > 0;

  const endpointStatus = useMemo(
    () => (hasTests ? getStatusForTests(testCases, execution.getState) : 'neutral'),
    [testCases, execution, hasTests],
  );

  const statusDotClass = {
    neutral: classes.statusNeutral,
    pass: classes.statusPass,
    fail: classes.statusFail,
    running: classes.statusRunning,
  }[endpointStatus];

  return (
    <>
      <Box
        className={`${classes.endpointRow} ${hasTests ? classes.endpointRowClickable : ''}`}
        onClick={hasTests ? () => setExpanded(prev => !prev) : undefined}
      >
        <Chip
          label={endpoint.method}
          size="small"
          className={`${classes.methodChip} ${methodColorClass(endpoint.method)}`}
        />
        <Typography className={classes.pathText}>{endpoint.path}</Typography>
        {endpoint.summary && (
          <Typography className={classes.summary}>{endpoint.summary}</Typography>
        )}
        {hasTests && (
          <>
            <span className={`${classes.statusDot} ${statusDotClass}`} />
            <Chip
              label={`${testCases.length} test${testCases.length !== 1 ? 's' : ''}`}
              size="small"
              variant="outlined"
              className={classes.testCountBadge}
            />
            <ExpandMoreIcon
              className={`${classes.expandIcon} ${expanded ? classes.expandIconOpen : ''}`}
            />
          </>
        )}
      </Box>
      {hasTests && (
        <Collapse in={expanded} unmountOnExit>
          <Box className={classes.testCasesContainer}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Method</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Path</TableCell>
                  <TableCell>Result</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {testCases.map(tc => {
                  const state = execution.getState(tc.id);
                  const tcRuntime = variablesCtx.runtimeOverrides[tc.id] ?? {};
                  const tcMerged = { ...variablesCtx.mergedVariables, ...tcRuntime };
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
          </Box>
        </Collapse>
      )}
    </>
  );
}

interface RouteGroupAccordionProps {
  group: RouteGroup;
  refreshKey: number;
  variablesCtx: VariablesContext;
}

function RouteGroupAccordion({ group, refreshKey, variablesCtx }: RouteGroupAccordionProps) {
  const classes = useStyles();
  const { testCases, loading, refresh } = useTestCases(group.prefix);
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

  /** Map each endpoint to its matching test cases by normalized method+path */
  const testsByEndpoint = useMemo(() => {
    const map = new Map<string, TestCase[]>();
    const matched = new Set<string>();

    for (const ep of group.endpoints) {
      const key = `${ep.method}::${normalizePath(ep.path)}`;
      if (!map.has(key)) map.set(key, []);
    }

    for (const tc of testCases) {
      const key = `${tc.method.toUpperCase()}::${normalizePath(tc.path)}`;
      if (map.has(key)) {
        map.get(key)!.push(tc);
        matched.add(tc.id);
      }
    }

    // Collect unmatched test cases
    const unmatched = testCases.filter(tc => !matched.has(tc.id));

    return { map, unmatched };
  }, [group.endpoints, testCases]);

  const methodColorClass = (method: string): string => {
    const m = method.toLowerCase();
    if (m in classes) return (classes as any)[m];
    return classes.default;
  };

  const handleRunAll = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setRunningAll(true);
      for (const tc of testCases) {
        const tcRuntime = variablesCtx.runtimeOverrides[tc.id] ?? {};
        const tcMerged = { ...variablesCtx.mergedVariables, ...tcRuntime };
        await execution.execute(
          tc.id,
          group.prefix,
          tcMerged,
          variablesCtx.activeEnvironment,
        );
      }
      setRunningAll(false);
    },
    [testCases, group.prefix, execution, variablesCtx],
  );

  return (
    <Accordion
      className={classes.routeAccordion}
      TransitionProps={{ unmountOnExit: true }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography className={classes.routeSummary}>{group.prefix}</Typography>
        <Chip
          label={`${group.endpoints.length} endpoint${group.endpoints.length !== 1 ? 's' : ''}`}
          size="small"
          className={classes.badge}
        />
        <span
          className={`${classes.statusDot} ${statusDotClass}`}
          style={{ marginLeft: 8, alignSelf: 'center' }}
        />
      </AccordionSummary>
      <AccordionDetails style={{ display: 'block', paddingTop: 0 }}>
        {loading && <LinearProgress />}
        {group.endpoints.map((ep, i) => {
          const key = `${ep.method}::${normalizePath(ep.path)}`;
          const epTests = testsByEndpoint.map.get(key) ?? [];
          return (
            <EndpointWithTests
              key={`${ep.method}-${ep.path}-${i}`}
              endpoint={ep}
              testCases={epTests}
              execution={execution}
              routeGroup={group.prefix}
              methodColorClass={methodColorClass}
              variablesCtx={variablesCtx}
            />
          );
        })}
        {testsByEndpoint.unmatched.length > 0 && (
          <Box style={{ paddingTop: 8 }}>
            <Typography
              variant="body2"
              style={{ fontWeight: 600, marginBottom: 4 }}
            >
              Other test cases
            </Typography>
            <Table size="small">
              <TableBody>
                {testsByEndpoint.unmatched.map(tc => {
                  const state = execution.getState(tc.id);
                  const tcRuntime = variablesCtx.runtimeOverrides[tc.id] ?? {};
                  const tcMerged = { ...variablesCtx.mergedVariables, ...tcRuntime };
                  return (
                    <TestCaseRow
                      key={tc.id}
                      testCase={tc}
                      routeGroup={group.prefix}
                      status={state.status}
                      result={state.result}
                      error={state.error}
                      onExecute={() =>
                        execution.execute(
                          tc.id,
                          group.prefix,
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
          </Box>
        )}
        {testCases.length > 0 && (
          <Box className={classes.routeGroupFooter}>
            <Tooltip title="Run all tests in this group">
              <span>
                <IconButton
                  size="small"
                  className={classes.runAllButton}
                  onClick={handleRunAll}
                  disabled={runningAll || loading}
                >
                  <PlayArrowIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="caption" color="textSecondary">
              Run all {testCases.length} test{testCases.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export function ApiRouteDefinitionContent() {
  const { entity } = useEntity();
  const definition = (entity.spec as any)?.definition;
  const variables = useVariables();

  const routeGroups = useMemo(() => {
    if (typeof definition !== 'string') return [];
    return parseOpenApiRoutes(definition);
  }, [definition]);

  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});

  const [variablesOpen, setVariablesOpen] = useState(false);

  // Per-test runtime overrides: { [testCaseId]: { [varKey]: value } }
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

  // Track execution-completed events so EndpointHistory components can
  // subscribe via a simple event-bus pattern (ref-based map of callbacks).
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

  const classes = useStyles();

  if (!definition) {
    return (
      <Box className={classes.root}>
        <Typography className={classes.emptyState}>
          No API definition found
        </Typography>
      </Box>
    );
  }

  if (routeGroups.length === 0) {
    return (
      <Box className={classes.root}>
        <Typography className={classes.emptyState}>
          No routes found in the API definition
        </Typography>
      </Box>
    );
  }

  return (
    <ExecutionHistoryContext.Provider value={historyCtxValue}>
      <Box className={classes.root}>
        <Box className={classes.titleRow}>
          <Typography className={classes.title}>
            API Routes
            <Chip
              label={`${routeGroups.length} route group${routeGroups.length !== 1 ? 's' : ''}`}
              size="small"
              className={classes.badge}
            />
          </Typography>
          <Box style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
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
          <RouteGroupAccordion
            key={group.prefix}
            group={group}
            refreshKey={refreshKeys[group.prefix] ?? 0}
            variablesCtx={variablesCtx}
          />
        ))}
      </Box>
    </ExecutionHistoryContext.Provider>
  );
}
