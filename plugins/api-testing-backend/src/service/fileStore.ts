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

const API_TESTS_DIR = path.resolve(
  // eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
  __dirname,
  '../../../../test-repositories/Freddy.Backend.Tests/test-suites',
);

const FLOW_REGISTRATIONS_PATH = path.resolve(
  // eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
  __dirname,
  '../../../../test-repositories/Freddy.Backend.Tests/flow-test-registrations.json',
);

const cache = new Map<string, RouteGroupFile>();
let flowRegistrationsCache: TestCase[] | undefined;

function routeGroupToFilename(routeGroup: string): string {
  return `${routeGroup.replace(/^\//, '').replace(/\//g, '-')}.json`;
}

function getFilePath(routeGroup: string): string {
  return path.join(API_TESTS_DIR, routeGroupToFilename(routeGroup));
}

function loadFlowRegistrations(): TestCase[] {
  if (flowRegistrationsCache) return flowRegistrationsCache;

  if (!fs.existsSync(FLOW_REGISTRATIONS_PATH)) {
    flowRegistrationsCache = [];
    return flowRegistrationsCache;
  }

  const raw = fs.readFileSync(FLOW_REGISTRATIONS_PATH, 'utf-8');
  flowRegistrationsCache = JSON.parse(raw) as TestCase[];
  return flowRegistrationsCache;
}

function getFlowTestsForRouteGroup(routeGroup: string): TestCase[] {
  const registrations = loadFlowRegistrations();
  // Extract domain from route group, handling both "/v1/model" and encoded "/v1-model"
  const clean = routeGroup.replace(/^\//, '').replace(/\/$/, '');
  // Try slash-separated first (e.g. "v1/model" → "model"), fall back to dash-separated
  const segments = clean.includes('/') ? clean.split('/') : clean.split('-');
  const domain = segments[segments.length - 1];
  if (!domain) return [];

  return registrations.filter(
    tc =>
      tc.flow_metadata?.markers?.includes(domain),
  );
}

export function loadRouteGroup(routeGroup: string): RouteGroupFile {
  const cached = cache.get(routeGroup);
  if (cached) return cached;

  const filePath = getFilePath(routeGroup);
  let data: RouteGroupFile;

  if (!fs.existsSync(filePath)) {
    data = {
      route_group: routeGroup,
      test_cases: [],
    };
  } else {
    const raw = fs.readFileSync(filePath, 'utf-8');
    data = JSON.parse(raw);
  }

  // Merge flow tests from the central registrations file, deduplicating by id
  const flowTests = getFlowTestsForRouteGroup(routeGroup);
  if (flowTests.length > 0) {
    const existingIds = new Set(data.test_cases.map(tc => tc.id));
    for (const ft of flowTests) {
      if (!existingIds.has(ft.id)) {
        data.test_cases.push(ft);
      }
    }
  }

  cache.set(routeGroup, data);
  return data;
}

export function invalidateCache(routeGroup: string): void {
  cache.delete(routeGroup);
  flowRegistrationsCache = undefined;
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
