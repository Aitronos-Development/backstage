const MAX_RESOLUTION_DEPTH = 5;
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Resolves `{{variable_name}}` placeholders in strings and objects.
 *
 * Recursively walks the input. For every string value, replaces placeholders
 * using the provided variables map. Supports nested references (a variable
 * value may itself contain `{{...}}` placeholders). Detects cycles / deep
 * nesting by limiting resolution passes to MAX_RESOLUTION_DEPTH.
 *
 * Throws a descriptive error when a variable cannot be resolved.
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
    result = result.replace(VARIABLE_PATTERN, (match, key) => {
      if (key in variables) return variables[key];
      throw new Error(`Variable '{{${key}}}' not found in any layer`);
    });
    // Nothing changed or no more placeholders — done
    if (result === previous || !VARIABLE_PATTERN.test(result)) break;
    // Reset lastIndex since we reuse the regex
    VARIABLE_PATTERN.lastIndex = 0;
  }

  // After max passes, check for remaining placeholders (circular reference)
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

/**
 * Extract all `{{variable_name}}` placeholders from a test case's path,
 * headers, and body. Useful for the frontend to show which variables a
 * test case uses.
 */
export function extractVariablePlaceholders(testCase: {
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}): string[] {
  const found = new Set<string>();

  function scan(value: unknown): void {
    if (typeof value === 'string') {
      VARIABLE_PATTERN.lastIndex = 0;
      let match;
      while ((match = VARIABLE_PATTERN.exec(value)) !== null) {
        found.add(match[1]);
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) {
        scan(v);
      }
    }
  }

  scan(testCase.path);
  if (testCase.headers) scan(testCase.headers);
  if (testCase.body) scan(testCase.body);

  return Array.from(found).sort();
}
