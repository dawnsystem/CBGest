/**
 * @fileoverview Gestión de Usuarios (panel de administrador)
 * @description Vive dentro de Configuración → Usuarios. Permite a un usuario
 *              con el label "admin" crear cuentas con una contraseña temporal,
 *              restablecer contraseñas y eliminar usuarios. No existe
 *              auto-registro: esta es la única forma de dar acceso a la app.
 *              El usuario creado deberá cambiar su contraseña temporal en su
 *              primer inicio de sesión (ver ForcePasswordChange.tsx).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, KeyRound, Trash2, ShieldAlert, ShieldCheck, Loader2, RefreshCw, Copy, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userAdminService } from '../services/userAdminService';
import { ManagedUser, UserRole } from '../types';
import {
  generateTemporaryPassword,
  isAcceptableTemporaryPassword,
  MIN_TEMP_PASSWORD_LENGTH,
} from '../utils/temporaryPassword';
import { useToast } from './Toast';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'admin',
  [UserRole.GESTOR]: 'gestor',
  [UserRole.COMUNERO]: 'comunero',
};

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  comunero: 'Comunero',
};

interface NewUserFormState {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

const emptyForm: NewUserFormState = {
  name: '',
  email: '',
  password: generateTemporaryPassword(),
  role: UserRole.COMUNERO,
};

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showToast, showConfirm } = useToast();

  const isAdmin = !!currentUser?.labels?.includes('admin');

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState('');

  const [form, setForm] = useState<NewUserFormState>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [lastCreatedCredentials, setLastCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPasswordDraft, setResetPasswordDraft] = useState(generateTemporaryPassword());
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingList(true);
    setListError('');
    try {
      const list = await userAdminService.listUsers();
      setUsers(list);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoadingList(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center animate-fade-in">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h3 className="font-semibold text-slate-900 mb-1">Acceso restringido</h3>
        <p className="text-sm text-slate-500">
          Solo un administrador puede crear o gestionar usuarios. Si necesitas una cuenta, contacta con el
          administrador de tu comunidad.
        </p>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.email.trim()) {
      showToast('Nombre y email son obligatorios.', 'warning');
      return;
    }
    if (!isAcceptableTemporaryPassword(form.password)) {
      showToast(
        `La contraseña temporal debe tener al menos ${MIN_TEMP_PASSWORD_LENGTH} caracteres y no puede ser un patrón predecible.`,
        'warning'
      );
      return;
    }

    setCreating(true);
    try {
      await userAdminService.createUser(form.email.trim(), form.name.trim(), form.password, [ROLE_LABELS[form.role]]);
      showToast(`Usuario ${form.email} creado correctamente.`, 'success');
      setLastCreatedCredentials({ email: form.email.trim(), password: form.password });
      setForm({ ...emptyForm, password: generateTemporaryPassword() });
      await loadUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al crear el usuario.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!lastCreatedCredentials) return;
    const text = `Email: ${lastCreatedCredentials.email}\nContraseña temporal: ${lastCreatedCredentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('No se pudo copiar. Cópialo manualmente.', 'warning');
    }
  };

  const handleResetPassword = async (managedUser: ManagedUser) => {
    if (!isAcceptableTemporaryPassword(resetPasswordDraft)) {
      showToast(
        `La contraseña temporal debe tener al menos ${MIN_TEMP_PASSWORD_LENGTH} caracteres y no puede ser un patrón predecible.`,
        'warning'
      );
      return;
    }
    setBusyUserId(managedUser.id);
    try {
      await userAdminService.resetPassword(managedUser.id, resetPasswordDraft);
      showToast(`Contraseña restablecida para ${managedUser.email}.`, 'success');
      setLastCreatedCredentials({ email: managedUser.email, password: resetPasswordDraft });
      setResettingUserId(null);
      setResetPasswordDraft(generateTemporaryPassword());
      await loadUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al restablecer la contraseña.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteUser = async (managedUser: ManagedUser) => {
    const confirmed = await showConfirm(`¿Eliminar al usuario "${managedUser.name}" (${managedUser.email})? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    setBusyUserId(managedUser.id);
    try {
      await userAdminService.deleteUser(managedUser.id);
      showToast('Usuario eliminado.', 'success');
      await loadUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al eliminar el usuario.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Formulario de creación */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <UserPlus className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Crear Usuario</h3>
            <p className="text-sm text-slate-500">
              El auto-registro está desactivado. Crea la cuenta con una contraseña temporal; el usuario deberá
              cambiarla en su primer inicio de sesión.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="new-user-name" className="block text-sm font-medium text-slate-700 mb-1">Nombre completo</label>
            <input
              id="new-user-name"
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white text-slate-900"
              placeholder="Ej: Juan Pérez"
              autoComplete="off"
              disabled={creating}
              required
            />
          </div>
          <div>
            <label htmlFor="new-user-email" className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
            <input
              id="new-user-email"
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white text-slate-900"
              placeholder="usuario@comunidad.com"
              autoComplete="off"
              disabled={creating}
              required
            />
          </div>
          <div>
            <label htmlFor="new-user-role" className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
            <select
              id="new-user-role"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white text-slate-900"
              disabled={creating}
            >
              <option value={UserRole.COMUNERO}>Comunero</option>
              <option value={UserRole.GESTOR}>Gestor</option>
              <option value={UserRole.ADMIN}>Administrador</option>
            </select>
          </div>
          <div>
            <label htmlFor="new-user-password" className="block text-sm font-medium text-slate-700 mb-1">Contraseña temporal</label>
            <div className="flex gap-2">
              <input
                id="new-user-password"
                type="text"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono bg-white text-slate-900"
                autoComplete="off"
                disabled={creating}
                required
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, password: generateTemporaryPassword() })}
                className="shrink-0 p-2.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
                title="Generar otra contraseña"
                disabled={creating}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Secreto criptográfico (mín. {MIN_TEMP_PASSWORD_LENGTH} caracteres, ≥128 bits). Cópialo y
              comunícalo al usuario; deberá cambiarlo en su primer login.
            </p>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Crear Usuario
            </button>
          </div>
        </form>

        {lastCreatedCredentials && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start justify-between gap-3">
            <div className="text-sm text-emerald-800">
              <p className="font-medium mb-1">Comunica estas credenciales al usuario:</p>
              <p>Email: <span className="font-mono">{lastCreatedCredentials.email}</span></p>
              <p>Contraseña temporal: <span className="font-mono">{lastCreatedCredentials.password}</span></p>
            </div>
            <button
              type="button"
              onClick={handleCopyCredentials}
              className="shrink-0 p-2 text-emerald-700 hover:bg-emerald-100 rounded-lg"
              title="Copiar credenciales"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* Listado de usuarios */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Usuarios</h3>
          <button
            type="button"
            onClick={loadUsers}
            className="text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
            disabled={loadingList}
          >
            <RefreshCw className={`w-3 h-3 ${loadingList ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>

        {listError && (
          <div className="p-4 text-sm text-red-600 bg-red-50 border-b border-red-100">{listError}</div>
        )}

        <div className="divide-y divide-slate-100">
          {loadingList && users.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando usuarios...
            </div>
          )}
          {!loadingList && users.length === 0 && !listError && (
            <div className="p-6 text-center text-slate-400 text-sm">No hay usuarios todavía.</div>
          )}
          {users.map(managedUser => (
            <div key={managedUser.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-slate-900 truncate">{managedUser.name}</p>
                  {managedUser.id === currentUser?.$id && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Tú</span>
                  )}
                  {managedUser.mustChangePassword ? (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Pendiente cambio de contraseña
                    </span>
                  ) : (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                      Activo
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 truncate">{managedUser.email}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {(managedUser.labels.length > 0 ? managedUser.labels : ['sin rol']).map(label => (
                    <span key={label} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      {label === 'admin' && <ShieldCheck className="w-2.5 h-2.5" />}
                      {ROLE_DISPLAY_NAMES[label] || label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {resettingUserId === managedUser.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={resetPasswordDraft}
                      onChange={e => setResetPasswordDraft(e.target.value)}
                      className="border border-slate-200 rounded-lg p-1.5 text-xs font-mono w-32 bg-white text-slate-900"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleResetPassword(managedUser)}
                      disabled={busyUserId === managedUser.id}
                      className="text-xs bg-amber-600 text-white px-2 py-1.5 rounded hover:bg-amber-700 disabled:opacity-50"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => setResettingUserId(null)}
                      className="text-xs text-slate-500 px-2 py-1.5 rounded hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setResettingUserId(managedUser.id);
                      setResetPasswordDraft(generateTemporaryPassword());
                    }}
                    className="text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded flex items-center gap-1"
                    disabled={busyUserId === managedUser.id}
                  >
                    <KeyRound className="w-3 h-3" /> Restablecer contraseña
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDeleteUser(managedUser)}
                  disabled={busyUserId === managedUser.id || managedUser.id === currentUser?.$id}
                  title={managedUser.id === currentUser?.$id ? 'No puedes eliminar tu propia cuenta' : 'Eliminar usuario'}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
