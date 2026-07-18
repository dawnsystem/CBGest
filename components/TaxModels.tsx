
import React, { useState, useCallback, useMemo } from 'react';
import { FileText, Download, AlertCircle, Loader2, FileCode, Save } from 'lucide-react';
import { Invoice, AppSettings, Reservation, Apartment } from '../types';
import { saveTaxReport } from '../services/appwrite/taxReportService';
import {
  buildModelo184Draft,
  exportModelo184File,
  exportModelo184Pdf,
  getModelo184FileName,
  getModelo184PdfFileName,
  hasBlockingIssues,
} from '../services/modelo184';
import { downloadPDF } from '../services/pdfService';
import { TouristTaxPanel } from './TouristTaxPanel';
import { useToast } from './Toast';
import { useFiscalYear } from '../context/FiscalYearContext';

interface TaxModelsProps {
  invoices: Invoice[];
  settings: AppSettings;
  reservations?: Reservation[];
  apartments?: Apartment[];
  onUpdateReservation?: (id: string, data: Partial<Reservation>) => void;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const TaxModels: React.FC<TaxModelsProps> = ({
  invoices,
  settings,
  reservations = [],
  apartments = [],
  onUpdateReservation
}) => {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingTxt, setExportingTxt] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [activeTab, setActiveTab] = useState<'MODELS' | 'IEET'>('MODELS');
  const { showToast } = useToast();
  const { activeFiscalYear } = useFiscalYear();

  const selectedFiscalYearId = activeFiscalYear?.appwriteId || activeFiscalYear?.id;
  const selectedYear = activeFiscalYear?.year;

  const draft = useMemo(() => {
    if (!selectedFiscalYearId || !selectedYear) return null;
    return buildModelo184Draft({
      settings,
      invoices,
      reservations,
      apartments,
      fiscalYearId: selectedFiscalYearId,
      ejercicio: selectedYear,
    });
  }, [settings, invoices, reservations, apartments, selectedFiscalYearId, selectedYear]);

  const partners = useMemo(() => settings.partners || [], [settings.partners]);
  const blockingIssues = draft ? hasBlockingIssues(draft) : true;

  const handleExportPdf = useCallback(() => {
    if (!draft) {
      showToast('Selecciona un ejercicio fiscal activo.', 'warning');
      return;
    }
    if (blockingIssues) {
      showToast('Corrige los errores del borrador antes de exportar.', 'error');
      return;
    }

    setExportingPdf(true);
    try {
      const blob = exportModelo184Pdf(draft);
      downloadPDF(blob, getModelo184PdfFileName(draft));
      showToast('PDF del Modelo 184 generado.', 'success');
    } catch (error) {
      console.error('Error generating PDF 184:', error);
      showToast('Error al generar el PDF.', 'error');
    } finally {
      setExportingPdf(false);
    }
  }, [draft, blockingIssues, showToast]);

  const handleExportTxt = useCallback(() => {
    if (!draft) {
      showToast('Selecciona un ejercicio fiscal activo.', 'warning');
      return;
    }
    if (blockingIssues) {
      showToast('Corrige los errores del borrador antes de exportar.', 'error');
      return;
    }

    setExportingTxt(true);
    try {
      const blob = exportModelo184File(draft);
      downloadBlob(blob, getModelo184FileName(draft));
      showToast('Fichero telemático AEAT generado.', 'success');
    } catch (error) {
      console.error('Error generating TXT 184:', error);
      showToast('Error al generar el fichero.', 'error');
    } finally {
      setExportingTxt(false);
    }
  }, [draft, blockingIssues, showToast]);

  const handleSaveDraft = useCallback(async () => {
    if (!draft) {
      showToast('Selecciona un ejercicio fiscal activo.', 'warning');
      return;
    }

    setSavingDraft(true);
    try {
      await saveTaxReport(draft, 'DRAFT');
      showToast('Borrador guardado en la nube.', 'success');
    } catch (error) {
      console.error('Error saving tax report:', error);
      showToast('No se pudo guardar el borrador (¿colección tax_reports configurada?).', 'warning');
    } finally {
      setSavingDraft(false);
    }
  }, [draft, showToast]);

  const showIEET = settings.fiscalRegime === 'ALQUILER_EXENTO' &&
                   (settings.touristTaxConfig?.enabled ?? true) &&
                   apartments.some(a => a.apartmentType === 'TOURIST');

  const rendimientoNeto = draft?.resumen.rendimientoNeto ?? 0;

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
              Tasa Turística (IEET)
            </button>
          </div>
        )}
      </div>

      {showIEET && activeTab === 'IEET' && onUpdateReservation && (
        <TouristTaxPanel
          reservations={reservations}
          apartments={apartments}
          settings={settings}
          onUpdateReservation={onUpdateReservation}
        />
      )}

      {activeTab === 'MODELS' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-50 rounded-xl border border-slate-200 border-dashed p-6 flex flex-col items-center justify-center text-center opacity-75">
            <div className="bg-slate-200 p-3 rounded-full mb-3">
                <FileText className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-700 mb-1">Modelo 303 (IVA) No Aplicable</h3>
            <p className="text-sm text-slate-500">
                En régimen IRPF de CBGest solo se generan Modelo 184 y hojas de socios.
            </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden border-l-4 border-l-emerald-500">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
             <div className="flex items-center gap-3">
              <div className="bg-emerald-600 text-white text-xs font-bold px-2 py-1 rounded">MOD 184</div>
              <h3 className="font-semibold text-slate-800">Declaración Informativa CB</h3>
            </div>
            <span className="text-xs font-medium text-slate-500">Anual {selectedYear || '—'}</span>
          </div>

          <div className="p-6">
             <div className="mb-4 flex flex-wrap gap-2 text-xs">
               <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded">Clave C</span>
               <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded">Subclave 01</span>
               <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded">Ingresos: reservas</span>
             </div>

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

             {draft && draft.issues.length > 0 && (
               <div className="mb-4 space-y-2">
                 {draft.issues.map((issue) => (
                   <div
                     key={`${issue.code}-${issue.message}`}
                     className={`rounded-lg p-3 flex gap-2 items-start text-xs ${
                       issue.severity === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
                     }`}
                   >
                     <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                     <p>{issue.message}</p>
                   </div>
                 ))}
               </div>
             )}

             <div className="bg-emerald-50 rounded-lg p-3 mb-4 flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-emerald-700 mt-0.5" />
                <p className="text-xs text-emerald-800">
                    Borrador alineado al formulario oficial AEAT (clave C). Los ingresos se calculan desde reservas confirmadas.
                </p>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
               <button
                 onClick={handleExportPdf}
                 disabled={exportingPdf || !draft}
                 className="bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {exportingPdf ? (
                   <><Loader2 className="w-4 h-4 animate-spin" /> PDF...</>
                 ) : (
                   <><Download className="w-4 h-4" /> PDF Oficial</>
                 )}
               </button>
               <button
                 onClick={handleExportTxt}
                 disabled={exportingTxt || !draft}
                 className="bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {exportingTxt ? (
                   <><Loader2 className="w-4 h-4 animate-spin" /> TXT...</>
                 ) : (
                   <><FileCode className="w-4 h-4" /> Fichero AEAT</>
                 )}
               </button>
               <button
                 onClick={handleSaveDraft}
                 disabled={savingDraft || !draft}
                 className="bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {savingDraft ? (
                   <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                 ) : (
                   <><Save className="w-4 h-4" /> Guardar</>
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
