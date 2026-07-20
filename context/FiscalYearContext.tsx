/**
 * @fileoverview Contexto global de Ejercicio Contable (Fiscal Year)
 * @description Gestiona el ejercicio activo, la lista de todos los ejercicios,
 *              el modo lectura/escritura y las operaciones de apertura/cierre.
 *
 * ARQUITECTURA:
 * - El ejercicio activo se persiste en localStorage para sobrevivir recargas.
 * - isReadOnly=true cuando el ejercicio activo está CERRADO.
 * - Todos los componentes leen isReadOnly para proteger las mutaciones.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode
} from 'react';
import { FiscalYear, FiscalYearDependencies, TouristTaxPeriod } from '../types';
import * as appwriteService from '../services/appwriteService';
import { generateId } from '../utils/defaults';
import { useAuth } from './AuthContext';
import {
  parseTouristTaxPeriods,
  createDefaultPeriodForYear,
  sortPeriodsByDate,
  serializeTouristTaxPeriods,
} from '../utils/touristTaxUtils';
import { DEFAULT_TAX_CONFIG } from '../config/defaultSettings';
import {
  resolveFiscalYearFromPreference,
  saveStoredFiscalYearPreference,
} from '../utils/fiscalYearPersistence';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

interface FiscalYearContextType {
  /** Lista de todos los ejercicios, ordenados de más reciente a más antiguo */
  fiscalYears: FiscalYear[];
  /** Ejercicio activo seleccionado para trabajar */
  activeFiscalYear: FiscalYear | null;
  /** true cuando el ejercicio activo está CERRADO (solo lectura) */
  isReadOnly: boolean;
  /** true mientras se cargan los ejercicios */
  isLoading: boolean;
  /**
   * true cuando hay varios ejercicios y el usuario debe elegir explícitamente
   * (no hay preferencia guardada de uso previo).
   */
  needsSelection: boolean;
  /** Seleccionar el ejercicio activo (cambia los datos que se muestran) */
  selectFiscalYear: (id: string) => void;
  /** Crear un nuevo ejercicio. Si hay ejercicio previo, copia maestros automáticamente */
  createFiscalYear: (
    year: number,
    notes?: string,
    options?: { selectAfterCreate?: boolean }
  ) => Promise<{ fiscalYear: FiscalYear; copiedSuppliers: number; copiedApartments: number; copiedRecurringExpenses: number }>;
  /** Cerrar un ejercicio (no se podrán editar sus datos) */
  closeFiscalYear: (id: string) => Promise<void>;
  /** Reabrir un ejercicio cerrado */
  reopenFiscalYear: (id: string) => Promise<void>;
  /** Recargar la lista de ejercicios desde Appwrite */
  refreshFiscalYears: () => Promise<void>;
  /**
   * Consulta el número de documentos asociados a un ejercicio en cada colección.
   * Usado para determinar si se requiere borrado en cascada.
   */
  getFiscalYearDependencies: (id: string) => Promise<FiscalYearDependencies>;
  /**
   * Elimina un ejercicio.
   * - `cascade = false` → elimina solo el documento del ejercicio (debe estar vacío).
   * - `cascade = true`  → elimina todos los datos del ejercicio y luego el ejercicio.
   * Si el ejercicio eliminado era el activo, selecciona automáticamente el siguiente disponible.
   */
  deleteFiscalYear: (
    id: string,
    cascade: boolean,
    onProgress?: (phase: string, done: number) => void
  ) => Promise<void>;
  /**
   * Actualiza los períodos de vigencia de la tasa turística de un ejercicio.
   * Si el ejercicio es el activo, actualiza también el estado local.
   */
  updateFiscalYearTouristTax: (
    fiscalYearId: string,
    periods: TouristTaxPeriod[]
  ) => Promise<FiscalYear>;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const FiscalYearContext = createContext<FiscalYearContextType | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface FiscalYearProviderProps {
  children: ReactNode;
  /** Callback para notificar a App.tsx que debe recargar los datos del ejercicio activo */
  onFiscalYearChange?: (fiscalYearId: string | null) => void;
}

