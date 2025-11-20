
import React from 'react';
import { FileText, Download, Calculator, AlertCircle } from 'lucide-react';
import { Invoice, AppSettings } from '../types';

interface TaxModelsProps {
  invoices: Invoice[];
  settings: AppSettings;
}

export const TaxModels: React.FC<TaxModelsProps> = ({ invoices, settings }) => {
  
  // Cálculo básico
  const ivaRepercutido = (invoices || [])
    .filter(i => i.type === 'INCOME')
    .reduce((acc, curr) => acc + curr.vatAmount, 0);

  const ivaSoportado = (invoices || [])
    .filter(i => i.type === 'EXPENSE')
    .reduce((acc, curr) => acc + curr.vatAmount, 0);

  const resultadoIVA = ivaRepercutido - ivaSoportado;

  // Cálculo Rendimiento Neto (Para Mod 184)
  // En régimen de alquiler, el IVA soportado es GASTO si no se deduce.
  const totalIngresos = (invoices || [])
    .filter(i => i.type === 'INCOME')
    .reduce((acc, curr) => acc + curr.baseAmount, 0); // Rentas normalmente van sin IVA o exentas

  const totalGastos = (invoices || [])
    .filter(i => i.type === 'EXPENSE')
    .reduce((acc, curr) => {
        // Si es exento, el gasto es el Total (Base + IVA). Si es General, es solo Base.
        if (settings.fiscalRegime === 'ALQUILER_EXENTO') {
            return acc + curr.totalAmount; 
        }
        return acc + curr.baseAmount;
    }, 0);

  const rendimientoNeto = totalIngresos - totalGastos;

  const showMod303 = settings.fiscalRegime === 'GENERAL' && settings.vatObligation;
  
  // SAFE GUARD: Ensure partners exists
  const partners = settings.partners || [];

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Modelos Fiscales</h2>
          <p className="text-slate-500">
            {settings.fiscalRegime === 'ALQUILER_EXENTO' 
              ? 'Régimen de Atribución de Rentas (Alquileres)' 
              : 'Régimen General'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Modelo 303 - IVA (Condicional) */}
        {showMod303 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">MOD 303</div>
                <h3 className="font-semibold text-slate-800">Autoliquidación IVA</h3>
              </div>
              <span className="text-xs font-medium text-slate-500">3T 2024</span>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">IVA Devengado (Ventas)</span>
                  <span className="font-mono font-medium text-emerald-600">+{ivaRepercutido.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">IVA Deducible (Gastos)</span>
                  <span className="font-mono font-medium text-rose-600">-{ivaSoportado.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-900">Resultado a ingresar/devolver</span>
                  <span className={`text-xl font-bold font-mono ${resultadoIVA > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                    {resultadoIVA.toFixed(2)}€
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Generar PDF
                </button>
              </div>
            </div>
          </div>
        ) : (
            <div className="bg-slate-50 rounded-xl border border-slate-200 border-dashed p-6 flex flex-col items-center justify-center text-center opacity-75">
                <div className="bg-slate-200 p-3 rounded-full mb-3">
                    <FileText className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="font-semibold text-slate-700 mb-1">Modelo 303 (IVA) No Aplicable</h3>
                <p className="text-sm text-slate-500">
                    Según la configuración actual ({settings.fiscalRegime === 'ALQUILER_EXENTO' ? 'Alquiler Exento' : 'Sin obligación IVA'}), 
                    esta entidad no presenta autoliquidaciones de IVA.
                </p>
            </div>
        )}

        {/* Modelo 184 - Entidades en atribución de rentas */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden border-l-4 border-l-emerald-500">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
             <div className="flex items-center gap-3">
              <div className="bg-emerald-600 text-white text-xs font-bold px-2 py-1 rounded">MOD 184</div>
              <h3 className="font-semibold text-slate-800">Declaración Informativa CB</h3>
            </div>
            <span className="text-xs font-medium text-slate-500">Anual 2024</span>
          </div>

          <div className="p-6">
             <div className="mb-6">
                <div className="flex justify-between items-end mb-4">
                    <p className="text-sm text-slate-600">Rendimiento Neto Atribuible:</p>
                    <p className="text-xl font-bold text-slate-900">{rendimientoNeto.toFixed(2)}€</p>
                </div>
                
                <div className="space-y-3">
                  {partners.map((partner, index) => (
                    <div key={partner.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${index % 2 === 0 ? 'bg-indigo-500' : 'bg-purple-500'}`}>
                            {partner.name.charAt(0)}
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900">{partner.name} ({partner.participation}%)</p>
                            <p className="text-xs text-slate-400">NIF: {partner.nif || 'Pendiente'}</p>
                        </div>
                        </div>
                        <span className="font-mono text-sm font-bold text-slate-700">
                            {(rendimientoNeto * (partner.participation / 100)).toFixed(2)}€
                        </span>
                    </div>
                  ))}
                </div>
             </div>
             
             <div className="bg-emerald-50 rounded-lg p-3 mb-4 flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-emerald-700 mt-0.5" />
                <p className="text-xs text-emerald-800">
                    Este cálculo simula el "Rendimiento del Capital Inmobiliario" neto a imputar en la Renta (IRPF) de cada socio.
                </p>
             </div>

             <button className="w-full bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" /> Previsualizar Certificados
              </button>
          </div>
        </div>
      </div>
    </div>
  );
};
