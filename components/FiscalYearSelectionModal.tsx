/**
 * @fileoverview Modal bloqueante para seleccionar ejercicio fiscal.
 * @description Se muestra cuando no hay preferencia guardada y hay varios ejercicios.
 *              Patrón estándar "workspace picker" (Slack, Notion, QuickBooks).
 */

import React from 'react';
import { CalendarDays, Lock, LockOpen } from 'lucide-react';
import { FiscalYear } from '../types';

interface FiscalYearSelectionModalProps {
  fiscalYears: FiscalYear[];
  onSelect: (id: string) => void;
}

/**
 * Modal que obliga al usuario a elegir en qué ejercicio trabajar.
 * No se puede cerrar sin seleccionar (evita operar en el ejercicio equivocado).
 */
export const FiscalYearSelectionModal: React.FC<FiscalYearSelectionModalProps> = ({
  fiscalYears,
  onSelect,
}) => {
  const sorted = [...fiscalYears].sort((a, b) => b.year - a.year);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fy-selection-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in-up">
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 id="fy-selection-title" className="text-lg font-bold text-slate-900">
                Selecciona un ejercicio
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Elige en qué ejercicio fiscal quieres trabajar hoy.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Las facturas, asientos y demás datos se guardan en el ejercicio seleccionado.
            Revisa bien antes de continuar.
          </p>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {sorted.map((fy) => {
              const isOpen = fy.status === 'OPEN';
              return (
                <button
                  key={fy.id}
                  type="button"
                  onClick={() => onSelect(fy.appwriteId || fy.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    {isOpen
                      ? <LockOpen className="w-5 h-5 text-emerald-500" />
                      : <Lock className="w-5 h-5 text-slate-400" />
                    }
                    <div>
                      <span className="font-semibold text-slate-900 group-hover:text-blue-700">
                        Ejercicio {fy.year}
                      </span>
                      {fy.notes && (
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{fy.notes}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    isOpen
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isOpen ? 'Abierto' : 'Cerrado'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
