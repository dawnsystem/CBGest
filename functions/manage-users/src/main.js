import { Client, Users } from 'node-appwrite';
import { randomBytes } from 'crypto';

/**
 * Manage Users Function
 *
 * Permite que un usuario con el label "admin" cree, liste, restablezca la
 * contraseña o elimine cuentas de otros usuarios usando el Users API del
 * SDK de servidor (requiere API Key). El auto-registro está deshabilitado
 * en el cliente (ver components/Login.tsx); esta función es el único punto
 * donde se crean cuentas nuevas.
 *
 * Trigger: HTTPS (Execute Access = "Users", para que req.headers incluya
 * `x-appwrite-user-id` con el id de quien ejecuta la función).
 *
 * Body (JSON):
 *   { "action": "list" }
 *   { "action": "create", "email": "...", "name": "...", "password": "...", "labels": ["comunero"] }
 *   { "action": "resetPassword", "userId": "...", "password": "..." }
 *   { "action": "updateLabels", "userId": "...", "labels": ["gestor"] }
 *   { "action": "delete", "userId": "..." }
 *
 * Variables de entorno requeridas: APPWRITE_API_KEY, DATABASE_ID (no usada
 * aquí pero mantenida por consistencia con el resto de funciones).
 *
 * SEC-016: contraseñas temporales ≥16 chars / ≥128 bits; se rechaza el
 * patrón legacy `cambiarNNN`. BUG-026: si falla updatePrefs/labels tras
 * create, se hace rollback eliminando el usuario recién creado.
 */

const VALID_LABELS = ['admin', 'gestor', 'comunero'];
/** SEC-016: mínimo de contraseña temporal (Appwrite exige ≥8; política CBGest ≥16). */
const MIN_TEMP_PASSWORD_LENGTH = 16;
const TEMP_PASSWORD_ENTROPY_BYTES = 16;
const WEAK_TEMP_PASSWORD_PATTERN = /^cambiar\d{1,4}$/i;

const jsonResponse = (res, payload, statusCode = 200) => res.json(payload, statusCode);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const sanitizeLabels = (labels) => {
  if (!Array.isArray(labels)) return [];
  return labels.filter((label) => VALID_LABELS.includes(label));
};

/**
 * @param {string} password
 * @returns {boolean}
 */
const isAcceptableTemporaryPassword = (password) => {
  if (typeof password !== 'string') return false;
  const trimmed = password.trim();
  if (trimmed.length < MIN_TEMP_PASSWORD_LENGTH) return false;
  if (WEAK_TEMP_PASSWORD_PATTERN.test(trimmed)) return false;
  return true;
};

/**
 * Genera un secreto temporal en base64url (≥128 bits).
 * @returns {string}
 */
