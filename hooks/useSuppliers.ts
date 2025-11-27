/**
 * @fileoverview Hook para gestión de proveedores
 * @description Encapsula la lógica de estado y operaciones CRUD de proveedores
 */

import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { Supplier, AppSettings } from '../types';
import * as appwriteService from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';

interface UseSuppliersOptions {
  settings: AppSettings;
  showError: (message: string, autoClearMs?: number) => void;
}

interface UseSuppliersReturn {
  suppliers: Supplier[];
  setSuppliers: Dispatch<SetStateAction<Supplier[]>>;
  handleAddSupplier: (supplier: Supplier) => Promise<void>;
  handleUpdateSupplier: (supplier: Supplier) => Promise<void>;
  handleDeleteSupplier: (id: string) => Promise<void>;
}

export function useSuppliers(options: UseSuppliersOptions): UseSuppliersReturn {
  const { settings, showError } = options;
  const { user } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const handleAddSupplier = useCallback(async (supplier: Supplier) => {
    const supplierWithAudit: Supplier = {
      ...supplier,
      createdBy: supplier.createdBy || user?.$id,
      createdByName: supplier.createdByName || user?.name
    };

    setSuppliers(prev => [supplierWithAudit, ...prev]);

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        const savedSupplier = await appwriteService.createSupplier(supplierWithAudit);
        setSuppliers(prev => prev.map(s => s.id === supplierWithAudit.id ? savedSupplier : s));
        console.log('✅ Proveedor guardado en Appwrite:', savedSupplier.id);
      } catch (error: unknown) {
        setSuppliers(prev => prev.filter(s => s.id !== supplierWithAudit.id));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al crear proveedor: ${errorMessage}. Los cambios no se han guardado.`);
        console.error('Error saving supplier to Appwrite:', error);
      }
    }
  }, [user, settings, showError]);

  const handleUpdateSupplier = useCallback(async (supplier: Supplier) => {
    const oldSupplier = suppliers.find(s => s.id === supplier.id);

    setSuppliers(prev => prev.map(s => s.id === supplier.id ? supplier : s));

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        const supplierToUpdate = {
          ...supplier,
          appwriteId: supplier.appwriteId || supplier.id
        };
        await appwriteService.updateSupplier(supplierToUpdate);
        console.log('✅ Proveedor actualizado en Appwrite:', supplierToUpdate.appwriteId);
      } catch (error: unknown) {
        if (oldSupplier) {
          setSuppliers(prev => prev.map(s => s.id === supplier.id ? oldSupplier : s));
        }
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al actualizar proveedor: ${errorMessage}. Los cambios no se han guardado.`);
        console.error('Error updating supplier in Appwrite:', error);
      }
    }
  }, [suppliers, settings, showError]);

  const handleDeleteSupplier = useCallback(async (id: string) => {
    const supplier = suppliers.find(s => s.id === id);

    setSuppliers(prev => prev.filter(s => s.id !== id));

    if (settings.dataConfig?.type === 'APPWRITE' && supplier) {
      try {
        const docId = supplier.appwriteId || supplier.id;
        await appwriteService.deleteSupplier(docId);
        console.log('✅ Proveedor eliminado de Appwrite:', docId);
      } catch (error: unknown) {
        setSuppliers(prev => [supplier, ...prev]);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al eliminar proveedor: ${errorMessage}. El proveedor no se ha eliminado.`);
        console.error('Error deleting supplier from Appwrite:', error);
      }
    }
  }, [suppliers, settings, showError]);

  return {
    suppliers,
    setSuppliers,
    handleAddSupplier,
    handleUpdateSupplier,
    handleDeleteSupplier
  };
}
