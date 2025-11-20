import React, { useState } from 'react';
import { Save, Users, Building, Info, Plus, Trash2, Database, Cloud, HardDrive, Download, Upload, CheckCircle, FilePlus, FileInput, Lock, LogOut, Check, Clock, ShieldCheck } from 'lucide-react';
import { AppSettings, Partner, DataSourceType } from '../types';

interface SettingsProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  // File System Props
  currentFileName?: string;
  onCloneToFile: (password: string) => void; // Create new file from current data
  onLoadFromFile: (password: string) => void; // Load data from file
  onDisconnectFile: () => void; // Revert to Local Storage
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
  const [formData, setFormData] = useState<AppSettings>(settings);
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
    const updatedPartners = formData.partners.map(p => 
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
    setFormData({ ...formData, partners: [...formData.partners, newPartner] });
  };

  const removePartner = (id: string) => {
    setFormData({ ...formData, partners: formData.partners.filter(p => p.id !== id) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalParticipation = formData.partners.reduce((acc, curr) => acc + Number(curr.participation), 0);
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

  // Data Management Functions (Legacy JSON)
  const downloadBackup = () => {
    const data = {
        invoices: localStorage.getItem('gestcb_invoices'),
        entries: localStorage.getItem('gestcb_entries'),
        transactions: localStorage.getItem('gestcb_bank_transactions'),
        settings: localStorage.getItem('gestcb_settings'),
        timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gestcb_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const triggerFileInput = () => {
      document.getElementById('restore-input')?.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if(window.confirm("⚠️ ATENCIÓN: Esto SOBREESCRIBIRÁ todos los datos actuales. ¿Estás seguro?")) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              try {
                  const json = JSON.parse(ev.target?.result as string);
                  if (json.invoices) localStorage.setItem('gestcb_invoices', json.invoices);
                  if (json.entries) localStorage.setItem('gestcb_entries', json.entries);
                  if (json.transactions) localStorage.setItem('gestcb_bank_transactions', json.transactions);
                  if (json.settings) localStorage.setItem('gestcb_settings', json.settings);
                  alert("Datos restaurados correctamente. La página se recargará.");
                  window.location.reload();
              } catch (err) {
                  alert("Error al leer el archivo de copia de seguridad.");
              }
          };
          reader.readAsText(file);
      }
  };

  // CONFIRMATION HANDLERS
  const handleLocalModeClick = () => {
      if (isLocalFileMode) {
          if (window.confirm("¿Estás seguro de que quieres cambiar a 'Navegador Local'?\n\nSe cerrará la conexión con el archivo cifrado actual. Los cambios futuros no se guardarán en el archivo.")) {
              onDisconnectFile();
          }
      }
      // If already local, do nothing or maybe show a toast saying "Already active"
  };

  const handleFileModeClick = (action: 'CREATE' | 'OPEN') => {
       if (isLocalFileMode) {
           if (!window.confirm("⚠️ Ya tienes un archivo abierto y conectado.\n\n¿Quieres cerrar la sesión actual para abrir o crear un archivo diferente?")) {
               return;
           }
       }
       setShowPasswordModal(action);
  };

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

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
        <button 
            onClick={() => setActiveTab('GENERAL')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'GENERAL' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            <Building className="w-4 h-4 inline mr-2" /> Datos Fiscales
        </button>
        <button 
            onClick={() => setActiveTab('PARTNERS')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'PARTNERS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            <Users className="w-4 h-4 inline mr-2" /> Comuneros
        </button>
        <button 
            onClick={() => setActiveTab('DATA')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'DATA' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            <Database className="w-4 h-4 inline mr-2" /> Datos y Conexiones
        </button>
      </div>

      {/* --- DATA TAB CONTENT --- */}
      {activeTab === 'DATA' && (
        <div className="space-y-8 animate-fade-in">
            {/* 1. Data Source Selector - IMPROVED UX */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-500" />
                    Fuente de Datos
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* CARD: LOCAL STORAGE */}
                    <button 
                        type="button"
                        onClick={handleLocalModeClick}
                        className={`relative p-6 rounded-xl border-2 text-left transition-all duration-300 group ${
                            !isLocalFileMode 
                            ? 'border-blue-600 bg-blue-50 ring-4 ring-blue-100 shadow-lg scale-[1.02] z-10' 
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 opacity-80 hover:opacity-100'
                        }`}
                    >
                        {!isLocalFileMode && (
                            <div className="absolute -top-3 -right-3 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> ACTIVO
                            </div>
                        )}
                        <HardDrive className={`w-8 h-8 mb-4 ${!isLocalFileMode ? 'text-blue-600' : 'text-slate-400'}`} />
                        <h3 className={`text-lg font-bold mb-2 ${!isLocalFileMode ? 'text-blue-900' : 'text-slate-700'}`}>Navegador Local</h3>
                        <p className="text-sm text-slate-500 leading-relaxed">
                            Los datos se guardan temporalmente en la memoria de este navegador. 
                            <span className="block mt-2 text-xs text-amber-600 bg-amber-50 p-1 rounded border border-amber-100">
                                ⚠️ Riesgo: Si borras caché, pierdes los datos.
                            </span>
                        </p>
                    </button>

                    {/* CARD: SECURE FILE MODE */}
                    <div className={`relative col-span-2 p-6 rounded-xl border-2 transition-all duration-300 ${
                        isLocalFileMode 
                        ? 'border-blue-600 bg-blue-50 ring-4 ring-blue-100 shadow-lg scale-[1.01] z-10' 
                        : 'border-slate-200 bg-white'
                    }`}>
                        {isLocalFileMode && (
                            <div className="absolute -top-3 -right-3 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> ACTIVO
                            </div>
                        )}
                        
                        <div className="flex flex-col md:flex-row justify-between gap-6 h-full">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`p-2 rounded-lg ${isLocalFileMode ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <Lock className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className={`text-lg font-bold ${isLocalFileMode ? 'text-blue-900' : 'text-slate-700'}`}>
                                            Archivo Seguro (.gestcb)
                                        </h3>
                                        <p className="text-sm text-slate-500">Base de datos física encriptada (AES-GCM).</p>
                                    </div>
                                </div>

                                {isLocalFileMode ? (
                                    <div className="bg-white/60 p-4 rounded-lg border border-blue-200 backdrop-blur-sm">
                                        <div className="flex items-center gap-2 mb-2 text-blue-800 font-bold text-sm uppercase tracking-wide">
                                            <ShieldCheck className="w-4 h-4" /> Conexión Establecida
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm text-blue-900"><span className="font-semibold opacity-70">Archivo:</span> {currentFileName}</p>
                                            {lastSaved ? (
                                                <p className="text-xs text-emerald-600 flex items-center gap-1 font-mono">
                                                    <Clock className="w-3 h-3" /> Guardado: {lastSaved.toLocaleTimeString()}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-amber-600 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> Esperando primer guardado...
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                        Crea un archivo único en tu ordenador donde se guardará toda tu contabilidad, facturas y adjuntos de forma segura. 
                                        <span className="block mt-2 font-medium text-slate-800">Requiere contraseña maestra.</span>
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-col justify-center gap-3 min-w-[220px] border-l border-slate-100 pl-0 md:pl-6">
                                {isLocalFileMode ? (
                                    <>
                                        <button 
                                            onClick={() => handleLocalModeClick()} 
                                            className="w-full py-3 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-medium transition-colors flex items-center justify-center gap-2"
                                        >
                                            <LogOut className="w-4 h-4" /> Cerrar Archivo
                                        </button>
                                        <p className="text-[10px] text-slate-400 text-center">Para cambiar de archivo, cierra el actual primero.</p>
                                    </>
                                ) : (
                                    <>
                                        <button 
                                            onClick={() => handleFileModeClick('CREATE')}
                                            className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                                        >
                                            <FilePlus className="w-4 h-4" /> Crear Nueva BD
                                        </button>
                                        <button 
                                            onClick={() => handleFileModeClick('OPEN')}
                                            className="w-full bg-white border border-slate-300 text-slate-700 py-3 rounded-lg font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <FileInput className="w-4 h-4" /> Abrir Existente
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* 2. Backup & Restore (Legacy) */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 opacity-70 hover:opacity-100 transition-opacity">
                 <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">Herramientas de Emergencia (Sin Cifrado)</h3>
                    <div className="flex flex-col md:flex-row gap-4">
                        <button 
                            type="button" 
                            onClick={downloadBackup}
                            className="flex-1 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 py-2 rounded-lg flex items-center justify-center gap-2 transition-all text-sm"
                        >
                            <Download className="w-4 h-4" /> Exportar JSON (Backup)
                        </button>
                        
                        <input type="file" id="restore-input" className="hidden" accept=".json" onChange={handleRestore} />
                        <button 
                            type="button" 
                            onClick={triggerFileInput}
                            className="flex-1 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 py-2 rounded-lg flex items-center justify-center gap-2 transition-all text-sm"
                        >
                            <Upload className="w-4 h-4" /> Importar JSON
                        </button>
                    </div>
            </div>
        </div>
      )}

      {/* ... Other Tabs (GENERAL, PARTNERS) Render Logic ... */}
      {activeTab === 'GENERAL' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Denominación (Razón Social)</label>
                    <input type="text" value={formData.cbName} onChange={(e) => handleInputChange('cbName', e.target.value)} className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900" />
                    </div>
                    <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">NIF Comunidad</label>
                    <input type="text" value={formData.nif} onChange={(e) => handleInputChange('nif', e.target.value)} className="w-full border-slate-200 rounded-lg text-sm font-mono bg-white text-slate-900" />
                    </div>
                    <div className="col-span-1 md:col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <label className="block text-sm font-semibold text-blue-900 mb-2">Régimen Fiscal</label>
                    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="fiscalRegime" checked={formData.fiscalRegime === 'GENERAL'} onChange={() => handleInputChange('fiscalRegime', 'GENERAL')} className="text-blue-600 focus:ring-blue-500 bg-white" />
                        <span className="text-sm text-slate-700">General (IVA Trimestral)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="fiscalRegime" checked={formData.fiscalRegime === 'ALQUILER_EXENTO'} onChange={() => handleInputChange('fiscalRegime', 'ALQUILER_EXENTO')} className="text-blue-600 focus:ring-blue-500 bg-white" />
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
                    {formData.partners.map((partner, index) => (
                    <div key={partner.id} className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${index % 2 === 0 ? 'bg-indigo-500' : 'bg-purple-500'}`}>{partner.name.charAt(0)}</div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input type="text" placeholder="Nombre" value={partner.name} onChange={(e) => handlePartnerChange(partner.id, 'name', e.target.value)} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" />
                            <input type="text" placeholder="NIF" value={partner.nif} onChange={(e) => handlePartnerChange(partner.id, 'nif', e.target.value)} className="w-full border-slate-200 rounded text-sm font-mono bg-white text-slate-900" />
                            <div className="relative">
                                <input type="number" value={partner.participation} onChange={(e) => handlePartnerChange(partner.id, 'participation', parseFloat(e.target.value))} className="w-full border-slate-200 rounded text-sm pr-8 bg-white text-slate-900" />
                                <span className="absolute right-3 top-2 text-xs text-slate-500">%</span>
                            </div>
                        </div>
                        {formData.partners.length > 1 && (
                            <button type="button" onClick={() => removePartner(partner.id)} className="self-end md:self-center p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        )}
                    </div>
                    ))}
                </div>
                <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-end items-center gap-2 text-sm">
                    <span className="text-slate-500">Total:</span>
                    <span className={`font-bold ${Math.abs(formData.partners.reduce((a, c) => a + Number(c.participation), 0) - 100) < 0.1 ? 'text-emerald-600' : 'text-red-600'}`}>{formData.partners.reduce((a, c) => a + Number(c.participation), 0)}%</span>
                </div>
            </div>
        )}


        {/* Password Modal */}
        {showPasswordModal !== 'NONE' && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-fade-in-up">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                        <div className="bg-amber-100 p-2 rounded-full">
                             <Lock className="w-5 h-5 text-amber-600" />
                        </div>
                        <h3 className="font-bold text-slate-900">Seguridad Requerida</h3>
                    </div>
                    <div className="p-6">
                        <p className="text-sm text-slate-600 mb-4">
                            {showPasswordModal === 'CREATE' 
                                ? 'Establece una contraseña robusta para cifrar tu archivo .gestcb. Si la pierdes, los datos serán irrecuperables.' 
                                : 'Introduce la contraseña para descifrar y abrir el archivo.'}
                        </p>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña de cifrado</label>
                        <input 
                            type="password" 
                            autoFocus
                            className="w-full border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white text-slate-900"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                        />
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <button onClick={() => setShowPasswordModal('NONE')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancelar</button>
                        <button onClick={handlePasswordSubmit} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800">
                            {showPasswordModal === 'CREATE' ? 'Encriptar y Guardar' : 'Descifrar y Abrir'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};