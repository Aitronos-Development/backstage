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
import yaml from 'js-yaml';

const MAX_RESOLUTION_DEPTH = 5;
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Resolves `{{variable_name}}` placeholders in strings and objects.
 * Throws on unresolved variables. Detects cycles via depth limiting.
 */
export function resolveVariables(
  template: string | Record<string, unknown>,
  variables: Record<string, string>,
): string | Record<string, unknown> {
  if (typeof template === 'string') {
    return resolveString(template, variables);
  }
  return resolveObject(template, variables);
}

function resolveString(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;

  for (let depth = 0; depth < MAX_RESOLUTION_DEPTH; depth++) {
    const previous = result;
    result = result.replace(VARIABLE_PATTERN, (_, key) => {
      if (key in variables) return variables[key];
      throw new Error(`Variable '{{${key}}}' not found in any layer`);
    });
    if (result === previous || !VARIABLE_PATTERN.test(result)) break;
    VARIABLE_PATTERN.lastIndex = 0;
  }

  VARIABLE_PATTERN.lastIndex = 0;
  const remaining = VARIABLE_PATTERN.exec(result);
  if (remaining) {
    throw new Error(
      `Variable resolution exceeded maximum depth (${MAX_RESOLUTION_DEPTH}). ` +
        `Possible circular reference involving '{{${remaining[1]}}}'`,
    );
  }

  return result;
}

function resolveObject(
  obj: Record<string, unknown>,
  variables: Record<string, string>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      resolved[key] = resolveString(value, variables);
    } else if (Array.isArray(value)) {
      resolved[key] = value.map(item => {
        if (typeof item === 'string') return resolveString(item, variables);
        if (typeof item === 'object' && item !== null) {
          return resolveObject(item as Record<string, unknown>, variables);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveObject(
        value as Record<string, unknown>,
        variables,
      );
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

interface SetupStep {
  name: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  capture: Record<string, string>; // varName -> responseJsonPath
  allowFailure?: boolean; // if true, step failure is logged but doesn't abort
}

interface ApiTestingEnvironment {
  baseUrl: string;
  variables: Record<string, string>;
  setup?: SetupStep[];
}

interface ApiTestingConfig {
  defaultEnvironment: string;
  environments: Record<string, ApiTestingEnvironment>;
}

/**
 * Read the apiTesting section from app-config.yaml.
 * The MCP server runs as a standalone process, so it reads the file directly.
 */
export function readAppConfig(): ApiTestingConfig {
  const result: ApiTestingConfig = {
    defaultEnvironment: 'develop',
    environments: {},
  };

  // Walk up from cwd to find app-config.yaml
  let dir = process.cwd();
  let configPath: string | undefined;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'app-config.yaml');
    if (fs.existsSync(candidate)) {
      configPath = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (!configPath) return result;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;
    const apiTesting = parsed?.apiTesting as
      | Record<string, unknown>
      | undefined;
    if (!apiTesting) return result;

    result.defaultEnvironment =
      (apiTesting.defaultEnvironment as string) ?? 'develop';

    const envs = apiTesting.environments as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (envs) {
      for (const [name, env] of Object.entries(envs)) {
        const setupRaw = env.setup as Array<Record<string, unknown>> | undefined;
        const setup: SetupStep[] | undefined = setupRaw?.map(s => {
          const step: SetupStep = {
            name: (s.name as string) ?? '',
            method: (s.method as string) ?? 'GET',
            path: (s.path as string) ?? '',
            capture: (s.capture as Record<string, string>) ?? {},
          };
          if (s.headers) step.headers = s.headers as Record<string, string>;
          if (s.body) step.body = s.body as Record<string, unknown>;
          if (s.allowFailure) step.allowFailure = true;
          return step;
        });

        result.environments[name] = {
          baseUrl: (env.baseUrl as string) ?? '',
          variables: (env.variables as Record<string, string>) ?? {},
          ...(setup && setup.length > 0 && { setup }),
        };
      }
    }
  } catch {
    // Config file missing or malformed — use defaults
  }

  return result;
}

/**
 * Extract a value from a JSON object using a dot-notation path.
 * e.g. "access_token" → obj.access_token
 *      "data.org_id"  → obj.data.org_id
 */
function extractJsonPath(obj: unknown, jsonPath: string): unknown {
  let current: unknown = obj;
  for (const segment of jsonPath.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// Cache setup results per environment to avoid re-authenticating on every run
const SETUP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const setupCache = new Map<
  string,
  { variables: Record<string, string>; expiresAt: number }
>();

/**
 * Execute environment-level setup steps (e.g. authenticate, create test data).
 * Each step is an HTTP call whose response values can be captured as variables.
 * Steps run sequentially; later steps can use variables captured by earlier ones.
 * Results are cached per environment for SETUP_CACHE_TTL_MS.
 */
async function executeSetupSteps(
  envName: string,
  steps: SetupStep[],
  baseUrl: string,
  baseVariables: Record<string, string>,
): Promise<Record<string, string>> {
  // Check cache
  const cached = setupCache.get(envName);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.variables };
  }

  const variables = { ...baseVariables };

  for (const step of steps) {
    const resolvedPath = resolveVariables(step.path, variables) as string;
    const url = `${baseUrl}${resolvedPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (step.headers) {
      const resolved = resolveVariables(step.headers, variables) as Record<
        string,
        unknown
      >;
      for (const [k, v] of Object.entries(resolved)) {
        headers[k] = String(v);
      }
    }

    const fetchOptions: RequestInit = {
      method: step.method,
      headers,
    };

    if (step.body && ['POST', 'PUT', 'PATCH'].includes(step.method)) {
      const resolvedBody = resolveVariables(
        step.body as Record<string, unknown>,
        variables,
      );
      fetchOptions.body = JSON.stringify(resolvedBody);
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const body = await response.json();

      // Capture values from response
      for (const [varName, jsonPathStr] of Object.entries(step.capture)) {
        const value = extractJsonPath(body, jsonPathStr);
        if (value !== undefined && value !== null) {
          variables[varName] = String(value);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (step.allowFailure) {
        // Step is optional (e.g. register may fail if user already exists)
        // Log and continue to next step
        console.warn(
          `Setup step '${step.name}' failed (allowFailure=true, continuing): ${message}`,
        );
      } else {
        throw new Error(
          `Environment setup step '${step.name}' failed: ${message}`,
        );
      }
    }
  }

  // Cache the result
  setupCache.set(envName, {
    variables: { ...variables },
    expiresAt: Date.now() + SETUP_CACHE_TTL_MS,
  });

  return variables;
}

/**
 * Build the merged variables map for MCP execution:
 * app-config environment variables < setup captures < variable_overrides
 */
export async function buildMcpVariables(
  overrides?: Record<string, string>,
): Promise<Record<string, string>> {
  const config = readAppConfig();
  const envName = config.defaultEnvironment;
  const envConfig = config.environments[envName];
  let merged: Record<string, string> = {};

  if (envConfig) {
    if (envConfig.baseUrl) merged.base_url = envConfig.baseUrl;
    Object.assign(merged, envConfig.variables);

    // Run environment setup steps (e.g. authenticate)
    if (envConfig.setup && envConfig.setup.length > 0) {
      merged = await executeSetupSteps(
        envName,
        envConfig.setup,
        envConfig.baseUrl,
        merged,
      );
    }
  }

  if (overrides) {
    Object.assign(merged, overrides);
  }

  return merged;
}
