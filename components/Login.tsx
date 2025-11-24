
import React, { useState, useEffect } from 'react';
import { initializeAppwrite, authService } from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';
import { Loader2, ShieldCheck, ArrowRight, AlertTriangle } from 'lucide-react';
import { APPWRITE_CONFIG } from '../config/appwrite';

export const Login: React.FC = () => {
  const auth = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize Appwrite on mount with fixed configuration
  useEffect(() => {
    // Initialize Appwrite with hardcoded configuration
    initializeAppwrite({
      projectId: APPWRITE_CONFIG.projectId,
      endpoint: APPWRITE_CONFIG.endpoint,
      databaseId: APPWRITE_CONFIG.databaseId,
      storageBucketId: APPWRITE_CONFIG.bucketId,
      invoicesCollectionId: APPWRITE_CONFIG.collections.invoices,
      entriesCollectionId: APPWRITE_CONFIG.collections.entries,
      transactionsCollectionId: APPWRITE_CONFIG.collections.transactions,
      settingsCollectionId: APPWRITE_CONFIG.collections.settings,
      notificationsCollectionId: APPWRITE_CONFIG.collections.notifications,
      uploadsCollectionId: APPWRITE_CONFIG.collections.uploads,
      suppliersCollectionId: APPWRITE_CONFIG.collections.suppliers
    });

    // Save config to localStorage for other components
    const savedSettingsStr = localStorage.getItem('gestcb_settings');
    let settings = {};
    try {
      settings = savedSettingsStr ? JSON.parse(savedSettingsStr) : {};
    } catch {
      // Invalid JSON in localStorage, use empty settings
      settings = {};
    }

    const newSettings = {
      ...settings,
      dataConfig: {
        ...(settings as any).dataConfig,
        type: 'APPWRITE',
        appwriteProjectId: APPWRITE_CONFIG.projectId,
        appwriteEndpoint: APPWRITE_CONFIG.endpoint,
        appwriteDatabaseId: APPWRITE_CONFIG.databaseId,
        appwriteBucketId: APPWRITE_CONFIG.bucketId
      }
    };
    localStorage.setItem('gestcb_settings', JSON.stringify(newSettings));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        await auth.register(email, password, name);
      } else {
        await auth.login(email, password);
      }
      // Auth context will automatically update with the new user
    } catch (err: any) {
      console.error(err);
      if (err.message === "Failed to fetch") {
          setError("No se pudo conectar al servidor. Verifica tu conexión a internet.");
      } else if (err.message === "RATELIMIT" || (err.message && err.message.includes("Rate limit"))) {
          setError("Has superado el límite de intentos. Espera unos minutos antes de probar.");
      } else {
          setError(err.message || "Error de autenticación. Verifica tus credenciales.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative">

      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative z-10">
        <div className="bg-blue-600 p-8 text-center">
           <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
             <ShieldCheck className="w-8 h-8 text-white" />
           </div>
           <h1 className="text-2xl font-bold text-white tracking-tight">CBGest</h1>
           <p className="text-blue-100 text-sm mt-2">Contabilidad y Gestión para Comunidades de Bienes</p>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">
            {isRegister ? 'Crear Cuenta Gestor' : 'Iniciar Sesión'}
          </h2>

          {error ? (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label htmlFor="name-input" className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                <input
                  id="name-input"
                  name="name"
                  type="text"
                  required
                  className="w-full border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                  placeholder="Ej: Juan Pérez"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label htmlFor="email-input" className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
              <input
                id="email-input"
                name="email"
                type="email"
                required
                className="w-full border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                placeholder="admin@comunidad.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password-input" className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input
                id="password-input"
                name="password"
                type="password"
                required
                minLength={8}
                className="w-full border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                   {isRegister ? 'Registrarse' : 'Entrar'} <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate gratis'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
