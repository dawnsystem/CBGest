/**
 * @fileoverview Tests de la función manage-users (SEC-016 / BUG-026).
 * @description Cubre rechazo de contraseñas predecibles, generación server-side
 *              y rollback cuando updatePrefs falla tras create.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsers = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  updateLabels: vi.fn(),
  updatePrefs: vi.fn(),
  updatePassword: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Client: class {
    setEndpoint() { return this; }
    setProject() { return this; }
    setKey() { return this; }
  },
  Users: class {
    get(...args: unknown[]) { return mockUsers.get(...args); }
    list(...args: unknown[]) { return mockUsers.list(...args); }
    create(...args: unknown[]) { return mockUsers.create(...args); }
    updateLabels(...args: unknown[]) { return mockUsers.updateLabels(...args); }
    updatePrefs(...args: unknown[]) { return mockUsers.updatePrefs(...args); }
    updatePassword(...args: unknown[]) { return mockUsers.updatePassword(...args); }
    delete(...args: unknown[]) { return mockUsers.delete(...args); }
  },
}));

const makeRes = () => {
  const calls: Array<{ payload: unknown; status?: number }> = [];
  return {
    calls,
    json: vi.fn((payload: unknown, statusCode = 200) => {
      calls.push({ payload, status: statusCode });
      return { payload, status: statusCode };
    }),
  };
};

const adminCaller = {
  $id: 'admin-1',
  labels: ['admin'],
  prefs: { mustChangePassword: false },
};

describe('manage-users (SEC-016 / BUG-026)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.APPWRITE_FUNCTION_PROJECT_ID = 'proj';
    process.env.APPWRITE_API_KEY = 'key';
    mockUsers.get.mockResolvedValue(adminCaller);
  });

  it('rejects unauthenticated callers', async () => {
    const { default: manageUsers } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await manageUsers({
      req: { headers: {}, body: '{}' },
      res,
      log: vi.fn(),
      error: vi.fn(),
    });
    expect(res.calls[0].status).toBe(401);
  });

  it('rejects weak legacy temporary passwords on create (SEC-016)', async () => {
    const { default: manageUsers } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await manageUsers({
      req: {
        headers: { 'x-appwrite-user-id': 'admin-1' },
        bodyJson: {
          action: 'create',
          email: 'a@test.com',
          name: 'Ana',
          password: 'cambiar123',
          labels: ['comunero'],
        },
      },
      res,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(res.calls[0].status).toBe(400);
    expect(String((res.calls[0].payload as { error: string }).error)).toMatch(/predecible|16/i);
    expect(mockUsers.create).not.toHaveBeenCalled();
  });

  it('creates a user with mustChangePassword and returns success', async () => {
    mockUsers.create.mockResolvedValueOnce({
      $id: 'u-new',
      name: 'Ana',
      email: 'a@test.com',
      labels: [],
      status: true,
      registration: '',
      passwordUpdate: '',
      prefs: {},
    });
    mockUsers.updateLabels.mockResolvedValueOnce({});
    mockUsers.updatePrefs.mockResolvedValueOnce({});

    const { default: manageUsers } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await manageUsers({
      req: {
        headers: { 'x-appwrite-user-id': 'admin-1' },
        bodyJson: {
          action: 'create',
          email: 'a@test.com',
          name: 'Ana',
          password: 'xK9_mPqR2nVwL0sT8uAbCd',
          labels: ['comunero'],
        },
      },
      res,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(res.calls[0].status).toBe(200);
    expect((res.calls[0].payload as { success: boolean; user: { mustChangePassword: boolean } }).success).toBe(true);
    expect((res.calls[0].payload as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(true);
    expect(mockUsers.updatePrefs).toHaveBeenCalled();
  });

  it('rolls back (deletes) the user if updatePrefs fails after create (BUG-026)', async () => {
    mockUsers.create.mockResolvedValueOnce({
      $id: 'u-orphan',
      name: 'Orphan',
      email: 'o@test.com',
      labels: [],
      status: true,
      registration: '',
      passwordUpdate: '',
      prefs: {},
    });
    mockUsers.updateLabels.mockResolvedValueOnce({});
    mockUsers.updatePrefs.mockRejectedValueOnce(new Error('prefs failed'));
    mockUsers.delete.mockResolvedValueOnce({});

    const { default: manageUsers } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await manageUsers({
      req: {
        headers: { 'x-appwrite-user-id': 'admin-1' },
        bodyJson: {
          action: 'create',
          email: 'o@test.com',
          name: 'Orphan',
          password: 'xK9_mPqR2nVwL0sT8uAbCd',
          labels: ['comunero'],
        },
      },
      res,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(mockUsers.delete).toHaveBeenCalledWith({ userId: 'u-orphan' });
    expect(res.calls[0].status).toBe(500);
    expect((res.calls[0].payload as { success: boolean }).success).toBe(false);
  });

  it('blocks an admin who still has mustChangePassword pending', async () => {
    mockUsers.get.mockResolvedValueOnce({
      $id: 'admin-1',
      labels: ['admin'],
      prefs: { mustChangePassword: true },
    });

    const { default: manageUsers } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await manageUsers({
      req: {
        headers: { 'x-appwrite-user-id': 'admin-1' },
        bodyJson: { action: 'list' },
      },
      res,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(res.calls[0].status).toBe(403);
    expect(String((res.calls[0].payload as { error: string }).error)).toMatch(/contraseña temporal/i);
  });
});
