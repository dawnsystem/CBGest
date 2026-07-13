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

const LS_KEY = 'gestcb_active_fiscal_year_id';

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
  /** Seleccionar el ejercicio activo (cambia los datos que se muestran) */
  selectFiscalYear: (id: string) => void;
  /** Crear un nuevo ejercicio. Si hay ejercicio previo, copia maestros automáticamente */
  createFiscalYear: (
    year: number,
    notes?: string
  ) => Promise<{ fiscalYear: FiscalYear; copiedSuppliers: number; copiedApartments: number }>;
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

  // Derivado: readonly si el ejercicio activo está cerrado
  const isReadOnly = activeFiscalYear?.status === 'CLOSED';

  // ------------------------------------------------------------------
  // CARGA INICIAL
  // ------------------------------------------------------------------
  const refreshFiscalYears = useCallback(async () => {
    try {
      const years = await appwriteService.fetchFiscalYears();
      setFiscalYears(years);

      // Restaurar ejercicio activo desde localStorage
      const storedId = localStorage.getItem(LS_KEY);
      if (storedId) {
        const found = years.find(y => y.id === storedId || y.appwriteId === storedId);
        if (found) {
          setActiveFiscalYear(found);
          return;
        }
      }

      // Si no hay uno guardado, seleccionar el más reciente ABIERTO, o el más reciente
      const open = years.find(y => y.status === 'OPEN');
      const defaultYear = open || years[0] || null;
      setActiveFiscalYear(defaultYear);
      if (defaultYear) {
        localStorage.setItem(LS_KEY, defaultYear.id);
      }
    } catch (err) {
      console.error('[FiscalYearContext] Error cargando ejercicios:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setFiscalYears([]);
      setActiveFiscalYear(null);
      setIsLoading(false);
      localStorage.removeItem(LS_KEY);
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
    setActiveFiscalYear(found);
    localStorage.setItem(LS_KEY, found.id);
    onFiscalYearChange?.(found.id);
  }, [fiscalYears, onFiscalYearChange]);

  // ------------------------------------------------------------------
  // CREAR EJERCICIO
  // ------------------------------------------------------------------
  const createFiscalYear = useCallback(async (
    year: number,
    notes?: string
  ): Promise<{ fiscalYear: FiscalYear; copiedSuppliers: number; copiedApartments: number }> => {
    const now = new Date().toISOString();

    const newFiscalYear: FiscalYear = {
      id: generateId(),
      year,
      status: 'OPEN',
      openedAt: now,
      notes: notes || ''
    };

    const saved = await appwriteService.createFiscalYearDoc(newFiscalYear);

    // Buscar ejercicio previo (el de año inmediatamente anterior)
    const previousYear = fiscalYears
      .filter(y => y.year < year)
      .sort((a, b) => b.year - a.year)[0];

    let copiedSuppliers = 0;
    let copiedApartments = 0;

    if (previousYear) {
      try {
        const result = await appwriteService.copyMasterDataToFiscalYear(
          previousYear.appwriteId || previousYear.id,
          saved.appwriteId || saved.id
        );
        copiedSuppliers = result.suppliers;
        copiedApartments = result.apartments;
      } catch (err) {
        console.error('[FiscalYearContext] Error copiando datos maestros:', err);
        // No bloqueamos la creación si falla la copia
      }
    }

    // Actualizar estado local
    const updatedYears = [saved, ...fiscalYears];
    setFiscalYears(updatedYears);
    setActiveFiscalYear(saved);
    localStorage.setItem(LS_KEY, saved.id);
    onFiscalYearChange?.(saved.id);

    return { fiscalYear: saved, copiedSuppliers, copiedApartments };
  }, [fiscalYears, onFiscalYearChange]);

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

    // Si era el ejercicio activo, seleccionar el siguiente disponible
    const wasActive = activeFiscalYear?.id === id || activeFiscalYear?.appwriteId === id;
    if (wasActive) {
      // Seleccionar el ejercicio ABIERTO más reciente (mayor año final) o el primero disponible
      const openYears = updatedYears.filter(y => y.status === 'OPEN');
      const nextYear =
        (openYears.length > 0
          ? openYears.reduce((best, y) => (y.year > best.year ? y : best))
          : updatedYears[0]) || null;
      setActiveFiscalYear(nextYear);
      if (nextYear) {
        localStorage.setItem(LS_KEY, nextYear.id);
        onFiscalYearChange?.(nextYear.id);
      } else {
        localStorage.removeItem(LS_KEY);
        onFiscalYearChange?.(null);
      }
    }
  }, [fiscalYears, activeFiscalYear, onFiscalYearChange]);

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
