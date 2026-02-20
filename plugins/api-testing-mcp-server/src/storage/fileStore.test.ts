import fs from 'fs';
import path from 'path';
import os from 'os';

// We need to mock the API_TESTS_DIR before importing fileStore
let testDir: string;

jest.mock('./fileStore', () => {
  // Create a fresh temp dir for each test suite
  const actualModule = jest.requireActual('./fileStore');
  return actualModule;
});

// Override the directory by mocking path.resolve for the specific call
let originalResolve: typeof path.resolve;

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-tests-'));
  originalResolve = path.resolve;

  // Intercept path.resolve to redirect the api-tests dir
  jest.spyOn(path, 'resolve').mockImplementation((...args: string[]) => {
    const result = originalResolve(...args);
    if (result.endsWith('/api-tests')) {
      return testDir;
    }
    return result;
  });
});

afterAll(() => {
  jest.restoreAllMocks();
  fs.rmSync(testDir, { recursive: true, force: true });
});

// Dynamic import after mock setup
let fileStore: typeof import('./fileStore');

beforeEach(async () => {
  // Clear any cached modules and reimport
  jest.resetModules();
  fileStore = await import('./fileStore');

  // Clean the test directory
  const files = fs.readdirSync(testDir);
  for (const file of files) {
    fs.unlinkSync(path.join(testDir, file));
  }
});

