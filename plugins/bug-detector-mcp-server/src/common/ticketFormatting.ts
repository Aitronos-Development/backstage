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
import crypto from 'node:crypto';
import type { FailureRecord } from './types';
import { redactSensitiveFields, redactHeaders } from './redaction';
import { computeFailureFingerprint, buildFingerprintMarker } from './fingerprint';
import { categorizeFailure, type FailureGroup } from './categorization';

export const BULK_LIMIT = 20;

export const HTTP_STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

export function deriveShortErrorSummary(failure: FailureRecord): string {
  const { actual_status, failure_reason } = failure;

  if (actual_status >= 500 && actual_status < 600) {
    const text = HTTP_STATUS_TEXT[actual_status] ?? 'Server Error';
    return `${actual_status} ${text}`;
  }

  if (
    actual_status >= 400 &&
    actual_status < 500 &&
    HTTP_STATUS_TEXT[actual_status]
  ) {
    return `Expected 200, got ${actual_status} ${HTTP_STATUS_TEXT[actual_status]}`;
  }

  if (/schema\s*validation/i.test(failure_reason)) {
    return 'Response schema validation failed';
  }

  if (/body_contains/i.test(failure_reason)) {
    return 'Response body mismatch';
  }

  if (failure_reason.length > 60) {
    return `${failure_reason.slice(0, 57)}...`;
  }
  return failure_reason;
}

export function generateHeading(failure: FailureRecord): string {
  const summary = deriveShortErrorSummary(failure);
  const heading = `[API Test Failure] ${failure.method} ${failure.endpoint} \u2014 ${summary}`;
  if (heading.length > 200) {
    return `${heading.slice(0, 197)}...`;
  }
  return heading;
}

export function derivePriority(
  failure: FailureRecord,
): 'urgent' | 'medium' | 'low' {
  const { actual_status, failure_reason } = failure;

  if (actual_status >= 500 && actual_status < 600) return 'urgent';
  if (/timeout/i.test(failure_reason)) return 'urgent';
  if (actual_status === 401 || actual_status === 403) return 'medium';
  if (/schema\s*validation/i.test(failure_reason)) return 'low';

  return 'medium';
}

function routeGroupSlug(routeGroup: string): string {
  return routeGroup.replace(/^\//, '').replace(/\//g, '-');
}

/* ──────────────── Error Info Extraction ──────────────────────────────── */

interface ErrorInfo {
  code: string | null;
  message: string | null;
  systemMessage: string | null;
  type: string | null;
  details: unknown | null;
  traceId: string | null;
}

function asRecord(obj: unknown): Record<string, unknown> | null {
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    return obj as Record<string, unknown>;
  }
  return null;
}

function extractErrorInfo(responseBody: unknown): ErrorInfo {
  const info: ErrorInfo = {
    code: null,
    message: null,
    systemMessage: null,
    type: null,
    details: null,
    traceId: null,
  };

  const body = asRecord(responseBody);
  if (!body) {
    if (typeof responseBody === 'string' && responseBody.length > 0) {
      info.message = responseBody;
    }
    return info;
  }

  // Nested error object: body.error.{code, message, type, ...}
  const nested = asRecord(body.error);
  if (nested) {
    info.code = typeof nested.code === 'string' ? nested.code : null;
    info.message = typeof nested.message === 'string' ? nested.message : null;
    info.systemMessage =
      typeof nested.system_message === 'string'
        ? nested.system_message
        : null;
    info.type = typeof nested.type === 'string' ? nested.type : null;
    info.traceId =
      typeof nested.trace_id === 'string' ? nested.trace_id : null;
    if (
      nested.details !== undefined &&
      nested.details !== null &&
      JSON.stringify(nested.details) !== '{}'
    ) {
      info.details = nested.details;
    }
    return info;
  }

  // String error: body.error as string
  if (typeof body.error === 'string') {
    info.message = body.error;
  }

  // Flat fields: body.code, body.message, body.detail
  if (!info.code && typeof body.code === 'string') info.code = body.code;
  if (!info.message && typeof body.message === 'string')
    info.message = body.message;
  if (!info.message && typeof body.detail === 'string')
    info.message = body.detail;
  if (typeof body.trace_id === 'string') info.traceId = body.trace_id;

  // GraphQL-style: body.errors[0]
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const first = asRecord(body.errors[0]);
    if (first) {
      if (!info.code && typeof first.code === 'string') info.code = first.code;
      if (!info.message && typeof first.message === 'string')
        info.message = first.message;
    }
  }

  return info;
}

