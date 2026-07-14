/**
 * @fileoverview Servicio de Administración de Usuarios
 * @description Permite a un administrador crear, listar, restablecer contraseña
 *              y eliminar usuarios sin auto-registro. Delega en la Appwrite
 *              Function `manage-users`, que usa el Users API del SDK de
 *              servidor (requiere API Key) y verifica que quien la ejecuta
 *              tenga el label "admin".
 *
 * @example
 * import { userAdminService } from '@/services/userAdminService';
 * const users = await userAdminService.listUsers();
 */

import { functions } from '../lib/appwrite/client';
import { APPWRITE_CONFIG } from '../config/appwrite';
import type { ManagedUser } from '../types';
import { authLogger } from './logger';

const FUNCTION_ID = APPWRITE_CONFIG.functions.manageUsers;

type ManageUsersAction = 'list' | 'create' | 'resetPassword' | 'updateLabels' | 'delete';

interface ManageUsersResponse {
  success: boolean;
  error?: string;
  users?: ManagedUser[];
  user?: ManagedUser;
}

/**
 * Ejecuta la función `manage-users` con el payload dado y devuelve su respuesta
 * ya parseada. Lanza un Error legible si la función falla o responde con
 * `success: false` (ej. usuario sin permisos de admin).
 */
const callManageUsers = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any> & { action: ManageUsersAction }
): Promise<ManageUsersResponse> => {
  const execution = await functions.createExecution(FUNCTION_ID, JSON.stringify(payload), false);

  if (execution.responseStatusCode && execution.responseStatusCode >= 500 && !execution.responseBody) {
    throw new Error('La función de gestión de usuarios no respondió correctamente.');
  }

  let parsed: ManageUsersResponse;
  try {
    parsed = JSON.parse(execution.responseBody || '{}');
  } catch {
    throw new Error('Respuesta inválida de la función de gestión de usuarios.');
  }

  if (!parsed.success) {
    throw new Error(parsed.error || 'Error al gestionar usuarios.');
  }

  return parsed;
};

export const userAdminService = {
  /**
   * Lista todos los usuarios de la aplicación (requiere ser admin).
   */
  async listUsers(): Promise<ManagedUser[]> {
    try {
      const response = await callManageUsers({ action: 'list' });
      return response.users || [];
    } catch (error) {
      authLogger.error(`listUsers error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },

  /**
   * Crea un nuevo usuario con contraseña temporal. El usuario deberá
   * cambiarla en su primer login (mustChangePassword).
   *
   * @param email - Email del nuevo usuario
   * @param name - Nombre completo
   * @param temporaryPassword - Contraseña temporal (puede ser insegura, ej. "1234")
   * @param labels - Roles asignados (ej. ["comunero"])
   */
  async createUser(
    email: string,
    name: string,
    temporaryPassword: string,
    labels: string[] = []
  ): Promise<ManagedUser | undefined> {
    try {
      const response = await callManageUsers({
        action: 'create',
        email,
        name,
        password: temporaryPassword,
        labels,
      });
      authLogger.success(`Usuario creado: ${email}`);
      return response.user;
    } catch (error) {
      authLogger.error(`createUser error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },

  /**
   * Restablece la contraseña de un usuario a una nueva contraseña temporal.
   * Vuelve a marcar mustChangePassword para forzar el cambio en el próximo login.
   */
  async resetPassword(userId: string, temporaryPassword: string): Promise<void> {
    try {
      await callManageUsers({ action: 'resetPassword', userId, password: temporaryPassword });
      authLogger.success(`Contraseña restablecida para usuario: ${userId}`);
    } catch (error) {
      authLogger.error(`resetPassword error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },

  /**
   * Actualiza los roles (labels) de un usuario.
   */
  async updateLabels(userId: string, labels: string[]): Promise<ManagedUser | undefined> {
    try {
      const response = await callManageUsers({ action: 'updateLabels', userId, labels });
      return response.user;
    } catch (error) {
      authLogger.error(`updateLabels error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },

  /**
   * Elimina un usuario definitivamente.
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      await callManageUsers({ action: 'delete', userId });
      authLogger.success(`Usuario eliminado: ${userId}`);
    } catch (error) {
      authLogger.error(`deleteUser error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
};

export default userAdminService;
