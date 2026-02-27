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

export const SENSITIVE_KEY_PATTERN =
  /^(password|secret|token|api[_-]?key|apikey|api[-_]?secret|authorization|credit[_-]?card|ssn)$/i;

const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'cookie'];

export function redactSensitiveFields(
  obj: unknown,
  redactedValue: string = '[REDACTED]',
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj))
    return obj.map(v => redactSensitiveFields(v, redactedValue));
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>,
    )) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? redactedValue
        : redactSensitiveFields(value, redactedValue);
    }
    return result;
  }
  return obj;
}

export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_HEADERS.includes(key.toLowerCase())
      ? '[REDACTED]'
      : value;
  }
  return result;
}

export function truncateBody(
  body: unknown,
  maxLen: number = 2000,
): string {
  if (body === null || body === undefined) return 'N/A';
  const serialized =
    typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  if (serialized.length > maxLen) {
    return `${serialized.slice(0, maxLen)}... [truncated]`;
  }
  return serialized;
}