/* ──────────────── Failure Reason Parsing ─────────────────────────────── */

interface FieldMismatch {
  kind: 'status' | 'body_field' | 'missing_field' | 'other';
  field?: string;
  expected?: string;
  actual?: string;
  raw: string;
}

function parseFailureReasonFields(failureReason: string): FieldMismatch[] {
  const segments = failureReason.split(/;\s*/);
  const results: FieldMismatch[] = [];

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    // "Expected status 201, got 403"
    const statusMatch = trimmed.match(
      /expected\s+status\s+(\d{3}),?\s+got\s+(\d{3})/i,
    );
    if (statusMatch) {
      results.push({
        kind: 'status',
        expected: statusMatch[1],
        actual: statusMatch[2],
        raw: trimmed,
      });
      continue;
    }

    // "Body field 'success': expected true, got false"
    const bodyMatch = trimmed.match(
      /body\s+field\s+'([^']+)':\s+expected\s+(.+?),\s+got\s+(.+)/i,
    );
    if (bodyMatch) {
      results.push({
        kind: 'body_field',
        field: bodyMatch[1],
        expected: bodyMatch[2],
        actual: bodyMatch[3],
        raw: trimmed,
      });
      continue;
    }

    // "Missing required fields: user_id, email_key, type"
    const missingMatch = trimmed.match(/missing\s+required\s+fields?:\s+(.+)/i);
    if (missingMatch) {
      results.push({
        kind: 'missing_field',
        field: missingMatch[1],
        raw: trimmed,
      });
      continue;
    }

    results.push({ kind: 'other', raw: trimmed });
  }

  return results;
}

function buildExpectedVsActualTable(mismatches: FieldMismatch[]): string {
  const rows: string[] = [];

  for (const m of mismatches) {
    switch (m.kind) {
      case 'status': {
        const expText = HTTP_STATUS_TEXT[Number(m.expected)] ?? '';
        const actText = HTTP_STATUS_TEXT[Number(m.actual)] ?? '';
        rows.push(
          `| Status Code | ${m.expected}${expText ? ` ${expText}` : ''} | ${m.actual}${actText ? ` ${actText}` : ''} |`,
        );
        break;
      }
      case 'body_field':
        rows.push(
          `| Body \`${m.field}\` | \`${m.expected}\` | \`${m.actual}\` |`,
        );
        break;
      case 'missing_field':
        rows.push(`| Required fields | Present | Missing: ${m.field} |`);
        break;
      case 'other':
        rows.push(`| Assertion | Pass | Fail: ${m.raw} |`);
        break;
    }
  }

  return rows.length > 0 ? rows.join('\n') : '| Status Code | N/A | N/A |';
}

/* ──────────────── Curl Command Builder ──────────────────────────────── */

function buildCurlCommand(failure: FailureRecord): string {
  const redacted = redactHeaders(failure.request.headers);
  const redactedBody = redactSensitiveFields(failure.request.body);

  let cmd = `curl -X ${failure.method} '${failure.request.url}'`;

  for (const [key, value] of Object.entries(redacted)) {
    cmd += ` \\\n  -H '${key}: ${value}'`;
  }

  if (redactedBody !== null && redactedBody !== undefined) {
    const bodyStr =
      typeof redactedBody === 'string'
        ? redactedBody
        : JSON.stringify(redactedBody);
    if (bodyStr.length <= 500) {
      cmd += ` \\\n  -d '${bodyStr}'`;
    } else {
      cmd += ` \\\n  -d '${bodyStr.slice(0, 497)}...'`;
    }
  }

  return cmd;
}

/* ──────────────── Category-Specific Narratives ──────────────────────── */

type FailureCategory = ReturnType<typeof categorizeFailure>;

