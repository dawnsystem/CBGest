/**
 * @fileoverview Gestor de períodos de vigencia de la tasa turística por ejercicio.
 *
 * Permite al usuario ver, crear, editar y eliminar los períodos de vigencia
 * (TouristTaxPeriod) del ejercicio fiscal activo. Cada período define la tarifa,
 * el máximo de noches y la edad mínima durante un rango de fechas concreto.
 *
 * El componente es solo-lectura si el ejercicio está cerrado.
 */

import React, { useState, useMemo } from 'react';
import {
  Plus, Trash2, Edit2, Save, X, AlertTriangle, Calendar,
  Euro, Users, ChevronDown, ChevronUp, Info
} from 'lucide-react';
import type { TouristTaxPeriod, FiscalYear } from '../types';
import { useIsReadOnly, useFiscalYear } from '../context/FiscalYearContext';
import {
  hasOverlap,
  sortPeriodsByDate,
  parseTouristTaxPeriods,
  createDefaultPeriodForYear,
} from '../utils/touristTaxUtils';
import { DEFAULT_TAX_CONFIG } from '../config/defaultSettings';
import { generateId } from '../utils/defaults';

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function yearStart(year: number): string {
  return `${year}-01-01`;
}
function yearEnd(year: number): string {
  return `${year}-12-31`;
}

// ============================================================================
// TIPOS INTERNOS
// ============================================================================

interface PeriodFormState {
  startDate: string;
  endDate: string;
  rate: string;
  maxNights: string;
  minAge: string;
  enabled: boolean;
  notes: string;
}

const EMPTY_FORM = (year: number): PeriodFormState => ({
  startDate: yearStart(year),
  endDate: '',
  rate: '1',
  maxNights: '7',
  minAge: '17',
  enabled: true,
  notes: '',
});

function periodToForm(p: TouristTaxPeriod): PeriodFormState {
  return {
    startDate: p.startDate,
    endDate: p.endDate ?? '',
    rate: String(p.rate),
    maxNights: String(p.maxNights),
    minAge: String(p.minAge),
    enabled: p.enabled,
    notes: p.notes ?? '',
  };
}

function formToPeriod(form: PeriodFormState, existingId?: string): Omit<TouristTaxPeriod, 'id'> & { id?: string } {
  return {
    id: existingId,
    startDate: form.startDate,
    endDate: form.endDate || undefined,
    rate: parseFloat(form.rate) || 0,
    maxNights: parseInt(form.maxNights) || 1,
    minAge: parseInt(form.minAge) || 0,
    enabled: form.enabled,
    notes: form.notes || undefined,
  };
}

// ============================================================================
// MODAL DE EDICIÓN / CREACIÓN
// ============================================================================

interface PeriodModalProps {
  mode: 'create' | 'edit';
  fiscalYear: FiscalYear;
  existing: TouristTaxPeriod[];
  initialForm: PeriodFormState;
  editingId?: string;
  onSave: (period: TouristTaxPeriod) => void;
  onClose: () => void;
}

