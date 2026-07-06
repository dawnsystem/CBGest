import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('appwrite');

import { AppwriteException } from 'appwrite';
import { authService, setAuthCallbacks } from '../authService';
import { account } from '../../lib/appwrite/client';

// authService uses a 5000ms grace period after login; we wait slightly longer
// so tests assert the post-grace behavior deterministically.
const AUTH_GRACE_PERIOD_BUFFER_MS = 5200;
const waitForGracePeriodToExpire = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, AUTH_GRACE_PERIOD_BUFFER_MS));

describe('authService direct coverage', () => {
  const getMock = vi.mocked(account.get);
  const createSessionMock = vi.mocked(account.createEmailPasswordSession);
  const deleteSessionMock = vi.mocked(account.deleteSession);
  const deleteSessionsMock = vi.mocked(account.deleteSessions);
  const updateNameMock = vi.mocked(account.updateName);
  const createRecoveryMock = vi.mocked(account.createRecovery);
  const listSessionsMock = vi.mocked(account.listSessions);
  const createVerificationMock = vi.mocked(account.createVerification);
  const updateVerificationMock = vi.mocked(account.updateVerification);
  const createJWTMock = vi.mocked(account.createJWT);

  beforeEach(() => {
    vi.clearAllMocks();
    setAuthCallbacks({});

    getMock.mockResolvedValue({
      $id: 'user123',
      email: 'test@example.com',
      name: 'Test User',
      emailVerification: true,
    } as Awaited<ReturnType<typeof account.get>>);
  });

  it('should return null when there is no active session', async () => {
    getMock.mockRejectedValueOnce(new AppwriteException('missing', 401));

    await expect(authService.getCurrentUser()).resolves.toBeNull();
  });

  it('should login and emit session ready callback', async () => {
    const onSessionReady = vi.fn();
    setAuthCallbacks({ onSessionReady });

    const result = await authService.login('test@example.com', 'secret');

    expect(result.success).toBe(true);
    expect(result.user?.email).toBe('test@example.com');
    expect(createSessionMock).toHaveBeenCalledWith('test@example.com', 'secret');
    expect(onSessionReady).toHaveBeenCalledTimes(1);
    expect(deleteSessionMock).toHaveBeenCalledWith('current');
  });

  it('should treat session as valid during grace period after login', async () => {
    await authService.login('test@example.com', 'secret');
    getMock.mockRejectedValueOnce(new AppwriteException('expired', 401));

    await expect(authService.verifySession()).resolves.toBe(true);
  });

  it('should notify session expiration when verification fails outside grace period', async () => {
    const onSessionExpired = vi.fn();
    setAuthCallbacks({ onSessionExpired });
    await waitForGracePeriodToExpire();
    getMock.mockRejectedValueOnce(new AppwriteException('expired', 401));

    await expect(authService.verifySession()).resolves.toBe(false);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  }, 15000);

  it('should not expire session on unauthorized collection error if account is still valid', async () => {
    const onSessionExpired = vi.fn();
    setAuthCallbacks({ onSessionExpired });

    await authService.handleUnauthorizedError();

    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('should expire session on unauthorized error when account check also fails', async () => {
    const onSessionExpired = vi.fn();
    setAuthCallbacks({ onSessionExpired });
    await waitForGracePeriodToExpire();
    getMock.mockRejectedValueOnce(new AppwriteException('expired', 401));

    await authService.handleUnauthorizedError();

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  }, 15000);

  it('should NOT expire session when verification fails with network error (non-401)', async () => {
    const onSessionExpired = vi.fn();
    setAuthCallbacks({ onSessionExpired });
    await waitForGracePeriodToExpire();
    // Simulate a network error (no code) during the account.get() verification
    getMock.mockRejectedValueOnce(new Error('Failed to fetch'));

    await authService.handleUnauthorizedError();

    // Should NOT call onSessionExpired because the error is transient, not auth-related
    expect(onSessionExpired).not.toHaveBeenCalled();
  }, 15000);

  it('should propagate network errors from getCurrentUser', async () => {
    getMock.mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(authService.getCurrentUser()).rejects.toThrow('Failed to fetch');
  });

  it('should map active sessions from Appwrite', async () => {
    const sessions = await authService.getSessions();

    expect(listSessionsMock).toHaveBeenCalledTimes(1);
    expect(sessions).toEqual([
      {
        sessionId: 'session123',
        userId: 'user123',
        provider: 'email',
        expire: '2099-01-01T00:00:00.000Z',
        current: true,
      },
    ]);
  });

  it('should support profile and recovery helpers', async () => {
    await expect(authService.updateName('Nuevo Nombre')).resolves.toMatchObject({ name: 'Nuevo Nombre' });
    await expect(authService.recoverPassword('test@example.com', 'https://cbgest.test/reset')).resolves.toBe(true);
    await expect(authService.sendEmailVerification('https://cbgest.test/verify')).resolves.toBe(true);
    await expect(authService.confirmEmailVerification('user123', 'secret')).resolves.toBe(true);
    await expect(authService.createJWT()).resolves.toBe('jwt-token');

    expect(updateNameMock).toHaveBeenCalledWith('Nuevo Nombre');
    expect(createRecoveryMock).toHaveBeenCalledWith('test@example.com', 'https://cbgest.test/reset');
    expect(createVerificationMock).toHaveBeenCalledWith('https://cbgest.test/verify');
    expect(updateVerificationMock).toHaveBeenCalledWith('user123', 'secret');
    expect(createJWTMock).toHaveBeenCalledTimes(1);
  });

  it('should logout current and all sessions', async () => {
    await expect(authService.logout()).resolves.toBe(true);
    await expect(authService.logoutAll()).resolves.toBe(true);

    expect(deleteSessionMock).toHaveBeenCalledWith('current');
    expect(deleteSessionsMock).toHaveBeenCalledTimes(1);
  });

  it('should expose retryability helpers', () => {
    expect(authService.isSessionError(new AppwriteException('expired', 401))).toBe(true);
    expect(authService.isRetryableError(new AppwriteException('rate limit', 429))).toBe(false);
    expect(authService.isRetryableError(new Error('network'))).toBe(true);
  });
});
