import { Client, Users } from 'node-appwrite';

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
 */

const VALID_LABELS = ['admin', 'gestor', 'comunero'];
// Appwrite exige un mínimo de 8 caracteres para cualquier contraseña, incluso
// las creadas por un admin vía Users API. No se puede usar algo tan corto
// como "1234"; en su lugar se recomienda una contraseña simple pero >= 8
// caracteres (ej. "cambiar123"), que el usuario deberá cambiar de todos
// modos en su primer login.
const MIN_TEMP_PASSWORD_LENGTH = 8;

const jsonResponse = (res, payload, statusCode = 200) => res.json(payload, statusCode);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const sanitizeLabels = (labels) => {
  if (!Array.isArray(labels)) return [];
  return labels.filter((label) => VALID_LABELS.includes(label));
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

        if (!isNonEmptyString(email) || !isNonEmptyString(name) || !isNonEmptyString(password)) {
          return jsonResponse(res, { success: false, error: 'Nombre, email y contraseña son obligatorios.' }, 400);
        }
        if (password.length < MIN_TEMP_PASSWORD_LENGTH) {
          return jsonResponse(res, {
            success: false,
            error: `La contraseña temporal debe tener al menos ${MIN_TEMP_PASSWORD_LENGTH} caracteres.`,
          }, 400);
        }

        const created = await users.create({
          userId: 'unique()',
          email,
          password,
          name,
        });

        const cleanLabels = sanitizeLabels(labels);
        if (cleanLabels.length > 0) {
          await users.updateLabels({ userId: created.$id, labels: cleanLabels });
        }

        // El usuario deberá cambiar su contraseña temporal en el primer login.
        await users.updatePrefs({
          userId: created.$id,
          prefs: { mustChangePassword: true },
        });

        log(`Usuario creado por admin ${callerId}: ${created.$id} (${email})`);

        return jsonResponse(res, {
          success: true,
          user: toPublicUser({ ...created, labels: cleanLabels, prefs: { mustChangePassword: true } }),
        });
      }

      case 'resetPassword': {
        const { userId, password } = body;

        if (!isNonEmptyString(userId) || !isNonEmptyString(password)) {
          return jsonResponse(res, { success: false, error: 'userId y password son obligatorios.' }, 400);
        }
        if (password.length < MIN_TEMP_PASSWORD_LENGTH) {
          return jsonResponse(res, {
            success: false,
            error: `La contraseña temporal debe tener al menos ${MIN_TEMP_PASSWORD_LENGTH} caracteres.`,
          }, 400);
        }

        await users.updatePassword({ userId, password });
        const existing = await users.get({ userId });
        await users.updatePrefs({
          userId,
          prefs: { ...(existing.prefs || {}), mustChangePassword: true },
        });

        log(`Contraseña restablecida por admin ${callerId} para usuario: ${userId}`);

        return jsonResponse(res, { success: true });
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