const PeriodModal: React.FC<PeriodModalProps> = ({
  mode, fiscalYear, existing, initialForm, editingId, onSave, onClose
}) => {
  const [form, setForm] = useState<PeriodFormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!form.startDate) {
      errs.startDate = 'La fecha de inicio es obligatoria.';
    } else if (form.startDate < yearStart(fiscalYear.year) || form.startDate > yearEnd(fiscalYear.year)) {
      errs.startDate = `La fecha debe estar dentro del ejercicio ${fiscalYear.year}.`;
    }

    if (form.endDate) {
      if (form.endDate <= form.startDate) {
        errs.endDate = 'La fecha fin debe ser posterior a la fecha de inicio.';
      } else if (form.endDate > yearEnd(fiscalYear.year)) {
        errs.endDate = `La fecha fin no puede superar el ${yearEnd(fiscalYear.year)}.`;
      }
    }

    const rate = parseFloat(form.rate);
    if (isNaN(rate) || rate < 0) errs.rate = 'La tarifa debe ser un número ≥ 0.';

    const maxNights = parseInt(form.maxNights);
    if (isNaN(maxNights) || maxNights < 1) errs.maxNights = 'El máximo de noches debe ser ≥ 1.';

    const minAge = parseInt(form.minAge);
    if (isNaN(minAge) || minAge < 0) errs.minAge = 'La edad mínima debe ser ≥ 0.';

    const draft = formToPeriod(form, editingId);
    if (hasOverlap(draft, existing, editingId)) {
      errs.startDate = 'Este período se solapa con otro ya existente.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const draft = formToPeriod(form, editingId);
    const period: TouristTaxPeriod = {
      id: draft.id ?? generateId(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      rate: draft.rate,
      maxNights: draft.maxNights,
      minAge: draft.minAge,
      enabled: draft.enabled,
      notes: draft.notes,
    };
    onSave(period);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-amber-50 px-6 py-4 border-b border-amber-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">
            {mode === 'create' ? 'Nuevo período de vigencia' : 'Editar período de vigencia'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Inicio de vigencia *
              </label>
              <input
                type="date"
                value={form.startDate}
                min={yearStart(fiscalYear.year)}
                max={yearEnd(fiscalYear.year)}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.startDate ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Fin de vigencia
              </label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate}
                max={yearEnd(fiscalYear.year)}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.endDate ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
              <p className="text-xs text-slate-400 mt-1">Dejar vacío = rige hasta fin del ejercicio</p>
            </div>
          </div>

          {/* Tarifa */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <Euro className="w-4 h-4 inline mr-1" />
              Tarifa €/noche/adulto *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.rate ? 'border-red-400' : 'border-slate-200'}`}
            />
            {errors.rate && <p className="text-xs text-red-500 mt-1">{errors.rate}</p>}
          </div>

          {/* Max Noches y Edad Mínima */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Máximo noches *
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={form.maxNights}
                onChange={(e) => setForm({ ...form, maxNights: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.maxNights ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.maxNights && <p className="text-xs text-red-500 mt-1">{errors.maxNights}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Users className="w-4 h-4 inline mr-1" />
                Edad mínima (años) *
              </label>
              <input
                type="number"
                min="0"
                max="99"
                value={form.minAge}
                onChange={(e) => setForm({ ...form, minAge: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.minAge ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.minAge && <p className="text-xs text-red-500 mt-1">{errors.minAge}</p>}
            </div>
          </div>

          {/* Activar/desactivar */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm font-medium text-slate-700">Tasa activa en este período</span>
            </label>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo del cambio (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Decreto X/2025 de la Generalitat"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              maxLength={200}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            {mode === 'create' ? 'Crear período' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

interface TouristTaxPeriodsManagerProps {
  /** Si se omite se usa el ejercicio activo del contexto */
  fiscalYear?: FiscalYear;
}

/**
 * Gestor de períodos de vigencia de la tasa turística.
 *
 * Muestra la lista de períodos del ejercicio activo (o del pasado a través de prop),
 * permite añadir, editar y eliminar períodos, y persiste los cambios mediante
 * FiscalYearContext.updateFiscalYearTouristTax.
 */
export const TouristTaxPeriodsManager: React.FC<TouristTaxPeriodsManagerProps> = ({
  fiscalYear: fiscalYearProp,
}) => {
  const { activeFiscalYear, updateFiscalYearTouristTax } = useFiscalYear();
  const isReadOnly = useIsReadOnly();

  const fiscalYear = fiscalYearProp ?? activeFiscalYear;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<TouristTaxPeriod | null>(null);
  const [saving, setSaving] = useState(false);

  // Períodos actuales del ejercicio
  const periods = useMemo((): TouristTaxPeriod[] => {
    if (!fiscalYear) return [];
    const parsed = parseTouristTaxPeriods(fiscalYear.touristTaxPeriods);
    if (parsed.length > 0) return sortPeriodsByDate(parsed);
    // Fallback: período sintético usando la config por defecto
    return [createDefaultPeriodForYear(fiscalYear.year, DEFAULT_TAX_CONFIG)];
  }, [fiscalYear]);

  if (!fiscalYear) {
    return (
      <div className="p-4 text-sm text-slate-400 text-center">
        No hay ejercicio activo. Crea uno desde &ldquo;Gestión de Ejercicios&rdquo;.
      </div>
    );
  }

  const isClosed = fiscalYear.status === 'CLOSED';
  const effectiveReadOnly = isReadOnly || isClosed;

  // ------------------------------------------------------------------
  // PERSISTIR CAMBIOS
  // ------------------------------------------------------------------
  const persist = async (updated: TouristTaxPeriod[]) => {
    const docId = fiscalYear.appwriteId || fiscalYear.id;
    if (!docId) return;
    setSaving(true);
    try {
      await updateFiscalYearTouristTax(docId, sortPeriodsByDate(updated));
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // HANDLERS
  // ------------------------------------------------------------------
  const handleSavePeriod = async (period: TouristTaxPeriod) => {
    const isEdit = editingPeriod !== null;
    let updated: TouristTaxPeriod[];
    if (isEdit) {
      updated = periods.map(p => p.id === period.id ? period : p);
    } else {
      updated = [...periods, period];
    }
    await persist(updated);
    setShowModal(false);
    setEditingPeriod(null);
  };

  const handleDelete = async (id: string) => {
    const updated = periods.filter(p => p.id !== id);
    await persist(updated);
  };

  const openCreate = () => {
    setEditingPeriod(null);
    setShowModal(true);
  };

  const openEdit = (period: TouristTaxPeriod) => {
    setEditingPeriod(period);
    setShowModal(true);
  };

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <Calendar className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">
              Períodos de vigencia — Ejercicio {fiscalYear.year}
            </h3>
            <p className="text-xs text-slate-500">
              Define franjas con distintas tarifas dentro del ejercicio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!effectiveReadOnly && (
            <button
              onClick={openCreate}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Añadir período
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(c => !c)}
            className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={isCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Ejercicio cerrado — aviso */}
      {isClosed && (
        <div className="mx-6 mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2 text-sm text-slate-500">
          <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0" />
          El ejercicio está cerrado. Los períodos son de solo lectura.
        </div>
      )}

      {/* Body */}
      {!isCollapsed && (
        <div className="p-6 space-y-3">
          {periods.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No hay períodos configurados.
              {!effectiveReadOnly && (
                <button onClick={openCreate} className="ml-2 text-amber-600 hover:underline">
                  Añadir el primero
                </button>
              )}
            </div>
          ) : (
            sortPeriodsByDate(periods).map((period) => (
              <PeriodCard
                key={period.id}
                period={period}
                fiscalYear={fiscalYear}
                readOnly={effectiveReadOnly}
                onEdit={() => openEdit(period)}
                onDelete={() => handleDelete(period.id)}
                saving={saving}
              />
            ))
          )}

          {/* Nota informativa */}
          <div className="pt-2 flex items-start gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Los períodos sin fecha fin rigen hasta el 31/12/{fiscalYear.year}.
              En caso de solapamiento, tiene precedencia el período con fecha de inicio más tardía.
            </span>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <PeriodModal
          mode={editingPeriod ? 'edit' : 'create'}
          fiscalYear={fiscalYear}
          existing={periods}
          initialForm={editingPeriod ? periodToForm(editingPeriod) : EMPTY_FORM(fiscalYear.year)}
          editingId={editingPeriod?.id}
          onSave={handleSavePeriod}
          onClose={() => { setShowModal(false); setEditingPeriod(null); }}
        />
      )}
    </div>
  );
};

// ============================================================================
// TARJETA DE PERÍODO
// ============================================================================

interface PeriodCardProps {
  period: TouristTaxPeriod;
  fiscalYear: FiscalYear;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
  saving: boolean;
}

const PeriodCard: React.FC<PeriodCardProps> = ({
  period, fiscalYear, readOnly, onEdit, onDelete, saving
}) => {
  const isOpenEnded = !period.endDate;
  return (
    <div className={`flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-lg border ${period.enabled ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      {/* Rango de fechas */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Calendar className={`w-4 h-4 shrink-0 ${period.enabled ? 'text-amber-600' : 'text-slate-400'}`} />
        <div>
          <p className="text-sm font-medium text-slate-800">
            {formatDate(period.startDate)} → {isOpenEnded ? `31/12/${fiscalYear.year}` : formatDate(period.endDate)}
          </p>
          {isOpenEnded && (
            <p className="text-xs text-slate-400">Sin fecha fin (abierto)</p>
          )}
        </div>
      </div>

      {/* Tarifa */}
      <div className="flex items-center gap-1.5 text-sm">
        <Euro className="w-4 h-4 text-slate-500" />
        <span className="font-semibold text-slate-800">{period.rate.toFixed(2)}</span>
        <span className="text-slate-400 text-xs">/noche·adulto</span>
      </div>

      {/* Máx noches */}
      <div className="flex items-center gap-1.5 text-sm text-slate-600">
        <span className="text-xs">Máx.</span>
        <span className="font-medium">{period.maxNights} noches</span>
      </div>

      {/* Edad mínima */}
      <div className="flex items-center gap-1.5 text-sm text-slate-600">
        <Users className="w-4 h-4 text-slate-400" />
        <span className="text-xs">≥ {period.minAge} años</span>
      </div>

      {/* Estado */}
      <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${period.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
        {period.enabled ? 'Activa' : 'Inactiva'}
      </div>

      {/* Notas */}
      {period.notes && (
        <p className="text-xs text-slate-500 italic flex-1 truncate" title={period.notes}>
          {period.notes}
        </p>
      )}

      {/* Acciones */}
      {!readOnly && (
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={onEdit}
            disabled={saving}
            className="p-1.5 text-slate-400 hover:text-amber-600 transition-colors disabled:opacity-50"
            aria-label="Editar período"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={saving}
            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
            aria-label="Eliminar período"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
