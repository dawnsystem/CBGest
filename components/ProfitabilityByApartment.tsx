import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Award, Home, ArrowUpRight, ArrowDownRight, Minus, Filter } from 'lucide-react';
import { Invoice, Apartment, RecurringExpense, Reservation } from '../types';
import { ChartWrapper } from './ChartWrapper';
import { useFiscalYear } from '../context/FiscalYearContext';

interface ProfitabilityByApartmentProps {
  invoices: Invoice[];
  apartments: Apartment[];
  recurringExpenses: RecurringExpense[];
  reservations?: Reservation[]; // Optional - for accurate income per apartment
}

type PeriodFilter = 'month' | 'quarter' | 'year' | 'all';

interface ApartmentMetrics {
  apartment: Apartment | null; // null for common/unassigned
  apartmentId: string;
  name: string;
  code: string;
  income: number;
  incomeFromReservations: number; // Income from reservations
  incomeFromInvoices: number; // Income from INCOME invoices
  expenses: number;
  recurringExpenses: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  invoiceCount: number;
  expenseCount: number;
  reservationCount: number;
  nights: number; // Total nights from reservations
}

const COLORS = {
  profit: '#10b981',
  loss: '#ef4444',
  neutral: '#64748b',
  income: '#3b82f6',
  expense: '#f43f5e'
};

