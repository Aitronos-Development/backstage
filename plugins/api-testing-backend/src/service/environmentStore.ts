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

export interface EnvironmentOverride {
  baseUrl: string;
  variables: Record<string, string>;
}

export interface EnvironmentOverrides {
  defaultEnvironment?: string;
  environments: Record<string, EnvironmentOverride>;
}

// eslint-disable-next-line no-restricted-syntax -- resolving relative to package source directory
const CONFIG_DIR = path.resolve(__dirname, '../../../../.api-testing-config');
const ENVIRONMENTS_FILE = path.join(CONFIG_DIR, 'environments.json');

function ensureDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

const EMPTY_OVERRIDES: EnvironmentOverrides = { environments: {} };

export function readOverrides(): EnvironmentOverrides {
  if (!fs.existsSync(ENVIRONMENTS_FILE)) {
    return { ...EMPTY_OVERRIDES, environments: {} };
  }
  try {
    const raw = fs.readFileSync(ENVIRONMENTS_FILE, 'utf-8');
    return JSON.parse(raw) as EnvironmentOverrides;
  } catch {
    return { ...EMPTY_OVERRIDES, environments: {} };
  }
}

function writeOverrides(data: EnvironmentOverrides): void {
  ensureDir();
  const tmp = `${ENVIRONMENTS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, ENVIRONMENTS_FILE);
}

export function putEnvironment(
  name: string,
  override: EnvironmentOverride,
): void {
  const data = readOverrides();
  data.environments[name] = override;
  writeOverrides(data);
}

export function deleteEnvironment(name: string): void {
  const data = readOverrides();
  delete data.environments[name];
  if (data.defaultEnvironment === name) {
    delete data.defaultEnvironment;
  }
  writeOverrides(data);
}

export function setDefaultEnvironment(name: string): void {
  const data = readOverrides();
  data.defaultEnvironment = name;
  writeOverrides(data);
}
