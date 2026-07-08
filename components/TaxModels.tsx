
import React, { useState, useCallback, useMemo } from 'react';
import { FileText, Download, AlertCircle, Loader2, Users, Receipt } from 'lucide-react';
import { Invoice, AppSettings, Reservation, Apartment } from '../types';
import {
  generatePDF303,
  generatePDF184,
  generatePartnerCertificate,
  downloadPDF,
  calculateTaxData
} from '../services/pdfService';
import { TouristTaxPanel } from './TouristTaxPanel';
import { useToast } from './Toast';

interface TaxModelsProps {
  invoices: Invoice[];
  settings: AppSettings;
  reservations?: Reservation[];
  apartments?: Apartment[];
  onUpdateReservation?: (id: string, data: Partial<Reservation>) => void;
}

export const TaxModels: React.FC<TaxModelsProps> = ({ 
  invoices, 
  settings,
  reservations = [],
  apartments = [],
  onUpdateReservation
}) => {
  const [generating303, setGenerating303] = useState(false);
  const [generating184, setGenerating184] = useState(false);
  const [generatingCerts, setGeneratingCerts] = useState(false);
  const [activeTab, setActiveTab] = useState<'MODELS' | 'IEET'>('MODELS');
  const { showToast, showConfirm } = useToast();

  // Usar servicio centralizado para cálculos
  const taxData = calculateTaxData(invoices, settings);
  const { ivaRepercutido, ivaSoportado, resultadoIVA, totalIngresos, totalGastos, rendimientoNeto } = taxData;

  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const trimestre = `${currentQuarter}T`;

  const showMod303 = settings.fiscalRegime === 'GENERAL' && settings.vatObligation;

  // SAFE GUARD: Ensure partners exists - memoized to prevent re-renders
  const partners = useMemo(() => settings.partners || [], [settings.partners]);

  // Handler para generar PDF del Modelo 303
  const handleGenerate303 = useCallback(() => {
    setGenerating303(true);
    try {
      const blob = generatePDF303({
        trimestre,
        year: currentYear,
        ivaRepercutido,
        ivaSoportado,
        resultado: resultadoIVA,
        settings
      });
      downloadPDF(blob, `Modelo303_${trimestre}_${currentYear}.pdf`);
    } catch (error) {
      console.error('Error generating PDF 303:', error);
      showToast('Error al generar el PDF. Por favor, inténtelo de nuevo.', 'error');
    } finally {
      setGenerating303(false);
    }
  }, [trimestre, currentYear, ivaRepercutido, ivaSoportado, resultadoIVA, settings, showToast]);

  // Handler para generar PDF del Modelo 184
  const handleGenerate184 = useCallback(() => {
    setGenerating184(true);
    try {
      const blob = generatePDF184({
        year: currentYear,
        rendimientoNeto,
        totalIngresos,
        totalGastos,
        settings
      });
      downloadPDF(blob, `Modelo184_${currentYear}.pdf`);
    } catch (error) {
      console.error('Error generating PDF 184:', error);
      showToast('Error al generar el PDF. Por favor, inténtelo de nuevo.', 'error');
    } finally {
      setGenerating184(false);
    }
  }, [currentYear, rendimientoNeto, totalIngresos, totalGastos, settings, showToast]);

  // Handler para generar certificados de los partícipes
  const handleGenerateCertificates = useCallback(() => {
    setGeneratingCerts(true);
    const errors: string[] = [];

    partners.forEach((partner, index) => {
      try {
        const blob = generatePartnerCertificate(partner, settings, rendimientoNeto, currentYear);
        // Small delay between downloads to prevent browser blocking
        // DEBT-014: each download wrapped individually to surface per-partner errors
        setTimeout(() => {
          try {
            downloadPDF(blob, `Certificado_${partner.name.replace(/\s+/g, '_')}_${currentYear}.pdf`);
          } catch (err) {
            console.error(`Error descargando certificado de ${partner.name}:`, err);
            errors.push(partner.name);
            if (errors.length === 1) {
              showToast(`Error al descargar el certificado de ${partner.name}.`, 'error');
            }
          }
        }, index * 300);
      } catch (error) {
        console.error(`Error generando certificado de ${partner.name}:`, error);
        showToast(`Error al generar el certificado de ${partner.name}.`, 'error');
      }
    });

    setTimeout(() => setGeneratingCerts(false), partners.length * 300 + 500);
  }, [partners, settings, rendimientoNeto, currentYear, showToast]);

  // Check if tourist tax is enabled
  const showIEET = settings.fiscalRegime === 'ALQUILER_EXENTO' && 
                   (settings.touristTaxConfig?.enabled ?? true) &&
                   apartments.some(a => a.apartmentType === 'TOURIST');

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 animate-fade-in pb-24 md:pb-8 overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Modelos Fiscales</h2>
          <p className="text-sm md:text-base text-slate-500">
            {settings.fiscalRegime === 'ALQUILER_EXENTO'
              ? 'Régimen de Atribución de Rentas (Alquileres)'
              : 'Régimen General'}
          </p>
        </div>
        
        {/* Tabs for IEET */}
        {showIEET && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setActiveTab('MODELS')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'MODELS'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              Modelos 184/303
            </button>
            <button
              onClick={() => setActiveTab('IEET')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'IEET'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Tasa Turística (IEET)
            </button>
          </div>
        )}
      </div>

      {/* IEET Tab Content */}
      {showIEET && activeTab === 'IEET' && onUpdateReservation && (
        <TouristTaxPanel
          reservations={reservations}
          apartments={apartments}
          settings={settings}
          onUpdateReservation={onUpdateReservation}
        />
      )}

      {/* Models Tab Content */}
      {activeTab === 'MODELS' && (
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
                <button
                  onClick={handleGenerate303}
                  disabled={generating303}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {generating303 ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Generar PDF</>
                  )}
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
                    Este cálculo simula el &ldquo;Rendimiento del Capital Inmobiliario&rdquo; neto a imputar en la Renta (IRPF) de cada socio.
                </p>
             </div>

             <div className="flex gap-3">
               <button
                 onClick={handleGenerate184}
                 disabled={generating184}
                 className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {generating184 ? (
                   <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                 ) : (
                   <><Download className="w-4 h-4" /> Modelo 184</>
                 )}
               </button>
               <button
                 onClick={handleGenerateCertificates}
                 disabled={generatingCerts || partners.length === 0}
                 className="flex-1 bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {generatingCerts ? (
                   <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                 ) : (
                   <><Users className="w-4 h-4" /> Certificados</>
                 )}
               </button>
             </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
