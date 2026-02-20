import fs from 'fs';
import os from 'os';
import path from 'path';
import * as historyStore from './historyStore';
import type { ExecutionRecord } from './historyTypes';

// Mock getApiTestsDir to use a temp directory
let tmpDir: string;

jest.mock('./fileStore', () => ({
  getApiTestsDir: () => tmpDir,
}));

function makeRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: historyStore.generateExecutionId(),
    timestamp: new Date().toISOString(),
    initiator: 'user',
    test_case_id: 'tc-1',
    test_case_name: 'Test one',
    route_group: '/v1/rules',
    result: 'pass',
    duration_ms: 42,
    request: {
      method: 'GET',
      url: 'http://localhost:7007/v1/rules',
      headers: { 'Content-Type': 'application/json' },
    },
    response: {
      status_code: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
    },
    failure_reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('historyStore', () => {
  describe('append and query', () => {
    it('appends a record and reads it back', async () => {
      const rec = makeRecord();
      await historyStore.append('/v1/rules', 'tc-1', rec);

      const results = await historyStore.query('/v1/rules', 'tc-1');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(rec.id);
      expect(results[0].result).toBe('pass');
    });

    it('returns most recent first', async () => {
      const r1 = makeRecord({ id: 'exec-0001', timestamp: '2026-01-01T00:00:00Z' });
      const r2 = makeRecord({ id: 'exec-0002', timestamp: '2026-01-02T00:00:00Z' });
      const r3 = makeRecord({ id: 'exec-0003', timestamp: '2026-01-03T00:00:00Z' });

      await historyStore.append('/v1/rules', 'tc-1', r1);
      await historyStore.append('/v1/rules', 'tc-1', r2);
      await historyStore.append('/v1/rules', 'tc-1', r3);

      const results = await historyStore.query('/v1/rules', 'tc-1');
      expect(results.map(r => r.id)).toEqual(['exec-0003', 'exec-0002', 'exec-0001']);
    });

    it('returns empty array for non-existent endpoint', async () => {
      const results = await historyStore.query('/v1/rules', 'does-not-exist');
      expect(results).toEqual([]);
    });
  });

  describe('filters', () => {
    beforeEach(async () => {
      const records = [
        makeRecord({ id: 'e1', initiator: 'user', result: 'pass', timestamp: '2026-01-01T00:00:00Z' }),
        makeRecord({ id: 'e2', initiator: 'agent', result: 'fail', timestamp: '2026-01-02T00:00:00Z' }),
        makeRecord({ id: 'e3', initiator: 'user', result: 'fail', timestamp: '2026-01-03T00:00:00Z' }),
        makeRecord({ id: 'e4', initiator: 'agent', result: 'pass', timestamp: '2026-01-04T00:00:00Z' }),
      ];
      for (const r of records) {
        await historyStore.append('/v1/rules', 'tc-1', r);
      }
    });

    it('filters by initiator', async () => {
      const results = await historyStore.query('/v1/rules', 'tc-1', { initiator: 'agent' });
      expect(results.map(r => r.id)).toEqual(['e4', 'e2']);
    });

    it('filters by result', async () => {
      const results = await historyStore.query('/v1/rules', 'tc-1', { result: 'fail' });
      expect(results.map(r => r.id)).toEqual(['e3', 'e2']);
    });

    it('combines initiator and result filters', async () => {
      const results = await historyStore.query('/v1/rules', 'tc-1', {
        initiator: 'user',
        result: 'fail',
      });
      expect(results.map(r => r.id)).toEqual(['e3']);
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) {
        await historyStore.append('/v1/rules', 'tc-1', makeRecord({
          id: `e${i}`,
          timestamp: `2026-01-0${i}T00:00:00Z`,
        }));
      }
    });

    it('respects limit', async () => {
      const results = await historyStore.query('/v1/rules', 'tc-1', { limit: 2 });
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('e5');
      expect(results[1].id).toBe('e4');
    });

    it('respects offset', async () => {
      const results = await historyStore.query('/v1/rules', 'tc-1', { limit: 2, offset: 2 });
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('e3');
      expect(results[1].id).toBe('e2');
    });
  });

  describe('tail', () => {
    it('returns last N records in reverse chronological order', async () => {
      for (let i = 1; i <= 5; i++) {
        await historyStore.append('/v1/rules', 'tc-1', makeRecord({
          id: `e${i}`,
          timestamp: `2026-01-0${i}T00:00:00Z`,
        }));
      }

      const results = await historyStore.tail('/v1/rules', 'tc-1', 3);
      // tail takes last 3 lines from the file (append order), then reverses
      expect(results.map(r => r.id)).toEqual(['e5', 'e4', 'e3']);
    });

    it('returns empty for non-existent endpoint', async () => {
      const results = await historyStore.tail('/v1/rules', 'missing', 5);
      expect(results).toEqual([]);
    });
  });

  describe('queryGroup', () => {
    it('aggregates records across multiple endpoints', async () => {
      await historyStore.append('/v1/rules', 'tc-1', makeRecord({
        id: 'a1',
        test_case_id: 'tc-1',
        timestamp: '2026-01-01T00:00:00Z',
      }));
      await historyStore.append('/v1/rules', 'tc-2', makeRecord({
        id: 'a2',
        test_case_id: 'tc-2',
        timestamp: '2026-01-03T00:00:00Z',
      }));
      await historyStore.append('/v1/rules', 'tc-1', makeRecord({
        id: 'a3',
        test_case_id: 'tc-1',
        timestamp: '2026-01-02T00:00:00Z',
      }));

      const results = await historyStore.queryGroup('/v1/rules');
      expect(results.map(r => r.id)).toEqual(['a2', 'a3', 'a1']);
    });

    it('returns empty for non-existent route group', async () => {
      const results = await historyStore.queryGroup('/v1/nothing');
      expect(results).toEqual([]);
    });
  });

  describe('buildExecutionRecord', () => {
    it('produces a valid record', () => {
      const record = historyStore.buildExecutionRecord({
        testCaseId: 'tc-1',
        testCaseName: 'Test one',
        routeGroup: '/v1/rules',
        initiator: 'user',
        durationMs: 100,
        pass: true,
        failureReason: null,
        request: {
          method: 'GET',
          url: 'http://localhost:7007/v1/rules',
          headers: { 'Content-Type': 'application/json' },
        },
        response: {
          status_code: 200,
          headers: { 'content-type': 'application/json' },
        },
      });

      expect(record.id).toMatch(/^exec-[0-9a-f]{8}$/);
      expect(record.result).toBe('pass');
      expect(record.initiator).toBe('user');
      expect(record.agent_identity).toBeUndefined();
    });

    it('includes agent_identity when provided', () => {
      const record = historyStore.buildExecutionRecord({
        testCaseId: 'tc-1',
        testCaseName: 'Test one',
        routeGroup: '/v1/rules',
        initiator: 'agent',
        agentIdentity: 'session-abc123',
        durationMs: 50,
        pass: false,
        failureReason: 'Expected 200, got 404',
        request: {
          method: 'GET',
          url: 'http://localhost:7007/v1/rules/123',
          headers: {},
        },
        response: {
          status_code: 404,
          headers: {},
        },
      });

      expect(record.agent_identity).toBe('session-abc123');
      expect(record.result).toBe('fail');
      expect(record.failure_reason).toBe('Expected 200, got 404');
    });

    it('masks Authorization header in request', () => {
      const record = historyStore.buildExecutionRecord({
        testCaseId: 'tc-1',
        testCaseName: 'Test',
        routeGroup: '/v1/rules',
        initiator: 'user',
        durationMs: 10,
        pass: true,
        failureReason: null,
        request: {
          method: 'GET',
          url: 'http://localhost:7007/v1/rules',
          headers: {
            Authorization: 'Bearer real-token-here',
            'Content-Type': 'application/json',
          },
        },
        response: {
          status_code: 200,
          headers: {},
        },
      });

      expect(record.request.headers['Authorization']).toBe('Bearer ***');
      expect(record.request.headers['Content-Type']).toBe('application/json');
    });

    it('masks authorization header case-insensitively', () => {
      const record = historyStore.buildExecutionRecord({
        testCaseId: 'tc-1',
        testCaseName: 'Test',
        routeGroup: '/v1/rules',
        initiator: 'user',
        durationMs: 10,
        pass: true,
        failureReason: null,
        request: {
          method: 'GET',
          url: 'http://localhost:7007/v1/rules',
          headers: {
            authorization: 'Bearer secret',
          },
        },
        response: {
          status_code: 200,
          headers: {},
        },
      });

      expect(record.request.headers['authorization']).toBe('Bearer ***');
    });
  });

  describe('generateExecutionId', () => {
    it('produces unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => historyStore.generateExecutionId()));
      expect(ids.size).toBe(100);
    });

    it('matches expected format', () => {
      const id = historyStore.generateExecutionId();
      expect(id).toMatch(/^exec-[0-9a-f]{8}$/);
    });
  });
});
