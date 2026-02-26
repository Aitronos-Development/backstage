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
import { useMemo } from 'react';
import type { TestStatus, ExecutionResult, FlowMetadata } from '../api/types';

interface UseErrorAnalysisOptions {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  flowMetadata?: FlowMetadata;
  status: TestStatus;
  result?: ExecutionResult;
  error?: string;
}

/**
 * Extracts a concise error summary from a failed test execution.
 *
 * For HTTP tests: highlights status code mismatch, failed assertions, and
 * the error response body excerpt.
 *
 * For FLOW tests (pytest): extracts the exception / assertion line from
 * the pytest output.
 */
export function useErrorAnalysis({
  method,
  path,
  body,
  flowMetadata,
  status,
  result,
  error,
}: UseErrorAnalysisOptions): string | null {
  return useMemo(() => {
    if (status !== 'fail') return null;

    const isFlow = method === 'FLOW';

    // Path A: network / parse error (no result object)
    if (error && !result) {
      let enrichedError = error;
      if (error.includes('setup step')) {
        enrichedError += '\n\nHint: Check that the target API is running and the setup credentials in app-config.yaml are correct.';
      } else if (error.includes("not found in any layer")) {
        enrichedError += '\n\nHint: A variable could not be resolved. Check that environment setup steps in app-config.yaml are capturing it correctly.';
      }
      return isFlow
        ? formatFlowRequest(enrichedError, path, flowMetadata, result)
        : formatWithRequest(enrichedError, method, path, body);
    }

    if (!result) return null;

    // Path B: FLOW test — use structured step log when available
    if (isFlow) {
      if (result.details.flowStepLog) {
        const failedStep = result.details.flowStepLog.steps.find(
          s => s.status === 'fail',
        );
        if (failedStep) {
          const parts: string[] = [
            `Step "${failedStep.name}" failed after ${failedStep.duration_ms}ms`,
          ];
          if (failedStep.http_calls.length > 0) {
            parts.push(
              failedStep.http_calls
                .map(c => `  ${c.method} ${c.url} -> ${c.status_code}`)
                .join('\n'),
            );
          }
          if (failedStep.error) {
            const errorLines = failedStep.error.split('\n').slice(0, 3);
            parts.push(errorLines.join('\n'));
          }
          return formatFlowRequest(
            parts.join('\n'),
            path,
            flowMetadata,
            result,
          );
        }
      }
      return formatFlowRequest(extractFlowSummary(result), path, flowMetadata, result);
    }

    // Path C: HTTP test — structured assertion failures
    return formatWithRequest(extractHttpSummary(result, error), method, path, body);
  }, [method, path, body, flowMetadata, status, result, error]);
}

/** Prepend a compact request section to an HTTP error summary. */
function formatWithRequest(
  errorSummary: string,
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
): string {
  const parts: string[] = [];

  parts.push(`${method} ${path}`);

  if (body && Object.keys(body).length > 0) {
    const bodyStr = JSON.stringify(body);
    const truncated =
      bodyStr.length > 200 ? `${bodyStr.slice(0, 200)}...` : bodyStr;
    parts.push(`Body: ${truncated}`);
  }

  return `${parts.join('\n')}\n---\n${errorSummary}`;
}

/** Prepend flow test context (file, failed step) to the error summary. */
function formatFlowRequest(
  errorSummary: string,
  testPath: string,
  flowMetadata: FlowMetadata | undefined,
  result: ExecutionResult | undefined,
): string {
  const parts: string[] = [];

  if (flowMetadata?.file) {
    parts.push(`File: ${flowMetadata.file}`);
  }
  parts.push(`Test: ${testPath}`);

  // Identify which step failed
  if (flowMetadata?.steps && flowMetadata.steps.length > 0 && result) {
    const failedIdx = inferFailedStepIndex(flowMetadata.steps, result);
    if (failedIdx >= 0 && failedIdx < flowMetadata.steps.length) {
      parts.push(
        `Failed at step ${failedIdx + 1}/${flowMetadata.steps.length}: ${flowMetadata.steps[failedIdx]}`,
      );
    }
  }

  return `${parts.join('\n')}\n---\n${errorSummary}`;
}

