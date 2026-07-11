
import React, { useState, useEffect } from 'react';
import { Save, Users, Building, Info, Plus, Trash2, Database, Cloud, HardDrive, Download, Upload, CheckCircle, FilePlus, FileInput, Lock, LogOut, Check, Clock, ShieldCheck, Wifi, AlertTriangle, HelpCircle, Receipt, Euro } from 'lucide-react';
import { AppSettings, Partner, DataSourceType, TouristTaxConfig } from '../types';
import { APPWRITE_CONFIG } from '../config/appwrite';
import { createDefaultDataSourceConfig, generateId } from '../utils/defaults';
import { useToast } from './Toast';

interface SettingsProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  // File System Props
  currentFileName?: string;
  onCloneToFile: (password: string) => void;
  onLoadFromFile: (password: string) => void;
  onDisconnectFile: () => void;
  isLocalFileMode: boolean;
  lastSaved?: Date | null;
}

export const Settings: React.FC<SettingsProps> = ({ 
    settings, 
    onUpdateSettings, 
    currentFileName, 
    onCloneToFile, 
    onLoadFromFile, 
    onDisconnectFile,
    isLocalFileMode,
    lastSaved
}) => {
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'PARTNERS' | 'TAX' | 'DATA'>('GENERAL');
  
  // Initialize form data with settings
  // Using a function to compute initial state avoids the need for useEffect sync
  const getInitialFormData = (): AppSettings => ({
    ...settings,
    partners: settings.partners || [],
    dataConfig: settings.dataConfig || createDefaultDataSourceConfig()
  });

  const [formData, setFormData] = useState<AppSettings>(getInitialFormData);

  // Track settings reference to detect external changes
  const settingsRef = React.useRef(settings);

  // Sync with incoming settings props changes only when they actually change
  React.useEffect(() => {
    // Only update if settings reference changed (external update)
    if (settingsRef.current !== settings) {
      settingsRef.current = settings;
      setFormData({
        ...settings,
        partners: settings.partners || [],
        dataConfig: settings.dataConfig || createDefaultDataSourceConfig()
      });
    }
  }, [settings]);

  const [isSaved, setIsSaved] = useState(false);

  // Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState<'NONE' | 'CREATE' | 'OPEN'>('NONE');
  const [passwordInput, setPasswordInput] = useState('');
  const { showToast, showConfirm } = useToast();

  // Handlers
  const handleInputChange = (field: keyof AppSettings, value: any) => {
    setFormData({ ...formData, [field]: value });
    setIsSaved(false);
  };

  const handlePartnerChange = (id: string, field: keyof Partner, value: string | number) => {
    const updatedPartners = (formData.partners || []).map(p => 
      p.id === id ? { ...p, [field]: value } : p
    );
    setFormData({ ...formData, partners: updatedPartners });
    setIsSaved(false);
  };

  const addPartner = () => {
    const newPartner: Partner = {
      id: generateId(),
      name: 'Nuevo Comunero',
      nif: '',
      participation: 0
    };
    setFormData({ ...formData, partners: [...(formData.partners || []), newPartner] });
  };

  const removePartner = (id: string) => {
    setFormData({ ...formData, partners: (formData.partners || []).filter(p => p.id !== id) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalParticipation = (formData.partners || []).reduce((acc, curr) => acc + Number(curr.participation), 0);
    if (Math.abs(totalParticipation - 100) > 0.1) {
      showToast(`La suma de participaciones debe ser 100%. Actual: ${totalParticipation}%`, 'warning');
      return;
    }
    onUpdateSettings(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handlePasswordSubmit = () => {
      if (!passwordInput) {
          showToast("La contraseña no puede estar vacía.", "warning");
          return;
      }
      if (showPasswordModal === 'CREATE') {
          onCloneToFile(passwordInput);
      } else if (showPasswordModal === 'OPEN') {
          onLoadFromFile(passwordInput);
      }
      setShowPasswordModal('NONE');
      setPasswordInput('');
  };

  const handleLocalModeClick = async () => {
      if (isLocalFileMode) {
          if (await showConfirm("¿Estás seguro de que quieres cambiar a 'Navegador Local'?")) {
              onDisconnectFile();
          }
      }
  };

  const handleFileModeClick = async (action: 'CREATE' | 'OPEN') => {
       if (isLocalFileMode) {
           if (!(await showConfirm("⚠️ Ya tienes un archivo abierto. ¿Cerrar sesión actual?"))) {
               return;
           }
       }
       setShowPasswordModal(action);
  };

  // Safeguard partners
  const partners = formData.partners || [];

  return (
    <div className="p-4 md:p-8 animate-fade-in max-w-5xl mx-auto pb-24 md:pb-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
            <h2 className="text-2xl font-bold text-slate-900">Configuración</h2>
            <p className="text-slate-500">Gestión integral de la entidad y datos.</p>
        </div>
        <button 
            onClick={handleSubmit}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium text-white shadow-lg transition-all ${
              isSaved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-900 hover:bg-slate-800'
            }`}
        >
            {isSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaved ? 'Guardado' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <button onClick={() => setActiveTab('GENERAL')} className={`px-4 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'GENERAL' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Building className="w-4 h-4 inline mr-1 md:mr-2" /> <span className="hidden sm:inline">Datos</span> Fiscales
        </button>
        <button onClick={() => setActiveTab('PARTNERS')} className={`px-4 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'PARTNERS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Users className="w-4 h-4 inline mr-1 md:mr-2" /> Comuneros
        </button>
        <button onClick={() => setActiveTab('TAX')} className={`px-4 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'TAX' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Receipt className="w-4 h-4 inline mr-1 md:mr-2" /> <span className="hidden sm:inline">Tasa</span> Turística
        </button>
        <button onClick={() => setActiveTab('DATA')} className={`px-4 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'DATA' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Database className="w-4 h-4 inline mr-1 md:mr-2" /> <span className="hidden sm:inline">Datos y</span> Conexiones
        </button>
      </div>

      {/* --- DATA TAB CONTENT --- */}
      {activeTab === 'DATA' && (
        <div className="space-y-6 animate-fade-in">
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* 1. LOCAL STORAGE */}
                <button 
                    type="button"
                    onClick={handleLocalModeClick}
                    className={`relative p-4 md:p-6 rounded-xl border-2 text-left transition-all duration-300 ${
                        !isLocalFileMode && formData.dataConfig?.type === 'LOCAL_STORAGE'
                        ? 'border-blue-600 bg-blue-50 ring-4 ring-blue-100 shadow-lg z-10' 
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <HardDrive className={`w-6 md:w-8 h-6 md:h-8 mb-3 md:mb-4 text-slate-600`} />
                    <h3 className="text-base md:text-lg font-bold text-slate-900 mb-2">Navegador Local</h3>
                    <p className="text-sm text-slate-500">Uso básico. Sin configuración.</p>
                </button>

                {/* 2. APPWRITE CLOUD */}
                <div className={`relative p-4 md:p-6 rounded-xl border-2 transition-all duration-300 lg:col-span-2 ${
                    formData.dataConfig?.type === 'APPWRITE'
                    ? 'border-pink-600 bg-pink-50 ring-4 ring-pink-100 shadow-lg z-10'
                    : 'border-slate-200 bg-white'
                }`}>
                    {formData.dataConfig?.type === 'APPWRITE' && (
                        <div className="absolute -top-3 -right-3 bg-pink-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md">CONECTADO</div>
                    )}

                    <div className="flex items-start gap-3 md:gap-4 mb-4">
                        <Cloud className={`w-6 md:w-8 h-6 md:h-8 flex-shrink-0 ${formData.dataConfig?.type === 'APPWRITE' ? 'text-pink-600' : 'text-slate-400'}`} />
                        <div className="min-w-0">
                            <h3 className="text-base md:text-lg font-bold text-slate-900">Backend Appwrite</h3>
                            <p className="text-sm text-slate-500">Sincronización completa en la nube.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                API Endpoint
                            </label>
                            <div className="w-full border-slate-200 border rounded text-xs md:text-sm bg-slate-50 text-slate-700 font-mono px-3 py-2 truncate">
                                {APPWRITE_CONFIG.endpoint}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Project ID
                                </label>
                                <div className="w-full border-slate-200 border rounded text-xs md:text-sm bg-slate-50 text-slate-700 font-mono px-3 py-2 truncate">
                                    {APPWRITE_CONFIG.projectId}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Database ID
                                </label>
                                <div className="w-full border-slate-200 border rounded text-xs md:text-sm bg-slate-50 text-slate-700 font-mono px-3 py-2 truncate">
                                    {APPWRITE_CONFIG.databaseId}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                Bucket ID (Storage)
                            </label>
                            <div className="w-full border-slate-200 border rounded text-xs md:text-sm bg-slate-50 text-slate-700 font-mono px-3 py-2 truncate">
                                {APPWRITE_CONFIG.bucketId}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 bg-emerald-50 p-3 rounded border border-emerald-200 text-xs text-slate-600 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <p className="text-emerald-700 font-medium">
                            Configuración del servidor establecida. La conexión es automática.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* ... Rest of tabs ... */}
      {activeTab === 'GENERAL' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-fade-in">
                {/* Existing General Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                    <label htmlFor="settings-cbname-input" className="block text-sm font-medium text-slate-700 mb-1">Denominación (Razón Social)</label>
                    <input id="settings-cbname-input" name="cbName" type="text" value={formData.cbName} onChange={(e) => handleInputChange('cbName', e.target.value)} className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900" autoComplete="organization" />
                    </div>
                    <div>
                    <label htmlFor="settings-nif-input" className="block text-sm font-medium text-slate-700 mb-1">NIF Comunidad</label>
                    <input id="settings-nif-input" name="nif" type="text" value={formData.nif} onChange={(e) => handleInputChange('nif', e.target.value)} className="w-full border-slate-200 rounded-lg text-sm font-mono bg-white text-slate-900" autoComplete="off" />
                    </div>
                    <div className="col-span-1 md:col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-blue-900">Régimen Fiscal</label>
                      {formData.fiscalRegime === 'ALQUILER_EXENTO' && (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                          ✓ IRPF Activo
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                        <label htmlFor="settings-fiscalregime-general-radio" className="flex items-center gap-2 cursor-pointer">
                        <input id="settings-fiscalregime-general-radio" type="radio" name="fiscalRegime" checked={formData.fiscalRegime === 'GENERAL'} onChange={() => handleInputChange('fiscalRegime', 'GENERAL')} className="text-blue-600 focus:ring-blue-500 bg-white" />
                        <span className="text-sm text-slate-700">General (IVA Trimestral)</span>
                        </label>
                        <label htmlFor="settings-fiscalregime-alquiler-radio" className="flex items-center gap-2 cursor-pointer">
                        <input id="settings-fiscalregime-alquiler-radio" type="radio" name="fiscalRegime" checked={formData.fiscalRegime === 'ALQUILER_EXENTO'} onChange={() => handleInputChange('fiscalRegime', 'ALQUILER_EXENTO')} className="text-blue-600 focus:ring-blue-500 bg-white" />
                        <span className="text-sm font-semibold text-emerald-700">IRPF Simplificado — Arrendamiento Exento IVA</span>
                        </label>
                    </div>
                    {formData.fiscalRegime === 'ALQUILER_EXENTO' && (
                      <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1">
                        <p className="font-semibold">Flujo contable IRPF activo:</p>
                        <p>📄 <strong>Factura emitida/recibida</strong> → asiento 2 líneas: cuenta de ingreso/gasto + cuenta pendiente (430 clientes / 410 acreedores)</p>
                        <p>🏦 <strong>Cobro/Pago bancario</strong> → cierra la cuenta pendiente contra 572 Bancos</p>
                        <p>⚠️ Las cuentas <strong>472 (IVA soportado)</strong> y <strong>477 (IVA repercutido)</strong> no se usan en este régimen.</p>
                      </div>
                    )}
                    </div>
                </div>
            </div>
        )}
      
      {activeTab === 'PARTNERS' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-800">Distribución de Participación</h3>
                    <button type="button" onClick={addPartner} className="text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
                    <Plus className="w-3 h-3" /> Añadir Socio
                    </button>
                </div>
                <div className="divide-y divide-slate-100">
                    {partners.length === 0 && (
                        <div className="p-4 text-center text-slate-400 text-sm">No hay comuneros. Añade uno.</div>
                    )}
                    {partners.map((partner, index) => (
                    <div key={partner.id} className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${index % 2 === 0 ? 'bg-indigo-500' : 'bg-purple-500'}`}>
                            {partner.name.charAt(0)}
                        </div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input id={`settings-partner-${partner.id}-name-input`} name={`partner-${partner.id}-name`} type="text" placeholder="Nombre" value={partner.name} onChange={(e) => handlePartnerChange(partner.id, 'name', e.target.value)} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" autoComplete="name" />
                            <input id={`settings-partner-${partner.id}-nif-input`} name={`partner-${partner.id}-nif`} type="text" placeholder="NIF" value={partner.nif} onChange={(e) => handlePartnerChange(partner.id, 'nif', e.target.value)} className="w-full border-slate-200 rounded text-sm font-mono bg-white text-slate-900" autoComplete="off" />
                            <div className="relative">
                                <input id={`settings-partner-${partner.id}-participation-input`} name={`partner-${partner.id}-participation`} type="number" value={partner.participation} onChange={(e) => handlePartnerChange(partner.id, 'participation', parseFloat(e.target.value))} className="w-full border-slate-200 rounded text-sm pr-8 bg-white text-slate-900" autoComplete="off" />
                                <span className="absolute right-3 top-2 text-xs text-slate-500">%</span>
                            </div>
                        </div>
                        {partners.length > 1 && (
                            <button type="button" onClick={() => removePartner(partner.id)} className="self-end md:self-center p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        )}
                    </div>
                    ))}
                </div>
            </div>
        )}

      {/* --- TAX TAB CONTENT --- */}
      {activeTab === 'TAX' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Receipt className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Configuración de Tasa Turística (IEET)</h3>
                <p className="text-sm text-slate-500">Impost sobre Estades en Establiments Turístics - Cataluña</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Enable/Disable */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.touristTaxConfig?.enabled ?? true}
                    onChange={(e) => setFormData({
                      ...formData,
                      touristTaxConfig: {
                        ...formData.touristTaxConfig || { rate: 1, maxNights: 7, minAge: 17, enabled: true },
                        enabled: e.target.checked
                      }
                    })}
                    className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-medium text-slate-900">Activar gestión de tasa turística</span>
                    <p className="text-xs text-slate-500">Habilita el cálculo y seguimiento de la tasa turística</p>
                  </div>
                </label>
              </div>

              {/* Rate */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tarifa por noche/adulto
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.touristTaxConfig?.rate ?? 1}
                    onChange={(e) => setFormData({
                      ...formData,
                      touristTaxConfig: {
                        ...formData.touristTaxConfig || { rate: 1, maxNights: 7, minAge: 17, enabled: true },
                        rate: parseFloat(e.target.value) || 1
                      }
                    })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm pr-8"
                  />
                  <Euro className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 mt-1">Actualmente en Cataluña: 1€ (puede variar según zona)</p>
              </div>

              {/* Max Nights */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Máximo de noches por estancia
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={formData.touristTaxConfig?.maxNights ?? 7}
                  onChange={(e) => setFormData({
                    ...formData,
                    touristTaxConfig: {
                      ...formData.touristTaxConfig || { rate: 1, maxNights: 7, minAge: 17, enabled: true },
                      maxNights: parseInt(e.target.value) || 7
                    }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Máximo de noches que se cobra por estancia (incluso consecutivas)</p>
              </div>

              {/* Min Age */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Edad mínima para pagar tasa
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={formData.touristTaxConfig?.minAge ?? 17}
                    onChange={(e) => setFormData({
                      ...formData,
                      touristTaxConfig: {
                        ...formData.touristTaxConfig || { rate: 1, maxNights: 7, minAge: 17, enabled: true },
                        minAge: parseInt(e.target.value) || 17
                      }
                    })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Los menores de esta edad no pagan tasa turística</p>
              </div>
            </div>

            {/* Info Box */}
            <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-2">Información sobre la Tasa Turística en Cataluña:</p>
                  <ul className="list-disc ml-4 space-y-1 text-xs">
                    <li>Se aplica solo a <strong>apartamentos turísticos</strong> (con licencia HUT)</li>
                    <li>Las <strong>estancias consecutivas</strong> del mismo huésped cuentan como una única estancia</li>
                    <li>Liquidación semestral: <strong>Abril</strong> (2º sem. anterior) y <strong>Octubre</strong> (1er sem. año)</li>
                    <li>Presentación en el Portal de la <strong>Agència Tributària de Catalunya</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Deposit Configuration */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Euro className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Configuración de Fianzas</h3>
                <p className="text-sm text-slate-500">Depósitos de garantía por tipo de alquiler</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🏖️</span>
                  <h4 className="font-medium text-amber-800">Apartamentos Turísticos</h4>
                </div>
                <p className="text-3xl font-bold text-amber-600 mb-1">100€</p>
                <p className="text-xs text-amber-700">Fianza fija por estancia</p>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🏠</span>
                  <h4 className="font-medium text-blue-800">Vivienda Habitual</h4>
                </div>
                <p className="text-3xl font-bold text-blue-600 mb-1">1 mes</p>
                <p className="text-xs text-blue-700">Equivalente a 1 mes de alquiler</p>
              </div>
            </div>
          </div>
        </div>
      )}
        
        {/* Password Modal (Existing) */}
        {showPasswordModal !== 'NONE' && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                {/* ... modal content ... */}
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
                     {/* ... content same as previous ... */}
                     <div className="bg-slate-50 px-6 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-900">Contraseña</h3></div>
                     <div className="p-6">
                        <input id="settings-password-input" name="password" type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="w-full border p-2 rounded" autoFocus onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()} autoComplete="current-password"/>
                     </div>
                     <div className="p-6 flex justify-end gap-2"><button onClick={() => setShowPasswordModal('NONE')}>Cancelar</button><button onClick={handlePasswordSubmit} className="bg-blue-600 text-white px-4 py-2 rounded">Confirmar</button></div>
                </div>
            </div>
        )}
    </div>
  );
};
