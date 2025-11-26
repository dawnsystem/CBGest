import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar, TrendingUp, AlertTriangle, ChevronRight, Clock } from 'lucide-react';
import { RecurringExpense, ExpenseFrequency, Apartment } from '../types';

interface ExpenseProjectionsProps {
  recurringExpenses: RecurringExpense[];
  apartments: Apartment[];
}

type ProjectionPeriod = 3 | 6 | 12;

// Calculate how many times an expense occurs in a given month range
const getOccurrencesInMonth = (
  expense: RecurringExpense,
  targetMonth: number, // 0-11
  targetYear: number
): number => {
  const dayOfMonth = expense.dayOfMonth || 15;

  // Check if this expense would occur in this month based on frequency
  switch (expense.frequency) {
    case 'MONTHLY':
      return 1;
    case 'BIMONTHLY':
      // Occurs every 2 months - check if target month is even/odd relative to start
      return targetMonth % 2 === 0 ? 1 : 0;
    case 'QUARTERLY':
      // Occurs in months 0, 3, 6, 9 (Jan, Apr, Jul, Oct)
      return targetMonth % 3 === 0 ? 1 : 0;
    case 'SEMIANNUAL':
      // Occurs in months 0 and 6 (Jan and Jul)
      return targetMonth % 6 === 0 ? 1 : 0;
    case 'ANNUAL':
      // Occurs once per year - assume January
      return targetMonth === 0 ? 1 : 0;
    default:
      return 0;
  }
};

// Get projected expenses for a specific month
const getMonthProjection = (
  expenses: RecurringExpense[],
  month: number,
  year: number,
  apartments: Apartment[]
): {
  total: number;
  byApartment: Record<string, number>;
  items: Array<{ expense: RecurringExpense; amount: number }>;
} => {
  const byApartment: Record<string, number> = { common: 0 };
  apartments.forEach(apt => {
    byApartment[apt.id] = 0;
  });

  const items: Array<{ expense: RecurringExpense; amount: number }> = [];
  let total = 0;

  for (const expense of expenses) {
    if (!expense.isActive) continue;

    const occurrences = getOccurrencesInMonth(expense, month, year);
    if (occurrences > 0) {
      const amount = expense.estimatedAmount * occurrences;
      total += amount;

      const aptKey = expense.apartmentId || 'common';
      if (byApartment[aptKey] !== undefined) {
        byApartment[aptKey] += amount;
      } else {
        byApartment.common += amount;
      }

      items.push({ expense, amount });
    }
  }

  return { total, byApartment, items };
};

// Get month name in Spanish
const getMonthName = (month: number, short: boolean = false): string => {
  const months = short
    ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    : ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  // Ensure month index is within bounds
  const safeMonth = Math.max(0, Math.min(11, month));
  return months[safeMonth];
};