describe('fileStore', () => {
  describe('createTestCase', () => {
    it('creates a test case and persists it to disk', async () => {
      const tc = await fileStore.createTestCase('/v1/rules', {
        name: 'Create rule returns 201',
        method: 'POST',
        path: '/v1/rules',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'test-rule' },
        assertions: { status_code: 201 },
      });

      expect(tc.id).toMatch(/^tc-[a-z0-9]{6}$/);
      expect(tc.name).toBe('Create rule returns 201');
      expect(tc.method).toBe('POST');
      expect(tc.created_at).toBeDefined();
      expect(tc.updated_at).toBe(tc.created_at);

      // Verify file exists on disk
      const filePath = path.join(testDir, 'v1-rules.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.route_group).toBe('/v1/rules');
      expect(raw.test_cases).toHaveLength(1);
      expect(raw.test_cases[0].id).toBe(tc.id);
    });

    it('appends to existing test cases', async () => {
      await fileStore.createTestCase('/v1/rules', {
        name: 'First',
        method: 'GET',
        path: '/v1/rules',
        assertions: {},
      });
      await fileStore.createTestCase('/v1/rules', {
        name: 'Second',
        method: 'POST',
        path: '/v1/rules',
        assertions: { status_code: 201 },
      });

      const list = await fileStore.listTestCases('/v1/rules');
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('First');
      expect(list[1].name).toBe('Second');
    });
  });

  describe('listTestCases', () => {
    it('returns empty array for non-existent route group', async () => {
      const list = await fileStore.listTestCases('/v1/nonexistent');
      expect(list).toEqual([]);
    });

    it('returns all test cases for a route group', async () => {
      await fileStore.createTestCase('/v1/auth', {
        name: 'Login',
        method: 'POST',
        path: '/v1/auth/login',
        assertions: { status_code: 200 },
      });

      const list = await fileStore.listTestCases('/v1/auth');
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Login');
    });
  });

  describe('readTestCase', () => {
    it('returns null for non-existent test case', async () => {
      const result = await fileStore.readTestCase('/v1/rules', 'tc-missing');
      expect(result).toBeNull();
    });

    it('returns the test case by ID', async () => {
      const created = await fileStore.createTestCase('/v1/rules', {
        name: 'Read test',
        method: 'GET',
        path: '/v1/rules/1',
        assertions: { status_code: 200 },
      });

      const result = await fileStore.readTestCase('/v1/rules', created.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
      expect(result!.name).toBe('Read test');
    });
  });

  describe('editTestCase', () => {
    let testCaseId: string;

    beforeEach(async () => {
      const tc = await fileStore.createTestCase('/v1/rules', {
        name: 'Original name',
        method: 'POST',
        path: '/v1/rules',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer old_token',
        },
        body: { name: 'old_rule', description: 'A test rule' },
        assertions: {
          status_code: 200,
          body_contains: { name: 'old_rule' },
          body_schema: { required_fields: ['id', 'name'] },
        },
      });
      testCaseId = tc.id;
    });

    it('replaces an entire field', async () => {
      const updated = await fileStore.editTestCase('/v1/rules', testCaseId, {
        field: 'name',
        new_value: 'Updated name',
      });

      expect(updated.name).toBe('Updated name');
      expect(updated.updated_at).toBeDefined();
      // Verify the update persisted
      const read = await fileStore.readTestCase('/v1/rules', testCaseId);
      expect(read!.name).toBe('Updated name');
    });

    it('find-replaces within a field', async () => {
      const updated = await fileStore.editTestCase('/v1/rules', testCaseId, {
        field: 'body',
        old_value: 'old_rule',
        new_value: 'updated_rule',
        replace_all: true,
      });

      expect((updated.body as Record<string, unknown>).name).toBe(
        'updated_rule',
      );
    });

    it('deep-merges into an object field', async () => {
      const updated = await fileStore.editTestCase('/v1/rules', testCaseId, {
        field: 'headers',
        new_value: { Authorization: 'Bearer new_token' },
        merge: true,
      });

      expect(updated.headers!.Authorization).toBe('Bearer new_token');
      expect(updated.headers!['Content-Type']).toBe('application/json');
    });

    it('deep-merges with old_value validation', async () => {
      const updated = await fileStore.editTestCase('/v1/rules', testCaseId, {
        field: 'assertions',
        old_value: { status_code: 200 },
        new_value: { status_code: 201 },
        merge: true,
      });

      expect(updated.assertions.status_code).toBe(201);
      expect(updated.assertions.body_contains).toEqual({ name: 'old_rule' });
      expect(updated.assertions.body_schema).toEqual({
        required_fields: ['id', 'name'],
      });
    });

    it('rejects merge when old_value does not match', async () => {
      await expect(
        fileStore.editTestCase('/v1/rules', testCaseId, {
          field: 'assertions',
          old_value: { status_code: 999 },
          new_value: { status_code: 201 },
          merge: true,
        }),
      ).rejects.toThrow(/Optimistic concurrency conflict/);
    });

    it('rejects find-replace when old_value not found', async () => {
      await expect(
        fileStore.editTestCase('/v1/rules', testCaseId, {
          field: 'name',
          old_value: 'nonexistent',
          new_value: 'replacement',
        }),
      ).rejects.toThrow(/Could not find/);
    });

    it('rejects merge on non-object fields', async () => {
      await expect(
        fileStore.editTestCase('/v1/rules', testCaseId, {
          field: 'name',
          new_value: { key: 'value' },
          merge: true,
        }),
      ).rejects.toThrow(/Cannot merge into field 'name'/);
    });

    it('errors for non-existent test case', async () => {
      await expect(
        fileStore.editTestCase('/v1/rules', 'tc-missing', {
          field: 'name',
          new_value: 'new',
        }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('deleteTestCase', () => {
    it('deletes an existing test case', async () => {
      const tc = await fileStore.createTestCase('/v1/rules', {
        name: 'To delete',
        method: 'DELETE',
        path: '/v1/rules/1',
        assertions: {},
      });

      await fileStore.deleteTestCase('/v1/rules', tc.id);

      const list = await fileStore.listTestCases('/v1/rules');
      expect(list).toHaveLength(0);
    });

    it('errors for non-existent test case', async () => {
      await expect(
        fileStore.deleteTestCase('/v1/rules', 'tc-missing'),
      ).rejects.toThrow(/not found/);
    });
  });
});
