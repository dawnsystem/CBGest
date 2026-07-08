import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Save, Calendar, DollarSign, RefreshCw, Search, Filter, AlertTriangle, CheckCircle } from 'lucide-react';
import { RecurringExpense, ExpenseFrequency, Apartment, Supplier } from '../types';
import { ApartmentSelector, ApartmentBadge } from './ApartmentSelector';
import { AccountSelector } from './AccountSelector';
import { generateId } from '../utils/defaults';
import { useToast } from './Toast';

interface RecurringExpenseManagerProps {
  expenses: RecurringExpense[];
  apartments: Apartment[];
  suppliers: Supplier[];
  onAddExpense: (expense: RecurringExpense) => Promise<void>;
  onUpdateExpense: (expense: RecurringExpense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
}

const FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  MONTHLY: 'Mensual',
  BIMONTHLY: 'Bimestral',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual'
};

const FREQUENCY_COLORS: Record<ExpenseFrequency, string> = {
  MONTHLY: 'bg-blue-100 text-blue-700 border-blue-200',
  BIMONTHLY: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  QUARTERLY: 'bg-purple-100 text-purple-700 border-purple-200',
  SEMIANNUAL: 'bg-amber-100 text-amber-700 border-amber-200',
  ANNUAL: 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

// Calculate annual cost based on frequency
const getAnnualCost = (amount: number, frequency: ExpenseFrequency): number => {
  const multipliers: Record<ExpenseFrequency, number> = {
    MONTHLY: 12,
    BIMONTHLY: 6,
    QUARTERLY: 4,
    SEMIANNUAL: 2,
    ANNUAL: 1
  };
  return amount * multipliers[frequency];
};

// Get next expected payment date
const getNextPaymentDate = (expense: RecurringExpense): Date | null => {
  if (!expense.isActive) return null;

  const today = new Date();
  const dayOfMonth = expense.dayOfMonth || 1;

  // BUG-013 fix: build candidate dates from year/month/day components without
  // relying on the local-time constructor (new Date(y, m, d)), which can shift
  // by one day around DST transitions.  We use a helper that returns midnight
  // UTC for a given calendar date so all comparisons are time-zone stable.
  const utcDate = (y: number, m: number, d: number): Date =>
    new Date(Date.UTC(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));

  const year = today.getFullYear();
  const month = today.getMonth();
  const clampedDay = Math.min(dayOfMonth, new Date(year, month + 1, 0).getDate());

  let nextDate = utcDate(year, month, clampedDay);

  // If day has passed this month, move to next occurrence
  if (nextDate <= today) {
    const monthsToAdd: Record<ExpenseFrequency, number> = {
      MONTHLY: 1,
      BIMONTHLY: 2,
      QUARTERLY: 3,
      SEMIANNUAL: 6,
      ANNUAL: 12
    };

    const newMonth = month + monthsToAdd[expense.frequency];
    const newYear = year + Math.floor(newMonth / 12);
    const adjustedMonth = newMonth % 12;

    nextDate = utcDate(newYear, adjustedMonth, dayOfMonth);
  }

  return nextDate;
};

export const RecurringExpenseManager: React.FC<RecurringExpenseManagerProps> = ({
  expenses,
  apartments,
  suppliers,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<RecurringExpense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterApartment, setFilterApartment] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast, showConfirm } = useToast();

  // Form state
  const [formData, setFormData] = useState<Partial<RecurringExpense>>({
    name: '',
    description: '',
    estimatedAmount: 0,
    frequency: 'MONTHLY',
    category: '',
    apartmentId: undefined,
    supplierId: undefined,
    dayOfMonth: 1,
    isDeductible: true,
    isActive: true,
    notes: ''
  });

  // Filter and sort expenses
  const filteredExpenses = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return expenses
      .filter(exp => {
        const matchesSearch = !searchTerm ||
                             exp.name?.toLowerCase().includes(searchLower) ||
                             exp.description?.toLowerCase().includes(searchLower);
        const matchesApartment = !filterApartment ||
                                 (filterApartment === 'common' && !exp.apartmentId) ||
                                 exp.apartmentId === filterApartment;
        const matchesActive = showInactive || exp.isActive;
        return matchesSearch && matchesApartment && matchesActive;
      })
      .sort((a, b) => {
        // Sort by active first, then by name
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [expenses, searchTerm, filterApartment, showInactive]);

  // Calculate totals
  const totals = useMemo(() => {
    const activeExpenses = expenses.filter(e => e.isActive);
    const monthlyTotal = activeExpenses.reduce((sum, exp) => {
      return sum + getAnnualCost(exp.estimatedAmount, exp.frequency) / 12;
    }, 0);
    const annualTotal = activeExpenses.reduce((sum, exp) => {
      return sum + getAnnualCost(exp.estimatedAmount, exp.frequency);
    }, 0);
    return { monthlyTotal, annualTotal, count: activeExpenses.length };
  }, [expenses]);

  const openModal = (expense?: RecurringExpense) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData({ ...expense });
    } else {
      setEditingExpense(null);
      setFormData({
        name: '',
        description: '',
        estimatedAmount: 0,
        frequency: 'MONTHLY',
        category: '',
        apartmentId: undefined,
        supplierId: undefined,
        dayOfMonth: 1,
        isDeductible: true,
        isActive: true,
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingExpense(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = formData.name?.trim();
    const amount = formData.estimatedAmount;

    // Validate required fields
    if (!trimmedName) {
      showToast('El nombre del gasto es obligatorio', 'warning');
      return;
    }
    if (amount === undefined || isNaN(amount) || amount <= 0) {
      showToast('El importe debe ser un número mayor que 0', 'warning');
      return;
    }

    // Validate dayOfMonth
    const dayOfMonth = formData.dayOfMonth;
    if (dayOfMonth !== undefined && (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) {
      showToast('El día del mes debe estar entre 1 y 31', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const expenseData: RecurringExpense = {
        id: editingExpense?.id || generateId(),
        name: trimmedName,
        description: formData.description?.trim(),
        estimatedAmount: amount,
        frequency: formData.frequency as ExpenseFrequency,
        category: formData.category,
        apartmentId: formData.apartmentId || undefined,
        supplierId: formData.supplierId || undefined,
        dayOfMonth: dayOfMonth || 1,
        isDeductible: formData.isDeductible ?? true,
        isActive: formData.isActive ?? true,
        notes: formData.notes?.trim(),
        appwriteId: editingExpense?.appwriteId
      };

      if (editingExpense) {
        await onUpdateExpense(expenseData);
      } else {
        await onAddExpense(expenseData);
      }
      closeModal();
    } catch (error) {
      console.error('Error saving expense:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm('¿Estás seguro de eliminar este gasto recurrente?')) {
      try {
        await onDeleteExpense(id);
      } catch (error) {
        console.error('Error deleting expense:', error);
        showToast('Error al eliminar el gasto. Por favor, inténtalo de nuevo.', 'error');
      }
    }
  };

  const getApartmentName = (apartmentId?: string) => {
    if (!apartmentId) return 'Comunitario';
    const apt = apartments.find(a => a.id === apartmentId);
    return apt?.name || 'Desconocido';
  };

  const getSupplierName = (supplierId?: string) => {
    if (!supplierId) return null;
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || null;
  };

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Gastos Recurrentes</h2>
          <p className="text-sm text-slate-500">Gestiona gastos fijos: seguros, suministros, comunidad, etc.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nuevo Gasto
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Gastos Activos</p>
              <p className="text-xl font-bold text-slate-900">{totals.count}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Calendar className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Estimado Mensual</p>
              <p className="text-xl font-bold text-slate-900">
                {totals.monthlyTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Estimado Anual</p>
              <p className="text-xl font-bold text-slate-900">
                {totals.annualTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-3 items-center">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterApartment || ''}
              onChange={(e) => setFilterApartment(e.target.value || null)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los apartamentos</option>
              <option value="common">Comunitario</option>
              {apartments.filter(a => a.isActive).map(apt => (
                <option key={apt.id} value={apt.id}>{apt.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Ver inactivos
            </label>
          </div>
        </div>
      </div>

      {/* Expense List */}
      {filteredExpenses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <RefreshCw className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No hay gastos recurrentes</h3>
          <p className="text-sm text-slate-500 mb-4">
            {searchTerm || filterApartment ? 'No se encontraron resultados con los filtros actuales.' : 'Añade gastos fijos como seguros, comunidad, suministros, etc.'}
          </p>
          {!searchTerm && !filterApartment && (
            <button
              onClick={() => openModal()}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              + Crear primer gasto recurrente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExpenses.map(expense => {
            const nextPayment = getNextPaymentDate(expense);
            const annualCost = getAnnualCost(expense.estimatedAmount, expense.frequency);
            const supplierName = getSupplierName(expense.supplierId);

            return (
              <div
                key={expense.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                  expense.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60'
                }`}
              >
                <div className="p-4">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 truncate">{expense.name}</h3>
                        {!expense.isActive && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            Inactivo
                          </span>
                        )}
                      </div>
                      {expense.description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{expense.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => openModal(expense)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Amount & Frequency */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl font-bold text-slate-900">
                      {expense.estimatedAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full border ${FREQUENCY_COLORS[expense.frequency]}`}>
                      {FREQUENCY_LABELS[expense.frequency]}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Coste anual:</span>
                      <span className="font-medium text-slate-700">
                        {annualCost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Apartamento:</span>
                      <ApartmentBadge
                        apartment={apartments.find(a => a.id === expense.apartmentId)}
                        size="sm"
                      />
                    </div>

                    {supplierName && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Proveedor:</span>
                        <span className="font-medium text-slate-700">{supplierName}</span>
                      </div>
                    )}

                    {nextPayment && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Próximo pago:</span>
                        <span className="font-medium text-slate-700">
                          {nextPayment.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    {expense.isDeductible && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Deducible
                      </span>
                    )}
                    {expense.category && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {expense.category.split(' - ')[0]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingExpense ? 'Editar Gasto Recurrente' : 'Nuevo Gasto Recurrente'}
              </h3>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del gasto *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Electricidad, Seguro Hogar, Comunidad..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción opcional..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Amount & Frequency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Importe estimado *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.estimatedAmount ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setFormData({ ...formData, estimatedAmount: undefined });
                      } else {
                        const parsed = parseFloat(value);
                        setFormData({ ...formData, estimatedAmount: !isNaN(parsed) && parsed >= 0 ? parsed : undefined });
                      }
                    }}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Frecuencia
                  </label>
                  <select
                    value={formData.frequency || 'MONTHLY'}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as ExpenseFrequency })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Day of Month */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Día del mes (aprox.)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={formData.dayOfMonth ?? 1}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setFormData({ ...formData, dayOfMonth: 1 });
                    } else {
                      const parsed = parseInt(value, 10);
                      const validDay = !isNaN(parsed) && parsed >= 1 && parsed <= 31 ? parsed : 1;
                      setFormData({ ...formData, dayOfMonth: validDay });
                    }
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Día esperado de cargo/pago</p>
              </div>

              {/* Apartment */}
              <div>
                <ApartmentSelector
                  apartments={apartments}
                  selectedApartmentId={formData.apartmentId || null}
                  onSelect={(id) => setFormData({ ...formData, apartmentId: id || undefined })}
                  includeCommon={true}
                  label="Asignar a Apartamento"
                />
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Proveedor
                </label>
                <select
                  value={formData.supplierId || ''}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value || undefined })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin proveedor asignado</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>

              {/* Category (Account) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cuenta Contable
                </label>
                <AccountSelector
                  value={formData.category || ''}
                  onChange={(val) => setFormData({ ...formData, category: val })}
                />
              </div>

              {/* Checkboxes */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isDeductible ?? true}
                    onChange={(e) => setFormData({ ...formData, isDeductible: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Deducible fiscalmente</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive ?? true}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Activo</span>
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="Notas adicionales..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formData.name || !formData.estimatedAmount}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSubmitting ? 'Guardando...' : editingExpense ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