function generateCategoryNarrative(
  category: FailureCategory,
  failure: FailureRecord,
  errorInfo: ErrorInfo,
): string {
  switch (category) {
    case 'server-error':
      return (
        `The server encountered an internal error while processing this request. ` +
        `A ${failure.actual_status} response typically indicates an unhandled exception ` +
        `or infrastructure problem on the server side, not a client issue.`
      );

    case 'auth-failure': {
      if (failure.actual_status === 401) {
        return (
          `The server rejected the request as unauthenticated. ` +
          `The request either lacked valid credentials or the provided credentials were not accepted.`
        );
      }
      if (errorInfo.code) {
        return (
          `The server denied access with error code \`${errorInfo.code}\`. ` +
          `The credentials may be valid, but the authenticated identity does not have ` +
          `permission to perform this action.`
        );
      }
      return (
        `The server denied access to this endpoint. The request was understood ` +
        `but the server is refusing to fulfill it.`
      );
    }

    case 'validation-error':
      return (
        `The response did not match the expected schema or field values. ` +
        `This suggests either the API contract has changed, or the endpoint ` +
        `is returning unexpected data.`
      );

    case 'timeout':
      return (
        `The request timed out before the server could respond. This may indicate ` +
        `the server is under heavy load, the endpoint is performing a long-running operation, ` +
        `or there is a network issue between the test runner and the server.`
      );

    case 'connection-error':
      return (
        `The test runner could not establish a connection to the server. The server ` +
        `may be down, the hostname may be unreachable, or a firewall/network issue is ` +
        `preventing connectivity.`
      );

    case 'unexpected-status':
      return (
        `The server returned an unexpected status code. The endpoint responded ` +
        `but the status code did not match what the test expected.`
      );
  }
}

function generateRootCauseHints(
  category: FailureCategory,
  failure: FailureRecord,
  errorInfo: ErrorInfo,
): string {
  const hints: string[] = [];

  switch (category) {
    case 'server-error':
      hints.push(
        'Check server logs for stack traces around the timestamp of this request',
      );
      if (failure.actual_status === 502 || failure.actual_status === 503)
        hints.push(
          'Upstream service or dependency may be unavailable',
        );
      if (failure.actual_status === 504)
        hints.push(
          'Upstream service may be responding too slowly (gateway timeout)',
        );
      if (errorInfo.traceId)
        hints.push(
          `Search server logs for trace ID \`${errorInfo.traceId}\` for the full stack trace`,
        );
      hints.push('Verify database connectivity and query performance');
      break;

    case 'auth-failure':
      if (errorInfo.code) {
        const codeLower = errorInfo.code.toLowerCase();
        if (codeLower.includes('restrict'))
          hints.push(
            'This action may require a whitelisted email domain, an invitation code, or admin approval',
          );
        if (codeLower.includes('expired'))
          hints.push('The authentication token or session may have expired');
        if (codeLower.includes('invalid'))
          hints.push(
            'The provided credentials may be incorrect or the account may be deactivated',
          );
      }
      if (failure.actual_status === 401)
        hints.push(
          'Check if the auth token is expired, missing, or malformed',
        );
      if (failure.actual_status === 403) {
        hints.push(
          'Verify the test user has the required role/permissions for this endpoint',
        );
        hints.push(
          'Check if a feature flag or environment config is restricting this action',
        );
      }
      break;

    case 'validation-error':
      hints.push(
        'Check if the API schema or validation rules have been recently updated',
      );
      hints.push(
        'The test assertions may need to be updated to match the current API contract',
      );
      break;

    case 'timeout':
      hints.push(
        'Check server resource utilization (CPU, memory, DB connections) at the time of failure',
      );
      hints.push(
        'The endpoint handler may have a slow query or external call',
      );
      hints.push(
        'Network latency between the test runner and server may be abnormal',
      );
      break;

    case 'connection-error':
      hints.push(
        'Verify the server process is running and listening on the expected port',
      );
      hints.push(
        'Check DNS resolution and network connectivity from the test runner host',
      );
      hints.push(
        'A firewall, proxy, or security group may be blocking the connection',
      );
      break;

    case 'unexpected-status':
      if (errorInfo.code)
        hints.push(
          `Server error code \`${errorInfo.code}\` may indicate a business logic precondition failure`,
        );
      hints.push(
        'The endpoint behavior may have changed in a recent deployment',
      );
      hints.push(
        'Check if the test expectations need updating for new API behavior',
      );
      break;
  }

  return hints.map(h => `- ${h}`).join('\n');
}

