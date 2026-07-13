
import React, { useState, useMemo } from 'react';
import { BookOpen, Filter, Download, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { AccountingEntry, getEntryLines } from '../types';
import { getAccountName } from '../utils/accountingPlan';

interface AccountLedgerProps {
  entries: AccountingEntry[];
}

// Movimiento en el mayor de una cuenta
interface LedgerMovement {
  entryId: string;
  entryDate: string;
  entryConcept: string;
  debit: number;
  credit: number;
  balance: number; // Saldo acumulado
}

// Mayor de una cuenta
interface AccountLedgerData {
  accountCode: string;
  accountName: string;
  movements: LedgerMovement[];
  totalDebit: number;
  totalCredit: number;
  balance: number;
  balanceType: 'DEUDOR' | 'ACREEDOR' | 'CERO';
}

export const AccountLedger: React.FC<AccountLedgerProps> = ({ entries }) => {
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Get all unique accounts from entries
  const allAccounts = useMemo(() => {
    const accountsMap = new Map<string, string>();
    
    entries.forEach(entry => {
      const lines = getEntryLines(entry);
      lines.forEach(line => {
        if (line.accountCode && !accountsMap.has(line.accountCode)) {
          accountsMap.set(line.accountCode, line.accountName || getAccountName(line.accountCode));
        }
      });
    });

    // Sort by account code
    return Array.from(accountsMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, name]) => ({ code, name }));
  }, [entries]);

  // Filter accounts by search term
  const filteredAccountOptions = useMemo(() => {
    if (!searchTerm) return allAccounts;
    const term = searchTerm.toLowerCase();
    return allAccounts.filter(acc => 
      acc.code.toLowerCase().includes(term) || 
      acc.name.toLowerCase().includes(term)
    );
  }, [allAccounts, searchTerm]);

  // Calculate ledger for selected account
  const accountLedger = useMemo<AccountLedgerData | null>(() => {
    if (!selectedAccount) return null;

    const movements: LedgerMovement[] = [];
    let totalDebit = 0;
    let totalCredit = 0;
    let runningBalance = 0;

    // Filter entries by date
    const filteredEntries = entries
      .filter(entry => {
        const matchStart = !startDate || entry.date >= startDate;
        const matchEnd = !endDate || entry.date <= endDate;
        return matchStart && matchEnd;
      })
      .sort((a, b) => a.date.localeCompare(b.date)); // Sort by date ascending

    filteredEntries.forEach(entry => {
      const lines = getEntryLines(entry);
      
      // Find all lines for this account
      lines.forEach(line => {
        if (line.accountCode === selectedAccount) {
          totalDebit += line.debit || 0;
          totalCredit += line.credit || 0;
          
          // Calculate running balance
          // For asset/expense accounts (1,2,3,5,6): Debit increases, Credit decreases
          // For liability/income accounts (4,7): Credit increases, Debit decreases
          // Exception within group 4: 43x (Clientes) and 44x (Deudores) are debit-nature assets
          const isDebitNature = ['1', '2', '3', '5', '6'].some(g => selectedAccount.startsWith(g)) ||
            selectedAccount.startsWith('43') || selectedAccount.startsWith('44');
          
          if (isDebitNature) {
            runningBalance += (line.debit || 0) - (line.credit || 0);
          } else {
            runningBalance += (line.credit || 0) - (line.debit || 0);
          }

          movements.push({
            entryId: entry.id,
            entryDate: entry.date,
            entryConcept: entry.concept,
            debit: line.debit || 0,
            credit: line.credit || 0,
            balance: runningBalance
          });
        }
      });
    });

    const finalBalance = totalDebit - totalCredit;
    let balanceType: 'DEUDOR' | 'ACREEDOR' | 'CERO' = 'CERO';
    if (finalBalance > 0.01) balanceType = 'DEUDOR';
    else if (finalBalance < -0.01) balanceType = 'ACREEDOR';

    const accountName = allAccounts.find(a => a.code === selectedAccount)?.name || getAccountName(selectedAccount);

    return {
      accountCode: selectedAccount,
      accountName,
      movements,
      totalDebit,
      totalCredit,
      balance: Math.abs(finalBalance),
      balanceType
    };
  }, [selectedAccount, entries, startDate, endDate, allAccounts]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!accountLedger) return;

    // BUG-016 fix: wrap every field in double-quotes and escape internal
    // quotes, so that field values containing the separator (;) or commas
    // never break the CSV parse.
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

    const headers = ['Fecha', 'Concepto', 'Debe', 'Haber', 'Saldo'].map(q);
    const rows = accountLedger.movements.map(m => [
      q(m.entryDate),
      q(m.entryConcept),
      q(m.debit.toFixed(2)),
      q(m.credit.toFixed(2)),
      q(m.balance.toFixed(2))
    ]);

    // Add totals row
    rows.push([
      q('TOTALES'),
      q(''),
      q(accountLedger.totalDebit.toFixed(2)),
      q(accountLedger.totalCredit.toFixed(2)),
      q(`${accountLedger.balanceType === 'DEUDOR' ? '' : '-'}${accountLedger.balance.toFixed(2)}`)
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Mayor_${accountLedger.accountCode}_${accountLedger.accountName.replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Libro Mayor</h2>
          <p className="text-slate-500">Extracto de movimientos por cuenta contable</p>
        </div>
        {accountLedger && (
          <button
            onClick={handleExportCSV}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        )}
      </div>

      {/* Account Selector and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-3 text-slate-700 font-medium text-sm">
          <Filter className="w-4 h-4" /> Seleccionar Cuenta
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Account Search/Select */}
          <div className="md:col-span-2 relative">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar cuenta por código o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-slate-200 rounded-lg pl-9 text-sm bg-white text-slate-900"
              />
            </div>
            {searchTerm && filteredAccountOptions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                {filteredAccountOptions.map(acc => (
                  <button
                    key={acc.code}
                    onClick={() => {
                      setSelectedAccount(acc.code);
                      setSearchTerm('');
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm flex items-center gap-2"
                  >
                    <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-xs">
                      {acc.code}
                    </span>
                    <span className="text-slate-700">{acc.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Account Display */}
          {selectedAccount && (
            <div className="md:col-span-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">Cuenta seleccionada:</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                {selectedAccount} - {allAccounts.find(a => a.code === selectedAccount)?.name}
              </span>
              <button
                onClick={() => setSelectedAccount('')}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Date Filters */}
        {selectedAccount && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
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
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium px-4 py-2"
              >
                Limpiar fechas
              </button>
            </div>
          </div>
        )}
      </div>

      {/* No account selected state */}
      {!selectedAccount && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Selecciona una cuenta</h3>
          <p className="text-slate-500 text-sm">
            Busca y selecciona una cuenta contable para ver su libro mayor con todos los movimientos.
          </p>
        </div>
      )}

      {/* Account Ledger Display */}
      {accountLedger && (
        <>
          {/* Summary Card */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 rounded-xl mb-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <p className="text-blue-200 text-xs uppercase tracking-wide mb-1">Mayor de la cuenta</p>
                <h3 className="text-xl font-bold">
                  {accountLedger.accountCode} - {accountLedger.accountName}
                </h3>
                <p className="text-blue-200 text-sm mt-1">
                  {accountLedger.movements.length} movimientos
                </p>
              </div>
              
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-blue-200 text-xs uppercase">Total Debe</p>
                  <p className="text-2xl font-bold font-mono flex items-center gap-1">
                    <TrendingUp className="w-5 h-5" />
                    {accountLedger.totalDebit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-blue-200 text-xs uppercase">Total Haber</p>
                  <p className="text-2xl font-bold font-mono flex items-center gap-1">
                    <TrendingDown className="w-5 h-5" />
                    {accountLedger.totalCredit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                  </p>
                </div>
                <div className="text-center border-l border-blue-400 pl-6">
                  <p className="text-blue-200 text-xs uppercase">Saldo</p>
                  <p className="text-2xl font-bold font-mono">
                    {accountLedger.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    accountLedger.balanceType === 'DEUDOR' ? 'bg-rose-500' :
                    accountLedger.balanceType === 'ACREEDOR' ? 'bg-emerald-500' : 'bg-slate-500'
                  }`}>
                    {accountLedger.balanceType}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Movements Table - Desktop */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Concepto</th>
                  <th className="px-6 py-4 text-right">Debe</th>
                  <th className="px-6 py-4 text-right">Haber</th>
                  <th className="px-6 py-4 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accountLedger.movements.map((movement, idx) => (
                  <tr key={`${movement.entryId}-${idx}`} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">{movement.entryDate}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{movement.entryConcept}</td>
                    <td className="px-6 py-4 text-sm font-mono text-right text-rose-600">
                      {movement.debit > 0 ? movement.debit.toFixed(2) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-right text-emerald-600">
                      {movement.credit > 0 ? movement.credit.toFixed(2) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-right font-bold text-slate-900">
                      {movement.balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
                
                {/* Totals Row */}
                <tr className="bg-slate-100 font-bold">
                  <td className="px-6 py-4 text-sm text-slate-700" colSpan={2}>TOTALES</td>
                  <td className="px-6 py-4 text-sm font-mono text-right text-rose-700">
                    {accountLedger.totalDebit.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-right text-emerald-700">
                    {accountLedger.totalCredit.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-right text-slate-900">
                    <span className={`px-2 py-1 rounded ${
                      accountLedger.balanceType === 'DEUDOR' ? 'bg-rose-100 text-rose-700' :
                      accountLedger.balanceType === 'ACREEDOR' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200'
                    }`}>
                      {accountLedger.balance.toFixed(2)} {accountLedger.balanceType}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Movements - Mobile */}
          <div className="md:hidden space-y-3">
            {accountLedger.movements.map((movement, idx) => (
              <div key={`${movement.entryId}-${idx}`} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-mono text-slate-500">{movement.entryDate}</span>
                  <span className="text-xs font-bold text-slate-700">Saldo: {movement.balance.toFixed(2)}€</span>
                </div>
                <p className="text-sm font-medium text-slate-900 mb-2">{movement.entryConcept}</p>
                <div className="flex justify-between text-sm font-mono">
                  <span className={movement.debit > 0 ? 'text-rose-600' : 'text-slate-300'}>
                    D: {movement.debit > 0 ? movement.debit.toFixed(2) : '-'}
                  </span>
                  <span className={movement.credit > 0 ? 'text-emerald-600' : 'text-slate-300'}>
                    H: {movement.credit > 0 ? movement.credit.toFixed(2) : '-'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {accountLedger.movements.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <p className="text-slate-500">No hay movimientos para esta cuenta en el período seleccionado.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
