import fs from 'fs';
import path from 'path';
import type { RouteGroupFile, TestCase } from './types';

const API_TESTS_DIR = path.resolve(__dirname, '../../../../api-tests');

const cache = new Map<string, RouteGroupFile>();

function routeGroupToFilename(routeGroup: string): string {
  return routeGroup.replace(/^\//, '').replace(/\//g, '-') + '.json';
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
