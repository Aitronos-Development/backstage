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
import React, { useEffect, useState } from 'react';
import {
  Table,
  TableColumn,
  Progress,
  StatusOK,
  StatusError,
  StatusWarning,
  Link,
  EmptyState,
  InfoCard,
  OverflowTooltip,
} from '@backstage/core-components';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import {
  Box,
  Chip,
  Grid,
  Typography,
  Button,
  IconButton,
  Collapse,
  Paper,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import RefreshIcon from '@material-ui/icons/Refresh';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import AssessmentIcon from '@material-ui/icons/Assessment';
import BugReportIcon from '@material-ui/icons/BugReport';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';

interface TestRunHistory {
  runId: string;
  route: string;
  timestamp: string;
  duration: number;
  certificate: {
    totalTests: number;
    passed: number;
    bugsFound: number;
    bugIds: string[];
    flakyTests: number;
    invalidTests: number;
    codeCoverage: number;
    performanceGrade: string;
  };
  metadata?: {
    triggeredBy?: string;
    environment?: string;
  };
}

interface TestHistorySummary {
  route: string;
  totalRuns: number;
  lastRun: string;
  lastRunId: string;
  lastDuration: string;
  passRate: string;
  bugsFound: number;
  grade: string;
}

export const TestHistoryComponent: React.FC = () => {
  const [history, setHistory] = useState<TestRunHistory[]>([]);
  const [summary, setSummary] = useState<TestHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const configApi = useApi(configApiRef);
  const backendUrl = configApi.getString('backend.baseUrl');

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch test history summary
      const response = await fetch(`${backendUrl}/api/api-testing/history/summary`);
      if (!response.ok) {
        throw new Error('Failed to fetch test history');
      }
      const data = await response.json();
      setSummary(data.routes || []);

      // If a route is selected, fetch detailed history
      if (selectedRoute) {
        const detailedResponse = await fetch(
          `${backendUrl}/api/api-testing/history?route=${encodeURIComponent(selectedRoute)}`
        );
        if (detailedResponse.ok) {
          const detailedData = await detailedResponse.json();
          setHistory(detailedData.history || []);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedRoute]);

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'primary';
      case 'B': return 'primary';
      case 'C': return 'default';
      case 'D': return 'secondary';
      case 'F': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (passRate: number) => {
    if (passRate >= 90) return <StatusOK />;
    if (passRate >= 70) return <StatusWarning />;
    return <StatusError />;
  };

  const formatDuration = (duration: number) => {
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const summaryColumns: TableColumn<TestHistorySummary>[] = [
    {
      title: 'Route',
      field: 'route',
      render: (row: TestHistorySummary) => (
        <Link to="#" onClick={() => setSelectedRoute(row.route)}>
          <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
            {row.route}
          </Typography>
        </Link>
      ),
    },
    {
      title: 'Total Runs',
      field: 'totalRuns',
      width: '100px',
    },
    {
      title: 'Last Run',
      field: 'lastRun',
      render: (row: TestHistorySummary) => formatDate(row.lastRun),
    },
    {
      title: 'Pass Rate',
      field: 'passRate',
      render: (row: TestHistorySummary) => {
        const rate = parseInt(row.passRate);
        return (
          <Box display="flex" alignItems="center" gap={1}>
            {getStatusIcon(rate)}
            <Typography variant="body2">{row.passRate}</Typography>
          </Box>
        );
      },
    },
    {
      title: 'Bugs',
      field: 'bugsFound',
      render: (row: TestHistorySummary) => (
        <Box display="flex" alignItems="center" gap={1}>
          {row.bugsFound > 0 && <BugReportIcon fontSize="small" color="error" />}
          <Typography variant="body2">{row.bugsFound}</Typography>
        </Box>
      ),
    },
    {
      title: 'Grade',
      field: 'grade',
      render: (row: TestHistorySummary) => (
        <Chip
          label={row.grade}
          size="small"
          color={getGradeColor(row.grade) as any}
        />
      ),
    },
  ];

  const historyColumns: TableColumn<TestRunHistory>[] = [
    {
      title: 'Run ID',
      field: 'runId',
      render: (row: TestRunHistory) => (
        <Box>
          <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
            {row.runId}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setExpandedRow(expandedRow === row.runId ? null : row.runId)}
          >
            {expandedRow === row.runId ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
      ),
    },
    {
      title: 'Timestamp',
      field: 'timestamp',
      render: (row: TestRunHistory) => formatDate(row.timestamp),
    },
    {
      title: 'Duration',
      field: 'duration',
      render: (row: TestRunHistory) => formatDuration(row.duration),
    },
    {
      title: 'Tests',
      render: (row: TestRunHistory) => (
        <Box>
          <Typography variant="body2">
            {row.certificate.passed}/{row.certificate.totalTests}
          </Typography>
          <Progress
            value={(row.certificate.passed / row.certificate.totalTests) * 100}
          />
        </Box>
      ),
    },
    {
      title: 'Bugs',
      render: (row: TestRunHistory) => (
        <Box display="flex" alignItems="center" gap={1}>
          {row.certificate.bugsFound > 0 && (
            <BugReportIcon fontSize="small" color="error" />
          )}
          <Typography variant="body2">{row.certificate.bugsFound}</Typography>
        </Box>
      ),
    },
    {
      title: 'Grade',
      render: (row: TestRunHistory) => (
        <Chip
          label={row.certificate.performanceGrade}
          size="small"
          color={getGradeColor(row.certificate.performanceGrade) as any}
        />
      ),
    },
  ];

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <Alert severity="error">
        <Typography>Error loading test history: {error}</Typography>
        <Button onClick={fetchHistory} startIcon={<RefreshIcon />}>
          Retry
        </Button>
      </Alert>
    );
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <InfoCard
          title="API Test History"
          action={
            <Button
              onClick={fetchHistory}
              startIcon={<RefreshIcon />}
              variant="outlined"
              size="small"
            >
              Refresh
            </Button>
          }
        >
          {selectedRoute ? (
            <Box>
              <Box mb={2}>
                <Button
                  onClick={() => {
                    setSelectedRoute(null);
                    setHistory([]);
                  }}
                  size="small"
                >
                  ← Back to Summary
                </Button>
                <Typography variant="h6" gutterBottom>
                  Test History for {selectedRoute}
                </Typography>
              </Box>

              {history.length === 0 ? (
                <EmptyState
                  title="No test history found"
                  description={`No test runs found for ${selectedRoute}`}
                />
              ) : (
                <Table
                  columns={historyColumns}
                  data={history}
                  title={`${history.length} test runs`}
                  options={{
                    padding: 'dense',
                    search: false,
                    paging: true,
                    pageSize: 10,
                  }}
                  detailPanel={({ rowData }) => expandedRow === rowData.runId ? (
                    <Box p={2} bgcolor="background.default">
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2">Test Details</Typography>
                          <Box mt={1}>
                            <Typography variant="body2">
                              • Total Tests: {rowData.certificate.totalTests}
                            </Typography>
                            <Typography variant="body2">
                              • Passed: {rowData.certificate.passed}
                            </Typography>
                            <Typography variant="body2">
                              • Failed: {rowData.certificate.totalTests - rowData.certificate.passed}
                            </Typography>
                            <Typography variant="body2">
                              • Flaky Tests: {rowData.certificate.flakyTests}
                            </Typography>
                            <Typography variant="body2">
                              • Invalid Tests: {rowData.certificate.invalidTests}
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2">Metrics</Typography>
                          <Box mt={1}>
                            <Typography variant="body2">
                              • Code Coverage: {rowData.certificate.codeCoverage}%
                            </Typography>
                            <Typography variant="body2">
                              • Performance Grade: {rowData.certificate.performanceGrade}
                            </Typography>
                            {rowData.certificate.bugIds.length > 0 && (
                              <Typography variant="body2">
                                • Bug IDs: {rowData.certificate.bugIds.join(', ')}
                              </Typography>
                            )}
                          </Box>
                        </Grid>
                      </Grid>
                    </Box>
                  ) : null}
                />
              )}
            </Box>
          ) : (
            <>
              {summary.length === 0 ? (
                <EmptyState
                  title="No test history found"
                  description="Run some API tests to see history here"
                  action={
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AssessmentIcon />}
                    >
                      Run Tests
                    </Button>
                  }
                />
              ) : (
                <Table
                  columns={summaryColumns}
                  data={summary}
                  title={`${summary.length} route groups tested`}
                  options={{
                    padding: 'dense',
                    search: true,
                    paging: true,
                    pageSize: 10,
                  }}
                />
              )}
            </>
          )}
        </InfoCard>
      </Grid>
    </Grid>
  );
};