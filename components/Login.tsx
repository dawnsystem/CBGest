/**
 * @fileoverview Componente de Login
 * @description Formulario de inicio de sesión y registro.
 *              Solo maneja UI - la lógica de auth está en AuthContext.
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Loader2, ArrowRight, AlertTriangle } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, register, lastError, clearError } = useAuth();

  // Estado del formulario
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  // Combinar error local con error del contexto
  const displayError = localError || lastError;

  /**
   * Manejar envío del formulario
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError('');
    clearError();

    try {
      if (isRegister) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      // Auth context actualizará automáticamente con el nuevo usuario
    } catch (err: unknown) {
      console.error('[Login] Error:', err);

      // El error ya está en lastError del contexto, pero podemos añadir más contexto
      if (err instanceof Error) {
        if (err.message === 'Failed to fetch') {
          setLocalError('No se pudo conectar al servidor. Verifica tu conexión a internet.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cambiar entre login y registro
   */
  const toggleMode = () => {
    setIsRegister(!isRegister);
    setLocalError('');
    clearError();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative z-10">
        {/* Header */}
        <div className="bg-slate-900 p-8 text-center">
          <div className="flex justify-center mb-4">
            <img src="/assets/logo.png" alt="CBGest" className="w-20 h-24 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CBGest</h1>
          <p className="text-slate-400 text-sm mt-2">
            Contabilidad y Gestión para Comunidades de Bienes
          </p>
        </div>

        {/* Formulario */}
        <div className="p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">
            {isRegister ? 'Crear Cuenta Gestor' : 'Iniciar Sesión'}
          </h2>

          {/* Error */}
          {displayError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo Nombre (solo registro) */}
            {isRegister && (
              <div>
                <label
                  htmlFor="name-input"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Nombre Completo
                </label>
                <input
                  id="name-input"
                  name="name"
                  type="text"
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                  placeholder="Ej: Juan Pérez"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  disabled={loading}
                />
              </div>
            )}

            {/* Campo Email */}
            <div>
              <label
                htmlFor="email-input"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Correo Electrónico
              </label>
              <input
                id="email-input"
                name="email"
                type="email"
                required
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                placeholder="admin@comunidad.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
              />
            </div>

            {/* Campo Contraseña */}
            <div>
              <label
                htmlFor="password-input"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Contraseña
              </label>
              <input
                id="password-input"
                name="password"
                type="password"
                required
                minLength={8}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                disabled={loading}
              />
              {isRegister && (
                <p className="text-xs text-slate-500 mt-1">Mínimo 8 caracteres</p>
              )}
            </div>

            {/* Botón Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isRegister ? 'Registrarse' : 'Entrar'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle Login/Register */}
          <div className="mt-6 text-center">
            <button
              onClick={toggleMode}
              className="text-sm text-blue-600 hover:underline font-medium"
              disabled={loading}
            >
              {isRegister
                ? '¿Ya tienes cuenta? Inicia sesión'
                : '¿No tienes cuenta? Regístrate gratis'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
