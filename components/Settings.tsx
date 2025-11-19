import React, { useState } from 'react';
import { Save, Users, Building, Info, Plus, Trash2 } from 'lucide-react';
import { AppSettings, Partner } from '../types';

interface SettingsProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onUpdateSettings }) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [isSaved, setIsSaved] = useState(false);

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
    // Validate participation total
    const totalParticipation = formData.partners.reduce((acc, curr) => acc + Number(curr.participation), 0);
    if (Math.abs(totalParticipation - 100) > 0.1) {
      alert(`La suma de participaciones debe ser 100%. Actual: ${totalParticipation}%`);
      return;
    }
    
    onUpdateSettings(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="p-8 animate-fade-in max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Configuración de la Entidad</h2>
        <p className="text-slate-500">Datos fiscales y estructura de la Comunidad de Bienes</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Datos Identificativos */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
            <Building className="w-5 h-5 text-slate-600" />
            <h3 className="font-semibold text-slate-800">Datos Fiscales</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Denominación (Razón Social)</label>
              <input 
                type="text" 
                value={formData.cbName}
                onChange={(e) => handleInputChange('cbName', e.target.value)}
                className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">NIF Comunidad</label>
              <input 
                type="text" 
                value={formData.nif}
                onChange={(e) => handleInputChange('nif', e.target.value)}
                className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="col-span-1 md:col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100">
               <label className="block text-sm font-semibold text-blue-900 mb-2">Régimen Fiscal</label>
               <div className="flex gap-6">
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input 
                    type="radio" 
                    name="fiscalRegime"
                    checked={formData.fiscalRegime === 'GENERAL'}
                    onChange={() => handleInputChange('fiscalRegime', 'GENERAL')}
                    className="text-blue-600 focus:ring-blue-500"
                   />
                   <span className="text-sm text-slate-700">General (Comercio/Servicios)</span>
                 </label>
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input 
                    type="radio" 
                    name="fiscalRegime"
                    checked={formData.fiscalRegime === 'ALQUILER_EXENTO'}
                    onChange={() => handleInputChange('fiscalRegime', 'ALQUILER_EXENTO')}
                    className="text-blue-600 focus:ring-blue-500"
                   />
                   <span className="text-sm text-slate-700 font-medium">Arrendamiento Inmuebles (Exento IVA)</span>
                 </label>
               </div>
               <p className="text-xs text-blue-700 mt-2 ml-1">
                 {formData.fiscalRegime === 'ALQUILER_EXENTO' 
                   ? 'La CB no presentará Modelo 303. El IVA soportado será considerado mayor gasto.'
                   : 'La CB presentará Modelo 303 trimestral y Modelo 390 anual.'}
               </p>
            </div>
            
            {formData.fiscalRegime === 'GENERAL' && (
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  checked={formData.vatObligation}
                  onChange={(e) => handleInputChange('vatObligation', e.target.checked)}
                  id="vatObligation"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="vatObligation" className="text-sm text-slate-700">Obligación de presentar autoliquidaciones periódicas de IVA</label>
              </div>
            )}
          </div>
        </div>

        {/* Comuneros */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-600" />
              <h3 className="font-semibold text-slate-800">Comuneros (Socios)</h3>
            </div>
            <button 
              type="button"
              onClick={addPartner}
              className="text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" /> Añadir
            </button>
          </div>
          
          <div className="divide-y divide-slate-100">
            {formData.partners.map((partner, index) => (
              <div key={partner.id} className="p-4 flex items-center gap-4">
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${index === 0 ? 'bg-indigo-500' : 'bg-purple-500'}`}>
                    {partner.name.charAt(0)}
                 </div>
                 <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Nombre</label>
                      <input 
                        type="text" 
                        value={partner.name}
                        onChange={(e) => handlePartnerChange(partner.id, 'name', e.target.value)}
                        className="w-full border-slate-200 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">NIF</label>
                      <input 
                        type="text" 
                        value={partner.nif}
                        onChange={(e) => handlePartnerChange(partner.id, 'nif', e.target.value)}
                        className="w-full border-slate-200 rounded text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">% Participación</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={partner.participation}
                          onChange={(e) => handlePartnerChange(partner.id, 'participation', parseFloat(e.target.value))}
                          className="w-full border-slate-200 rounded text-sm pr-8"
                        />
                        <span className="absolute right-3 top-2 text-xs text-slate-500">%</span>
                      </div>
                    </div>
                 </div>
                 {formData.partners.length > 1 && (
                   <button 
                    type="button"
                    onClick={() => removePartner(partner.id)}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                 )}
              </div>
            ))}
          </div>
          <div className="bg-slate-50 px-6 py-3 border-t border-slate-100">
             <div className="flex justify-end items-center gap-2 text-sm">
                <span className="text-slate-500">Total Participación:</span>
                <span className={`font-bold ${
                  Math.abs(formData.partners.reduce((a, c) => a + Number(c.participation), 0) - 100) < 0.1 
                  ? 'text-emerald-600' 
                  : 'text-red-600'
                }`}>
                  {formData.partners.reduce((a, c) => a + Number(c.participation), 0)}%
                </span>
             </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            type="submit"
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white shadow-lg shadow-blue-200 transition-all ${
              isSaved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSaved ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {isSaved ? 'Guardado Correctamente' : 'Guardar Configuración'}
          </button>
        </div>
      </form>
    </div>
  );
};

// Helper component just for the icon
import { CheckCircle } from 'lucide-react';
