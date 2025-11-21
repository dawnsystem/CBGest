
import React, { useState, useEffect } from 'react';
import { Save, Users, Building, Info, Plus, Trash2, Database, Cloud, HardDrive, Download, Upload, CheckCircle, FilePlus, FileInput, Lock, LogOut, Check, Clock, ShieldCheck, Wifi, AlertTriangle, HelpCircle } from 'lucide-react';
import { AppSettings, Partner, DataSourceType } from '../types';
import { APPWRITE_CONFIG } from '../config/appwrite';

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
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'PARTNERS' | 'DATA'>('GENERAL');
  
  // Ensure partners is initialized correctly even if settings.partners is missing
  const [formData, setFormData] = useState<AppSettings>({
      ...settings,
      partners: settings.partners || []
  });
  
  // Sync with incoming settings props changes
  useEffect(() => {
      setFormData(prev => ({
          ...settings,
          partners: settings.partners || prev.partners || []
      }));
  }, [settings]);

  const [isSaved, setIsSaved] = useState(false);

  // Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState<'NONE' | 'CREATE' | 'OPEN'>('NONE');
  const [passwordInput, setPasswordInput] = useState('');

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
      id: Math.random().toString(36).substr(2, 9),
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
      alert(`La suma de participaciones debe ser 100%. Actual: ${totalParticipation}%`);
      return;
    }
    onUpdateSettings(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handlePasswordSubmit = () => {
      if (!passwordInput) {
          alert("La contraseña no puede estar vacía.");
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

  const handleLocalModeClick = () => {
      if (isLocalFileMode) {
          if (window.confirm("¿Estás seguro de que quieres cambiar a 'Navegador Local'?")) {
              onDisconnectFile();
          }
      }
  };

  const handleFileModeClick = (action: 'CREATE' | 'OPEN') => {
       if (isLocalFileMode) {
           if (!window.confirm("⚠️ Ya tienes un archivo abierto. ¿Cerrar sesión actual?")) {
               return;
           }
       }
       setShowPasswordModal(action);
  };

  // Safeguard partners
  const partners = formData.partners || [];

  return (
    <div className="p-4 md:p-8 animate-fade-in max-w-5xl mx-auto pb-24">
      <div className="flex justify-between items-center mb-6">
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
      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
        <button onClick={() => setActiveTab('GENERAL')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'GENERAL' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Building className="w-4 h-4 inline mr-2" /> Datos Fiscales
        </button>
        <button onClick={() => setActiveTab('PARTNERS')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'PARTNERS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Users className="w-4 h-4 inline mr-2" /> Comuneros
        </button>
        <button onClick={() => setActiveTab('DATA')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'DATA' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Database className="w-4 h-4 inline mr-2" /> Datos y Conexiones
        </button>
      </div>

      {/* --- DATA TAB CONTENT --- */}
      {activeTab === 'DATA' && (
        <div className="space-y-8 animate-fade-in">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. LOCAL STORAGE */}
                <button 
                    type="button"
                    onClick={handleLocalModeClick}
                    className={`relative p-6 rounded-xl border-2 text-left transition-all duration-300 ${
                        !isLocalFileMode && formData.dataConfig?.type === 'LOCAL_STORAGE'
                        ? 'border-blue-600 bg-blue-50 ring-4 ring-blue-100 shadow-lg z-10' 
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <HardDrive className={`w-8 h-8 mb-4 text-slate-600`} />
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Navegador Local</h3>
                    <p className="text-sm text-slate-500">Uso básico. Sin configuración.</p>
                </button>

                {/* 2. APPWRITE CLOUD */}
                <div className={`relative p-6 rounded-xl border-2 transition-all duration-300 col-span-1 md:col-span-2 ${
                    formData.dataConfig?.type === 'APPWRITE'
                    ? 'border-pink-600 bg-pink-50 ring-4 ring-pink-100 shadow-lg z-10'
                    : 'border-slate-200 bg-white'
                }`}>
                    {formData.dataConfig?.type === 'APPWRITE' && (
                        <div className="absolute -top-3 -right-3 bg-pink-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md">CONECTADO</div>
                    )}

                    <div className="flex items-start gap-4 mb-4">
                        <Cloud className={`w-8 h-8 ${formData.dataConfig?.type === 'APPWRITE' ? 'text-pink-600' : 'text-slate-400'}`} />
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Backend Appwrite</h3>
                            <p className="text-sm text-slate-500">Sincronización completa en la nube.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                API Endpoint
                            </label>
                            <div className="w-full border-slate-200 border rounded text-sm bg-slate-50 text-slate-700 font-mono px-3 py-2">
                                {APPWRITE_CONFIG.endpoint}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                Project ID
                            </label>
                            <div className="w-full border-slate-200 border rounded text-sm bg-slate-50 text-slate-700 font-mono px-3 py-2">
                                {APPWRITE_CONFIG.projectId}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                Database ID
                            </label>
                            <div className="w-full border-slate-200 border rounded text-sm bg-slate-50 text-slate-700 font-mono px-3 py-2">
                                {APPWRITE_CONFIG.databaseId}
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                Bucket ID (Storage)
                            </label>
                            <div className="w-full border-slate-200 border rounded text-sm bg-slate-50 text-slate-700 font-mono px-3 py-2">
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
                    <label className="block text-sm font-semibold text-blue-900 mb-2">Régimen Fiscal</label>
                    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                        <label htmlFor="settings-fiscalregime-general-radio" className="flex items-center gap-2 cursor-pointer">
                        <input id="settings-fiscalregime-general-radio" type="radio" name="fiscalRegime" checked={formData.fiscalRegime === 'GENERAL'} onChange={() => handleInputChange('fiscalRegime', 'GENERAL')} className="text-blue-600 focus:ring-blue-500 bg-white" />
                        <span className="text-sm text-slate-700">General (IVA Trimestral)</span>
                        </label>
                        <label htmlFor="settings-fiscalregime-alquiler-radio" className="flex items-center gap-2 cursor-pointer">
                        <input id="settings-fiscalregime-alquiler-radio" type="radio" name="fiscalRegime" checked={formData.fiscalRegime === 'ALQUILER_EXENTO'} onChange={() => handleInputChange('fiscalRegime', 'ALQUILER_EXENTO')} className="text-blue-600 focus:ring-blue-500 bg-white" />
                        <span className="text-sm text-slate-700 font-medium">Arrendamiento Inmuebles (Exento IVA)</span>
                        </label>
                    </div>
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
