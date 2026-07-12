import React, { useState } from 'react';
import { Save, Cloud, Database, Lock, Folder, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { AppwriteConfig as AppwriteConfigType } from '../types';
import { useToast } from './Toast';

interface AppwriteConfigProps {
  config?: AppwriteConfigType;
  onSave: (config: AppwriteConfigType) => void;
  onTest?: () => Promise<boolean>;
}

export const AppwriteConfig: React.FC<AppwriteConfigProps> = ({ config, onSave, onTest }) => {
  const [formData, setFormData] = useState<AppwriteConfigType>(config || {
    endpoint: 'https://cloud.appwrite.io/v1',
    projectId: '',
    databaseId: '',
    invoicesCollectionId: '',
    entriesCollectionId: '',
    transactionsCollectionId: '',
    settingsCollectionId: '',
    storageBucketId: ''
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const { showToast } = useToast();

  const handleChange = (field: keyof AppwriteConfigType, value: string) => {
    setFormData({ ...formData, [field]: value });
    setIsSaved(false);
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!onTest) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const success = await onTest();
      setTestResult(success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    // Validación básica
    if (!formData.projectId || !formData.databaseId) {
      showToast('Project ID y Database ID son obligatorios', 'warning');
      return;
    }

    onSave(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const isComplete = formData.projectId && formData.databaseId &&
                     formData.invoicesCollectionId && formData.entriesCollectionId &&
                     formData.transactionsCollectionId && formData.settingsCollectionId &&
                     formData.storageBucketId;

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-xl">
        <div className="flex items-start gap-4">
          <div className="bg-white/20 p-3 rounded-lg shrink-0">
            <Cloud className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Appwrite Cloud Backend</h3>
            <p className="text-sm text-blue-100 leading-relaxed">
              Conecta CBGest con Appwrite para sincronización multi-dispositivo,
              autenticación de usuarios, backups automáticos y colaboración en tiempo real.
            </p>
            <a
              href="https://cloud.appwrite.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-3 text-sm font-medium hover:underline"
            >
              Crear cuenta gratuita <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Help Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-amber-800 font-medium">¿Primera vez con Appwrite?</p>
          <p className="text-xs text-amber-700 mt-1">
            Consulta <span className="font-bold">APPWRITE_SETUP.md</span> para una guía completa paso a paso.
          </p>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
          <h4 className="font-semibold text-slate-900">Configuración de Conexión</h4>
        </div>

        <div className="p-6 space-y-5">
          {/* Endpoint */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Endpoint <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={formData.endpoint}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
              placeholder="https://cloud.appwrite.io/v1"
            />
            <p className="text-xs text-slate-400 mt-1">
              Cloud: <code>https://cloud.appwrite.io/v1</code> | Self-hosted: <code>http://tu-ip/v1</code>
            </p>
          </div>

          {/* Project ID */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Lock className="w-3 h-3" />
              Project ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.projectId}
              onChange={(e) => handleChange('projectId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
              placeholder="ej: 6473d8f9a1234567890"
            />
            <p className="text-xs text-slate-400 mt-1">
              Encuéntralo en: Appwrite Dashboard → Settings → Project ID
            </p>
          </div>

          {/* Database ID */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Database className="w-3 h-3" />
              Database ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.databaseId}
              onChange={(e) => handleChange('databaseId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
              placeholder="ej: cbgest_main"
            />
            <p className="text-xs text-slate-400 mt-1">
              Databases → Tu database → Settings → Database ID
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Collection IDs</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Invoices <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.invoicesCollectionId}
                  onChange={(e) => handleChange('invoicesCollectionId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                  placeholder="collection_id_invoices"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Entries <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.entriesCollectionId}
                  onChange={(e) => handleChange('entriesCollectionId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                  placeholder="collection_id_entries"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Transactions <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.transactionsCollectionId}
                  onChange={(e) => handleChange('transactionsCollectionId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                  placeholder="collection_id_transactions"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Settings <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.settingsCollectionId}
                  onChange={(e) => handleChange('settingsCollectionId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                  placeholder="collection_id_settings"
                />
              </div>
            </div>
          </div>

          {/* Storage Bucket */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Folder className="w-3 h-3" />
              Storage Bucket ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.storageBucketId}
              onChange={(e) => handleChange('storageBucketId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
              placeholder="ej: attachments"
            />
            <p className="text-xs text-slate-400 mt-1">
              Storage → Tu bucket → Settings → Bucket ID
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
              testResult === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testResult === 'success' ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  ✅ Conexión exitosa. Appwrite está listo.
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  ❌ Error de conexión. Verifica los datos.
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <div className="text-xs text-slate-500">
          {isComplete ? (
            <span className="text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Configuración completa
            </span>
          ) : (
            <span>Completa todos los campos obligatorios (*)</span>
          )}
        </div>

        <div className="flex gap-3">
          {onTest && (
            <button
              onClick={handleTest}
              disabled={!isComplete || isTesting}
              className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isTesting ? 'Probando...' : 'Probar Conexión'}
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={!isComplete}
            className={`px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSaved ? (
              <>
                <CheckCircle className="w-4 h-4" /> Guardado
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Guardar Configuración
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
