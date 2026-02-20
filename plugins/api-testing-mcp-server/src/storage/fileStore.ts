import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { RouteGroupFile, TestCase } from './types';

const API_TESTS_DIR = path.resolve(
  __dirname,
  '../../../../api-tests',
);

// In-memory cache: route_group -> RouteGroupFile
const cache = new Map<string, RouteGroupFile>();

// Per-file lock to prevent concurrent writes
const locks = new Map<string, Promise<void>>();

function generateId(): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(6);
  let id = 'tc-';
  for (let i = 0; i < 6; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

function routeGroupToFilename(routeGroup: string): string {
  return (
    routeGroup
      .replace(/^\//, '')
      .replace(/\//g, '-') + '.json'
  );
}

function getFilePath(routeGroup: string): string {
  return path.join(API_TESTS_DIR, routeGroupToFilename(routeGroup));
}

function ensureDir(): void {
  if (!fs.existsSync(API_TESTS_DIR)) {
    fs.mkdirSync(API_TESTS_DIR, { recursive: true });
  }
}

async function withLock<T>(
  routeGroup: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = locks.get(routeGroup);
  let resolve: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  locks.set(routeGroup, promise);

  if (existing) {
    await existing;
  }

  try {
    return await fn();
  } finally {
    resolve!();
    if (locks.get(routeGroup) === promise) {
      locks.delete(routeGroup);
    }
  }
}

export function loadRouteGroup(routeGroup: string): RouteGroupFile {
  const cached = cache.get(routeGroup);
  if (cached) return cached;

  const filePath = getFilePath(routeGroup);
  if (!fs.existsSync(filePath)) {
    const empty: RouteGroupFile = {
      route_group: routeGroup,
      test_cases: [],
    };
    cache.set(routeGroup, empty);
    return empty;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const data: RouteGroupFile = JSON.parse(raw);
  cache.set(routeGroup, data);
  return data;
}

function saveRouteGroup(routeGroup: string, data: RouteGroupFile): void {
  ensureDir();
  const filePath = getFilePath(routeGroup);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmpPath, filePath);
  cache.set(routeGroup, data);
}

export function invalidateCache(routeGroup: string): void {
  cache.delete(routeGroup);
}

export function routeGroupExists(routeGroup: string): boolean {
  return fs.existsSync(getFilePath(routeGroup));
}

export async function listTestCases(
  routeGroup: string,
): Promise<TestCase[]> {
  const data = loadRouteGroup(routeGroup);
  return data.test_cases;
}

export async function readTestCase(
  routeGroup: string,
  testCaseId: string,
): Promise<TestCase | null> {
  const data = loadRouteGroup(routeGroup);
  return data.test_cases.find(tc => tc.id === testCaseId) ?? null;
}

export async function createTestCase(
  routeGroup: string,
  input: {
    name: string;
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    assertions: TestCase['assertions'];
  },
): Promise<TestCase> {
  return withLock(routeGroup, async () => {
    const data = loadRouteGroup(routeGroup);
    const now = new Date().toISOString();
    const testCase: TestCase = {
      id: generateId(),
      name: input.name,
      method: input.method,
      path: input.path,
      ...(input.headers && { headers: input.headers }),
      ...(input.body && { body: input.body }),
      assertions: input.assertions,
      created_at: now,
      updated_at: now,
    };
    data.test_cases.push(testCase);
    saveRouteGroup(routeGroup, data);
    return testCase;
  });
}

export type EditableField =
  | 'name'
  | 'method'
  | 'path'
  | 'headers'
  | 'body'
  | 'assertions';

function deepMerge(target: unknown, source: unknown): unknown {
  if (
    typeof target === 'object' &&
    target !== null &&
    !Array.isArray(target) &&
    typeof source === 'object' &&
    source !== null &&
    !Array.isArray(source)
  ) {
    const result = { ...(target as Record<string, unknown>) };
    for (const key of Object.keys(source as Record<string, unknown>)) {
      result[key] = deepMerge(
        result[key],
        (source as Record<string, unknown>)[key],
      );
    }
    return result;
  }
  return source;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findAndReplace(
  obj: unknown,
  oldVal: unknown,
  newVal: unknown,
  replaceAll: boolean,
): { result: unknown; replaced: boolean } {
  const oldStr = JSON.stringify(obj);
  const searchStr = JSON.stringify(oldVal);
  const replaceStr = JSON.stringify(newVal);

  if (!oldStr.includes(searchStr)) {
    return { result: obj, replaced: false };
  }

  let newStr: string;
  if (replaceAll) {
    newStr = oldStr.split(searchStr).join(replaceStr);
  } else {
    newStr = oldStr.replace(searchStr, replaceStr);
  }
  return { result: JSON.parse(newStr), replaced: true };
}

export interface EditTestCaseInput {
  field: EditableField;
  new_value: unknown;
  old_value?: unknown;
  replace_all?: boolean;
  merge?: boolean;
}

export async function editTestCase(
  routeGroup: string,
  testCaseId: string,
  input: EditTestCaseInput,
): Promise<TestCase> {
  return withLock(routeGroup, async () => {
    const data = loadRouteGroup(routeGroup);
    const idx = data.test_cases.findIndex(tc => tc.id === testCaseId);
    if (idx === -1) {
      throw new Error(`Test case '${testCaseId}' not found in '${routeGroup}'`);
    }

    const tc = { ...data.test_cases[idx] };
    const currentValue = tc[input.field];
    const { field, new_value, old_value, replace_all, merge } = input;

    if (merge) {
      // Merge modes
      if (
        typeof currentValue !== 'object' ||
        currentValue === null ||
        Array.isArray(currentValue)
      ) {
        throw new Error(
          `Cannot merge into field '${field}': current value is not an object`,
        );
      }
      if (old_value !== undefined) {
        // Validate old_value matches relevant parts of current state
        if (typeof old_value === 'object' && old_value !== null) {
          for (const key of Object.keys(old_value as Record<string, unknown>)) {
            const currentField = (currentValue as Record<string, unknown>)[key];
            const expectedField = (old_value as Record<string, unknown>)[key];
            if (!deepEqual(currentField, expectedField)) {
              throw new Error(
                `Optimistic concurrency conflict on field '${field}.${key}': ` +
                  `expected ${JSON.stringify(expectedField)}, ` +
                  `but current value is ${JSON.stringify(currentField)}`,
              );
            }
          }
        } else if (!deepEqual(currentValue, old_value)) {
          throw new Error(
            `Optimistic concurrency conflict on field '${field}': ` +
              `expected ${JSON.stringify(old_value)}, ` +
              `but current value is ${JSON.stringify(currentValue)}`,
          );
        }
      }
      (tc as Record<string, unknown>)[field] = deepMerge(
        currentValue,
        new_value,
      );
    } else if (old_value !== undefined) {
      // Find-replace mode
      const { result, replaced } = findAndReplace(
        currentValue,
        old_value,
        new_value,
        replace_all ?? false,
      );
      if (!replaced) {
        throw new Error(
          `Could not find ${JSON.stringify(old_value)} in field '${field}'. ` +
            `Current value: ${JSON.stringify(currentValue)}`,
        );
      }
      (tc as Record<string, unknown>)[field] = result;
    } else {
      // Simple replace mode
      (tc as Record<string, unknown>)[field] = new_value;
    }

    tc.updated_at = new Date().toISOString();
    data.test_cases[idx] = tc;
    saveRouteGroup(routeGroup, data);
    return tc;
  });
}

export async function deleteTestCase(
  routeGroup: string,
  testCaseId: string,
): Promise<void> {
  return withLock(routeGroup, async () => {
    const data = loadRouteGroup(routeGroup);
    const idx = data.test_cases.findIndex(tc => tc.id === testCaseId);
    if (idx === -1) {
      throw new Error(`Test case '${testCaseId}' not found in '${routeGroup}'`);
    }
    data.test_cases.splice(idx, 1);
    saveRouteGroup(routeGroup, data);
  });
}

export function getApiTestsDir(): string {
  return API_TESTS_DIR;
}