const generateTemporaryPassword = () => {
  const bytes = randomBytes(TEMP_PASSWORD_ENTROPY_BYTES);
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const toPublicUser = (user) => ({
  id: user.$id,
  name: user.name,
  email: user.email,
  labels: user.labels || [],
  status: user.status,
  registration: user.registration,
  passwordUpdate: user.passwordUpdate,
  mustChangePassword: !!(user.prefs && user.prefs.mustChangePassword),
});

/**
 * Resuelve la contraseña temporal a usar: si el cliente envía una aceptable la
 * respeta; si no, genera una en el servidor (SEC-016).
 * @param {unknown} candidate
 * @returns {{ password: string, generated: boolean } | { error: string }}
 */
const resolveTemporaryPassword = (candidate) => {
  if (isNonEmptyString(candidate) && isAcceptableTemporaryPassword(candidate)) {
    return { password: candidate.trim(), generated: false };
  }
  if (isNonEmptyString(candidate) && !isAcceptableTemporaryPassword(candidate)) {
    return {
      error: `La contraseña temporal debe tener al menos ${MIN_TEMP_PASSWORD_LENGTH} caracteres y no puede ser un patrón predecible (p. ej. cambiar123).`,
    };
  }
  return { password: generateTemporaryPassword(), generated: true };
};

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const users = new Users(client);

  // 1. Identificar quién ejecuta la función.
  const callerId = req.headers['x-appwrite-user-id'];
  if (!callerId) {
    return jsonResponse(res, {
      success: false,
      error: 'No autenticado. Esta función requiere una sesión de usuario válida.',
    }, 401);
  }

  // 2. Verificar que quien ejecuta tiene el label "admin".
  let caller;
  try {
    caller = await users.get({ userId: callerId });
  } catch (e) {
    error(`No se pudo verificar al usuario que ejecuta: ${e.message}`);
    return jsonResponse(res, { success: false, error: 'No se pudo verificar el usuario.' }, 500);
  }

  if (!Array.isArray(caller.labels) || !caller.labels.includes('admin')) {
    return jsonResponse(res, {
      success: false,
      error: 'Solo un administrador puede gestionar usuarios.',
    }, 403);
  }

  // SEC-016 (gate server-side): un admin con mustChangePassword pendiente no
  // puede gestionar usuarios hasta completar el cambio de contraseña.
  if (caller.prefs && caller.prefs.mustChangePassword) {
    return jsonResponse(res, {
      success: false,
      error: 'Debes cambiar tu contraseña temporal antes de gestionar usuarios.',
    }, 403);
  }

  // 3. Parsear body.
  let body;
  try {
    body = req.bodyJson || JSON.parse(req.body || '{}');
  } catch {
    return jsonResponse(res, { success: false, error: 'Body inválido, se esperaba JSON.' }, 400);
  }

  const { action } = body;

  try {
    switch (action) {
      case 'list': {
        const response = await users.list();
        return jsonResponse(res, {
          success: true,
          users: response.users.map(toPublicUser),
        });
      }

      case 'create': {
        const { email, name, password, labels } = body;

        if (!isNonEmptyString(email) || !isNonEmptyString(name)) {
          return jsonResponse(res, { success: false, error: 'Nombre y email son obligatorios.' }, 400);
        }

        const resolved = resolveTemporaryPassword(password);
        if ('error' in resolved) {
          return jsonResponse(res, { success: false, error: resolved.error }, 400);
        }

        const created = await users.create({
          userId: 'unique()',
          email,
          password: resolved.password,
          name,
        });

        const cleanLabels = sanitizeLabels(labels);

        // BUG-026 / SEC-016: si labels o prefs fallan tras el create, rollback
        // eliminando el usuario para no dejar cuentas usables sin mustChangePassword.
        try {
          if (cleanLabels.length > 0) {
            await users.updateLabels({ userId: created.$id, labels: cleanLabels });
          }

          await users.updatePrefs({
            userId: created.$id,
            prefs: { mustChangePassword: true },
          });
        } catch (postCreateError) {
          try {
            await users.delete({ userId: created.$id });
            log(`Rollback SEC-016/BUG-026: usuario ${created.$id} eliminado tras fallo post-create`);
          } catch (rollbackError) {
            error(`Rollback fallido para ${created.$id}: ${rollbackError.message}`);
          }
          throw postCreateError;
        }

        log(`Usuario creado por admin ${callerId}: ${created.$id} (${email})`);

        return jsonResponse(res, {
          success: true,
          temporaryPassword: resolved.generated ? resolved.password : undefined,
          user: toPublicUser({ ...created, labels: cleanLabels, prefs: { mustChangePassword: true } }),
        });
      }

      case 'resetPassword': {
        const { userId, password } = body;

        if (!isNonEmptyString(userId)) {
          return jsonResponse(res, { success: false, error: 'userId es obligatorio.' }, 400);
        }

        const resolved = resolveTemporaryPassword(password);
        if ('error' in resolved) {
          return jsonResponse(res, { success: false, error: resolved.error }, 400);
        }

        await users.updatePassword({ userId, password: resolved.password });
        const existing = await users.get({ userId });
        await users.updatePrefs({
          userId,
          prefs: { ...(existing.prefs || {}), mustChangePassword: true },
        });

        log(`Contraseña restablecida por admin ${callerId} para usuario: ${userId}`);

        return jsonResponse(res, {
          success: true,
          temporaryPassword: resolved.generated ? resolved.password : undefined,
        });
      }

      case 'updateLabels': {
        const { userId, labels } = body;

        if (!isNonEmptyString(userId)) {
          return jsonResponse(res, { success: false, error: 'userId es obligatorio.' }, 400);
        }

        const cleanLabels = sanitizeLabels(labels);
        const updated = await users.updateLabels({ userId, labels: cleanLabels });

        return jsonResponse(res, { success: true, user: toPublicUser(updated) });
      }

      case 'delete': {
        const { userId } = body;

        if (!isNonEmptyString(userId)) {
          return jsonResponse(res, { success: false, error: 'userId es obligatorio.' }, 400);
        }
        if (userId === callerId) {
          return jsonResponse(res, { success: false, error: 'No puedes eliminar tu propia cuenta.' }, 400);
        }

        await users.delete({ userId });

        log(`Usuario eliminado por admin ${callerId}: ${userId}`);

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
