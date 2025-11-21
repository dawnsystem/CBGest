
import React, { useState, useEffect } from 'react';
import { initializeAppwrite, testConnection, authService } from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';
import { Loader2, ShieldCheck, ArrowRight, Settings, CheckCircle, AlertTriangle, Globe } from 'lucide-react';

export const Login: React.FC = () => {
  const auth = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Config State
  const [showConfig, setShowConfig] = useState(false);
  const [projectId, setProjectId] = useState('cbgest');
  const [endpoint, setEndpoint] = useState('https://fra.cloud.appwrite.io/v1');
  const [pingStatus, setPingStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [currentHost, setCurrentHost] = useState('');

  // Initial Init
  useEffect(() => {
    // Try to load existing config from local storage if available to pre-fill
    const savedSettingsStr = localStorage.getItem('gestcb_settings');
    if (savedSettingsStr) {
        try {
            const saved = JSON.parse(savedSettingsStr);
            if (saved.dataConfig?.appwriteEndpoint) setEndpoint(saved.dataConfig.appwriteEndpoint);
            if (saved.dataConfig?.appwriteProjectId) setProjectId(saved.dataConfig.appwriteProjectId);
        } catch (e) { /* ignore */ }
    }

    initializeAppwrite({
      projectId,
      endpoint,
      databaseId: '691f288100019843d43e',
      bucketId: 'cbgest-data',
      storageBucketId: 'cbgest-data',
      invoicesCollectionId: 'invoices',
      entriesCollectionId: 'entries',
      transactionsCollectionId: 'transactions',
      settingsCollectionId: 'settings'
    });
    setCurrentHost(window.location.hostname);
  }, []);

  // Save config to LocalStorage so App.tsx can use it later
  const persistConfig = () => {
      const savedSettingsStr = localStorage.getItem('gestcb_settings');
      let settings = {};
      try {
          settings = savedSettingsStr ? JSON.parse(savedSettingsStr) : {};
      } catch(e) {}
      
      const newSettings = {
          ...settings,
          dataConfig: {
              ...(settings as any).dataConfig,
              type: 'APPWRITE',
              appwriteProjectId: projectId,
              appwriteEndpoint: endpoint
          }
      };
      localStorage.setItem('gestcb_settings', JSON.stringify(newSettings));
  };

  const handleConfigSave = () => {
      initializeAppwrite({
        projectId,
        endpoint,
        databaseId: '691f288100019843d43e',
        bucketId: 'cbgest-data',
        storageBucketId: 'cbgest-data',
        invoicesCollectionId: 'invoices',
        entriesCollectionId: 'entries',
        transactionsCollectionId: 'transactions',
        settingsCollectionId: 'settings'
      });
      persistConfig(); // CRITICAL: Save to LS so App.tsx picks it up
      setShowConfig(false);
      setPingStatus('IDLE');
      setError('');
  };

  const handlePing = async () => {
      initializeAppwrite({
        projectId,
        endpoint,
        databaseId: '691f288100019843d43e',
        bucketId: 'cbgest-data',
        storageBucketId: 'cbgest-data',
        invoicesCollectionId: 'invoices',
        entriesCollectionId: 'entries',
        transactionsCollectionId: 'transactions',
        settingsCollectionId: 'settings'
      });
      setLoading(true);
      setError('');
      try {
          await testConnection();
          setPingStatus('SUCCESS');
          persistConfig(); // If ping works, save it!
          setTimeout(() => setPingStatus('IDLE'), 3000);
      } catch (e: any) {
          setPingStatus('ERROR');
          if (e.message === "CORS_ERROR" || e.message === "Failed to fetch") {
              setError("CORS_BLOCK");
          } else {
              setError(`Error: ${e.message}`);
          }
      }
      setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // Ensure initialized before login attempt
    initializeAppwrite({
      projectId,
      endpoint,
      databaseId: '691f288100019843d43e',
      bucketId: 'cbgest-data',
      storageBucketId: 'cbgest-data',
      invoicesCollectionId: 'invoices',
      entriesCollectionId: 'entries',
      transactionsCollectionId: 'transactions',
      settingsCollectionId: 'settings'
    });
    persistConfig();

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
          setError("CORS_BLOCK");
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
      
      {/* Config Button */}
      <button 
        onClick={() => setShowConfig(true)}
        className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors p-2"
        title="Configurar Conexión Appwrite"
      >
          <Settings className="w-6 h-6" />
      </button>

      {/* Config Modal */}
      {showConfig && (
          <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
                  <h3 className="font-bold text-slate-900 text-lg mb-4">Configuración de Conexión</h3>
                  <div className="space-y-4">
                      <div>
                          <label htmlFor="endpoint-input" className="block text-xs font-bold text-slate-500 mb-1">Endpoint API</label>
                          <input id="endpoint-input" name="endpoint" type="text" value={endpoint} onChange={e => setEndpoint(e.target.value)} className="w-full border-slate-200 rounded p-2 text-sm font-mono bg-white text-slate-900" />
                          <p className="text-[10px] text-slate-400 mt-1">Ej: https://cloud.appwrite.io/v1 o https://fra.cloud.appwrite.io/v1</p>
                      </div>
                      <div>
                          <label htmlFor="projectid-input" className="block text-xs font-bold text-slate-500 mb-1">Project ID</label>
                          <input id="projectid-input" name="projectId" type="text" value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full border-slate-200 rounded p-2 text-sm font-mono bg-white text-slate-900" />
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                          <button onClick={handlePing} className={`flex-1 py-2 rounded font-bold text-xs flex items-center justify-center gap-2 ${pingStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : (pingStatus === 'SUCCESS' ? <CheckCircle className="w-3 h-3"/> : <Settings className="w-3 h-3"/>)}
                              {pingStatus === 'SUCCESS' ? 'CONEXIÓN OK' : 'VERIFICAR CONEXIÓN (PING)'}
                          </button>
                      </div>
                      
                      {error === "CORS_BLOCK" && (
                          <div className="bg-red-50 border border-red-100 rounded p-3 text-xs text-red-700 space-y-2">
                              <p className="font-bold flex items-center gap-1"><Globe className="w-3 h-3"/> Conexión Bloqueada (CORS)</p>
                              <p>Appwrite no reconoce este dominio. Debes añadirlo a tu Plataforma Web:</p>
                              <div className="bg-white p-2 rounded border border-red-200 font-mono break-all select-all cursor-copy">
                                  {currentHost}
                              </div>
                              <p>O añade <code>*</code> para permitir todos.</p>
                          </div>
                      )}
                      
                      {error && error !== "CORS_BLOCK" && (
                          <div className="bg-red-50 border border-red-100 rounded p-2 text-xs text-red-600">
                              {error}
                          </div>
                      )}

                  </div>
                  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                      <button onClick={() => setShowConfig(false)} className="text-slate-500 text-sm hover:text-slate-800">Cancelar</button>
                      <button onClick={handleConfigSave} className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium">Guardar y Aplicar</button>
                  </div>
              </div>
          </div>
      )}

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

          {error === "CORS_BLOCK" ? (
            <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm mb-4 border border-amber-200">
               <p className="font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Conexión Bloqueada</p>
               <p className="mt-1">Pulsa el ⚙️ arriba a la derecha para ver instrucciones y configurar el dominio permitido.</p>
            </div>
          ) : error ? (
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
          
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
             <p className="text-xs text-slate-400">
                 Endpoint: {endpoint}
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};
