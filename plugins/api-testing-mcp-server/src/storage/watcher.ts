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
import { EventEmitter } from 'node:events';
import { getApiTestsDir, invalidateCache } from './fileStore';

export interface TestCaseChangeEvent {
  routeGroup: string;
  filename: string;
}

class TestCaseWatcher extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;
  private pollInterval: NodeJS.Timeout | null = null;

  start(): void {
    const dir = getApiTestsDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      this.watcher = fs.watch(dir, (_eventType, filename) => {
        if (filename && filename.endsWith('.json') && !filename.endsWith('.tmp')) {
          this.handleChange(filename);
        }
      });

      this.watcher.on('error', () => {
        // Fall back to polling if fs.watch fails
        this.watcher?.close();
        this.watcher = null;
        this.startPolling();
      });
    } catch {
      // fs.watch not available, fall back to polling
      this.startPolling();
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private startPolling(): void {
    const dir = getApiTestsDir();
    const mtimes = new Map<string, number>();

    // Seed initial state
    this.scanFiles(dir, mtimes);

    this.pollInterval = setInterval(() => {
      this.scanFiles(dir, mtimes);
    }, 1000);
  }

  private scanFiles(
    dir: string,
    mtimes: Map<string, number>,
  ): void {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const filename of files) {
      const filePath = path.join(dir, filename);
      try {
        const stat = fs.statSync(filePath);
        const prevMtime = mtimes.get(filename);
        if (prevMtime !== undefined && stat.mtimeMs !== prevMtime) {
          this.handleChange(filename);
        }
        mtimes.set(filename, stat.mtimeMs);
      } catch {
        // File may have been deleted between readdir and stat
      }
    }

    // Check for deleted files
    for (const tracked of mtimes.keys()) {
      if (!files.includes(tracked)) {
        mtimes.delete(tracked);
        this.handleChange(tracked);
      }
    }
  }

  private handleChange(filename: string): void {
    const routeGroup =
      `/${ 
      filename
        .replace(/\.json$/, '')
        .replace(/-/g, '/')}`;

    invalidateCache(routeGroup);

    this.emit('test-cases-changed', {
      routeGroup,
      filename,
    } satisfies TestCaseChangeEvent);
  }
}

export const watcher = new TestCaseWatcher();
