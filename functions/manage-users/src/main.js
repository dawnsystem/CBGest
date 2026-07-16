import { Client, Users, Query } from 'node-appwrite';
import { randomBytes } from 'crypto';

/** SEC-016/017, BUG-025/026 — ver BITACORA_MAESTRA.md */

const VALID_LABELS = ['admin', 'gestor', 'comunero'];
const USERS_PAGE_SIZE = 100;
const MIN_TEMP_PASSWORD_LENGTH = 16;
const TEMP_PASSWORD_ENTROPY_BYTES = 16;
const WEAK_TEMP_PASSWORD_PATTERN = /^cambiar\d{1,4}$/i;

const isAdminUser = (user) => Array.isArray(user?.labels) && user.labels.includes('admin');

const listAllUsers = async (users) => {
  const all = [];
  let offset = 0;
  while (true) {
    const response = await users.list({ queries: [Query.limit(USERS_PAGE_SIZE), Query.offset(offset)] });
    all.push(...response.users);
    if (response.users.length < USERS_PAGE_SIZE) break;
    offset += USERS_PAGE_SIZE;
  }
  return all;
};

const countOtherAdmins = (allUsers, excludeUserId) =>
  allUsers.filter((user) => user.$id !== excludeUserId && isAdminUser(user)).length;

const jsonResponse = (res, payload, statusCode = 200) => res.json(payload, statusCode);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const sanitizeLabels = (labels) => (Array.isArray(labels) ? labels.filter((l) => VALID_LABELS.includes(l)) : []);

const isAcceptableTemporaryPassword = (password) => {
  if (typeof password !== 'string') return false;
  const trimmed = password.trim();
  return trimmed.length >= MIN_TEMP_PASSWORD_LENGTH && !WEAK_TEMP_PASSWORD_PATTERN.test(trimmed);
};

const generateTemporaryPassword = () => {
  const bytes = randomBytes(TEMP_PASSWORD_ENTROPY_BYTES);
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const toPublicUser = (user) => ({
  id: user.$id, name: user.name, email: user.email, labels: user.labels || [],
  status: user.status, registration: user.registration, passwordUpdate: user.passwordUpdate,
  mustChangePassword: !!(user.prefs && user.prefs.mustChangePassword),
});

const resolveTemporaryPassword = (candidate) => {
  if (isNonEmptyString(candidate) && isAcceptableTemporaryPassword(candidate)) return { password: candidate.trim(), generated: false };
  if (isNonEmptyString(candidate) && !isAcceptableTemporaryPassword(candidate)) {
    return { error: `La contraseña temporal debe tener al menos ${MIN_TEMP_PASSWORD_LENGTH} caracteres y no puede ser un patrón predecible (p. ej. cambiar123).` };
  }
  return { password: generateTemporaryPassword(), generated: true };
};

export default async ({ req, res, log, error }) => {
  const users = new Users(new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY));

  const callerId = req.headers['x-appwrite-user-id'];
  if (!callerId) return jsonResponse(res, { success: false, error: 'No autenticado. Esta función requiere una sesión de usuario válida.' }, 401);

  let caller;
  try { caller = await users.get({ userId: callerId }); }
  catch (e) { error(`No se pudo verificar al usuario que ejecuta: ${e.message}`); return jsonResponse(res, { success: false, error: 'No se pudo verificar el usuario.' }, 500); }

  if (!Array.isArray(caller.labels) || !caller.labels.includes('admin')) return jsonResponse(res, { success: false, error: 'Solo un administrador puede gestionar usuarios.' }, 403);
  if (caller.prefs?.mustChangePassword) return jsonResponse(res, { success: false, error: 'Debes cambiar tu contraseña temporal antes de gestionar usuarios.' }, 403);

  let body;
  try { body = req.bodyJson || JSON.parse(req.body || '{}'); }
  catch { return jsonResponse(res, { success: false, error: 'Body inválido, se esperaba JSON.' }, 400); }

  const { action } = body;
  try {
    switch (action) {
      case 'list':
        return jsonResponse(res, { success: true, users: (await listAllUsers(users)).map(toPublicUser) });
      case 'create': {
        const { email, name, password, labels } = body;
        if (!isNonEmptyString(email) || !isNonEmptyString(name)) return jsonResponse(res, { success: false, error: 'Nombre y email son obligatorios.' }, 400);
        const resolved = resolveTemporaryPassword(password);
        if ('error' in resolved) return jsonResponse(res, { success: false, error: resolved.error }, 400);
        const created = await users.create({ userId: 'unique()', email, password: resolved.password, name });
        const cleanLabels = sanitizeLabels(labels);
        try {
          if (cleanLabels.length > 0) await users.updateLabels({ userId: created.$id, labels: cleanLabels });
          await users.updatePrefs({ userId: created.$id, prefs: { mustChangePassword: true } });
        } catch (postCreateError) {
          try { await users.delete({ userId: created.$id }); log(`Rollback BUG-026: usuario ${created.$id} eliminado`); }
          catch (rollbackError) { error(`Rollback fallido para ${created.$id}: ${rollbackError.message}`); }
          throw postCreateError;
        }
        return jsonResponse(res, { success: true, temporaryPassword: resolved.generated ? resolved.password : undefined, user: toPublicUser({ ...created, labels: cleanLabels, prefs: { mustChangePassword: true } }) });
      }
      case 'resetPassword': {
        const { userId, password } = body;
        if (!isNonEmptyString(userId)) return jsonResponse(res, { success: false, error: 'userId es obligatorio.' }, 400);
        const resolved = resolveTemporaryPassword(password);
        if ('error' in resolved) return jsonResponse(res, { success: false, error: resolved.error }, 400);
        await users.updatePassword({ userId, password: resolved.password });
        const existing = await users.get({ userId });
        await users.updatePrefs({ userId, prefs: { ...(existing.prefs || {}), mustChangePassword: true } });
        return jsonResponse(res, { success: true, temporaryPassword: resolved.generated ? resolved.password : undefined });
      }
      case 'updateLabels': {
        const { userId, labels } = body;
        if (!isNonEmptyString(userId)) return jsonResponse(res, { success: false, error: 'userId es obligatorio.' }, 400);
        const cleanLabels = sanitizeLabels(labels);
        if (userId === callerId && !cleanLabels.includes('admin')) return jsonResponse(res, { success: false, error: 'No puedes quitarte el rol de administrador.' }, 400);
        const target = await users.get({ userId });
        if (isAdminUser(target) && !cleanLabels.includes('admin')) {
          if (countOtherAdmins(await listAllUsers(users), userId) === 0) return jsonResponse(res, { success: false, error: 'Debe quedar al menos un administrador en el sistema.' }, 400);
        }
        return jsonResponse(res, { success: true, user: toPublicUser(await users.updateLabels({ userId, labels: cleanLabels })) });
      }
      case 'delete': {
        const { userId } = body;
        if (!isNonEmptyString(userId)) return jsonResponse(res, { success: false, error: 'userId es obligatorio.' }, 400);
        if (userId === callerId) return jsonResponse(res, { success: false, error: 'No puedes eliminar tu propia cuenta.' }, 400);
        await users.delete({ userId });
        return jsonResponse(res, { success: true });
      }
      default:
        return jsonResponse(res, { success: false, error: `Acción desconocida: ${action}` }, 400);
    }
  } catch (e) {
    error(`manage-users error (action=${action}): ${e.message}`);
    return jsonResponse(res, { success: false, error: e.message || 'Error interno' }, 500);
  }
};
