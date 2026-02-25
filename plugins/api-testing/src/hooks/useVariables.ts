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
  EnvironmentOverrides,
  ResolvedVariable,
  VariableSource,
} from '../api/types';

const ENVIRONMENT_STORAGE_KEY = 'backstage:api-testing:environment';

function readSelectedEnvironment(): string | null {
  return localStorage.getItem(ENVIRONMENT_STORAGE_KEY);
}

function writeSelectedEnvironment(env: string): void {
  localStorage.setItem(ENVIRONMENT_STORAGE_KEY, env);
}

export function useVariables() {
  const client = useApiTestingClient();
  const [config, setConfig] = useState<ApiTestingConfig | null>(null);
  const [overrides, setOverrides] = useState<EnvironmentOverrides | null>(null);
  const [runtimeOverrides, setRuntimeOverrides] = useState<
    Record<string, string>
  >({});
  const [selectedEnvironment, setSelectedEnvironmentState] = useState<string>(
    () => readSelectedEnvironment() ?? '',
  );
  const [loading, setLoading] = useState(true);

  // Fetch config + overrides from backend
  const fetchAll = useCallback(async () => {
    try {
      const [cfg, ovr] = await Promise.all([
        client.getConfig(),
        client.getConfigOverrides(),
      ]);
      setConfig(cfg);
      setOverrides(ovr);
      return cfg;
    } catch {
      return null;
    }
  }, [client]);

  // Initial fetch on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await fetchAll();
      if (!cancelled && cfg) {
        setSelectedEnvironmentState(
          prev =>
            prev ||
            cfg.defaultEnvironment ||
            Object.keys(cfg.environments)[0] ||
            '',
        );
        setLoading(false);
      } else if (!cancelled) {
        setLoading(false);
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

  // Config variables for the active environment (from merged config)
  const configVariables = useMemo<Record<string, string>>(() => {
    if (!config || !activeEnvironment) return {};
    const envConfig = config.environments[activeEnvironment];
    if (!envConfig) return {};
    const vars: Record<string, string> = {};
    if (envConfig.baseUrl) vars.base_url = envConfig.baseUrl;
    Object.assign(vars, envConfig.variables);
    return vars;
  }, [config, activeEnvironment]);

  // Saved overrides for the active environment (from JSON file)
  const savedOverrides = useMemo<Record<string, string>>(() => {
    if (!overrides || !activeEnvironment) return {};
    const envOverride = overrides.environments[activeEnvironment];
    if (!envOverride) return {};
    const vars: Record<string, string> = {};
    if (envOverride.baseUrl) vars.base_url = envOverride.baseUrl;
    Object.assign(vars, envOverride.variables);
    return vars;
  }, [overrides, activeEnvironment]);

  // Resolved variable table with source tracking
  const resolvedVariables = useMemo<ResolvedVariable[]>(() => {
    const result = new Map<string, ResolvedVariable>();

    // Layer 1: app-config (lowest priority — all merged values start as config)
    for (const [key, value] of Object.entries(configVariables)) {
      result.set(key, { key, value, source: 'app-config' });
    }

    // Layer 2: mark variables that come from saved overrides
    for (const key of Object.keys(savedOverrides)) {
      if (result.has(key)) {
        result.set(key, { key, value: result.get(key)!.value, source: 'saved' });
      }
    }

    // Layer 3: runtime overrides (highest priority)
    for (const [key, value] of Object.entries(runtimeOverrides)) {
      result.set(key, { key, value, source: 'runtime' });
    }

    return Array.from(result.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }, [configVariables, savedOverrides, runtimeOverrides]);

  // Merged variables map (for passing to execution)
  const mergedVariables = useMemo<Record<string, string>>(() => {
    const merged: Record<string, string> = {};
    Object.assign(merged, configVariables);
    Object.assign(merged, runtimeOverrides);
    return merged;
  }, [configVariables, runtimeOverrides]);

  // Server-side override CRUD (replaces localStorage)
  const setSavedOverride = useCallback(
    async (key: string, value: string) => {
      if (!activeEnvironment) return;
      // Optimistic update
      setOverrides(prev => {
        if (!prev) return prev;
        const envOvr = prev.environments[activeEnvironment] ?? {
          baseUrl: '',
          variables: {},
        };
        return {
          ...prev,
          environments: {
            ...prev.environments,
            [activeEnvironment]: {
              ...envOvr,
              variables: { ...envOvr.variables, [key]: value },
            },
          },
        };
      });
      // Persist to server
      const current = overrides?.environments[activeEnvironment];
      await client.putEnvironment(activeEnvironment, {
        baseUrl: current?.baseUrl ?? config?.environments[activeEnvironment]?.baseUrl ?? '',
        variables: { ...(current?.variables ?? {}), [key]: value },
      });
      await fetchAll();
    },
    [activeEnvironment, overrides, config, client, fetchAll],
  );

  const removeSavedOverride = useCallback(
    async (key: string) => {
      if (!activeEnvironment) return;
      const current = overrides?.environments[activeEnvironment];
      if (!current) return;
      const newVars = { ...current.variables };
      delete newVars[key];
      await client.putEnvironment(activeEnvironment, {
        baseUrl: current.baseUrl,
        variables: newVars,
      });
      await fetchAll();
    },
    [activeEnvironment, overrides, client, fetchAll],
  );

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
      if (key in savedOverrides) return 'saved';
      if (key in configVariables) return 'app-config';
      return undefined;
    },
    [runtimeOverrides, savedOverrides, configVariables],
  );

  // Refresh callback for external components (e.g. EnvironmentSettingsPanel)
  const refreshConfig = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  return {
    loading,
    config,
    overrides,
    environments,
    activeEnvironment,
    setSelectedEnvironment,
    configVariables,
    savedOverrides,
    runtimeOverrides,
    resolvedVariables,
    mergedVariables,
    setSavedOverride,
    removeSavedOverride,
    setRuntimeOverride,
    removeRuntimeOverride,
    clearRuntimeOverrides,
    getVariableSource,
    refreshConfig,
  };
}
