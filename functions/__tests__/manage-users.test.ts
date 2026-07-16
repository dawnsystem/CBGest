/** Tests manage-users — SEC-016/017, BUG-025/026 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsers = vi.hoisted(() => ({
  get: vi.fn(), list: vi.fn(), create: vi.fn(), updateLabels: vi.fn(),
  updatePrefs: vi.fn(), updatePassword: vi.fn(), delete: vi.fn(),
}));
const mockQuery = vi.hoisted(() => ({ limit: vi.fn((n: number) => `limit(${n})`), offset: vi.fn((n: number) => `offset(${n})`) }));

vi.mock('node-appwrite', () => ({
  Client: class { setEndpoint() { return this; } setProject() { return this; } setKey() { return this; } },
  Users: class {
    get(...a: unknown[]) { return mockUsers.get(...a); }
    list(...a: unknown[]) { return mockUsers.list(...a); }
    create(...a: unknown[]) { return mockUsers.create(...a); }
    updateLabels(...a: unknown[]) { return mockUsers.updateLabels(...a); }
    updatePrefs(...a: unknown[]) { return mockUsers.updatePrefs(...a); }
    updatePassword(...a: unknown[]) { return mockUsers.updatePassword(...a); }
    delete(...a: unknown[]) { return mockUsers.delete(...a); }
  },
  Query: mockQuery,
}));

const makeRes = () => {
  const calls: Array<{ payload: unknown; status?: number }> = [];
  return { calls, json: vi.fn((payload: unknown, status = 200) => { calls.push({ payload, status }); return { payload, status }; }) };
};
const adminCaller = { $id: 'admin-1', labels: ['admin'], prefs: { mustChangePassword: false } };

describe('manage-users PR-3', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    process.env.APPWRITE_FUNCTION_PROJECT_ID = 'proj'; process.env.APPWRITE_API_KEY = 'key';
    mockUsers.get.mockResolvedValue(adminCaller); mockUsers.list.mockResolvedValue({ users: [] });
  });

  it('BUG-026 rollback', async () => {
    mockUsers.create.mockResolvedValueOnce({ $id: 'u-1', name: 'X', email: 'x@t.com', labels: [], status: true, registration: '', passwordUpdate: '', prefs: {} });
    mockUsers.updateLabels.mockResolvedValueOnce({}); mockUsers.updatePrefs.mockRejectedValueOnce(new Error('fail')); mockUsers.delete.mockResolvedValueOnce({});
    const { default: fn } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await fn({ req: { headers: { 'x-appwrite-user-id': 'admin-1' }, bodyJson: { action: 'create', email: 'x@t.com', name: 'X', password: 'xK9_mPqR2nVwL0sT8uAbCd', labels: [] } }, res, log: vi.fn(), error: vi.fn() });
    expect(mockUsers.delete).toHaveBeenCalled();
  });

  it('BUG-025 pagina list', async () => {
    const p1 = Array.from({ length: 100 }, (_, i) => ({ $id: `u-${i}`, name: 'U', email: 'u@t.com', labels: [], status: true, registration: '', passwordUpdate: '', prefs: {} }));
    mockUsers.list.mockResolvedValueOnce({ users: p1 }).mockResolvedValueOnce({ users: [{ $id: 'u-100', name: 'U', email: 'u@t.com', labels: [], status: true, registration: '', passwordUpdate: '', prefs: {} }] });
    const { default: fn } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await fn({ req: { headers: { 'x-appwrite-user-id': 'admin-1' }, bodyJson: { action: 'list' } }, res, log: vi.fn(), error: vi.fn() });
    expect(mockUsers.list).toHaveBeenCalledTimes(2);
  });

  it('SEC-017 no self-demote', async () => {
    const { default: fn } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await fn({ req: { headers: { 'x-appwrite-user-id': 'admin-1' }, bodyJson: { action: 'updateLabels', userId: 'admin-1', labels: ['gestor'] } }, res, log: vi.fn(), error: vi.fn() });
    expect(res.calls[0].status).toBe(400);
  });

  it('SEC-017 no last admin', async () => {
    mockUsers.get.mockResolvedValueOnce({ $id: 'only', labels: ['admin'], prefs: {} });
    mockUsers.list.mockResolvedValueOnce({ users: [{ $id: 'only', labels: ['admin'] }] });
    const { default: fn } = await import('../manage-users/src/main.js');
    const res = makeRes();
    await fn({ req: { headers: { 'x-appwrite-user-id': 'admin-1' }, bodyJson: { action: 'updateLabels', userId: 'only', labels: ['gestor'] } }, res, log: vi.fn(), error: vi.fn() });
    expect(res.calls[0].status).toBe(400);
  });
});
