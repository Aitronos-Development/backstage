import fs from 'fs';
import path from 'path';
import os from 'os';

let testDir: string;
let originalResolve: typeof path.resolve;

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-tests-e2e-'));
  originalResolve = path.resolve;
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

let fileStore: typeof import('./fileStore');

beforeEach(async () => {
  jest.resetModules();
  fileStore = await import('./fileStore');
});

describe('Phase 2 end-to-end', () => {
  it('full CRUD lifecycle: create → read → edit → read → delete', async () => {
    // 1. Create a test case
    const created = await fileStore.createTestCase('/v1/rules', {
      name: 'Create rule with valid payload returns 201',
      method: 'POST',
      path: '/v1/rules',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{auth_token}}',
      },
      body: {
        name: 'test-rule',
        description: 'A test rule',
        conditions: [],
      },
      assertions: {
        status_code: 201,
        body_contains: { name: 'test-rule' },
        body_schema: { required_fields: ['id', 'name', 'created_at'] },
      },
    });

    expect(created.id).toMatch(/^tc-/);

    // Verify the file on disk
    const filePath = path.join(testDir, 'v1-rules.json');
    const onDisk1 = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(onDisk1.test_cases).toHaveLength(1);
    expect(onDisk1.test_cases[0].name).toBe(
      'Create rule with valid payload returns 201',
    );

    // 2. Read it back
    const read1 = await fileStore.readTestCase('/v1/rules', created.id);
    expect(read1).not.toBeNull();
    expect(read1!.headers!.Authorization).toBe('Bearer {{auth_token}}');

    // 3. Edit one header using merge
    await fileStore.editTestCase('/v1/rules', created.id, {
      field: 'headers',
      old_value: { Authorization: 'Bearer {{auth_token}}' },
      new_value: { Authorization: 'Bearer real_token_123' },
      merge: true,
    });

    // 4. Read again to confirm the edit
    const read2 = await fileStore.readTestCase('/v1/rules', created.id);
    expect(read2!.headers!.Authorization).toBe('Bearer real_token_123');
    expect(read2!.headers!['Content-Type']).toBe('application/json'); // preserved

    // Verify on disk
    const onDisk2 = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(onDisk2.test_cases[0].headers.Authorization).toBe(
      'Bearer real_token_123',
    );

    // 5. Delete it
    await fileStore.deleteTestCase('/v1/rules', created.id);

    // Verify on disk — file still exists but test_cases is empty
    const onDisk3 = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(onDisk3.test_cases).toHaveLength(0);

    // Verify read returns null
    const read3 = await fileStore.readTestCase('/v1/rules', created.id);
    expect(read3).toBeNull();
  });
});
