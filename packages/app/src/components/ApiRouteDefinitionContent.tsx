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

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
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
import { makeStyles } from '@material-ui/core/styles';
import {
  useTestCases,
  useRouteGroups,
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
import type {
  TestCase,
  TestStatus,
  ExecutionRecord,
} from '@internal/plugin-api-testing';

const MONO_FONT =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace';

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(3),
  },

  /* ---- Header card ---- */
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

  /* ---- Route group accordion ---- */
  routeAccordion: {
    '&:before': { display: 'none' },
    boxShadow: 'none',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '10px !important',
    marginBottom: theme.spacing(1.5),
    overflow: 'hidden',
    transition: 'border-color 200ms',
    '&.Mui-expanded': {
      borderColor: theme.palette.primary.main,
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

  /* ---- Endpoint row ---- */
  endpointRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    padding: theme.spacing(1, 1.5),
    borderRadius: 8,
    marginBottom: 2,
    transition: 'background-color 150ms',
  },
  endpointRowClickable: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(0,0,0,0.025)',
    },
  },
  methodChip: {
    fontWeight: 700,
    fontFamily: MONO_FONT,
    fontSize: '0.72rem',
    minWidth: 64,
    height: 24,
    justifyContent: 'center',
    borderRadius: 6,
    letterSpacing: '0.02em',
  },
  get: { backgroundColor: '#61affe', color: '#fff' },
  post: { backgroundColor: '#49cc90', color: '#fff' },
  put: { backgroundColor: '#fca130', color: '#fff' },
  delete: { backgroundColor: '#f93e3e', color: '#fff' },
  patch: { backgroundColor: '#50e3c2', color: '#fff' },
  default: { backgroundColor: theme.palette.grey[500], color: '#fff' },
  pathText: {
    fontFamily: MONO_FONT,
    fontSize: '0.85rem',
    color: theme.palette.text.primary,
  },
  summary: {
    color: theme.palette.text.secondary,
    fontSize: '0.82rem',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontWeight: 500,
    fontSize: '0.7rem',
    height: 22,
    borderRadius: 6,
  },
  testCountBadge: {
    fontSize: '0.68rem',
    height: 20,
    borderRadius: 5,
    fontWeight: 500,
  },

  /* ---- Test cases container ---- */
  testCasesContainer: {
    padding: theme.spacing(0.5, 0, 0.5, 3),
    marginBottom: theme.spacing(0.5),
    borderLeft: `2px solid ${
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.08)'
        : theme.palette.grey[200]
    }`,
    marginLeft: theme.spacing(4),
    '& .MuiTableHead-root .MuiTableCell-head': {
      fontWeight: 600,
      fontSize: '0.72rem',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: theme.palette.text.secondary,
      paddingTop: theme.spacing(0.5),
      paddingBottom: theme.spacing(0.5),
      borderBottom: `1px solid ${theme.palette.divider}`,
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

  /* ---- Route group footer ---- */
  runAllButton: {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.78rem',
    borderRadius: 8,
    color: theme.palette.success?.main || '#4caf50',
    borderColor: theme.palette.success?.main || '#4caf50',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(76,175,80,0.12)'
          : 'rgba(76,175,80,0.06)',
      borderColor: theme.palette.success?.main || '#4caf50',
    },
  },
  expandIcon: {
    transition: 'transform 200ms ease',
    fontSize: '1.1rem',
    color: theme.palette.text.secondary,
  },
  expandIconOpen: {
    transform: 'rotate(180deg)',
  },
  routeGroupFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1.5),
    paddingTop: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  accordionDetails: {
    display: 'block',
    padding: theme.spacing(0, 2, 2, 2),
  },

  /* ---- Unmatched / empty ---- */
  unmatchedSection: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(1.5, 2),
    borderRadius: 8,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.02)'
        : 'rgba(0,0,0,0.015)',
    border: `1px dashed ${theme.palette.divider}`,
  },
  unmatchedTitle: {
    fontWeight: 600,
    fontSize: '0.82rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
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
    () =>
      hasTests ? getStatusForTests(testCases, execution.getState) : 'neutral',
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
        className={`${classes.endpointRow} ${
          hasTests ? classes.endpointRowClickable : ''
        }`}
        onClick={hasTests ? () => setExpanded(prev => !prev) : undefined}
      >
        <Chip
          label={endpoint.method}
          size="small"
          className={`${classes.methodChip} ${methodColorClass(
            endpoint.method,
          )}`}
        />
        <Typography className={classes.pathText}>{endpoint.path}</Typography>
        {endpoint.summary && (
          <Typography className={classes.summary}>
            {endpoint.summary}
          </Typography>
        )}
        {hasTests && (
          <>
            <Typography
              component="span"
              className={`${classes.statusDot} ${statusDotClass}`}
            />
            <Chip
              label={`${testCases.length} test${
                testCases.length !== 1 ? 's' : ''
              }`}
              size="small"
              variant="outlined"
              className={classes.testCountBadge}
            />
            <ExpandMoreIcon
              className={`${classes.expandIcon} ${
                expanded ? classes.expandIconOpen : ''
              }`}
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

function RouteGroupAccordion({
  group,
  refreshKey,
  variablesCtx,
}: RouteGroupAccordionProps) {
  const classes = useStyles();
  const { testCases, loading, refresh } = useTestCases(group.prefix);
  const execution = useTestExecution();
  const [runningAll, setRunningAll] = useState(false);

  const prevRefreshKeyRef = useRef(refreshKey);
  if (prevRefreshKeyRef.current !== refreshKey) {
    prevRefreshKeyRef.current = refreshKey;
    refresh();
  }

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

    const unmatched = testCases.filter(
      tc => !matched.has(tc.id) && tc.method !== 'FLOW',
    );

    return { map, unmatched };
  }, [group.endpoints, testCases]);

  const methodColorClass = (method: string): string => {
    const m = method.toLowerCase();
    if (m in classes) return (classes as any)[m];
    return classes.default;
  };

  const endpointTests = useMemo(
    () => testCases.filter(tc => tc.method !== 'FLOW'),
    [testCases],
  );

  const overallStatus: OverallStatus = useMemo(() => {
    if (loading) return 'neutral';
    const statuses = endpointTests.map(tc => execution.getState(tc.id).status);
    if (statuses.some(s => s === 'running') || runningAll) return 'running';
    if (statuses.some(s => s === 'fail')) return 'fail';
    if (statuses.length > 0 && statuses.every(s => s === 'pass')) return 'pass';
    return 'neutral';
  }, [endpointTests, execution, runningAll, loading]);

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
      for (const tc of endpointTests) {
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
    [endpointTests, group.prefix, execution, variablesCtx],
  );

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
        <Typography className={classes.routePrefix}>{group.prefix}</Typography>
        <Chip
          label={`${group.endpoints.length} endpoint${
            group.endpoints.length !== 1 ? 's' : ''
          }`}
          size="small"
          variant="outlined"
          className={classes.countChip}
        />
        {endpointTests.length > 0 && (
          <Chip
            label={`${endpointTests.length} test${
              endpointTests.length !== 1 ? 's' : ''
            }`}
            size="small"
            variant="outlined"
            className={classes.countChip}
          />
        )}
      </AccordionSummary>
      <AccordionDetails className={classes.accordionDetails}>
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
          <Box className={classes.unmatchedSection}>
            <Typography className={classes.unmatchedTitle}>
              Other test cases ({testsByEndpoint.unmatched.length})
            </Typography>
            <Table size="small">
              <TableBody>
                {testsByEndpoint.unmatched.map(tc => {
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
        {endpointTests.length > 0 && (
          <Box className={classes.routeGroupFooter}>
            <Button
              variant="outlined"
              size="small"
              className={classes.runAllButton}
              onClick={handleRunAll}
              disabled={runningAll || loading}
              startIcon={<PlayArrowIcon style={{ fontSize: 16 }} />}
            >
              Run all {endpointTests.length} test
              {endpointTests.length !== 1 ? 's' : ''}
            </Button>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

/** Route group that exists in test suites but not in the OpenAPI spec */
function TestOnlyRouteGroupAccordion({
  routeGroup,
  refreshKey,
  variablesCtx,
}: {
  routeGroup: string;
  refreshKey: number;
  variablesCtx: VariablesContext;
}) {
  const classes = useStyles();
  const { testCases, loading, refresh } = useTestCases(routeGroup);
  const execution = useTestExecution();
  const [runningAll, setRunningAll] = useState(false);

  const prevRefreshKeyRef = useRef(refreshKey);
  if (prevRefreshKeyRef.current !== refreshKey) {
    prevRefreshKeyRef.current = refreshKey;
    refresh();
  }

  const endpointTests = useMemo(
    () => testCases.filter(tc => tc.method !== 'FLOW'),
    [testCases],
  );

  const overallStatus: OverallStatus = useMemo(() => {
    if (loading) return 'neutral';
    const statuses = endpointTests.map(tc => execution.getState(tc.id).status);
    if (statuses.some(s => s === 'running') || runningAll) return 'running';
    if (statuses.some(s => s === 'fail')) return 'fail';
    if (statuses.length > 0 && statuses.every(s => s === 'pass')) return 'pass';
    return 'neutral';
  }, [endpointTests, execution, runningAll, loading]);

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
      for (const tc of endpointTests) {
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
    [endpointTests, routeGroup, execution, variablesCtx],
  );

  if (!loading && endpointTests.length === 0) return null;

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
          label={`${endpointTests.length} test${
            endpointTests.length !== 1 ? 's' : ''
          }`}
          size="small"
          variant="outlined"
          className={classes.countChip}
        />
      </AccordionSummary>
      <AccordionDetails className={classes.accordionDetails}>
        {loading && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Path</TableCell>
              <TableCell>Result</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {endpointTests.map(tc => {
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
        {endpointTests.length > 0 && (
          <Box className={classes.routeGroupFooter}>
            <Button
              variant="outlined"
              size="small"
              className={classes.runAllButton}
              onClick={handleRunAll}
              disabled={runningAll || loading}
              startIcon={<PlayArrowIcon style={{ fontSize: 16 }} />}
            >
              Run all {endpointTests.length} test
              {endpointTests.length !== 1 ? 's' : ''}
            </Button>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export function ApiRouteDefinitionContent() {
  const { entity } = useEntity();
  const config = useApi(configApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const variables = useVariables();
  const apiClient = useApiTestingClient();

  // Fetch the OpenAPI spec: from entity definition (API entities) or
  // from the live Freddy backend via proxy (Component entities).
  const entityDefinition =
    entity.kind === 'API' ? (entity.spec as any)?.definition : undefined;

  const [fetchedDefinition, setFetchedDefinition] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (entityDefinition) return; // Already have it from the entity
    fetch(`${backendUrl}/api/proxy/freddy-api/openapi.json`)
      .then(res =>
        res.ok ? res.text() : Promise.reject(new Error(`${res.status}`)),
      )
      .then(text => setFetchedDefinition(text))
      .catch(() => setFetchedDefinition(null));
  }, [entityDefinition, backendUrl]);

  const definition = entityDefinition ?? fetchedDefinition;

  const routeGroups = useMemo(() => {
    if (typeof definition !== 'string') return [];
    return parseOpenApiRoutes(definition);
  }, [definition]);

  // Fetch test suite route groups from backend to discover groups not in OpenAPI
  const { routeGroups: testSuiteGroups } = useRouteGroups();
  const testOnlyGroups = useMemo(() => {
    const openApiPrefixes = new Set(routeGroups.map(g => g.prefix));
    return testSuiteGroups.filter(g => !openApiPrefixes.has(g));
  }, [routeGroups, testSuiteGroups]);

  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});

  const [variablesOpen, setVariablesOpen] = useState(false);
  const [envSettingsOpen, setEnvSettingsOpen] = useState(false);

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

  const totalGroups = routeGroups.length + testOnlyGroups.length;
  const totalEndpoints = routeGroups.reduce(
    (sum, g) => sum + g.endpoints.length,
    0,
  );

  if (!definition && testOnlyGroups.length === 0) {
    return (
      <Box className={classes.root}>
        <Box className={classes.emptyState}>
          <Typography className={classes.emptyTitle}>
            No API definition found
          </Typography>
          <Typography className={classes.emptySubtitle}>
            Attach an OpenAPI spec to this entity to see API routes and run
            tests.
          </Typography>
        </Box>
      </Box>
    );
  }

  if (routeGroups.length === 0 && testOnlyGroups.length === 0) {
    return (
      <Box className={classes.root}>
        <Box className={classes.emptyState}>
          <Typography className={classes.emptyTitle}>
            No routes found
          </Typography>
          <Typography className={classes.emptySubtitle}>
            The API definition was loaded but contains no path definitions.
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
            <Typography className={classes.title}>API Testing</Typography>
            <Chip
              label={`${totalGroups} group${totalGroups !== 1 ? 's' : ''}`}
              size="small"
              variant="outlined"
              className={classes.countChip}
            />
            {totalEndpoints > 0 && (
              <Chip
                label={`${totalEndpoints} endpoint${
                  totalEndpoints !== 1 ? 's' : ''
                }`}
                size="small"
                variant="outlined"
                className={classes.countChip}
              />
            )}
          </Box>
          <Box className={classes.headerControls}>
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
          client={apiClient}
          onSave={variables.refreshConfig}
        />
        {routeGroups.map(group => (
          <RouteGroupAccordion
            key={group.prefix}
            group={group}
            refreshKey={refreshKeys[group.prefix] ?? 0}
            variablesCtx={variablesCtx}
          />
        ))}
        {testOnlyGroups.map(group => (
          <TestOnlyRouteGroupAccordion
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
