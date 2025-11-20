import React, { useState } from 'react';
import { Partner, PartnerTaxInfo } from '../types';
import { X, Save, Calculator } from 'lucide-react';

interface PartnerTaxFormProps {
  partner: Partner;
  onSave: (partnerId: string, taxInfo: PartnerTaxInfo) => void;
  onClose: () => void;
}

export const PartnerTaxForm: React.FC<PartnerTaxFormProps> = ({ partner, onSave, onClose }) => {
  const [info, setInfo] = useState<PartnerTaxInfo>(partner.taxInfo || {
    otherWorkIncome: 0,
    otherActivitiesIncome: 0,
    taxResidency: 'CATALUÑA',
    maritalStatus: 'SINGLE',
    childrenCount: 0,
    disability: false,
    deductibleExpenses: 0
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(partner.id, info);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in-up">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-purple-100 p-2 rounded-lg">
                <Calculator className="w-5 h-5 text-purple-600" />
             </div>
             <div>
               <h3 className="font-bold text-slate-900">Datos Fiscales Personales</h3>
               <p className="text-xs text-slate-500">Para simulación de IRPF de {partner.name}</p>
             </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
             <p>⚠️ Introduce tus ingresos <strong>fuera</strong> de esta Comunidad de Bienes. Los rendimientos de la CB se calcularán automáticamente.</p>
           </div>

           <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rendimientos del Trabajo</label>
             <div className="relative">
               <input 
                 type="number" 
                 value={info.otherWorkIncome} 
                 onChange={e => setInfo({...info, otherWorkIncome: Number(e.target.value)})}
                 className="w-full border-slate-200 rounded-lg pl-8 py-2 text-sm bg-white text-slate-900"
                 placeholder="0.00"
               />
               <span className="absolute left-3 top-2 text-slate-400">€</span>
             </div>
             <p className="text-[10px] text-slate-400 mt-1">Nóminas brutas anuales, pensiones, etc.</p>
           </div>

           <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Otros Rendimientos</label>
             <div className="relative">
               <input 
                 type="number" 
                 value={info.otherActivitiesIncome} 
                 onChange={e => setInfo({...info, otherActivitiesIncome: Number(e.target.value)})}
                 className="w-full border-slate-200 rounded-lg pl-8 py-2 text-sm bg-white text-slate-900"
                 placeholder="0.00"
               />
               <span className="absolute left-3 top-2 text-slate-400">€</span>
             </div>
             <p className="text-[10px] text-slate-400 mt-1">Otras actividades, ganancias patrimoniales.</p>
           </div>

           <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gastos Deducibles (SS, etc)</label>
             <div className="relative">
               <input 
                 type="number" 
                 value={info.deductibleExpenses} 
                 onChange={e => setInfo({...info, deductibleExpenses: Number(e.target.value)})}
                 className="w-full border-slate-200 rounded-lg pl-8 py-2 text-sm bg-white text-slate-900"
                 placeholder="0.00"
               />
               <span className="absolute left-3 top-2 text-slate-400">€</span>
             </div>
           </div>

           <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Residencia Fiscal</label>
             <select 
                value={info.taxResidency}
                onChange={e => setInfo({...info, taxResidency: e.target.value as any})}
                className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900"
             >
                <option value="CATALUÑA">Cataluña</option>
                <option value="OTRA">Otra CCAA</option>
             </select>
           </div>

           <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Situación Familiar</label>
             <select 
                value={info.maritalStatus}
                onChange={e => setInfo({...info, maritalStatus: e.target.value as any})}
                className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900"
             >
                <option value="SINGLE">Soltero/a / Divorciado/a</option>
                <option value="MARRIED">Casado/a (Declaración Individual)</option>
             </select>
           </div>

           <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hijos (&lt;25 años)</label>
                <input 
                  type="number" 
                  value={info.childrenCount} 
                  onChange={e => setInfo({...info, childrenCount: Number(e.target.value)})}
                  className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900"
                />
             </div>
             <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={info.disability}
                    onChange={e => setInfo({...info, disability: e.target.checked})}
                    className="rounded text-purple-600 focus:ring-purple-500 bg-white" 
                  />
                  <span className="text-sm text-slate-700">Discapacidad &gt; 33%</span>
                </label>
             </div>
           </div>

        </form>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={handleSubmit} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2 shadow-sm">
            <Save className="w-4 h-4" /> Guardar Datos
          </button>
        </div>
      </div>
    </div>
  );
};