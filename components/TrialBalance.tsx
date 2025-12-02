
import React, { useMemo, useState } from 'react';
import { Scale, Download, Check, AlertTriangle, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { AccountingEntry, getEntryLines } from '../types';
import { getAccountName, isExpenseAccount, isIncomeAccount, isTreasuryAccount } from '../utils/accountingPlan';

interface TrialBalanceProps {
  entries: AccountingEntry[];
}

// Balance de una cuenta individual
interface AccountBalance {
  accountCode: string;
  accountName: string;
  group: string; // Grupo contable (6, 7, 4, 5, etc.)
  totalDebit: number;
  totalCredit: number;
  balanceDebit: number;  // Saldo deudor
  balanceCredit: number; // Saldo acreedor
}

// Totales generales
interface TrialBalanceTotals {
  sumDebit: number;
  sumCredit: number;
  balanceDebit: number;
  balanceCredit: number;
  isBalanced: boolean;
  difference: number;
}

// Grupo de cuentas para visualización
interface AccountGroup {
  name: string;
  accounts: AccountBalance[];
  isExpanded: boolean;
  totalDebit: number;
  totalCredit: number;
}

export const TrialBalance: React.FC<TrialBalanceProps> = ({ entries }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['6', '7', '4', '5']));
  const [showOnlyWithBalance, setShowOnlyWithBalance] = useState(false);

  // Calculate trial balance
  const { accountBalances, totals, groupedAccounts } = useMemo(() => {
    const balanceMap = new Map<string, AccountBalance>();

    // Filter entries by date
    const filteredEntries = entries.filter(entry => {
      const matchStart = !startDate || entry.date >= startDate;
      const matchEnd = !endDate || entry.date <= endDate;
      return matchStart && matchEnd;
    });

    // Aggregate debits and credits by account
    filteredEntries.forEach(entry => {
      const lines = getEntryLines(entry);
      
      lines.forEach(line => {
        if (!line.accountCode) return;

        const existing = balanceMap.get(line.accountCode);
        if (existing) {
          existing.totalDebit += line.debit || 0;
          existing.totalCredit += line.credit || 0;
        } else {
          balanceMap.set(line.accountCode, {
            accountCode: line.accountCode,
            accountName: line.accountName || getAccountName(line.accountCode),
            group: line.accountCode.charAt(0),
            totalDebit: line.debit || 0,
            totalCredit: line.credit || 0,
            balanceDebit: 0,
            balanceCredit: 0
          });
        }
      });
    });

    // Calculate balances for each account
    const accountBalances: AccountBalance[] = Array.from(balanceMap.values())
      .map(acc => {
        const diff = acc.totalDebit - acc.totalCredit;
        return {
          ...acc,
          balanceDebit: diff > 0 ? diff : 0,
          balanceCredit: diff < 0 ? Math.abs(diff) : 0
        };
      })
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    // Calculate totals
    const totals: TrialBalanceTotals = {
      sumDebit: accountBalances.reduce((sum, acc) => sum + acc.totalDebit, 0),
      sumCredit: accountBalances.reduce((sum, acc) => sum + acc.totalCredit, 0),
      balanceDebit: accountBalances.reduce((sum, acc) => sum + acc.balanceDebit, 0),
      balanceCredit: accountBalances.reduce((sum, acc) => sum + acc.balanceCredit, 0),
      isBalanced: false,
      difference: 0
    };
    
    totals.difference = Math.abs(totals.sumDebit - totals.sumCredit);
    totals.isBalanced = totals.difference < 0.01;

    // Group accounts by first digit
    const groupNames: Record<string, string> = {
      '1': 'Grupo 1 - Financiación Básica',
      '2': 'Grupo 2 - Inmovilizado',
      '3': 'Grupo 3 - Existencias',
      '4': 'Grupo 4 - Acreedores y Deudores',
      '5': 'Grupo 5 - Cuentas Financieras',
      '6': 'Grupo 6 - Compras y Gastos',
      '7': 'Grupo 7 - Ventas e Ingresos'
    };

    const grouped = new Map<string, AccountBalance[]>();
    accountBalances.forEach(acc => {
      const group = acc.group;
      if (!grouped.has(group)) {
        grouped.set(group, []);
      }
      grouped.get(group)!.push(acc);
    });

    const groupedAccounts: AccountGroup[] = Array.from(grouped.entries())
      .map(([group, accounts]) => ({
        name: groupNames[group] || `Grupo ${group}`,
        accounts: showOnlyWithBalance 
          ? accounts.filter(a => a.balanceDebit > 0.01 || a.balanceCredit > 0.01)
          : accounts,
        isExpanded: expandedGroups.has(group),
        totalDebit: accounts.reduce((sum, a) => sum + a.totalDebit, 0),
        totalCredit: accounts.reduce((sum, a) => sum + a.totalCredit, 0)
      }))
      .filter(g => g.accounts.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { accountBalances, totals, groupedAccounts };
  }, [entries, startDate, endDate, expandedGroups, showOnlyWithBalance]);

  const toggleGroup = (groupName: string) => {
    const groupCode = groupName.split(' ')[1];
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupCode)) {
      newExpanded.delete(groupCode);
    } else {
      newExpanded.add(groupCode);
    }
    setExpandedGroups(newExpanded);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Cuenta', 'Nombre', 'Suma Debe', 'Suma Haber', 'Saldo Deudor', 'Saldo Acreedor'];
    const rows = accountBalances.map(acc => [
      acc.accountCode,
      `"${acc.accountName.replace(/"/g, '""')}"`,
      acc.totalDebit.toFixed(2),
      acc.totalCredit.toFixed(2),
      acc.balanceDebit.toFixed(2),
      acc.balanceCredit.toFixed(2)
    ]);

    // Add totals row
    rows.push([
      'TOTALES',
      '',
      totals.sumDebit.toFixed(2),
      totals.sumCredit.toFixed(2),
      totals.balanceDebit.toFixed(2),
      totals.balanceCredit.toFixed(2)
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Balance_Sumas_Saldos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Balance de Sumas y Saldos</h2>
          <p className="text-slate-500">Comprobación de cuadre contable</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors text-sm font-medium"
        >
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-3 text-slate-700 font-medium text-sm">
          <Filter className="w-4 h-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyWithBalance}
                onChange={(e) => setShowOnlyWithBalance(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span className="text-sm text-slate-600">Solo cuentas con saldo</span>
            </label>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium px-4 py-2"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Balance Status Card */}
      <div className={`p-6 rounded-xl mb-6 ${
        totals.isBalanced 
          ? 'bg-gradient-to-r from-emerald-500 to-emerald-700' 
          : 'bg-gradient-to-r from-red-500 to-red-700'
      } text-white`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-full ${totals.isBalanced ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
              {totals.isBalanced ? <Check className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
            </div>
            <div>
              <h3 className="text-xl font-bold">
                {totals.isBalanced ? '✓ Balance Cuadrado' : '⚠ Balance Descuadrado'}
              </h3>
              <p className="text-white/80 text-sm">
                {totals.isBalanced 
                  ? 'La suma del Debe es igual a la suma del Haber'
                  : `Diferencia de ${totals.difference.toFixed(2)}€`}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-white/70 text-xs uppercase">Σ Debe</p>
              <p className="text-xl font-bold font-mono">{totals.sumDebit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
            </div>
            <div className="text-center">
              <p className="text-white/70 text-xs uppercase">Σ Haber</p>
              <p className="text-xl font-bold font-mono">{totals.sumCredit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
            </div>
            <div className="text-center border-l border-white/20 pl-6">
              <p className="text-white/70 text-xs uppercase">Saldos Deudores</p>
              <p className="text-xl font-bold font-mono">{totals.balanceDebit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
            </div>
            <div className="text-center">
              <p className="text-white/70 text-xs uppercase">Saldos Acreedores</p>
              <p className="text-xl font-bold font-mono">{totals.balanceCredit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Accounts Table - Desktop */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800 text-xs uppercase text-white">
            <tr>
              <th className="px-6 py-4 w-32">Cuenta</th>
              <th className="px-6 py-4">Nombre</th>
              <th className="px-6 py-4 text-right">Suma Debe</th>
              <th className="px-6 py-4 text-right">Suma Haber</th>
              <th className="px-6 py-4 text-right">Saldo Deudor</th>
              <th className="px-6 py-4 text-right">Saldo Acreedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groupedAccounts.map(group => (
              <React.Fragment key={group.name}>
                {/* Group Header */}
                <tr 
                  className="bg-slate-100 cursor-pointer hover:bg-slate-200"
                  onClick={() => toggleGroup(group.name)}
                >
                  <td className="px-6 py-3" colSpan={2}>
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                      {expandedGroups.has(group.name.split(' ')[1]) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      {group.name}
                      <span className="text-xs font-normal text-slate-500">
                        ({group.accounts.length} cuentas)
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-sm text-slate-600">
                    {group.totalDebit.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-sm text-slate-600">
                    {group.totalCredit.toFixed(2)}
                  </td>
                  <td className="px-6 py-3"></td>
                  <td className="px-6 py-3"></td>
                </tr>
                
                {/* Account Rows */}
                {expandedGroups.has(group.name.split(' ')[1]) && group.accounts.map(acc => (
                  <tr key={acc.accountCode} className="hover:bg-slate-50">
                    <td className="px-6 py-3 pl-12">
                      <span className="font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded text-xs">
                        {acc.accountCode}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-800">{acc.accountName}</td>
                    <td className="px-6 py-3 text-sm font-mono text-right text-rose-600">
                      {acc.totalDebit > 0 ? acc.totalDebit.toFixed(2) : '-'}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-right text-emerald-600">
                      {acc.totalCredit > 0 ? acc.totalCredit.toFixed(2) : '-'}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-right text-rose-700 font-bold">
                      {acc.balanceDebit > 0.01 ? acc.balanceDebit.toFixed(2) : '-'}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-right text-emerald-700 font-bold">
                      {acc.balanceCredit > 0.01 ? acc.balanceCredit.toFixed(2) : '-'}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            
            {/* Totals Row */}
            <tr className="bg-slate-800 text-white font-bold">
              <td className="px-6 py-4" colSpan={2}>TOTALES</td>
              <td className="px-6 py-4 text-right font-mono">{totals.sumDebit.toFixed(2)}</td>
              <td className="px-6 py-4 text-right font-mono">{totals.sumCredit.toFixed(2)}</td>
              <td className="px-6 py-4 text-right font-mono">{totals.balanceDebit.toFixed(2)}</td>
              <td className="px-6 py-4 text-right font-mono">{totals.balanceCredit.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {groupedAccounts.map(group => (
          <div key={group.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleGroup(group.name)}
              className="w-full px-4 py-3 bg-slate-100 flex justify-between items-center"
            >
              <span className="font-bold text-slate-700 text-sm">{group.name}</span>
              <span className="text-xs text-slate-500">
                {expandedGroups.has(group.name.split(' ')[1]) ? '▼' : '▶'} {group.accounts.length}
              </span>
            </button>
            
            {expandedGroups.has(group.name.split(' ')[1]) && (
              <div className="divide-y divide-slate-100">
                {group.accounts.map(acc => (
                  <div key={acc.accountCode} className="p-4">
                    <div className="flex justify-between mb-2">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                        {acc.accountCode}
                      </span>
                      <div className="text-right">
                        {acc.balanceDebit > 0.01 && (
                          <span className="text-xs bg-rose-100 text-rose-700 px-2 py-1 rounded">
                            D: {acc.balanceDebit.toFixed(2)}
                          </span>
                        )}
                        {acc.balanceCredit > 0.01 && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded ml-1">
                            A: {acc.balanceCredit.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-800">{acc.accountName}</p>
                    <div className="flex justify-between mt-2 text-xs text-slate-500">
                      <span>Debe: {acc.totalDebit.toFixed(2)}€</span>
                      <span>Haber: {acc.totalCredit.toFixed(2)}€</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {accountBalances.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Scale className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Sin movimientos</h3>
          <p className="text-slate-500 text-sm">
            No hay asientos contables en el período seleccionado.
          </p>
        </div>
      )}
    </div>
  );
};
