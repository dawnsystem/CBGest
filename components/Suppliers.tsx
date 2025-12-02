import React, { useState } from 'react';
import { Supplier, NifType } from '../types';
import { Plus, Search, Edit2, Trash2, Save, X, Building2, AlertCircle } from 'lucide-react';
import { isValidNIF, normalizeNif, detectNifType } from '../utils/validators';
import { generateId } from '../utils/defaults';

interface SuppliersProps {
  suppliers: Supplier[];
  onAddSupplier: (supplier: Supplier) => void;
  onUpdateSupplier: (supplier: Supplier) => void;
  onDeleteSupplier: (id: string) => void;
}

export const Suppliers: React.FC<SuppliersProps> = ({
  suppliers,
  onAddSupplier,
  onUpdateSupplier,
  onDeleteSupplier
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: '',
    nif: '',
    nifType: 'CIF',
    address: '',
    city: '',
    postalCode: '',
    email: '',
    phone: '',
    notes: ''
  });

  const [nifError, setNifError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNifError(null);

    if (!formData.name || !formData.nif) {
      alert('El nombre y el NIF/CIF son obligatorios');
      return;
    }

    // Normalize and validate NIF
    const normalizedNif = normalizeNif(formData.nif);

    // Validate NIF format (except for PASAPORTE which has no standard format)
    if (formData.nifType !== 'PASAPORTE' && !isValidNIF(normalizedNif)) {
      setNifError(`El ${formData.nifType} introducido no es válido. Verifica el formato.`);
      return;
    }

    // Auto-detect NIF type if it doesn't match
    const detectedType = detectNifType(normalizedNif);
    const finalNifType = formData.nifType === 'PASAPORTE' ? 'PASAPORTE' : detectedType;

    if (editingId) {
      // Update existing supplier
      const supplierToUpdate = suppliers.find(s => s.id === editingId);
      if (supplierToUpdate) {
        onUpdateSupplier({
          ...supplierToUpdate,
          ...formData as Supplier,
          nif: normalizedNif,
          nifType: finalNifType
        });
      }
    } else {
      // Create new supplier
      // Nota: createdAt y updatedAt son gestionados automáticamente por Appwrite ($createdAt, $updatedAt)
      const newSupplier: Supplier = {
        id: generateId(),
        name: formData.name!,
        nif: normalizedNif,
        nifType: finalNifType,
        address: formData.address,
        city: formData.city,
        postalCode: formData.postalCode,
        email: formData.email,
        phone: formData.phone,
        notes: formData.notes
      };
      onAddSupplier(newSupplier);
    }

    // Reset form
    setFormData({
      name: '',
      nif: '',
      nifType: 'CIF',
      address: '',
      city: '',
      postalCode: '',
      email: '',
      phone: '',
      notes: ''
    });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (supplier: Supplier) => {
    setFormData(supplier);
    setEditingId(supplier.id);
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setFormData({
      name: '',
      nif: '',
      nifType: 'CIF',
      address: '',
      city: '',
      postalCode: '',
      email: '',
      phone: '',
      notes: ''
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este proveedor?')) {
      onDeleteSupplier(id);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.nif.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 overflow-x-hidden">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Proveedores</h1>
        </div>
        <p className="text-slate-600">
          Gestiona tu lista de proveedores. La IA consultará esta lista antes de crear nuevos proveedores en las facturas.
        </p>
      </div>

      {/* Search and Add */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            id="suppliers-search-input"
            name="search"
            type="text"
            placeholder="Buscar por nombre, NIF o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            autoComplete="off"
          />
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) handleCancelEdit();
          }}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          {showForm ? (
            <>
              <X className="w-5 h-5" />
              Cancelar
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              Nuevo Proveedor
            </>
          )}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div className="md:col-span-2">
                <label htmlFor="suppliers-name-input" className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  id="suppliers-name-input"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Nombre del proveedor"
                  required
                  autoComplete="organization"
                />
              </div>

              {/* NIF Type */}
              <div>
                <label htmlFor="suppliers-niftype-select" className="block text-sm font-medium text-slate-700 mb-1">
                  Tipo de Identificación
                </label>
                <select
                  id="suppliers-niftype-select"
                  name="nifType"
                  value={formData.nifType}
                  onChange={(e) => setFormData({ ...formData, nifType: e.target.value as NifType })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="CIF">CIF</option>
                  <option value="NIF">NIF</option>
                  <option value="NIE">NIE</option>
                  <option value="DNI">DNI</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
              </div>

              {/* NIF */}
              <div>
                <label htmlFor="suppliers-nif-input" className="block text-sm font-medium text-slate-700 mb-1">
                  {formData.nifType} <span className="text-red-500">*</span>
                </label>
                <input
                  id="suppliers-nif-input"
                  name="nif"
                  type="text"
                  value={formData.nif}
                  onChange={(e) => {
                    setFormData({ ...formData, nif: e.target.value.toUpperCase() });
                    setNifError(null); // Clear error on change
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${
                    nifError ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-blue-500'
                  }`}
                  placeholder="A12345678"
                  required
                  autoComplete="off"
                />
                {nifError && (
                  <div className="flex items-center gap-1 mt-1 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{nifError}</span>
                  </div>
                )}
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <label htmlFor="suppliers-address-input" className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                <input
                  id="suppliers-address-input"
                  name="address"
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Calle, número, piso..."
                  autoComplete="street-address"
                />
              </div>

              {/* City */}
              <div>
                <label htmlFor="suppliers-city-input" className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
                <input
                  id="suppliers-city-input"
                  name="city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Barcelona"
                  autoComplete="address-level2"
                />
              </div>

              {/* Postal Code */}
              <div>
                <label htmlFor="suppliers-postalcode-input" className="block text-sm font-medium text-slate-700 mb-1">Código Postal</label>
                <input
                  id="suppliers-postalcode-input"
                  name="postalCode"
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="08001"
                  autoComplete="postal-code"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="suppliers-email-input" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  id="suppliers-email-input"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="contacto@proveedor.com"
                  autoComplete="email"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="suppliers-phone-input" className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input
                  id="suppliers-phone-input"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="+34 600 000 000"
                  autoComplete="tel"
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <label htmlFor="suppliers-notes-textarea" className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <textarea
                  id="suppliers-notes-textarea"
                  name="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  rows={3}
                  placeholder="Notas adicionales sobre el proveedor..."
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 mt-6">
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Save className="w-4 h-4" />
                {editingId ? 'Actualizar' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Suppliers List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        {filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No hay proveedores</h3>
            <p className="text-slate-600 mb-4">
              {searchTerm ? 'No se encontraron proveedores con ese criterio de búsqueda' : 'Comienza añadiendo tu primer proveedor'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Añadir Proveedor
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Identificación</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Contacto</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Ciudad</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSuppliers.map(supplier => (
                    <tr key={supplier.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{supplier.name}</div>
                        {supplier.notes && (
                          <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{supplier.notes}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          <span className="font-medium text-slate-700">{supplier.nifType}:</span>{' '}
                          <span className="text-slate-900">{supplier.nif}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm space-y-0.5">
                          {supplier.email && (
                            <div className="text-slate-700">{supplier.email}</div>
                          )}
                          {supplier.phone && (
                            <div className="text-slate-600">{supplier.phone}</div>
                          )}
                          {!supplier.email && !supplier.phone && (
                            <div className="text-slate-400 text-xs">Sin contacto</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          {supplier.city ? (
                            <>
                              <div className="text-slate-900">{supplier.city}</div>
                              {supplier.postalCode && (
                                <div className="text-slate-600 text-xs">CP: {supplier.postalCode}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEdit(supplier)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(supplier.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredSuppliers.map(supplier => (
                <div key={supplier.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium text-slate-900">{supplier.name}</h4>
                      <p className="text-sm text-slate-600 mt-0.5">
                        {supplier.nifType}: {supplier.nif}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(supplier)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(supplier.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {(supplier.email || supplier.phone) && (
                    <div className="text-sm space-y-1 mb-2">
                      {supplier.email && (
                        <div className="text-slate-700">{supplier.email}</div>
                      )}
                      {supplier.phone && (
                        <div className="text-slate-600">{supplier.phone}</div>
                      )}
                    </div>
                  )}

                  {supplier.city && (
                    <div className="text-sm text-slate-600">
                      {supplier.city} {supplier.postalCode && `(${supplier.postalCode})`}
                    </div>
                  )}

                  {supplier.notes && (
                    <div className="text-xs text-slate-500 mt-2 italic">{supplier.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Stats */}
      {suppliers.length > 0 && (
        <div className="mt-4 text-sm text-slate-600 text-center">
          Mostrando {filteredSuppliers.length} de {suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''}
        </div>
      )}
    </div>
  );
};
