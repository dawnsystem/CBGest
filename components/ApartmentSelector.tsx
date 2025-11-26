import React from 'react';
import { Apartment } from '../types';
import { Building, Home } from 'lucide-react';

interface ApartmentSelectorProps {
  apartments: Apartment[];
  selectedApartmentId?: string | null;
  onSelect: (apartmentId: string | null) => void;
  includeCommon?: boolean; // Include "Todos/Comunitario" option
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

/**
 * Reusable apartment selector component
 * Used in InvoiceUploader, AccountingBooks, ExpenseTable, etc.
 */
export const ApartmentSelector: React.FC<ApartmentSelectorProps> = ({
  apartments,
  selectedApartmentId,
  onSelect,
  includeCommon = true,
  label,
  placeholder = 'Seleccionar apartamento',
  disabled = false,
  className = '',
  size = 'md',
  showIcon = true
}) => {
  const activeApartments = apartments.filter(apt => apt.isActive);

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2',
    lg: 'px-4 py-3 text-lg'
  };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onSelect(value === '' || value === 'COMMON' ? null : value);
  };

  return (
    <div className={`${className}`}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {showIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Building className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <select
          value={selectedApartmentId || (includeCommon ? 'COMMON' : '')}
          onChange={handleChange}
          disabled={disabled}
          className={`
            block w-full rounded-lg border border-slate-300
            ${showIcon ? 'pl-9' : 'pl-3'} pr-8
            ${sizeClasses[size]}
            bg-white text-slate-900
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed
            transition-colors
          `}
        >
          {includeCommon && (
            <option value="COMMON">
              Todos / Comunitario
            </option>
          )}
          {!includeCommon && (
            <option value="">{placeholder}</option>
          )}
          {activeApartments.map(apt => (
            <option key={apt.id} value={apt.id}>
              {apt.code ? `${apt.code} - ${apt.name}` : apt.name}
            </option>
          ))}
        </select>
      </div>
      {activeApartments.length === 0 && (
        <p className="mt-1 text-xs text-slate-500">
          No hay apartamentos configurados. Añádelos en Configuración.
        </p>
      )}
    </div>
  );
};

/**
 * Compact badge version for display (not selectable)
 */
export const ApartmentBadge: React.FC<{
  apartment?: Apartment | null;
  isCommon?: boolean;
  size?: 'sm' | 'md';
}> = ({ apartment, isCommon, size = 'sm' }) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1'
  };

  if (isCommon || !apartment) {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} bg-slate-100 text-slate-600 rounded-full`}>
        <Home className="w-3 h-3" />
        Comunitario
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} bg-blue-100 text-blue-700 rounded-full`}>
      <Building className="w-3 h-3" />
      {apartment.code || apartment.name}
    </span>
  );
};

export default ApartmentSelector;