export const ProfitabilityByApartment: React.FC<ProfitabilityByApartmentProps> = ({
  invoices,
  apartments,
  recurringExpenses,
  reservations = []
}) => {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('year');
  const [sortBy, setSortBy] = useState<'profit' | 'income' | 'margin'>('profit');
  const { activeFiscalYear } = useFiscalYear();

  // Active fiscal year number; fall back to real current year
  const activeYear = activeFiscalYear?.year ?? new Date().getFullYear();

  // Filter reservations by period
  const filteredReservations = useMemo(() => {
    if (!reservations || reservations.length === 0) return [];

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    return reservations.filter(res => {
      // Exclude cancelled reservations
      if (res.status === 'Cancelled') return false;

      const resDate = new Date(res.checkIn);
      // Skip reservations with invalid dates
      if (isNaN(resDate.getTime())) return false;

      const resYear = resDate.getFullYear();
      const resMonth = resDate.getMonth();
      const resQuarter = Math.floor(resMonth / 3);

      switch (periodFilter) {
        case 'month':
          return resYear === activeYear && resMonth === currentMonth;
        case 'quarter':
          return resYear === activeYear && resQuarter === currentQuarter;
        case 'year':
          return resYear === activeYear;
        case 'all':
        default:
          return true;
      }
    });
  }, [reservations, periodFilter, activeYear]);

  // Filter invoices by period
  const filteredInvoices = useMemo(() => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    return invoices.filter(inv => {
      if (inv.status === 'PENDING') return false;

      const invDate = new Date(inv.date);
      // Skip invoices with invalid dates
      if (isNaN(invDate.getTime())) return false;

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

  // Calculate metrics by apartment
  const apartmentMetrics = useMemo(() => {
    const metricsMap = new Map<string, ApartmentMetrics>();

    // Initialize with all apartments
    apartments.forEach(apt => {
      metricsMap.set(apt.id, {
        apartment: apt,
        apartmentId: apt.id,
        name: apt.name,
        code: apt.code || apt.name.substring(0, 3).toUpperCase(),
        income: 0,
        incomeFromReservations: 0,
        incomeFromInvoices: 0,
        expenses: 0,
        recurringExpenses: 0,
        totalExpenses: 0,
        netProfit: 0,
        profitMargin: 0,
        invoiceCount: 0,
        expenseCount: 0,
        reservationCount: 0,
        nights: 0
      });
    });

    // Add common/unassigned category
    metricsMap.set('common', {
      apartment: null,
      apartmentId: 'common',
      name: 'Comunitario',
      code: 'COM',
      income: 0,
      incomeFromReservations: 0,
      incomeFromInvoices: 0,
      expenses: 0,
      recurringExpenses: 0,
      totalExpenses: 0,
      netProfit: 0,
      profitMargin: 0,
      invoiceCount: 0,
      expenseCount: 0,
      reservationCount: 0,
      nights: 0
    });

    // Process reservations first (most accurate income source)
    filteredReservations.forEach(res => {
      const key = res.apartmentId || 'common';
      const metrics = metricsMap.get(key);
      // BUG-012 fix: coerce to Number so that string values from Appwrite/CSV
      // are handled correctly.  Fall back to pricePerNight × nights when
      // totalAmount is missing or zero (e.g. reservations imported before the
      // field was populated).
      const amount = Number(res.totalAmount) || (Number(res.pricePerNight) || 0) * (res.nights || 0);
      const nights = res.nights || 0;

      if (metrics) {
        metrics.incomeFromReservations += amount;
        metrics.reservationCount++;
        metrics.nights += nights;
      } else {
        // Apartment was deleted, add to common
        const common = metricsMap.get('common')!;
        common.incomeFromReservations += amount;
        common.reservationCount++;
        common.nights += nights;
      }
    });

    // Process invoices
    filteredInvoices.forEach(inv => {
      const key = inv.apartmentId || 'common';
      const metrics = metricsMap.get(key);
      const invoiceAmount = inv.totalAmount || 0;

      if (metrics) {
        if (inv.type === 'INCOME') {
          metrics.incomeFromInvoices += invoiceAmount;
          metrics.invoiceCount++;
        } else {
          metrics.expenses += invoiceAmount;
          metrics.expenseCount++;
        }
      } else {
        // Apartment was deleted, add to common
        const common = metricsMap.get('common')!;
        if (inv.type === 'INCOME') {
          common.incomeFromInvoices += invoiceAmount;
        } else {
          common.expenses += invoiceAmount;
        }
      }
    });

    // Use reservation income if available, otherwise fall back to invoice income
    metricsMap.forEach(metrics => {
      // If we have reservations, use that as the primary income source
      // This is more accurate because Airbnb/Booking payments come as consolidated bank transfers
      metrics.income = metrics.incomeFromReservations > 0
        ? metrics.incomeFromReservations
        : metrics.incomeFromInvoices;
    });

    // Add recurring expenses (annualized based on period)
    const periodMultiplier = periodFilter === 'month' ? 1/12 :
                            periodFilter === 'quarter' ? 1/4 :
                            periodFilter === 'year' ? 1 : 1;

    recurringExpenses.forEach(exp => {
      if (!exp.isActive) return;

      const key = exp.apartmentId || 'common';
      const metrics = metricsMap.get(key);

      if (metrics) {
        // Calculate annual cost and apply period multiplier
        const annualCost = getAnnualCost(exp.estimatedAmount, exp.frequency);
        metrics.recurringExpenses += annualCost * periodMultiplier;
      }
    });

    // Calculate totals and margins
    metricsMap.forEach(metrics => {
      metrics.totalExpenses = metrics.expenses + metrics.recurringExpenses;
      metrics.netProfit = metrics.income - metrics.totalExpenses;
      metrics.profitMargin = metrics.income > 0
        ? (metrics.netProfit / metrics.income) * 100
        : metrics.totalExpenses > 0 ? -100 : 0;
    });

    // Convert to array and sort
    let result = Array.from(metricsMap.values());

    switch (sortBy) {
      case 'income':
        result.sort((a, b) => b.income - a.income);
        break;
      case 'margin':
        result.sort((a, b) => b.profitMargin - a.profitMargin);
        break;
      case 'profit':
      default:
        result.sort((a, b) => b.netProfit - a.netProfit);
    }

    return result;
  }, [filteredInvoices, filteredReservations, apartments, recurringExpenses, periodFilter, sortBy]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalIncome = apartmentMetrics.reduce((sum, m) => sum + m.income, 0);
    const totalExpenses = apartmentMetrics.reduce((sum, m) => sum + m.totalExpenses, 0);
    const netProfit = totalIncome - totalExpenses;
    const avgMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    const profitable = apartmentMetrics.filter(m => m.netProfit > 0 && m.apartmentId !== 'common').length;
    const unprofitable = apartmentMetrics.filter(m => m.netProfit < 0 && m.apartmentId !== 'common').length;

    const bestApartment = apartmentMetrics.filter(m => m.apartmentId !== 'common')
      .sort((a, b) => b.netProfit - a.netProfit)[0];
    const worstApartment = apartmentMetrics.filter(m => m.apartmentId !== 'common')
      .sort((a, b) => a.netProfit - b.netProfit)[0];

    return { totalIncome, totalExpenses, netProfit, avgMargin, profitable, unprofitable, bestApartment, worstApartment };
  }, [apartmentMetrics]);

  // Prepare chart data (only apartments with activity)
  const chartData = useMemo(() => {
    return apartmentMetrics
      .filter(m => m.income > 0 || m.totalExpenses > 0)
      .map(m => ({
        name: m.code || m.name.substring(0, 8),
        fullName: m.name,
        Ingresos: m.income,
        Gastos: m.totalExpenses,
        Beneficio: m.netProfit
      }));
  }, [apartmentMetrics]);

  const getPeriodLabel = () => {
    const currentDate = new Date();
    switch (periodFilter) {
      case 'month': {
        const monthDate = new Date(activeYear, currentDate.getMonth(), 1);
        return monthDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      }
      case 'quarter': {
        const quarter = Math.floor(currentDate.getMonth() / 3) + 1;
        return `${quarter}T ${activeYear}`;
      }
      case 'year':
        return `Año ${activeYear}`;
      case 'all':
        return 'Todo el histórico';
    }
  };

  const getProfitIcon = (profit: number) => {
    if (profit > 0) return <ArrowUpRight className="w-4 h-4 text-emerald-500" />;
    if (profit < 0) return <ArrowDownRight className="w-4 h-4 text-rose-500" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  const getProfitColor = (profit: number) => {
    if (profit > 0) return 'text-emerald-600';
    if (profit < 0) return 'text-rose-600';
    return 'text-slate-500';
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Award className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Rentabilidad por Apartamento</h3>
            <p className="text-xs text-slate-500">{getPeriodLabel()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
          >
            <option value="month">Este Mes</option>
            <option value="quarter">Este Trimestre</option>
            <option value="year">Este Año</option>
            <option value="all">Todo</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'profit' | 'income' | 'margin')}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
          >
            <option value="profit">Por Beneficio</option>
            <option value="income">Por Ingresos</option>
            <option value="margin">Por Margen</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-600 mb-1">Total Ingresos</p>
          <p className="text-lg font-bold text-blue-900">
            {totals.totalIncome.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
        </div>
        <div className="bg-rose-50 p-3 rounded-lg border border-rose-100">
          <p className="text-xs text-rose-600 mb-1">Total Gastos</p>
          <p className="text-lg font-bold text-rose-900">
            {totals.totalExpenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
        </div>
        <div className={`p-3 rounded-lg border ${totals.netProfit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
          <p className={`text-xs mb-1 ${totals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Beneficio Neto</p>
          <p className={`text-lg font-bold ${totals.netProfit >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
            {totals.netProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
        </div>
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
          <p className="text-xs text-slate-500 mb-1">Margen Medio</p>
          <p className={`text-lg font-bold ${totals.avgMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {totals.avgMargin.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Best/Worst Apartments */}
      {totals.bestApartment && totals.worstApartment && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
            <div className="p-2 bg-emerald-200 rounded-full">
              <TrendingUp className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <p className="text-xs text-emerald-600">Más Rentable</p>
              <p className="text-sm font-bold text-emerald-900">{totals.bestApartment.name}</p>
              <p className="text-xs text-emerald-700">
                {totals.bestApartment.netProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-rose-50 rounded-lg border border-rose-200">
            <div className="p-2 bg-rose-200 rounded-full">
              <TrendingDown className="w-4 h-4 text-rose-700" />
            </div>
            <div>
              <p className="text-xs text-rose-600">Menos Rentable</p>
              <p className="text-sm font-bold text-rose-900">{totals.worstApartment.name}</p>
              <p className="text-xs text-rose-700">
                {totals.worstApartment.netProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <ChartWrapper className="h-56 mb-6" minHeight={224}>
          <BarChart data={chartData} barGap={0}>
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
              tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
              formatter={(value: number, name: string) => [
                value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
                name
              ]}
              labelFormatter={(label) => {
                const item = chartData.find(d => d.name === label);
                return item?.fullName || label;
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={24}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="Ingresos" fill={COLORS.income} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gastos" fill={COLORS.expense} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartWrapper>
      )}

      {/* Detailed List */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Detalle por Apartamento</p>
        {apartmentMetrics.map((metrics, idx) => (
          <div
            key={metrics.apartmentId}
            className={`p-3 rounded-lg border transition-colors ${
              metrics.apartmentId === 'common'
                ? 'bg-slate-50 border-slate-200'
                : 'bg-white border-slate-100 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                  metrics.apartmentId === 'common'
                    ? 'bg-slate-200 text-slate-600'
                    : idx === 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                }`}>
                  {idx === 0 && metrics.apartmentId !== 'common' ? '🏆' : metrics.code.substring(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{metrics.name}</p>
                  <p className="text-xs text-slate-500">
                    {metrics.reservationCount > 0 ? (
                      <>{metrics.reservationCount} reservas • {metrics.nights} noches • </>
                    ) : (
                      <>{metrics.invoiceCount} ingresos • </>
                    )}
                    {metrics.expenseCount} gastos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-400">Ingresos</p>
                  <p className="text-sm font-medium text-blue-600">
                    {metrics.income.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-400">Gastos</p>
                  <p className="text-sm font-medium text-rose-600">
                    {metrics.totalExpenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                <div className="text-right min-w-[100px]">
                  <div className="flex items-center justify-end gap-1">
                    {getProfitIcon(metrics.netProfit)}
                    <p className={`text-sm font-bold ${getProfitColor(metrics.netProfit)}`}>
                      {metrics.netProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </div>
                  <p className={`text-xs ${metrics.profitMargin >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {metrics.profitMargin.toFixed(1)}% margen
                  </p>
                </div>
              </div>
            </div>

            {/* Progress bar showing income vs expenses */}
            {(metrics.income > 0 || metrics.totalExpenses > 0) && (() => {
              const maxValue = Math.max(metrics.income, metrics.totalExpenses);
              // Safety check to prevent division by zero
              if (maxValue === 0) return null;
              return (
                <div className="mt-2 flex gap-1 h-1.5">
                  <div
                    className="bg-blue-400 rounded-full"
                    style={{
                      width: `${(metrics.income / maxValue) * 50}%`
                    }}
                  />
                  <div
                    className="bg-rose-400 rounded-full"
                    style={{
                      width: `${(metrics.totalExpenses / maxValue) * 50}%`
                    }}
                  />
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to calculate annual cost
const getAnnualCost = (amount: number, frequency: string): number => {
  const multipliers: Record<string, number> = {
    MONTHLY: 12,
    BIMONTHLY: 6,
    QUARTERLY: 4,
    SEMIANNUAL: 2,
    ANNUAL: 1
  };
  return amount * (multipliers[frequency] || 1);
};
