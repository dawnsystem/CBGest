/**
 * @fileoverview Cambio de Contraseña Obligatorio
 * @description Pantalla que bloquea el acceso a la aplicación hasta que el
 *              usuario cambie su contraseña temporal (asignada por un
 *              administrador) por una definitiva. Se muestra justo después
 *              del login cuando `mustChangePassword` está activo, antes de
 *              renderizar cualquier otra parte de la app.
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Loader2, ArrowRight, AlertTriangle, LogOut } from 'lucide-react';

const MIN_NEW_PASSWORD_LENGTH = 8;

export const ForcePasswordChange: React.FC = () => {
  const { changePassword, logout, lastError, clearError } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const displayError = localError || lastError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (newPassword.length < MIN_NEW_PASSWORD_LENGTH) {
      setLocalError(`La nueva contraseña debe tener al menos ${MIN_NEW_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden.');
      return;
    }
    if (newPassword === currentPassword) {
      setLocalError('La nueva contraseña debe ser diferente de la temporal.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      // AuthContext actualizará el usuario y ocultará esta pantalla automáticamente.
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Failed to fetch') {
        setLocalError('No se pudo conectar al servidor. Verifica tu conexión a internet.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative z-10">
        {/* Header */}
        <div className="bg-amber-600 p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white/20 p-4 rounded-full">
              <KeyRound className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Cambio de Contraseña</h1>
          <p className="text-amber-100 text-sm mt-2">
            Por seguridad, debes definir tu propia contraseña antes de continuar.
          </p>
        </div>

        {/* Formulario */}
        <div className="p-8">
          {displayError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="current-password-input" className="block text-sm font-medium text-slate-700 mb-1">
                Contraseña temporal actual
              </label>
              <input
                id="current-password-input"
                name="currentPassword"
                type="password"
                required
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-900"
                placeholder="La que te dio el administrador"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="new-password-input" className="block text-sm font-medium text-slate-700 mb-1">
                Nueva contraseña
              </label>
              <input
                id="new-password-input"
                name="newPassword"
                type="password"
                required
                minLength={MIN_NEW_PASSWORD_LENGTH}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-900"
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
              />
              <p className="text-xs text-slate-500 mt-1">Mínimo {MIN_NEW_PASSWORD_LENGTH} caracteres</p>
            </div>

            <div>
              <label htmlFor="confirm-password-input" className="block text-sm font-medium text-slate-700 mb-1">
                Confirmar nueva contraseña
              </label>
              <input
                id="confirm-password-input"
                name="confirmPassword"
                type="password"
                required
                minLength={MIN_NEW_PASSWORD_LENGTH}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-900"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 text-white py-3 rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Guardar y continuar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => logout()}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium inline-flex items-center gap-1"
              disabled={loading}
            >
              <LogOut className="w-3.5 h-3.5" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
