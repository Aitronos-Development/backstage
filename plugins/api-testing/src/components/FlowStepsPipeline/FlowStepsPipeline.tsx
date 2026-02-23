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

import { useMemo, useState, useEffect } from 'react';
import Box from '@material-ui/core/Box';
import Typography from '@material-ui/core/Typography';
import Tooltip from '@material-ui/core/Tooltip';
import { makeStyles } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import type { TestStatus, ExecutionResult } from '../../api/types';

const MONO_FONT =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace';

type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skipped';

const useStyles = makeStyles(theme => ({
  pipeline: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1, 0),
  },
  stepNode: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.5, 1.25),
    borderRadius: 20,
    border: '2px solid',
    transition: 'all 300ms ease',
    cursor: 'default',
  },
  stepPending: {
    borderColor: theme.palette.grey[400],
    backgroundColor: 'transparent',
    color: theme.palette.text.secondary,
  },
  stepRunning: {
    borderColor: theme.palette.info.main,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(33,150,243,0.15)'
        : 'rgba(33,150,243,0.08)',
    color: theme.palette.info.main,
    animation: '$pulseStep 1.5s ease-in-out infinite',
  },
  stepPass: {
    borderColor: theme.palette.type === 'dark' ? '#66bb6a' : '#4caf50',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(102,187,106,0.15)'
        : 'rgba(76,175,80,0.08)',
    color: theme.palette.type === 'dark' ? '#66bb6a' : '#4caf50',
  },
  stepFail: {
    borderColor: theme.palette.error.main,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(244,67,54,0.15)'
        : 'rgba(244,67,54,0.08)',
    color: theme.palette.error.main,
  },
  stepSkipped: {
    borderColor: theme.palette.grey[300],
    backgroundColor: 'transparent',
    color: theme.palette.grey[400],
    opacity: 0.6,
  },
  stepNumber: {
    fontWeight: 700,
    fontSize: '0.68rem',
    fontFamily: MONO_FONT,
    width: 18,
    height: 18,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberPending: {
    backgroundColor: theme.palette.grey[300],
    color: theme.palette.grey[700],
  },
  stepNumberRunning: {
    backgroundColor: theme.palette.info.main,
    color: '#fff',
  },
  stepNumberPass: {
    backgroundColor: theme.palette.type === 'dark' ? '#66bb6a' : '#4caf50',
    color: '#fff',
  },
  stepNumberFail: {
    backgroundColor: theme.palette.error.main,
    color: '#fff',
  },
  stepNumberSkipped: {
    backgroundColor: theme.palette.grey[300],
    color: theme.palette.grey[500],
  },
  stepIcon: {
    fontSize: '0.75rem',
  },
  stepLabel: {
    fontFamily: MONO_FONT,
    fontSize: '0.75rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  connector: {
    width: 20,
    height: 2,
    flexShrink: 0,
    transition: 'background-color 300ms ease',
  },
  connectorPending: {
    backgroundColor: theme.palette.grey[300],
  },
  connectorDone: {
    backgroundColor: theme.palette.type === 'dark' ? '#66bb6a' : '#4caf50',
  },
  connectorFail: {
    backgroundColor: theme.palette.error.main,
  },
  connectorRunning: {
    backgroundColor: theme.palette.info.main,
    animation: '$pulseConnector 1.5s ease-in-out infinite',
  },
  '@keyframes pulseStep': {
    '0%, 100%': {
      opacity: 1,
      boxShadow: '0 0 0 0 rgba(33,150,243,0.3)',
    },
    '50%': {
      opacity: 0.85,
      boxShadow: '0 0 8px 2px rgba(33,150,243,0.2)',
    },
  },
  '@keyframes pulseConnector': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.4 },
  },
}));

/**
 * Given a test result and step names, figure out which step failed.
 * Looks for step names mentioned near FAILED/AssertionError in the output.
 * Falls back to the last step if indeterminate.
 */
function inferFailedStepIndex(
  steps: string[],
  result?: ExecutionResult,
): number {
  if (!result || result.pass) return -1;

  const output =
    typeof result.details.responseBody === 'string'
      ? result.details.responseBody
      : '';

  // Look for lines with FAILED, AssertionError, assert, or Error
  const failureSection = output
    .split('\n')
    .filter(
      l =>
        l.includes('FAILED') ||
        l.includes('AssertionError') ||
        l.includes('assert ') ||
        l.includes('Error'),
    )
    .join(' ');

  // Check each step name in the failure output (reverse to find last mentioned)
  for (let i = steps.length - 1; i >= 0; i--) {
    if (failureSection.includes(steps[i])) {
      return i;
    }
  }

  // If the output mentions "steps_completed", the assertion at the end failed.
  // Figure out how many steps completed by scanning for step names in order.
  if (output.includes('steps_completed')) {
    for (let i = steps.length - 1; i >= 0; i--) {
      // If this step name appears in the output (logged during execution)
      // but the next one doesn't, the failure is at step i+1
      const thisFound = output.includes(`"${steps[i]}"`);
      const nextFound =
        i < steps.length - 1 && output.includes(`"${steps[i + 1]}"`);
      if (thisFound && !nextFound && i < steps.length - 1) {
        return i + 1;
      }
    }
  }

  // Default: last step
  return steps.length - 1;
}

