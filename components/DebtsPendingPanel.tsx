import React, { useCallback, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Clock, TrendingDown, TrendingUp, Users, Truck } from 'lucide-react';
import { AccountingEntry, getEntryLines } from '../types';
import { isDebitNatureAccount } from '../utils/accountingPlan';

interface DebtsPendingPanelProps {
  entries: AccountingEntry[];
}

interface PendingItem {
  entryId: string;
  date: string;
  concept: string;
  amount: number;
  accountCode: string;
  daysElapsed: number;
}

/** Calcula los días transcurridos desde una fecha ISO hasta hoy */
const daysElapsed = (dateStr: string): number => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const entry = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
};

/** Devuelve las clases de color del badge según días transcurridos */
const ageBadgeClasses = (days: number): string => {
  if (days > 60) return 'bg-red-100 text-red-700 border-red-200';
  if (days > 30) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
};

const ageBadgeLabel = (days: number): string => {
  if (days === 0) return 'Hoy';
  if (days === 1) return '1 día';
  return `${days} días`;
};

/**
 * Panel de Deudas y Cobros Pendientes.
 *
 * Muestra el saldo neto de las cuentas de proveedores (400/401) y clientes (430/431),
 * con la lista de movimientos no conciliados y sus días pendientes.
 */
export const DebtsPendingPanel: React.FC<DebtsPendingPanelProps> = ({ entries }) => {

  // todayKey refreshes the memo when the calendar day changes (e.g. browser left open overnight)
  const todayKey = new Date().toDateString();

  /** Calcula saldo y movimientos no conciliados de un conjunto de prefijos de cuenta */
  const computeSection = useCallback((prefixes: string[]) => {
    const items: PendingItem[] = [];
    let totalBalance = 0;

    entries
      .filter(e => !e.isDraft)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(entry => {
        getEntryLines(entry).forEach(line => {
          const matches = prefixes.some(p => line.accountCode.startsWith(p));
          if (!matches) return;

          // Net movement for this line — use shared utility for debit/credit nature
          const lineBalance = isDebitNatureAccount(line.accountCode)
            ? (line.debit - line.credit)
            : (line.credit - line.debit);

          totalBalance += lineBalance;

          // Only show entries not yet reconciled
          if (!entry.reconciled && lineBalance !== 0) {
            items.push({
              entryId: entry.id,
              date: entry.date,
              concept: entry.concept,
              amount: lineBalance,
              accountCode: line.accountCode,
              daysElapsed: daysElapsed(entry.date),
            });
          }
        });
      });

    return { totalBalance, items };
  }, [entries, todayKey]);

  const suppliers = useMemo(() => computeSection(['400', '401']), [computeSection]);
  const clients   = useMemo(() => computeSection(['430', '431']), [computeSection]);

  const renderList = (items: PendingItem[], emptyLabel: string) => {
    if (items.length === 0) {
      return (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400 justify-center">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          {emptyLabel}
        </div>
      );
    }

    return (
      <ul className="divide-y divide-slate-100">
        {items.map((item, idx) => (
          <li key={`${item.entryId}-${item.accountCode}-${idx}`} className="flex items-center justify-between py-3 px-1">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{item.concept}</p>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {item.date}
                <span className="font-mono text-slate-300 mx-1">·</span>
                cta. {item.accountCode}
              </p>
            </div>
            <div className="ml-4 flex items-center gap-2 shrink-0">
              <span className="font-mono text-sm font-semibold text-slate-800">
                {item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${ageBadgeClasses(item.daysElapsed)}`}>
                {ageBadgeLabel(item.daysElapsed)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 overflow-x-hidden">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Deudas y Cobros Pendientes</h2>
        <p className="text-slate-500">Saldo de cuentas de proveedores (400) y clientes (430) con alertas de antigüedad</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Proveedores */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <Truck className="w-4 h-4 text-rose-500" />
              Proveedores (400/401)
            </div>
            <div className={`text-lg font-bold font-mono ${suppliers.totalBalance >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {suppliers.totalBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
            </div>
          </div>
          <div className="px-5 py-2">
            {renderList(suppliers.items, 'Sin deudas pendientes con proveedores')}
          </div>
          {suppliers.items.length > 0 && (
            <div className="px-5 py-3 bg-rose-50 border-t border-rose-100 flex items-center gap-2 text-xs text-rose-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {suppliers.items.length} movimiento{suppliers.items.length !== 1 ? 's' : ''} pendiente{suppliers.items.length !== 1 ? 's' : ''} de conciliar
            </div>
          )}
        </div>

        {/* Clientes */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <Users className="w-4 h-4 text-blue-500" />
              Clientes (430/431)
            </div>
            <div className={`text-lg font-bold font-mono ${clients.totalBalance > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
              {clients.totalBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
            </div>
          </div>
          <div className="px-5 py-2">
            {renderList(clients.items, 'Sin cobros pendientes de clientes')}
          </div>
          {clients.items.length > 0 && (
            <div className="px-5 py-3 bg-blue-50 border-t border-blue-100 flex items-center gap-2 text-xs text-blue-700">
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              {clients.items.length} cobro{clients.items.length !== 1 ? 's' : ''} pendiente{clients.items.length !== 1 ? 's' : ''} de conciliar
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500">
        <p className="font-semibold text-slate-600 mb-2 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> Leyenda de antigüedad</p>
        <div className="flex flex-wrap gap-3">
          <span className="px-2 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">≤ 30 días — Al corriente</span>
          <span className="px-2 py-1 rounded border bg-amber-100 text-amber-700 border-amber-200 font-medium">31-60 días — Atención</span>
          <span className="px-2 py-1 rounded border bg-red-100 text-red-700 border-red-200 font-medium">&gt; 60 días — Urgente</span>
        </div>
      </div>
    </div>
  );
};