/**
 * Given a test result and step names, figure out which step failed.
 * Mirrors the logic in FlowStepsPipeline.
 */
function inferFailedStepIndex(
  steps: string[],
  result: ExecutionResult,
): number {
  if (result.pass) return -1;

  const output =
    typeof result.details.responseBody === 'string'
      ? result.details.responseBody
      : '';

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

  for (let i = steps.length - 1; i >= 0; i--) {
    if (failureSection.includes(steps[i])) {
      return i;
    }
  }

  if (output.includes('steps_completed')) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const thisFound = output.includes(`"${steps[i]}"`);
      const nextFound =
        i < steps.length - 1 && output.includes(`"${steps[i + 1]}"`);
      if (thisFound && !nextFound && i < steps.length - 1) {
        return i + 1;
      }
    }
  }

  return steps.length - 1;
}

/** Pull the most relevant failure line(s) from pytest output. */
function extractFlowSummary(result: ExecutionResult): string {
  const output =
    typeof result.details.responseBody === 'string'
      ? result.details.responseBody
      : '';

  const lines = output.split('\n');

  // Look for AssertionError, assert, or FAILED lines
  const failureLines = lines.filter(
    l =>
      l.includes('AssertionError') ||
      l.includes('assert ') ||
      l.includes('FAILED') ||
      l.includes('Error:') ||
      l.includes('Exception'),
  );

  if (failureLines.length > 0) {
    // Dedupe and take at most 3 most relevant lines
    const unique = [...new Set(failureLines.map(l => l.trim()))];
    return unique.slice(0, 3).join('\n');
  }

  // Fallback: last non-empty lines of output (often the summary)
  const tail = lines
    .map(l => l.trim())
    .filter(Boolean)
    .slice(-3);
  return tail.join('\n') || 'Test failed (no details available)';
}

/** Build a structured summary for HTTP assertion failures. */
function extractHttpSummary(result: ExecutionResult, error?: string): string {
  const parts: string[] = [];

  // Status code
  if (
    result.expectedStatusCode !== undefined &&
    result.statusCode !== result.expectedStatusCode
  ) {
    parts.push(
      `HTTP ${result.statusCode} (expected ${result.expectedStatusCode})`,
    );
  }

  // Body assertion failures
  if (result.details.bodyContainsFailures) {
    const fields = Object.keys(result.details.bodyContainsFailures);
    parts.push(
      `Assertion failed on field${fields.length > 1 ? 's' : ''}: ${fields.join(
        ', ',
      )}`,
    );
  }

  // Missing fields
  if (result.details.missingFields && result.details.missingFields.length > 0) {
    parts.push(`Missing fields: ${result.details.missingFields.join(', ')}`);
  }

  // Error response excerpt
  if (result.details.responseBody !== undefined) {
    const bodyStr =
      typeof result.details.responseBody === 'string'
        ? result.details.responseBody
        : JSON.stringify(result.details.responseBody);

    // Try to extract an error/message field from JSON
    const excerpt = extractErrorMessage(bodyStr);
    if (excerpt) {
      parts.push(excerpt);
    }
  }

  // Network / catch error
  if (error) {
    parts.push(error);
  }

  return parts.length > 0
    ? parts.join('\n')
    : 'Test failed (no details available)';
}

/** Try to pull an "error" or "message" field from a JSON string. */
function extractErrorMessage(bodyStr: string): string | null {
  try {
    const obj = JSON.parse(bodyStr);
    if (typeof obj === 'object' && obj !== null) {
      const msg = obj.error || obj.message || obj.detail || obj.error_message;
      if (typeof msg === 'string') return msg;
      if (typeof msg === 'object') return JSON.stringify(msg);
    }
  } catch {
    // not JSON — ignore
  }
  return null;
}
