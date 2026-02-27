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

export interface LedgerEntry {
  execution_id: string;
  processed_at: string;
  ticket_number: string;
  fingerprint: string;
}

const LEDGER_FILE = path.join(HISTORY_DIR, '.bug-detector-ledger.jsonl');
const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function ensureDir(): void {
  const dir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Read all entries from the ledger. */
export function readLedger(): LedgerEntry[] {
  if (!fs.existsSync(LEDGER_FILE)) return [];
  const content = fs.readFileSync(LEDGER_FILE, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  const entries: LedgerEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip corrupt lines
    }
  }
  return entries;
}

/** Append an entry to the ledger. */
export function appendLedger(entry: LedgerEntry): void {
  ensureDir();
  fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(entry)}\n`, 'utf-8');
}

/** Check if an execution ID has already been processed. */
export function isExecutionProcessed(executionId: string): boolean {
  const entries = readLedger();
  return entries.some(e => e.execution_id === executionId);
}

/**
 * Remove ledger entries older than 30 days.
 * Should be called at startup.
 */
export function pruneLedger(): void {
  if (!fs.existsSync(LEDGER_FILE)) return;
  const entries = readLedger();
  const cutoff = Date.now() - PRUNE_AGE_MS;
  const kept = entries.filter(
    e => new Date(e.processed_at).getTime() > cutoff,
  );

  if (kept.length === entries.length) return;

  ensureDir();
  const content = kept.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(LEDGER_FILE, content ? `${content}\n` : '', 'utf-8');
}
