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
import fs from 'node:fs';
import path from 'node:path';
import type { RouteGroupFile, TestCase } from './types';

// eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
const API_TESTS_DIR = path.resolve(__dirname, '../../../../test-repositories/Freddy.Backend.Tests/test-suites');

const cache = new Map<string, RouteGroupFile>();

function routeGroupToFilename(routeGroup: string): string {
  return `${routeGroup.replace(/^\//, '').replace(/\//g, '-')  }.json`;
}

function getFilePath(routeGroup: string): string {
  return path.join(API_TESTS_DIR, routeGroupToFilename(routeGroup));
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

export function invalidateCache(routeGroup: string): void {
  cache.delete(routeGroup);
}

export async function listTestCases(routeGroup: string): Promise<TestCase[]> {
  const data = loadRouteGroup(routeGroup);
  return data.test_cases;
}

export async function readTestCase(
  routeGroup: string,
  testCaseId: string,
): Promise<TestCase | undefined> {
  const data = loadRouteGroup(routeGroup);
  return data.test_cases.find(tc => tc.id === testCaseId);
}

export function getApiTestsDir(): string {
  return API_TESTS_DIR;
}
