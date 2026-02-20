import fs from 'fs';
import path from 'path';
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

interface ApiTestingEnvironment {
  baseUrl: string;
  variables: Record<string, string>;
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
    const apiTesting = parsed?.apiTesting as Record<string, unknown> | undefined;
    if (!apiTesting) return result;

    result.defaultEnvironment =
      (apiTesting.defaultEnvironment as string) ?? 'develop';

    const envs = apiTesting.environments as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (envs) {
      for (const [name, env] of Object.entries(envs)) {
        result.environments[name] = {
          baseUrl: (env.baseUrl as string) ?? '',
          variables: (env.variables as Record<string, string>) ?? {},
        };
      }
    }
  } catch {
    // Config file missing or malformed — use defaults
  }

  return result;
}

/**
 * Build the merged variables map for MCP execution:
 * app-config environment variables < variable_overrides
 */
export function buildMcpVariables(
  overrides?: Record<string, string>,
): Record<string, string> {
  const config = readAppConfig();
  const envName = config.defaultEnvironment;
  const envConfig = config.environments[envName];
  const merged: Record<string, string> = {};

  if (envConfig) {
    if (envConfig.baseUrl) merged.base_url = envConfig.baseUrl;
    Object.assign(merged, envConfig.variables);
  }

  if (overrides) {
    Object.assign(merged, overrides);
  }

  return merged;
}