export const FiscalYearProvider: React.FC<FiscalYearProviderProps> = ({
  children,
  onFiscalYearChange
}) => {
  const { user, sessionReady } = useAuth();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [activeFiscalYear, setActiveFiscalYear] = useState<FiscalYear | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSelection, setNeedsSelection] = useState(false);

  // Derivado: readonly si el ejercicio activo está cerrado
  const isReadOnly = activeFiscalYear?.status === 'CLOSED';

  // ------------------------------------------------------------------
  // CARGA INICIAL
  // ------------------------------------------------------------------
  const persistActiveFiscalYear = useCallback((fy: FiscalYear) => {
    if (user?.$id) {
      saveStoredFiscalYearPreference(user.$id, fy);
    }
  }, [user?.$id]);

  const applyFiscalYearSelection = useCallback((fy: FiscalYear | null) => {
    setActiveFiscalYear(fy);
    setNeedsSelection(false);
    if (fy) {
      persistActiveFiscalYear(fy);
      onFiscalYearChange?.(fy.id);
    }
  }, [persistActiveFiscalYear, onFiscalYearChange]);

  const resolveInitialFiscalYear = useCallback((years: FiscalYear[]): FiscalYear | null => {
    if (years.length === 0) return null;
    if (years.length === 1) return years[0];

    if (user?.$id) {
      const fromPreference = resolveFiscalYearFromPreference(years, user.$id);
      if (fromPreference) return fromPreference;
    }

    // Sin preferencia: no auto-seleccionar el más reciente (evita operar en el equivocado)
    return null;
  }, [user?.$id]);

  const refreshFiscalYears = useCallback(async () => {
    try {
      const years = await appwriteService.fetchFiscalYears();
      setFiscalYears(years);

      const resolved = resolveInitialFiscalYear(years);
      if (resolved) {
        applyFiscalYearSelection(resolved);
      } else if (years.length > 1) {
        setActiveFiscalYear(null);
        setNeedsSelection(true);
      } else {
        setActiveFiscalYear(null);
        setNeedsSelection(false);
      }
    } catch (err) {
      console.error('[FiscalYearContext] Error cargando ejercicios:', err);
    } finally {
      setIsLoading(false);
    }
  }, [applyFiscalYearSelection, resolveInitialFiscalYear]);

  useEffect(() => {
    if (!user) {
      setFiscalYears([]);
      setActiveFiscalYear(null);
      setNeedsSelection(false);
      setIsLoading(false);
      return;
    }

    if (!sessionReady) {
      setIsLoading(true);
      return;
    }

    refreshFiscalYears();
  }, [refreshFiscalYears, user, sessionReady]);

  // ------------------------------------------------------------------
  // SELECCIONAR EJERCICIO ACTIVO
  // ------------------------------------------------------------------
  const selectFiscalYear = useCallback((id: string) => {
    const found = fiscalYears.find(y => y.id === id || y.appwriteId === id);
    if (!found) return;
    applyFiscalYearSelection(found);
  }, [fiscalYears, applyFiscalYearSelection]);

  // ------------------------------------------------------------------
  // CREAR EJERCICIO
  // ------------------------------------------------------------------
  const createFiscalYear = useCallback(async (
    year: number,
    notes?: string,
    options?: { selectAfterCreate?: boolean }
  ): Promise<{ fiscalYear: FiscalYear; copiedSuppliers: number; copiedApartments: number; copiedRecurringExpenses: number }> => {
    const selectAfterCreate = options?.selectAfterCreate === true;
    const now = new Date().toISOString();

    // Buscar ejercicio previo (el de año inmediatamente anterior)
    const previousYear = fiscalYears
      .filter(y => y.year < year)
      .sort((a, b) => b.year - a.year)[0];

    // Construir períodos iniciales copiando y re-fechando los del ejercicio anterior
    let initialPeriods: TouristTaxPeriod[] | undefined;
    if (previousYear) {
      const prevPeriods = parseTouristTaxPeriods(previousYear.touristTaxPeriods);
      if (prevPeriods.length > 0) {
        // Re-fechar cada período al nuevo año, preservando la configuración económica
        const sortedPrev = sortPeriodsByDate(prevPeriods);
        initialPeriods = sortedPrev.map((p, idx) => {
          // La lógica de refechado: trasladar mes/día al nuevo año, ajustando días inválidos (p.ej. 29/02)
          const [, mm, dd] = p.startDate.split('-');
          const startLastDay = new Date(year, parseInt(mm, 10), 0).getDate();
          const newStart = `${year}-${mm}-${String(Math.min(parseInt(dd, 10), startLastDay)).padStart(2, '0')}`;
          let newEnd: string | undefined;
          if (p.endDate) {
            const [, emm, edd] = p.endDate.split('-');
            const endLastDay = new Date(year, parseInt(emm, 10), 0).getDate();
            newEnd = `${year}-${emm}-${String(Math.min(parseInt(edd, 10), endLastDay)).padStart(2, '0')}`;
          }
          return {
            id: generateId(),
            startDate: idx === 0 ? `${year}-01-01` : newStart, // El primer período siempre arranca el 1 de enero
            endDate: newEnd,
            rate: p.rate,
            maxNights: p.maxNights,
            minAge: p.minAge,
            enabled: p.enabled,
            notes: p.notes ? `Copiado del ejercicio ${previousYear.year}` : undefined,
          };
        });
      }
    }

    // Fallback: un único período con la config por defecto
    if (!initialPeriods || initialPeriods.length === 0) {
      initialPeriods = [createDefaultPeriodForYear(year, DEFAULT_TAX_CONFIG)];
    }

    const newFiscalYear: FiscalYear = {
      id: generateId(),
      year,
      status: 'OPEN',
      openedAt: now,
      notes: notes || '',
      touristTaxPeriods: serializeTouristTaxPeriods(initialPeriods),
    };

    const saved = await appwriteService.createFiscalYearDoc(newFiscalYear);

    let copiedSuppliers = 0;
    let copiedApartments = 0;
    let copiedRecurringExpenses = 0;

    if (previousYear) {
      try {
        const result = await appwriteService.copyMasterDataToFiscalYear(
          previousYear.appwriteId || previousYear.id,
          saved.appwriteId || saved.id
        );
        copiedSuppliers = result.suppliers;
        copiedApartments = result.apartments;
        copiedRecurringExpenses = result.recurringExpenses;
      } catch (err) {
        console.error('[FiscalYearContext] Error copiando datos maestros:', err);
        // No bloqueamos la creación si falla la copia
      }
    }

    // Actualizar estado local — NO cambiar el ejercicio activo salvo petición explícita
    const updatedYears = [saved, ...fiscalYears];
    setFiscalYears(updatedYears);
    if (selectAfterCreate) {
      applyFiscalYearSelection(saved);
    }

    return { fiscalYear: saved, copiedSuppliers, copiedApartments, copiedRecurringExpenses };
  }, [fiscalYears, applyFiscalYearSelection]);

  // ------------------------------------------------------------------
  // CERRAR EJERCICIO
  // ------------------------------------------------------------------
  const closeFiscalYear = useCallback(async (id: string) => {
    const year = fiscalYears.find(y => y.id === id || y.appwriteId === id);
    if (!year) return;

    const updated = await appwriteService.updateFiscalYearDoc({
      ...year,
      status: 'CLOSED',
      closedAt: new Date().toISOString()
    });

    const updatedYears = fiscalYears.map(y =>
      y.id === id || y.appwriteId === id ? updated : y
    );
    setFiscalYears(updatedYears);

    // Si es el ejercicio activo, actualizar su estado en contexto
    if (activeFiscalYear?.id === id || activeFiscalYear?.appwriteId === id) {
      setActiveFiscalYear(updated);
    }
  }, [fiscalYears, activeFiscalYear]);

  // ------------------------------------------------------------------
  // REABRIR EJERCICIO
  // ------------------------------------------------------------------
  const reopenFiscalYear = useCallback(async (id: string) => {
    const year = fiscalYears.find(y => y.id === id || y.appwriteId === id);
    if (!year) return;

    const updated = await appwriteService.updateFiscalYearDoc({
      ...year,
      status: 'OPEN',
      closedAt: undefined
    });

    const updatedYears = fiscalYears.map(y =>
      y.id === id || y.appwriteId === id ? updated : y
    );
    setFiscalYears(updatedYears);

    if (activeFiscalYear?.id === id || activeFiscalYear?.appwriteId === id) {
      setActiveFiscalYear(updated);
    }
  }, [fiscalYears, activeFiscalYear]);

  // ------------------------------------------------------------------
  // CONSULTAR DEPENDENCIAS DEL EJERCICIO
  // ------------------------------------------------------------------
  const getFiscalYearDependencies = useCallback(async (id: string): Promise<FiscalYearDependencies> => {
    const year = fiscalYears.find(y => y.id === id || y.appwriteId === id);
    const docId = (year?.appwriteId || year?.id) ?? id;
    return await appwriteService.getFiscalYearDependencies(docId);
  }, [fiscalYears]);

  // ------------------------------------------------------------------
  // ELIMINAR EJERCICIO
  // ------------------------------------------------------------------
  const deleteFiscalYear = useCallback(async (
    id: string,
    cascade: boolean,
    onProgress?: (phase: string, done: number) => void
  ) => {
    const year = fiscalYears.find(y => y.id === id || y.appwriteId === id);
    if (!year) return;

    const docId = year.appwriteId || year.id;

    if (cascade) {
      await appwriteService.deleteFiscalYearCascade(docId, onProgress);
    } else {
      await appwriteService.deleteFiscalYearDoc(docId);
    }

    const updatedYears = fiscalYears.filter(y => y.id !== id && y.appwriteId !== id);
    setFiscalYears(updatedYears);

    // Si era el ejercicio activo, resolver siguiente (preferencia o selección explícita)
    const wasActive = activeFiscalYear?.id === id || activeFiscalYear?.appwriteId === id;
    if (wasActive) {
      const nextYear = resolveInitialFiscalYear(updatedYears);
      if (nextYear) {
        applyFiscalYearSelection(nextYear);
      } else if (updatedYears.length > 1) {
        setActiveFiscalYear(null);
        setNeedsSelection(true);
        onFiscalYearChange?.(null);
      } else if (updatedYears.length === 1) {
        applyFiscalYearSelection(updatedYears[0]);
      } else {
        setActiveFiscalYear(null);
        setNeedsSelection(false);
        onFiscalYearChange?.(null);
      }
    }
  }, [fiscalYears, activeFiscalYear, resolveInitialFiscalYear, applyFiscalYearSelection, onFiscalYearChange]);

  // ------------------------------------------------------------------
  // ACTUALIZAR PERÍODOS DE TASA TURÍSTICA
  // ------------------------------------------------------------------
  const updateFiscalYearTouristTax = useCallback(async (
    fiscalYearId: string,
    periods: TouristTaxPeriod[]
  ): Promise<FiscalYear> => {
    const year = fiscalYears.find(y => y.id === fiscalYearId || y.appwriteId === fiscalYearId);
    const docId = (year?.appwriteId || year?.id) ?? fiscalYearId;

    const updated = await appwriteService.updateFiscalYearTouristTaxDoc(docId, periods);

    const updatedYears = fiscalYears.map(y =>
      y.id === fiscalYearId || y.appwriteId === fiscalYearId ? updated : y
    );
    setFiscalYears(updatedYears);

    if (activeFiscalYear?.id === fiscalYearId || activeFiscalYear?.appwriteId === fiscalYearId) {
      setActiveFiscalYear(updated);
    }

    return updated;
  }, [fiscalYears, activeFiscalYear]);

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <FiscalYearContext.Provider value={{
      fiscalYears,
      activeFiscalYear,
      isReadOnly,
      isLoading,
      needsSelection,
      selectFiscalYear,
      createFiscalYear,
      closeFiscalYear,
      reopenFiscalYear,
      refreshFiscalYears,
      getFiscalYearDependencies,
      deleteFiscalYear,
      updateFiscalYearTouristTax,
    }}>
      {children}
    </FiscalYearContext.Provider>
  );
};

// ============================================================================
// HOOKS
// ============================================================================

export const useFiscalYear = (): FiscalYearContextType => {
  const ctx = useContext(FiscalYearContext);
  if (!ctx) {
    throw new Error('useFiscalYear must be used within a FiscalYearProvider');
  }
  return ctx;
};

/**
 * Hook de conveniencia que devuelve `isReadOnly`.
 * Si se usa fuera del provider (ctx es null), lanza un error para
 * evitar que componentes ignoren silenciosamente la protección de escritura.
 */
export const useIsReadOnly = (): boolean => {
  const ctx = useContext(FiscalYearContext);
  if (!ctx) {
    throw new Error('useIsReadOnly must be used within a FiscalYearProvider');
  }
  return ctx.isReadOnly;
};
