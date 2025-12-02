import React, { useState } from 'react';
import { Apartment, ApartmentType } from '../types';
import {
  Plus, Search, Edit2, Trash2, Save, X, Building2,
  Home, MapPin, Hash, Users, FileText, CheckCircle, XCircle,
  Palmtree, Building
} from 'lucide-react';
import { generateId } from '../utils/defaults';

interface ApartmentManagerProps {
  apartments: Apartment[];
  onAddApartment: (apartment: Apartment) => void;
  onUpdateApartment: (apartment: Apartment) => void;
  onDeleteApartment: (id: string) => void;
}

const emptyFormData: Partial<Apartment> = {
  name: '',
  code: '',
  address: '',
  cadastralRef: '',
  surfaceArea: undefined,
  maxOccupancy: undefined,
  licenseNumber: '',
  apartmentType: 'TOURIST',
  notes: '',
  isActive: true
};

export const ApartmentManager: React.FC<ApartmentManagerProps> = ({
  apartments,
  onAddApartment,
  onUpdateApartment,
  onDeleteApartment
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Apartment>>(emptyFormData);
  const [showInactive, setShowInactive] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate name (required and not just whitespace)
    const trimmedName = formData.name?.trim();
    if (!trimmedName) {
      alert('El nombre del apartamento es obligatorio');
      return;
    }

    // Validate numeric fields if provided
    if (formData.surfaceArea !== undefined && (isNaN(formData.surfaceArea) || formData.surfaceArea <= 0)) {
      alert('La superficie debe ser mayor a 0');
      return;
    }

    if (formData.maxOccupancy !== undefined && (isNaN(formData.maxOccupancy) || formData.maxOccupancy < 1 || formData.maxOccupancy > 50)) {
      alert('La capacidad máxima debe estar entre 1 y 50 personas');
      return;
    }

    if (editingId) {
      // Update existing apartment
      const apartmentToUpdate = apartments.find(a => a.id === editingId);
      if (apartmentToUpdate) {
        onUpdateApartment({
          ...apartmentToUpdate,
          ...formData,
          isActive: formData.isActive ?? true
        } as Apartment);
      }
    } else {
      // Create new apartment
      // Nota: createdAt y updatedAt son gestionados automáticamente por Appwrite ($createdAt, $updatedAt)
      const newApartment: Apartment = {
        id: generateId(),
        name: trimmedName,
        code: formData.code?.trim() || undefined,
        address: formData.address || undefined,
        cadastralRef: formData.cadastralRef || undefined,
        surfaceArea: formData.surfaceArea || undefined,
        maxOccupancy: formData.maxOccupancy || undefined,
        licenseNumber: formData.licenseNumber || undefined,
        apartmentType: formData.apartmentType || 'TOURIST',
        notes: formData.notes || undefined,
        isActive: formData.isActive ?? true
      };
      onAddApartment(newApartment);
    }

    // Reset form
    setFormData(emptyFormData);
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (apartment: Apartment) => {
    setFormData(apartment);
    setEditingId(apartment.id);
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setFormData(emptyFormData);
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    const apartment = apartments.find(a => a.id === id);
    if (window.confirm(`¿Estás seguro de que quieres eliminar "${apartment?.name}"?`)) {
      onDeleteApartment(id);
    }
  };

  const handleToggleActive = (apartment: Apartment) => {
    onUpdateApartment({
      ...apartment,
      isActive: !apartment.isActive
    });
  };

  const filteredApartments = apartments.filter(apartment => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      apartment.name?.toLowerCase().includes(searchLower) ||
      apartment.code?.toLowerCase().includes(searchLower) ||
      apartment.address?.toLowerCase().includes(searchLower);

    const matchesActive = showInactive || apartment.isActive;

    return matchesSearch && matchesActive;
  });

  const activeCount = apartments.filter(a => a.isActive).length;
  const inactiveCount = apartments.filter(a => !a.isActive).length;

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 overflow-x-hidden">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Apartamentos</h1>
        </div>
        <p className="text-slate-600">
          Gestiona los {activeCount} apartamentos de tu CB
          {inactiveCount > 0 && ` (${inactiveCount} inactivos)`}
        </p>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar apartamento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Filters & Add Button */}
        <div className="flex gap-2">
          {inactiveCount > 0 && (
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                showInactive
                  ? 'bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {showInactive ? 'Ocultar inactivos' : 'Mostrar inactivos'}
            </button>
          )}
          <button
            onClick={() => {
              setFormData(emptyFormData);
              setEditingId(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Nuevo Apartamento</span>
          </button>
        </div>
      </div>

      {/* Form Modal/Card */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingId ? 'Editar Apartamento' : 'Nuevo Apartamento'}
                </h2>
                <button
                  onClick={handleCancelEdit}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name & Code Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Apartamento 1A"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Código
                  </label>
                  <input
                    type="text"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="1A"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Dirección
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Calle, número, piso, puerta..."
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Cadastral Ref & License Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Referencia Catastral
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      value={formData.cadastralRef || ''}
                      onChange={(e) => setFormData({ ...formData, cadastralRef: e.target.value })}
                      placeholder="1234567AB1234N0001XX"
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Licencia Turística
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      value={formData.licenseNumber || ''}
                      onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                      placeholder="HUT-000000"
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Apartment Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tipo de Apartamento *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, apartmentType: 'TOURIST' })}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                      formData.apartmentType === 'TOURIST'
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <Palmtree className={`w-5 h-5 ${formData.apartmentType === 'TOURIST' ? 'text-amber-600' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <p className="font-medium text-sm">Turístico (HUT)</p>
                      <p className="text-xs text-slate-500">Vivienda de uso turístico</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, apartmentType: 'RESIDENTIAL' })}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                      formData.apartmentType === 'RESIDENTIAL'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <Building className={`w-5 h-5 ${formData.apartmentType === 'RESIDENTIAL' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <p className="font-medium text-sm">Vivienda Habitual</p>
                      <p className="text-xs text-slate-500">Alquiler de larga estancia</p>
                    </div>
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {formData.apartmentType === 'TOURIST' 
                    ? '🏖️ Los apartamentos turísticos generan tasa turística (IEET)'
                    : '🏠 Los apartamentos de vivienda habitual NO generan tasa turística'}
                </p>
              </div>

              {/* Surface & Occupancy Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Superficie (m²)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.surfaceArea ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setFormData({ ...formData, surfaceArea: undefined });
                      } else {
                        const parsed = parseFloat(value);
                        setFormData({ ...formData, surfaceArea: !isNaN(parsed) && parsed >= 0 ? parsed : undefined });
                      }
                    }}
                    placeholder="50"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Capacidad Máxima
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={formData.maxOccupancy ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          setFormData({ ...formData, maxOccupancy: undefined });
                        } else {
                          const parsed = parseInt(value, 10);
                          setFormData({ ...formData, maxOccupancy: !isNaN(parsed) && parsed >= 1 && parsed <= 50 ? parsed : undefined });
                        }
                      }}
                      placeholder="4"
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Información adicional sobre el apartamento..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive ?? true}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm text-slate-700">
                  Apartamento activo (aparecerá en selectores)
                </label>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {editingId ? 'Guardar Cambios' : 'Crear Apartamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apartments Grid */}
      {filteredApartments.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
          <Home className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            {searchTerm ? 'No se encontraron apartamentos' : 'No hay apartamentos'}
          </h3>
          <p className="text-slate-500 mb-4">
            {searchTerm
              ? 'Prueba con otros términos de búsqueda'
              : 'Añade tus apartamentos para poder asignarles gastos e ingresos'
            }
          </p>
          {!searchTerm && (
            <button
              onClick={() => {
                setFormData(emptyFormData);
                setEditingId(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Añadir Primer Apartamento
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApartments.map(apartment => (
            <div
              key={apartment.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                apartment.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60'
              }`}
            >
              {/* Card Header */}
              <div className={`px-4 py-3 border-b ${
                apartment.isActive 
                  ? apartment.apartmentType === 'TOURIST' 
                    ? 'bg-amber-50 border-amber-100' 
                    : 'bg-blue-50 border-blue-100'
                  : 'bg-slate-50 border-slate-100'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {apartment.apartmentType === 'TOURIST' ? (
                      <Palmtree className={`w-5 h-5 ${apartment.isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                    ) : (
                      <Building className={`w-5 h-5 ${apartment.isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    )}
                    <h3 className="font-semibold text-slate-900">
                      {apartment.code && <span className={apartment.apartmentType === 'TOURIST' ? 'text-amber-600' : 'text-blue-600'}>{apartment.code} - </span>}
                      {apartment.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      apartment.apartmentType === 'TOURIST'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {apartment.apartmentType === 'TOURIST' ? 'HUT' : 'VIVIENDA'}
                    </span>
                    {apartment.isActive ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-2">
                {apartment.address && (
                  <div className="flex items-start gap-2 text-sm text-slate-600">
                    <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{apartment.address}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  {apartment.surfaceArea && (
                    <span className="flex items-center gap-1">
                      <span className="font-medium">{apartment.surfaceArea}</span> m²
                    </span>
                  )}
                  {apartment.maxOccupancy && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {apartment.maxOccupancy} personas
                    </span>
                  )}
                </div>

                {apartment.licenseNumber && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{apartment.licenseNumber}</span>
                  </div>
                )}

                {apartment.notes && (
                  <p className="text-sm text-slate-500 line-clamp-2 mt-2 pt-2 border-t border-slate-100">
                    {apartment.notes}
                  </p>
                )}
              </div>

              {/* Card Actions */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                <button
                  onClick={() => handleToggleActive(apartment)}
                  className={`text-sm ${
                    apartment.isActive
                      ? 'text-slate-500 hover:text-amber-600'
                      : 'text-emerald-600 hover:text-emerald-700'
                  }`}
                >
                  {apartment.isActive ? 'Desactivar' : 'Activar'}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(apartment)}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(apartment.id)}
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApartmentManager;
