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
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApiTestingClient } from './useTestCases';
import type {
  ApiTestingConfig,
  ResolvedVariable,
  VariableSource,
} from '../api/types';

const LOCAL_STORAGE_KEY = 'backstage:api-testing:variables';
const ENVIRONMENT_STORAGE_KEY = 'backstage:api-testing:environment';

function readLocalStorageVars(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalStorageVars(vars: Record<string, string>): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(vars));
}

function readSelectedEnvironment(): string | null {
  return localStorage.getItem(ENVIRONMENT_STORAGE_KEY);
}

function writeSelectedEnvironment(env: string): void {
  localStorage.setItem(ENVIRONMENT_STORAGE_KEY, env);
}

export function useVariables() {
  const client = useApiTestingClient();
  const [config, setConfig] = useState<ApiTestingConfig | null>(null);
  const [localOverrides, setLocalOverrides] =
    useState<Record<string, string>>(readLocalStorageVars);
  const [runtimeOverrides, setRuntimeOverrides] = useState<
    Record<string, string>
  >({});
  const [selectedEnvironment, setSelectedEnvironmentState] = useState<string>(
    () => readSelectedEnvironment() ?? '',
  );
  const [loading, setLoading] = useState(true);

  // Fetch config from backend (run once on mount)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await client.getConfig();
        if (!cancelled) {
          setConfig(cfg);
          // Set default environment if not yet selected
          setSelectedEnvironmentState(
            prev =>
              prev ||
              cfg.defaultEnvironment ||
              Object.keys(cfg.environments)[0] ||
              '',
          );
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Environment selection
  const environments = useMemo(
    () => (config ? Object.keys(config.environments) : []),
    [config],
  );

  const activeEnvironment =
    selectedEnvironment || config?.defaultEnvironment || '';

  const setSelectedEnvironment = useCallback((env: string) => {
    setSelectedEnvironmentState(env);
    writeSelectedEnvironment(env);
  }, []);

  // Config variables for the active environment
  const configVariables = useMemo<Record<string, string>>(() => {
    if (!config || !activeEnvironment) return {};
    const envConfig = config.environments[activeEnvironment];
    if (!envConfig) return {};
    const vars: Record<string, string> = {};
    if (envConfig.baseUrl) vars.base_url = envConfig.baseUrl;
    Object.assign(vars, envConfig.variables);
    return vars;
  }, [config, activeEnvironment]);

  // Resolved variable table with source tracking
  const resolvedVariables = useMemo<ResolvedVariable[]>(() => {
    const result = new Map<string, ResolvedVariable>();

    // Layer 1: app-config (lowest priority)
    for (const [key, value] of Object.entries(configVariables)) {
      result.set(key, { key, value, source: 'app-config' });
    }

    // Layer 2: localStorage overrides
    for (const [key, value] of Object.entries(localOverrides)) {
      result.set(key, { key, value, source: 'localStorage' });
    }

    // Layer 3: runtime overrides (highest priority)
    for (const [key, value] of Object.entries(runtimeOverrides)) {
      result.set(key, { key, value, source: 'runtime' });
    }

    return Array.from(result.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }, [configVariables, localOverrides, runtimeOverrides]);

  // Merged variables map (for passing to execution)
  const mergedVariables = useMemo<Record<string, string>>(() => {
    const merged: Record<string, string> = {};
    // app-config < localStorage < runtime
    Object.assign(merged, configVariables);
    Object.assign(merged, localOverrides);
    Object.assign(merged, runtimeOverrides);
    return merged;
  }, [configVariables, localOverrides, runtimeOverrides]);

  // localStorage CRUD
  const setLocalOverride = useCallback((key: string, value: string) => {
    setLocalOverrides(prev => {
      const next = { ...prev, [key]: value };
      writeLocalStorageVars(next);
      return next;
    });
  }, []);

  const removeLocalOverride = useCallback((key: string) => {
    setLocalOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      writeLocalStorageVars(next);
      return next;
    });
  }, []);

  // Runtime override management
  const setRuntimeOverride = useCallback((key: string, value: string) => {
    setRuntimeOverrides(prev => ({ ...prev, [key]: value }));
  }, []);

  const removeRuntimeOverride = useCallback((key: string) => {
    setRuntimeOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearRuntimeOverrides = useCallback(() => {
    setRuntimeOverrides({});
  }, []);

  // Helper: get the source of a variable's current value
  const getVariableSource = useCallback(
    (key: string): VariableSource | undefined => {
      if (key in runtimeOverrides) return 'runtime';
      if (key in localOverrides) return 'localStorage';
      if (key in configVariables) return 'app-config';
      return undefined;
    },
    [runtimeOverrides, localOverrides, configVariables],
  );

  return {
    loading,
    config,
    environments,
    activeEnvironment,
    setSelectedEnvironment,
    configVariables,
    localOverrides,
    runtimeOverrides,
    resolvedVariables,
    mergedVariables,
    setLocalOverride,
    removeLocalOverride,
    setRuntimeOverride,
    removeRuntimeOverride,
    clearRuntimeOverrides,
    getVariableSource,
  };
}
