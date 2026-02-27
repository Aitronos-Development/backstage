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

/**
 * Normalize variable parts out of an error reason string so that
 * the same logical error always produces the same fingerprint.
 */
export function normalizeError(reason: string): string {
  return reason
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '{uuid}',
    )
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '{timestamp}')
    .replace(/request[_-]?id[:\s]*\S+/gi, 'request_id:{id}')
    .trim()
    .toLowerCase();
}

/**
 * Compute a deterministic fingerprint for a failure based on its
 * method, endpoint, status code, and normalized error reason.
 * Returns a 16-character hex string (first 16 chars of SHA-256).
 */
export function computeFailureFingerprint(failure: FailureRecord): string {
  const raw = `${failure.method}|${failure.endpoint}|${failure.actual_status}|${normalizeError(failure.failure_reason)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/** HTML comment marker embedded in ticket descriptions for fingerprint lookup. */
export function buildFingerprintMarker(fingerprint: string): string {
  return `<!-- bug-detector-fingerprint:${fingerprint} -->`;
}

/** Extract the fingerprint from a ticket description, or null if not found. */
export function extractFingerprint(
  description: string | null,
): string | null {
  if (!description) return null;
  const match = description.match(
    /<!-- bug-detector-fingerprint:([a-f0-9]{16}) -->/,
  );
  return match ? match[1] : null;
}