function getStepStatuses(
  steps: string[],
  testStatus: TestStatus,
  result?: ExecutionResult,
  activeRunningStep?: number,
): StepStatus[] {
  if (testStatus === 'idle') {
    return steps.map(() => 'pending');
  }

  if (testStatus === 'running') {
    return steps.map((_, i) => {
      if (i < (activeRunningStep ?? 0)) return 'pass';
      if (i === (activeRunningStep ?? 0)) return 'running';
      return 'pending';
    });
  }

  if (testStatus === 'pass') {
    return steps.map(() => 'pass');
  }

  // testStatus === 'fail'
  const failedIdx = inferFailedStepIndex(steps, result);
  return steps.map((_, i) => {
    if (i < failedIdx) return 'pass';
    if (i === failedIdx) return 'fail';
    return 'skipped';
  });
}

interface FlowStepsPipelineProps {
  steps: string[];
  status: TestStatus;
  result?: ExecutionResult;
}

export function FlowStepsPipeline({
  steps,
  status,
  result,
}: FlowStepsPipelineProps) {
  const classes = useStyles();

  // Animate through steps when running
  const [activeRunningStep, setActiveRunningStep] = useState(0);

  useEffect(() => {
    if (status !== 'running') {
      setActiveRunningStep(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setActiveRunningStep(prev => (prev + 1) % steps.length);
    }, 1200);

    return () => clearInterval(interval);
  }, [status, steps.length]);

  const stepStatuses = useMemo(
    () => getStepStatuses(steps, status, result, activeRunningStep),
    [steps, status, result, activeRunningStep],
  );

  const stepNodeClass = (s: StepStatus) =>
    ({
      pending: classes.stepPending,
      running: classes.stepRunning,
      pass: classes.stepPass,
      fail: classes.stepFail,
      skipped: classes.stepSkipped,
    }[s]);

  const stepNumberClass = (s: StepStatus) =>
    ({
      pending: classes.stepNumberPending,
      running: classes.stepNumberRunning,
      pass: classes.stepNumberPass,
      fail: classes.stepNumberFail,
      skipped: classes.stepNumberSkipped,
    }[s]);

  const connectorClass = (leftStatus: StepStatus, rightStatus: StepStatus) => {
    if (rightStatus === 'running') return classes.connectorRunning;
    if (leftStatus === 'fail') return classes.connectorFail;
    if (leftStatus === 'pass' && rightStatus !== 'pending')
      return classes.connectorDone;
    if (leftStatus === 'pass' && rightStatus === 'pending')
      return classes.connectorDone;
    return classes.connectorPending;
  };

  const stepContent = (s: StepStatus, index: number) => {
    if (s === 'pass') return <CheckIcon className={classes.stepIcon} />;
    if (s === 'fail') return <CloseIcon className={classes.stepIcon} />;
    return (
      <Typography
        component="span"
        style={{ fontSize: '0.65rem', fontWeight: 700, lineHeight: 1 }}
      >
        {index + 1}
      </Typography>
    );
  };

  const tooltipText = (step: string, s: StepStatus) => {
    const labels: Record<StepStatus, string> = {
      pending: 'Pending',
      running: 'Running...',
      pass: 'Passed',
      fail: 'Failed',
      skipped: 'Skipped',
    };
    return `${step}: ${labels[s]}`;
  };

  return (
    <Box className={classes.pipeline}>
      {steps.map((step, i) => {
        const s = stepStatuses[i];
        return (
          <Box key={step} style={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title={tooltipText(step, s)} arrow placement="top">
              <Box className={`${classes.stepNode} ${stepNodeClass(s)}`}>
                <Box className={`${classes.stepNumber} ${stepNumberClass(s)}`}>
                  {stepContent(s, i)}
                </Box>
                <Typography className={classes.stepLabel}>{step}</Typography>
              </Box>
            </Tooltip>
            {i < steps.length - 1 && (
              <Box
                className={`${classes.connector} ${connectorClass(
                  s,
                  stepStatuses[i + 1],
                )}`}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
