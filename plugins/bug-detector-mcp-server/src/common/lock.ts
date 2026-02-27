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
import { HISTORY_DIR } from './history';

const LOCK_FILE = path.join(HISTORY_DIR, '.bug-detector.lock');
const STALE_MS = 30_000; // force release after 30 seconds
const RETRY_DELAY_BASE_MS = 100;
const MAX_RETRIES = 5;

function ensureDir(): void {
  const dir = path.dirname(LOCK_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Acquire a file-based lock. Returns a release function.
 * Uses mkdir as an atomic lock primitive — mkdir fails if the dir already exists.
 * Retries with exponential backoff. Stale locks (>30s) are force-released.
 */
async function acquireLock(): Promise<() => void> {
  ensureDir();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // mkdir is atomic on most filesystems
      fs.mkdirSync(LOCK_FILE);
      // Write PID and timestamp for stale detection
      fs.writeFileSync(
        path.join(LOCK_FILE, 'info'),
        JSON.stringify({ pid: process.pid, acquired: Date.now() }),
      );
      return () => {
        try {
          fs.rmSync(LOCK_FILE, { recursive: true, force: true });
        } catch {
          // best effort cleanup
        }
      };
    } catch {
      // Lock directory already exists — check if stale
      try {
        const infoPath = path.join(LOCK_FILE, 'info');
        if (fs.existsSync(infoPath)) {
          const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
          if (Date.now() - info.acquired > STALE_MS) {
            // Stale lock — force release
            fs.rmSync(LOCK_FILE, { recursive: true, force: true });
            continue; // retry immediately
          }
        }
      } catch {
        // If we can't read info, try to force-release stale lock
        try {
          const stat = fs.statSync(LOCK_FILE);
          if (Date.now() - stat.mtimeMs > STALE_MS) {
            fs.rmSync(LOCK_FILE, { recursive: true, force: true });
            continue;
          }
        } catch {
          // lock dir gone — retry
          continue;
        }
      }

      if (attempt < MAX_RETRIES) {
        const delay =
          RETRY_DELAY_BASE_MS * Math.pow(2, attempt) +
          Math.random() * RETRY_DELAY_BASE_MS;
        await sleep(delay);
      }
    }
  }

  throw new Error(
    'Failed to acquire bug-detector lock after maximum retries',
  );
}

/**
 * Execute a function while holding the bug-detector file lock.
 * Only one instance of the locked function runs at a time.
 */
export async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock();
  try {
    return await fn();
  } finally {
    release();
  }
}
