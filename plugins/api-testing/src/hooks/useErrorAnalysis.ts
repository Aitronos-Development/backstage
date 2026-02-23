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
import type { TestStatus, ExecutionResult } from '../api/types';

interface UseErrorAnalysisOptions {
  method: string;
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
  status,
  result,
  error,
}: UseErrorAnalysisOptions): string | null {
  return useMemo(() => {
    if (status !== 'fail') return null;

    const isFlow = method === 'FLOW';

    // Path A: network / parse error (no result object)
    if (error && !result) {
      return error;
    }

    if (!result) return null;

    // Path B: FLOW test — extract key failure from pytest output
    if (isFlow) {
      return extractFlowSummary(result);
    }

    // Path C: HTTP test — structured assertion failures
    return extractHttpSummary(result, error);
  }, [method, status, result, error]);
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
