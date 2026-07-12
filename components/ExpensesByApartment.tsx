import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { Home, TrendingDown, Filter } from 'lucide-react';
import { Invoice, Apartment } from '../types';
import { ChartWrapper } from './ChartWrapper';
import { useFiscalYear } from '../context/FiscalYearContext';

interface ExpensesByApartmentProps {
  invoices: Invoice[];
  apartments: Apartment[];
}

type PeriodFilter = 'month' | 'quarter' | 'year' | 'all';

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
];

const COMMON_COLOR = '#64748b'; // slate for common/unassigned

// Custom Tooltip component moved outside to prevent recreation on each render
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { fullName: string; value: number } }>;
  totalExpenses: number;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, totalExpenses }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const percentage = totalExpenses > 0 ? ((data.value / totalExpenses) * 100).toFixed(1) : '0';
    return (
      <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-slate-200">
        <p className="font-medium text-slate-900">{data.fullName}</p>
        <p className="text-sm text-slate-600">
          {data.value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
        </p>
        <p className="text-xs text-slate-400">{percentage}% del total</p>
      </div>
    );
  }
  return null;
};

export const ExpensesByApartment: React.FC<ExpensesByApartmentProps> = ({ invoices, apartments }) => {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('year');
  const { activeFiscalYear } = useFiscalYear();

  // Active fiscal year number; fall back to real current year
  const activeYear = activeFiscalYear?.year ?? new Date().getFullYear();

  // Filter invoices by period
  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    return invoices.filter(inv => {
      // Only expenses that are processed
      if (inv.type !== 'EXPENSE' || inv.status === 'PENDING') return false;

      const invDate = new Date(inv.date);
      const invYear = invDate.getFullYear();
      const invMonth = invDate.getMonth();
      const invQuarter = Math.floor(invMonth / 3);

      switch (periodFilter) {
        case 'month':
          return invYear === activeYear && invMonth === currentMonth;
        case 'quarter':
          return invYear === activeYear && invQuarter === currentQuarter;
        case 'year':
          return invYear === activeYear;
        case 'all':
        default:
          return true;
      }
    });
  }, [invoices, periodFilter, activeYear]);

  // Calculate expenses by apartment
  const expensesByApartment = useMemo(() => {
    const apartmentMap = new Map<string, { name: string; code: string; total: number; count: number }>();

    // Initialize with all apartments
    apartments.forEach(apt => {
      apartmentMap.set(apt.id, {
        name: apt.name,
        code: apt.code,
        total: 0,
        count: 0
      });
    });

    // Add "Comunitario" category for unassigned expenses
    apartmentMap.set('common', {
      name: 'Comunitario',
      code: 'COM',
      total: 0,
      count: 0
    });

    // Sum expenses
    filteredInvoices.forEach(inv => {
      const key = inv.apartmentId || 'common';
      const existing = apartmentMap.get(key);
      if (existing) {
        existing.total += inv.totalAmount;
        existing.count += 1;
      } else {
        // Apartment was deleted but invoice still references it
        const common = apartmentMap.get('common')!;
        common.total += inv.totalAmount;
        common.count += 1;
      }
    });

    // Convert to array and sort by total descending
    return Array.from(apartmentMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .filter(item => item.total > 0 || item.id !== 'common') // Keep apartments with expenses or all named apartments
      .sort((a, b) => b.total - a.total);
  }, [filteredInvoices, apartments]);

  // Calculate totals
  const totalExpenses = expensesByApartment.reduce((sum, apt) => sum + apt.total, 0);

  // Prepare chart data
  const chartData = expensesByApartment
    .filter(apt => apt.total > 0)
    .map((apt, index) => ({
      name: apt.code || apt.name,
      fullName: apt.name,
      value: apt.total,
      color: apt.id === 'common' ? COMMON_COLOR : COLORS[index % COLORS.length]
    }));

  const getPeriodLabel = () => {
    const now = new Date();
    switch (periodFilter) {
      case 'month': {
        const monthDate = new Date(activeYear, now.getMonth(), 1);
        return monthDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      }
      case 'quarter': {
        const quarter = Math.floor(now.getMonth() / 3) + 1;
        return `${quarter}T ${activeYear}`;
      }
      case 'year':
        return `Año ${activeYear}`;
      case 'all':
        return 'Todo el histórico';
    }
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-100 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-100 rounded-lg">
            <TrendingDown className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Gastos por Apartamento</h3>
            <p className="text-xs text-slate-500">{getPeriodLabel()}</p>
          </div>
        </div>

        {/* Period Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="month">Este Mes</option>
            <option value="quarter">Este Trimestre</option>
            <option value="year">Este Año</option>
            <option value="all">Todo</option>
          </select>
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="text-center py-12">
          <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hay gastos registrados en este periodo</p>
          <p className="text-xs text-slate-400 mt-1">Los gastos aparecerán aquí cuando proceses facturas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <ChartWrapper className="h-64" minHeight={256}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip totalExpenses={totalExpenses} />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => (
                  <span className="text-xs text-slate-600">{value}</span>
                )}
              />
            </PieChart>
          </ChartWrapper>

          {/* Table */}
          <div className="overflow-hidden">
            <div className="text-right mb-3">
              <span className="text-xs text-slate-500">Total: </span>
              <span className="text-lg font-bold text-slate-900">
                {totalExpenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {expensesByApartment.map((apt, index) => {
                const percentage = totalExpenses > 0 ? (apt.total / totalExpenses) * 100 : 0;
                const color = apt.id === 'common' ? COMMON_COLOR : COLORS[index % COLORS.length];

                return (
                  <div
                    key={apt.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700 truncate">
                          {apt.name}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 ml-2">
                          {apt.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-12 text-right">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">{apt.count} facturas</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