export const ExpenseProjections: React.FC<ExpenseProjectionsProps> = ({
  recurringExpenses,
  apartments
}) => {
  const [period, setPeriod] = useState<ProjectionPeriod>(6);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // Generate projection data
  const projectionData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const data: Array<{
      month: string;
      monthIndex: number;
      year: number;
      fullDate: string;
      total: number;
      byApartment: Record<string, number>;
      items: Array<{ expense: RecurringExpense; amount: number }>;
    }> = [];

    for (let i = 0; i < period; i++) {
      const targetMonth = (currentMonth + i) % 12;
      const targetYear = currentYear + Math.floor((currentMonth + i) / 12);

      const projection = getMonthProjection(
        recurringExpenses,
        targetMonth,
        targetYear,
        apartments
      );

      data.push({
        month: getMonthName(targetMonth, true),
        monthIndex: targetMonth,
        year: targetYear,
        fullDate: `${getMonthName(targetMonth)} ${targetYear}`,
        ...projection
      });
    }

    return data;
  }, [recurringExpenses, apartments, period]);

  // Calculate totals
  const totals = useMemo(() => {
    if (projectionData.length === 0) {
      return {
        totalProjected: 0,
        avgMonthly: 0,
        maxMonth: null,
        minMonth: null
      };
    }

    const totalProjected = projectionData.reduce((sum, m) => sum + m.total, 0);
    const avgMonthly = period > 0 ? totalProjected / period : 0;
    const maxMonth = projectionData.reduce((max, m) => m.total > max.total ? m : max, projectionData[0]);
    const minMonth = projectionData.reduce((min, m) => m.total < min.total ? m : min, projectionData[0]);

    return { totalProjected, avgMonthly, maxMonth, minMonth };
  }, [projectionData, period]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return projectionData.map(d => ({
      name: d.month,
      Comunitario: d.byApartment.common || 0,
      ...apartments.reduce((acc, apt) => ({
        ...acc,
        [apt.code || apt.name]: d.byApartment[apt.id] || 0
      }), {})
    }));
  }, [projectionData, apartments]);

  // Colors for apartments
  const COLORS = ['#64748b', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  // Get next significant expense
  const nextBigExpense = useMemo(() => {
    const upcoming: Array<{ expense: RecurringExpense; date: Date; amount: number }> = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    for (const expense of recurringExpenses) {
      if (!expense.isActive) continue;

      const day = expense.dayOfMonth || 15;

      // Clamp day to valid range for the current month
      const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const clampedDay = Math.min(day, daysInCurrentMonth);

      let nextDate = new Date(currentYear, currentMonth, clampedDay);

      if (nextDate <= now) {
        // Move to next month and clamp day again
        const nextMonth = (currentMonth + 1) % 12;
        const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
        const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
        const clampedNextDay = Math.min(day, daysInNextMonth);
        nextDate = new Date(nextYear, nextMonth, clampedNextDay);
      }

      upcoming.push({
        expense,
        date: nextDate,
        amount: expense.estimatedAmount
      });
    }

    return upcoming
      .filter(u => u.amount > 100) // Only significant expenses
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 3);
  }, [recurringExpenses]);

  if (recurringExpenses.filter(e => e.isActive).length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Proyección de Gastos</h3>
            <p className="text-xs text-slate-500">Previsión basada en gastos fijos</p>
          </div>
        </div>
        <div className="text-center py-8 text-slate-400">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay gastos recurrentes configurados</p>
          <p className="text-xs mt-1">Añade gastos fijos para ver proyecciones</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Proyección de Gastos</h3>
            <p className="text-xs text-slate-500">Previsión de tesorería basada en gastos fijos</p>
          </div>
        </div>

        {/* Period Selector */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {([3, 6, 12] as ProjectionPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p} meses
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
          <p className="text-xs text-purple-600 mb-1">Total Proyectado</p>
          <p className="text-lg font-bold text-purple-900">
            {totals.totalProjected.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
        </div>
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
          <p className="text-xs text-slate-500 mb-1">Media Mensual</p>
          <p className="text-lg font-bold text-slate-900">
            {totals.avgMonthly.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
        </div>
        <div className="bg-rose-50 p-3 rounded-lg border border-rose-100">
          <p className="text-xs text-rose-600 mb-1">Mes Más Alto</p>
          <p className="text-sm font-bold text-rose-900">
            {totals.maxMonth?.fullDate || '-'}
          </p>
          <p className="text-xs text-rose-700">
            {totals.maxMonth?.total?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) || '-'}
          </p>
        </div>
        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
          <p className="text-xs text-emerald-600 mb-1">Mes Más Bajo</p>
          <p className="text-sm font-bold text-emerald-900">
            {totals.minMonth?.fullDate || '-'}
          </p>
          <p className="text-xs text-emerald-700">
            {totals.minMonth?.total?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) || '-'}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-48 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={(v) => `${v}€`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
              formatter={(value: number) => [`${value.toFixed(2)}€`, '']}
            />
            <Legend
              verticalAlign="bottom"
              height={24}
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-slate-600">{value}</span>
              )}
            />
            <Bar dataKey="Comunitario" stackId="a" fill={COLORS[0]} radius={[0, 0, 0, 0]} />
            {apartments.slice(0, 7).map((apt, idx) => (
              <Bar
                key={apt.id}
                dataKey={apt.code || apt.name}
                stackId="a"
                fill={COLORS[idx + 1]}
                radius={idx === apartments.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Upcoming Expenses Alert */}
      {nextBigExpense.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Próximos gastos importantes</span>
          </div>
          <div className="space-y-1">
            {nextBigExpense.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <span className="text-amber-700">
                  {item.expense.name} - {item.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
                <span className="font-medium text-amber-800">
                  {item.amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Detail List */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Detalle por Mes</p>
        {projectionData.map((monthData, idx) => (
          <div key={idx} className="border border-slate-100 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedMonth(expandedMonth === monthData.fullDate ? null : monthData.fullDate)}
              className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-purple-500' : 'bg-slate-300'}`} />
                <span className="text-sm font-medium text-slate-700">{monthData.fullDate}</span>
                {idx === 0 && (
                  <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                    Este mes
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-900">
                  {monthData.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
                <ChevronRight
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    expandedMonth === monthData.fullDate ? 'rotate-90' : ''
                  }`}
                />
              </div>
            </button>

            {expandedMonth === monthData.fullDate && monthData.items.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2">
                {monthData.items.map((item, itemIdx) => {
                  const apt = apartments.find(a => a.id === item.expense.apartmentId);
                  return (
                    <div key={itemIdx} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">{item.expense.name}</span>
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                          {apt?.code || 'COM'}
                        </span>
                      </div>
                      <span className="font-medium text-slate-700">
                        {item.amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
