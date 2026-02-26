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

import { useState } from 'react';
import Box from '@material-ui/core/Box';
import Typography from '@material-ui/core/Typography';
import Chip from '@material-ui/core/Chip';
import Collapse from '@material-ui/core/Collapse';
import IconButton from '@material-ui/core/IconButton';
import { makeStyles } from '@material-ui/core/styles';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import type { FlowStepDetail, FlowHttpCall } from '../../api/types';

const MONO_FONT =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace';

const METHOD_COLORS: Record<string, string> = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  PATCH: '#50e3c2',
  DELETE: '#f93e3e',
};

function statusCodeColor(code: number): string {
  if (code >= 200 && code < 300) return '#4caf50';
  if (code >= 400 && code < 500) return '#ff9800';
  return '#f44336';
}

const useStyles = makeStyles(theme => ({
  panel: {
    marginTop: theme.spacing(1),
    padding: theme.spacing(1.5),
    borderRadius: 8,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.03)'
        : 'rgba(0,0,0,0.02)',
    border: `1px solid ${theme.palette.divider}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  stepName: {
    fontFamily: MONO_FONT,
    fontWeight: 600,
    fontSize: '0.85rem',
  },
  statusChip: {
    fontWeight: 700,
    fontSize: '0.7rem',
    height: 20,
  },
  duration: {
    fontFamily: MONO_FONT,
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  errorBox: {
    padding: theme.spacing(1, 1.5),
    borderRadius: 6,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(244,67,54,0.08)'
        : 'rgba(244,67,54,0.04)',
    border: `1px solid ${theme.palette.error.main}30`,
    marginBottom: theme.spacing(1),
  },
  errorText: {
    fontFamily: MONO_FONT,
    fontSize: '0.75rem',
    color: theme.palette.error.main,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  httpCallCard: {
    padding: theme.spacing(1, 1.5),
    borderRadius: 6,
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[900]
        : theme.palette.grey[50],
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(0.75),
  },
  httpCallHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    cursor: 'pointer',
    '&:hover': {
      opacity: 0.8,
    },
  },
  methodBadge: {
    fontFamily: MONO_FONT,
    fontWeight: 700,
    fontSize: '0.7rem',
    padding: '1px 6px',
    borderRadius: 4,
    color: '#fff',
  },
  httpUrl: {
    fontFamily: MONO_FONT,
    fontSize: '0.75rem',
    color: theme.palette.text.primary,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  httpStatusCode: {
    fontFamily: MONO_FONT,
    fontWeight: 700,
    fontSize: '0.75rem',
  },
  httpDuration: {
    fontFamily: MONO_FONT,
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
  },
  bodySection: {
    marginTop: theme.spacing(0.75),
  },
  bodyLabel: {
    fontFamily: MONO_FONT,
    fontSize: '0.68rem',
    fontWeight: 600,
    color: theme.palette.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: theme.spacing(0.25),
  },
  bodyPre: {
    fontFamily: MONO_FONT,
    fontSize: '0.72rem',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(0,0,0,0.3)'
        : 'rgba(0,0,0,0.04)',
    padding: theme.spacing(0.75, 1),
    borderRadius: 4,
    overflow: 'auto',
    maxHeight: 200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  noCallsText: {
    fontFamily: MONO_FONT,
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
  },
  sectionLabel: {
    fontFamily: MONO_FONT,
    fontSize: '0.72rem',
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
}));

function HttpCallCard({ call }: { call: FlowHttpCall }) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(false);
  const hasBody = call.request_body_excerpt || call.response_body_excerpt;

  function formatExcerpt(text: string | null): string {
    if (!text) return '';
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  return (
    <Box className={classes.httpCallCard}>
      <Box
        className={classes.httpCallHeader}
        onClick={() => hasBody && setExpanded(prev => !prev)}
      >
        <span
          className={classes.methodBadge}
          style={{
            backgroundColor: METHOD_COLORS[call.method] || '#999',
          }}
        >
          {call.method}
        </span>
        <Typography className={classes.httpUrl}>{call.url}</Typography>
        <Typography
          className={classes.httpStatusCode}
          style={{ color: statusCodeColor(call.status_code) }}
        >
          {call.status_code}
        </Typography>
        <Typography className={classes.httpDuration}>
          {call.duration_ms}ms
        </Typography>
        {hasBody && (
          <IconButton size="small" style={{ padding: 2 }}>
            {expanded ? (
              <ExpandLessIcon style={{ fontSize: '0.9rem' }} />
            ) : (
              <ExpandMoreIcon style={{ fontSize: '0.9rem' }} />
            )}
          </IconButton>
        )}
      </Box>
      {hasBody && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box className={classes.bodySection}>
            {call.request_body_excerpt && (
              <Box style={{ marginBottom: 6 }}>
                <Typography className={classes.bodyLabel}>Request</Typography>
                <pre className={classes.bodyPre}>
                  {formatExcerpt(call.request_body_excerpt)}
                </pre>
              </Box>
            )}
            {call.response_body_excerpt && (
              <Box>
                <Typography className={classes.bodyLabel}>Response</Typography>
                <pre className={classes.bodyPre}>
                  {formatExcerpt(call.response_body_excerpt)}
                </pre>
              </Box>
            )}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

interface FlowStepDetailPanelProps {
  step: FlowStepDetail;
  stepIndex: number;
}

export function FlowStepDetailPanel({
  step,
  stepIndex,
}: FlowStepDetailPanelProps) {
  const classes = useStyles();

  return (
    <Box className={classes.panel}>
      <Box className={classes.header}>
        <Typography className={classes.stepName}>
          Step {stepIndex + 1}: {step.name}
        </Typography>
        <Chip
          size="small"
          label={step.status.toUpperCase()}
          className={classes.statusChip}
          style={{
            backgroundColor:
              step.status === 'pass'
                ? '#4caf50'
                : '#f44336',
            color: '#fff',
          }}
        />
        <Typography className={classes.duration}>
          {step.duration_ms}ms
        </Typography>
      </Box>
      {step.error && (
        <Box className={classes.errorBox}>
          <pre className={classes.errorText}>{step.error}</pre>
        </Box>
      )}
      {step.http_calls.length > 0 ? (
        <>
          <Typography className={classes.sectionLabel}>
            HTTP Calls ({step.http_calls.length})
          </Typography>
          {step.http_calls.map((call, i) => (
            <HttpCallCard key={i} call={call} />
          ))}
        </>
      ) : (
        <Typography className={classes.noCallsText}>
          No HTTP calls recorded for this step
        </Typography>
      )}
    </Box>
  );
}
