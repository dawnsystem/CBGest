import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('appwrite');

import { userAdminService } from '../userAdminService';
import { functions } from '../../lib/appwrite/client';

describe('userAdminService', () => {
  const createExecutionMock = vi.mocked(functions.createExecution);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockExecution = (body: unknown, statusCode = 200) => ({
    $id: 'execution123',
    functionId: 'manage-users',
    status: 'completed',
    responseStatusCode: statusCode,
    responseBody: JSON.stringify(body),
    duration: 0.2,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  it('lists users via the manage-users function', async () => {
    createExecutionMock.mockResolvedValueOnce(mockExecution({
      success: true,
      users: [
        { id: 'u1', name: 'Ana', email: 'ana@test.com', labels: ['admin'], status: true, registration: '', passwordUpdate: '', mustChangePassword: false },
      ],
    }));

    const users = await userAdminService.listUsers();

    expect(createExecutionMock).toHaveBeenCalledWith('manage-users', JSON.stringify({ action: 'list' }), false);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('ana@test.com');
  });

  it('creates a user with a temporary password and role label', async () => {
    createExecutionMock.mockResolvedValueOnce(mockExecution({
      success: true,
      user: { id: 'u2', name: 'Nuevo', email: 'nuevo@test.com', labels: ['comunero'], status: true, registration: '', passwordUpdate: '', mustChangePassword: true },
    }));

    const created = await userAdminService.createUser('nuevo@test.com', 'Nuevo', 'xK9_mPqR2nVwL0sT8uAbCd', ['comunero']);

    expect(createExecutionMock).toHaveBeenCalledWith(
      'manage-users',
      JSON.stringify({ action: 'create', email: 'nuevo@test.com', name: 'Nuevo', password: 'xK9_mPqR2nVwL0sT8uAbCd', labels: ['comunero'] }),
      false
    );
    expect(created?.mustChangePassword).toBe(true);
  });

  it('resets a password and marks mustChangePassword', async () => {
    createExecutionMock.mockResolvedValueOnce(mockExecution({ success: true }));

    await expect(userAdminService.resetPassword('u2', 'nuevaTempSegura_16ch')).resolves.toBeUndefined();

    expect(createExecutionMock).toHaveBeenCalledWith(
      'manage-users',
      JSON.stringify({ action: 'resetPassword', userId: 'u2', password: 'nuevaTempSegura_16ch' }),
      false
    );
  });

  it('deletes a user', async () => {
    createExecutionMock.mockResolvedValueOnce(mockExecution({ success: true }));

    await expect(userAdminService.deleteUser('u2')).resolves.toBeUndefined();

    expect(createExecutionMock).toHaveBeenCalledWith(
      'manage-users',
      JSON.stringify({ action: 'delete', userId: 'u2' }),
      false
    );
  });

  it('throws a readable error when the function denies access (non-admin)', async () => {
    createExecutionMock.mockResolvedValueOnce(mockExecution({
      success: false,
      error: 'Solo un administrador puede gestionar usuarios.',
    }, 403));

    await expect(userAdminService.listUsers()).rejects.toThrow('Solo un administrador puede gestionar usuarios.');
  });

  it('throws when the response body cannot be parsed', async () => {
    createExecutionMock.mockResolvedValueOnce({
      $id: 'execution123',
      functionId: 'manage-users',
      status: 'completed',
      responseStatusCode: 200,
      responseBody: 'not-json',
      duration: 0.2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(userAdminService.listUsers()).rejects.toThrow('Respuesta inválida');
  });
});
