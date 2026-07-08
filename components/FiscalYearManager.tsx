/**
 * @fileoverview Página de gestión de Ejercicios Contables
 * @description Permite crear, cerrar, reabrir y migrar ejercicios.
 *              Incluye herramienta de migración de datos legacy.
 */

import React, { useState, useMemo } from 'react';
import {
  CalendarDays, Lock, LockOpen, Plus, AlertTriangle,
  CheckCircle, RefreshCw, ChevronRight, Info, ArrowRight
} from 'lucide-react';
import { useFiscalYear } from '../context/FiscalYearContext';
import { useToast } from './Toast';
import { FiscalYear } from '../types';
import * as appwriteService from '../services/appwriteService';

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

// ============================================================================
// SUBCOMPONENTE: Tarjeta de ejercicio
// ============================================================================

interface FiscalYearCardProps {
  year: FiscalYear;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onReopen: () => void;
}

const FiscalYearCard: React.FC<FiscalYearCardProps> = ({
  year, isActive, onSelect, onClose, onReopen
}) => {
  const isOpen = year.status === 'OPEN';

  return (
    <div
      className={`bg-white rounded-xl border-2 p-5 transition-all duration-200 ${
        isActive
          ? 'border-blue-500 shadow-md shadow-blue-100'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Año + estado */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {isOpen
              ? <LockOpen className="w-6 h-6" />
              : <Lock className="w-6 h-6" />
            }
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900">Ejercicio {year.year}</h3>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                isOpen
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {isOpen ? '🟢 Abierto' : '🔒 Cerrado'}
              </span>
              {isActive && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                  ▶ Activo
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Desde: {formatDate(year.openedAt)}
              {year.closedAt && <> · Cerrado: {formatDate(year.closedAt)}</>}
            </p>
            {year.notes && (
              <p className="text-xs text-slate-400 mt-1 truncate">{year.notes}</p>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {!isActive && (
            <button
              onClick={onSelect}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
              Seleccionar
            </button>
          )}
          {isOpen ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-amber-100 hover:text-amber-700 transition-colors"
            >
              <Lock className="w-3 h-3" />
              Cerrar ejercicio
            </button>
          ) : (
            <button
              onClick={onReopen}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
            >
              <LockOpen className="w-3 h-3" />
              Reabrir
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export const FiscalYearManager: React.FC = () => {
  const {
    fiscalYears,
    activeFiscalYear,
    selectFiscalYear,
    createFiscalYear,
    closeFiscalYear,
    reopenFiscalYear,
    refreshFiscalYears
  } = useFiscalYear();
  const { showToast, showConfirm } = useToast();

  // Estado del modal "Crear Ejercicio"
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear() + 1);
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{
    copiedSuppliers: number; copiedApartments: number
  } | null>(null);

  // Estado migración legacy
  const [migrating, setMigrating] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState('');

  // Año nuevo sugerido: max existing year + 1 (o año actual si no hay ninguno)
  const suggestedYear = useMemo(() => {
    if (fiscalYears.length === 0) return new Date().getFullYear();
    return Math.max(...fiscalYears.map(y => y.year)) + 1;
  }, [fiscalYears]);

  const yearsExisting = new Set(fiscalYears.map(y => y.year));

  // ------------------------------------------------------------------
  // CREAR
  // ------------------------------------------------------------------
  const handleCreate = async () => {
    if (yearsExisting.has(newYear)) {
      showToast(`Ya existe el ejercicio ${newYear}`, 'error');
      return;
    }

    const previousYear = fiscalYears
      .filter(y => y.year < newYear)
      .sort((a, b) => b.year - a.year)[0];

    const hasPrevious = !!previousYear;
    const confirmMsg = hasPrevious
      ? `¿Crear Ejercicio ${newYear}?\n\nSe copiarán automáticamente los proveedores y apartamentos del Ejercicio ${previousYear.year}.`
      : `¿Crear Ejercicio ${newYear}?\n\nSe creará vacío (sin ejercicio anterior del que copiar datos maestros).`;

    if (!(await showConfirm(confirmMsg))) return;

    setCreating(true);
    try {
      const { copiedSuppliers, copiedApartments } = await createFiscalYear(newYear, newNotes);
      setCreateResult({ copiedSuppliers, copiedApartments });
      showToast(`Ejercicio ${newYear} creado correctamente`, 'success');
      setShowCreateModal(false);
      setNewNotes('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast(`Error al crear ejercicio: ${msg}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  // ------------------------------------------------------------------
  // CERRAR
  // ------------------------------------------------------------------
  const handleClose = async (year: FiscalYear) => {
    const confirmed = await showConfirm(
      `⚠️ ¿Cerrar el Ejercicio ${year.year}?\n\nUna vez cerrado, NO podrás añadir, editar ni eliminar datos de este ejercicio. Solo podrás consultarlos.\n\nPuedes reabrirlo en cualquier momento si lo necesitas.`
    );
    if (!confirmed) return;

    try {
      await closeFiscalYear(year.appwriteId || year.id);
      showToast(`Ejercicio ${year.year} cerrado`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast(`Error al cerrar ejercicio: ${msg}`, 'error');
    }
  };

  // ------------------------------------------------------------------
  // REABRIR
  // ------------------------------------------------------------------
  const handleReopen = async (year: FiscalYear) => {
    const confirmed = await showConfirm(
      `¿Reabrir el Ejercicio ${year.year}?\n\nPodrás editar, añadir y eliminar datos de este ejercicio.`
    );
    if (!confirmed) return;

    try {
      await reopenFiscalYear(year.appwriteId || year.id);
      showToast(`Ejercicio ${year.year} reabierto`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast(`Error al reabrir ejercicio: ${msg}`, 'error');
    }
  };

  // ------------------------------------------------------------------
  // MIGRACIÓN LEGACY
  // ------------------------------------------------------------------
  const handleMigrateLegacy = async () => {
    if (!activeFiscalYear) {
      showToast('Selecciona primero el ejercicio al que migrar los datos', 'error');
      return;
    }

    const confirmed = await showConfirm(
      `¿Migrar datos sin ejercicio al Ejercicio ${activeFiscalYear.year}?\n\nTodos los documentos (facturas, asientos, transacciones, reservas, proveedores, apartamentos) que aún no tienen ejercicio asignado se asignarán al Ejercicio ${activeFiscalYear.year}.\n\nEsta operación no se puede deshacer.`
    );
    if (!confirmed) return;

    setMigrating(true);
    setMigrateProgress('Iniciando migración...');
    try {
      const result = await appwriteService.migrateLegacyData(
        activeFiscalYear.appwriteId || activeFiscalYear.id,
        (done) => setMigrateProgress(`Documentos migrados: ${done}`)
      );
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      showToast(
        `Migración completada: ${total} documentos asignados al Ejercicio ${activeFiscalYear.year} (${result.invoices} facturas, ${result.entries} asientos, ${result.transactions} transacciones, ${result.reservations} reservas, ${result.suppliers} proveedores, ${result.apartments} apartamentos)`,
        'success'
      );
      setMigrateProgress('');
      await refreshFiscalYears();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast(`Error en migración: ${msg}`, 'error');
      setMigrateProgress('');
    } finally {
      setMigrating(false);
    }
  };

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <div className="p-4 md:p-8 animate-fade-in max-w-3xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-blue-600" />
            Ejercicios Contables
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestiona los ejercicios fiscales y controla el acceso a los datos de cada año
          </p>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); setNewYear(suggestedYear); setCreateResult(null); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nuevo Ejercicio
        </button>
      </div>

      {/* Resultado última creación */}
      {createResult && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Ejercicio creado correctamente</p>
            <p className="text-xs text-emerald-700 mt-1">
              Se copiaron <strong>{createResult.copiedSuppliers}</strong> proveedores
              y <strong>{createResult.copiedApartments}</strong> apartamentos del ejercicio anterior.
            </p>
          </div>
        </div>
      )}

      {/* Información sobre el ejercicio activo */}
      {activeFiscalYear && (
        <div className={`mb-6 rounded-xl p-4 border flex items-start gap-3 ${
          activeFiscalYear.status === 'OPEN'
            ? 'bg-blue-50 border-blue-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <Info className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
            activeFiscalYear.status === 'OPEN' ? 'text-blue-600' : 'text-amber-600'
          }`} />
          <div>
            <p className={`text-sm font-semibold ${
              activeFiscalYear.status === 'OPEN' ? 'text-blue-800' : 'text-amber-800'
            }`}>
              Trabajando en: Ejercicio {activeFiscalYear.year}
              {activeFiscalYear.status === 'CLOSED' && ' — Modo solo consulta 🔒'}
            </p>
            <p className={`text-xs mt-0.5 ${
              activeFiscalYear.status === 'OPEN' ? 'text-blue-700' : 'text-amber-700'
            }`}>
              {activeFiscalYear.status === 'OPEN'
                ? 'Puedes añadir, editar y eliminar datos en este ejercicio.'
                : 'Este ejercicio está cerrado. Solo puedes consultar los datos. Reabre el ejercicio si necesitas modificar algo.'
              }
            </p>
          </div>
        </div>
      )}

      {/* Lista de ejercicios */}
      <div className="space-y-3 mb-8">
        {fiscalYears.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
            <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No hay ejercicios creados</p>
            <p className="text-sm text-slate-400 mt-1">Crea el primer ejercicio para empezar a organizar tus datos</p>
          </div>
        ) : (
          fiscalYears.map(year => (
            <FiscalYearCard
              key={year.id}
              year={year}
              isActive={activeFiscalYear?.id === year.id || activeFiscalYear?.appwriteId === year.id}
              onSelect={() => selectFiscalYear(year.appwriteId || year.id)}
              onClose={() => handleClose(year)}
              onReopen={() => handleReopen(year)}
            />
          ))
        )}
      </div>

      {/* Herramienta de migración de datos legacy */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Migración de datos sin ejercicio</h3>
            <p className="text-xs text-slate-600 mt-1">
              Si tienes datos en Appwrite que fueron introducidos antes de activar los ejercicios contables,
              puedes asignarlos todos al ejercicio activo actualmente.
              Esta operación afecta a facturas, asientos, transacciones, reservas, proveedores y apartamentos
              que no tengan ningún ejercicio asignado.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleMigrateLegacy}
            disabled={migrating || !activeFiscalYear}
            className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {migrating
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Migrando...</>
              : <><ArrowRight className="w-4 h-4" /> Migrar al Ejercicio {activeFiscalYear?.year ?? '—'}</>
            }
          </button>
          {migrateProgress && (
            <span className="text-xs text-slate-500">{migrateProgress}</span>
          )}
        </div>
      </div>

      {/* Modal crear ejercicio */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-1">Nuevo Ejercicio Contable</h2>
              <p className="text-sm text-slate-500 mb-6">
                Se creará abierto. Los datos anteriores no se transfieren (solo proveedores y apartamentos).
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Año <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={newYear}
                    onChange={e => setNewYear(parseInt(e.target.value) || suggestedYear)}
                    min={2020}
                    max={2099}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {yearsExisting.has(newYear) && (
                    <p className="text-xs text-red-600 mt-1">Ya existe un ejercicio para este año</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Notas (opcional)
                  </label>
                  <textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    rows={2}
                    placeholder="Comentarios sobre este ejercicio..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  />
                </div>

                {/* Info copia maestros */}
                {fiscalYears.filter(y => y.year < newYear).length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
                    <span>
                      Se copiarán automáticamente los proveedores y apartamentos del Ejercicio{' '}
                      <strong>
                        {Math.max(...fiscalYears.filter(y => y.year < newYear).map(y => y.year))}
                      </strong>.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || yearsExisting.has(newYear)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creando...</>
                  : <><Plus className="w-4 h-4" /> Crear Ejercicio {newYear}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