function generateImpactAssessment(
  category: FailureCategory,
  failure: FailureRecord,
): string {
  const method = failure.method.toUpperCase();
  const isWrite =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE';

  switch (category) {
    case 'server-error':
      return isWrite
        ? 'Users attempting this write operation will experience errors. Data may not be persisted correctly.'
        : 'Users requesting this resource will encounter an error page or failed API call.';
    case 'auth-failure':
      return 'Legitimate users may be locked out of this functionality if the auth check is overly restrictive.';
    case 'validation-error':
      return 'The test assertions no longer match the API contract. This may indicate the test is stale or the API introduced a breaking change.';
    case 'timeout':
      return 'Slow responses degrade user experience and may cascade to upstream callers that also time out.';
    case 'connection-error':
      return 'The endpoint is unreachable, causing a complete outage of this feature for all users.';
    case 'unexpected-status':
      return 'The API behavior has diverged from the test specification. This may affect clients relying on the documented status code contract.';
  }
}

/* ──────────────── Server Error Details Formatter ─────────────────────── */

function formatServerErrorDetails(errorInfo: ErrorInfo): string {
  if (!errorInfo.code && !errorInfo.message && !errorInfo.type) {
    return '_No structured error information was returned in the response body._';
  }

  const lines: string[] = [];
  if (errorInfo.code) lines.push(`- **Error Code:** \`${errorInfo.code}\``);
  if (errorInfo.message) lines.push(`- **Message:** ${errorInfo.message}`);
  if (
    errorInfo.systemMessage &&
    errorInfo.systemMessage !== errorInfo.message
  ) {
    lines.push(`- **System Detail:** ${errorInfo.systemMessage}`);
  }
  if (errorInfo.type) lines.push(`- **Type:** \`${errorInfo.type}\``);
  if (errorInfo.traceId)
    lines.push(`- **Trace ID:** \`${errorInfo.traceId}\``);
  if (errorInfo.details) {
    const detailStr =
      typeof errorInfo.details === 'string'
        ? errorInfo.details
        : JSON.stringify(errorInfo.details, null, 2);
    if (detailStr.length < 200) {
      lines.push(`- **Details:** \`${detailStr}\``);
    } else {
      lines.push('- **Details:**');
      lines.push('```json');
      lines.push(detailStr);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

/* ──────────────── Timestamp Formatter ────────────────────────────────── */

function formatTimestamp(isoTimestamp: string): string {
  try {
    const d = new Date(isoTimestamp);
    return `${d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}`;
  } catch {
    return isoTimestamp;
  }
}

/* ──────────────── Individual Ticket Description ─────────────────────── */

export function generateDescription(
  failure: FailureRecord,
  routeGroup: string,
): string {
  const fingerprint = computeFailureFingerprint(failure);
  const category = categorizeFailure(failure);
  const errorInfo = extractErrorInfo(failure.response.body);
  const mismatches = parseFailureReasonFields(failure.failure_reason);

  // Parse expected status from structured mismatches
  const statusMismatch = mismatches.find(m => m.kind === 'status');
  const expectedStatus = statusMismatch?.expected ?? 'N/A';
  const expectedStatusText =
    expectedStatus !== 'N/A'
      ? HTTP_STATUS_TEXT[Number(expectedStatus)] ?? ''
      : '';
  const actualStatusText =
    HTTP_STATUS_TEXT[failure.actual_status] ?? '';

  // Build the error summary line for "What Happened"
  const errorSummaryLine =
    errorInfo.code && errorInfo.message
      ? `\n\nThe server returned error code \`${errorInfo.code}\`: "${errorInfo.message}"`
      : errorInfo.message
        ? `\n\nThe server responded with: "${errorInfo.message}"`
        : '';

  const categoryNarrative = generateCategoryNarrative(
    category,
    failure,
    errorInfo,
  );
  const expectedVsActualTable = buildExpectedVsActualTable(mismatches);
  const serverErrorDetails = formatServerErrorDetails(errorInfo);
  const rootCauseHints = generateRootCauseHints(
    category,
    failure,
    errorInfo,
  );
  const impactAssessment = generateImpactAssessment(category, failure);
  const curlCommand = buildCurlCommand(failure);
  const formattedTimestamp = formatTimestamp(failure.timestamp);
  const durationLine =
    failure.duration_ms !== undefined
      ? `\n**Response Time:** ${failure.duration_ms}ms`
      : '';

  return `## What Happened

The test "${failure.test_case_name}" sent a ${failure.method} request to \`${failure.endpoint}\` expecting a ${expectedStatus}${expectedStatusText ? ` ${expectedStatusText}` : ''} response, but received **${failure.actual_status} ${actualStatusText}** instead.${errorSummaryLine}

${categoryNarrative}

## Expected vs Actual

| Aspect | Expected | Actual |
|--------|----------|--------|
${expectedVsActualTable}

## Server Response

${serverErrorDetails}

## Likely Root Cause

${rootCauseHints}

## Impact

${impactAssessment}

## Reproduction

\`\`\`bash
${curlCommand}
\`\`\`

**Test:** ${failure.test_case_name}
**Execution:** \`${failure.execution_id}\`
**Timestamp:** ${formattedTimestamp}${durationLine}
**Route Group:** \`${routeGroup}\`

---
*Auto-generated by Bug Detector MCP | Labels: \`auto-generated\`, \`api-test\`, \`${routeGroupSlug(routeGroup)}\`, \`${category}\`*

${buildFingerprintMarker(fingerprint)}`;
}

export function generateBulkSummaryDescription(
  failures: FailureRecord[],
  routeGroup: string,
): string {
  const tableRows = failures
    .map(
      f =>
        `| ${f.method} | ${f.endpoint} | ${f.actual_status} | ${deriveShortErrorSummary(f)} |`,
    )
    .join('\n');

  return `## Systemic Failure Report

**Parent Route:** ${routeGroup}
**Total Failures:** ${failures.length}
**Timestamp:** ${new Date().toISOString()}

> More than ${BULK_LIMIT} failures were detected in a single analysis. This likely indicates a systemic issue.

## Failed Endpoints

| Method | Endpoint | Status | Error Summary |
|--------|----------|--------|---------------|
${tableRows}

## Reproduction

Re-trigger the parent route \`${routeGroup}\` test suite to verify.

---
*Auto-generated by Bug Detector MCP | Labels: \`auto-generated\`, \`api-test\`, \`${routeGroupSlug(routeGroup)}\`*`;
}

export function buildDedupSignature(failure: FailureRecord): string {
  const shortSummary = deriveShortErrorSummary(failure);
  return `${failure.method} ${failure.endpoint} \u2014 ${shortSummary}`;
}

export function buildSafeBulkHeading(
  routeGroup: string,
  failureCount: number,
): string {
  const heading = `[API Test Failure] ${routeGroup} \u2014 ${failureCount} failures detected (systemic issue)`;
  if (heading.length > 200) {
    return `${heading.slice(0, 197)}...`;
  }
  return heading;
}

/* ──────────────── Grouped Ticket Formatting ─────────────────────────── */

export function generateGroupedHeading(group: FailureGroup): string {
  const statusText =
    HTTP_STATUS_TEXT[group.actual_status] ?? `Status ${group.actual_status}`;
  const routeGroup = group.failures[0].route_group;
  const heading = `[API Test Failure] ${routeGroup} \u2014 ${group.failures.length} endpoints returning ${group.actual_status} ${statusText}`;
  if (heading.length > 200) {
    return `${heading.slice(0, 197)}...`;
  }
  return heading;
}

export function generateGroupedDescription(
  group: FailureGroup,
  routeGroup: string,
): string {
  const tableRows = group.failures
    .map(
      f =>
        `| ${f.method} | ${f.endpoint} | ${f.actual_status} | ${f.test_case_name} | ${deriveShortErrorSummary(f)} |`,
    )
    .join('\n');

  // Compute a group fingerprint from sorted individual fingerprints
  const individualFingerprints = group.failures
    .map(f => computeFailureFingerprint(f))
    .sort()
    .join(',');
  const groupFingerprintRaw = crypto
    .createHash('sha256')
    .update(individualFingerprints)
    .digest('hex')
    .slice(0, 16);

  const statusText =
    HTTP_STATUS_TEXT[group.actual_status] ?? `Status ${group.actual_status}`;

  return `## Grouped Failure Report

**Parent Route:** ${routeGroup}
**Root Cause:** ${group.failures.length} endpoints returning ${group.actual_status} ${statusText}
**Category:** \`${group.category}\`
**Timestamp:** ${new Date().toISOString()}

## Affected Endpoints

| Method | Endpoint | Status | Test Name | Error Summary |
|--------|----------|--------|-----------|---------------|
${tableRows}

## Reproduction

Re-trigger the parent route \`${routeGroup}\` test suite to verify.

---
*Auto-generated by Bug Detector MCP | Labels: \`auto-generated\`, \`api-test\`, \`${routeGroupSlug(routeGroup)}\`, \`${group.category}\`*

${buildFingerprintMarker(groupFingerprintRaw)}`;
}
