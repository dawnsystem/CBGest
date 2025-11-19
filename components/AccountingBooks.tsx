import React, { useState, useMemo } from 'react';
import { Book, ArrowUpRight, ArrowDownLeft, Eye, Filter, X } from 'lucide-react';
import { Invoice } from '../types';

interface AccountingBooksProps {
  invoices: Invoice[];
  onViewDocument: (invoice: Invoice) => void;
}

export const AccountingBooks: React.FC<AccountingBooksProps> = ({ invoices, onViewDocument }) => {
  
  // State for filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');

  // Filter only processed or paid invoices for the ledger
  // Using useMemo to avoid recalculating on every render unless invoices change
  const allEntries = useMemo(() => {
    const postedInvoices = invoices.filter(inv => inv.status === 'PROCESSED' || inv.status === 'PAID');

    // Generate pseudo-ledger entries from invoices
    return postedInvoices.map((inv, index) => ({
      id: `ASI-${index + 1}`,
      date: inv.date,
      concept: `Fra. ${inv.number} - ${inv.issuerName}`,
      account: inv.category ? inv.category.split('.')[0] : (inv.type === 'EXPENSE' ? '600.0.000' : '700.0.000'), // Basic mapping fallback
      fullAccountLabel: inv.category || (inv.type === 'EXPENSE' ? '600.0.000 - Compras' : '700.0.000 - Ventas'),
      debit: inv.type === 'EXPENSE' ? inv.baseAmount : 0,
      credit: inv.type === 'INCOME' ? inv.baseAmount : 0,
      original: inv
    }));
  }, [invoices]);

  // Get unique accounts for the filter dropdown
  const uniqueAccounts = useMemo(() => {
    const accounts = new Set(allEntries.map(e => e.fullAccountLabel));
    return Array.from(accounts);
  }, [allEntries]);

  // Apply filters
  const filteredEntries = allEntries.filter(entry => {
    const matchStartDate = startDate ? entry.date >= startDate : true;
    const matchEndDate = endDate ? entry.date <= endDate : true;
    const matchAccount = selectedAccount ? entry.fullAccountLabel === selectedAccount : true;
    return matchStartDate && matchEndDate && matchAccount;
  });

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedAccount('');
  };

  const hasActiveFilters = startDate || endDate || selectedAccount;

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Libro Diario</h2>
        <p className="text-slate-500">Registro cronológico de operaciones contables</p>
      </div>

      {/* Filters Section */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-3 text-slate-700 font-medium text-sm">
            <Filter className="w-4 h-4" />
            Filtros de Búsqueda
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
                <label className="block text-xs text-slate-500 mb-1">Desde</label>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label className="block text-xs text-slate-500 mb-1">Hasta</label>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label className="block text-xs text-slate-500 mb-1">Cuenta Contable</label>
                <select 
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Todas las cuentas</option>
                    {uniqueAccounts.map(acc => (
                        <option key={acc} value={acc}>{acc}</option>
                    ))}
                </select>
            </div>
            <div className="flex items-end">
                <button 
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                        hasActiveFilters 
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-red-600' 
                        : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                    }`}
                >
                    <X className="w-4 h-4" /> Limpiar
                </button>
            </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Asiento</th>
                <th className="px-6 py-4">Cuenta</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4 text-right">Debe</th>
                <th className="px-6 py-4 text-right">Haber</th>
                <th className="px-6 py-4 text-center">Doc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <Book className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>{hasActiveFilters ? 'No se encontraron asientos con estos filtros.' : 'No hay asientos contables registrados.'}</p>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-500">{entry.id}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-mono font-medium">
                        {entry.account}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 font-medium">{entry.concept}</td>
                    <td className="px-6 py-4 text-sm font-mono text-right text-slate-600">
                      {entry.debit > 0 ? entry.debit.toFixed(2) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-right text-slate-600">
                      {entry.credit > 0 ? entry.credit.toFixed(2) : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                       <button 
                        onClick={() => onViewDocument(entry.original)}
                        className="p-1.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                        title="Ver documento original"
                       >
                         <Eye className="w-4 h-4" />
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filteredEntries.length === 0 ? (
           <div className="text-center py-10 text-slate-400">
             <Book className="w-12 h-12 mx-auto mb-3 opacity-20" />
             <p>{hasActiveFilters ? 'Sin resultados.' : 'No hay asientos registrados.'}</p>
           </div>
        ) : (
          filteredEntries.map((entry) => (
            <div key={entry.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-100">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 mr-2">
                   <p className="font-semibold text-slate-900 text-sm truncate">{entry.concept}</p>
                   <p className="text-xs text-slate-500">{entry.date} • {entry.id}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-mono font-medium">
                    {entry.account}
                    </span>
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-slate-50 pt-2 mt-2">
                 <div className="flex items-center gap-2">
                    <button 
                        onClick={() => onViewDocument(entry.original)}
                        className="flex items-center gap-1 text-xs text-blue-600 font-medium px-2 py-1 rounded hover:bg-blue-50"
                    >
                        <Eye className="w-3 h-3" /> Ver Doc
                    </button>
                 </div>
                 <div className="text-sm font-mono font-bold">
                    {entry.debit > 0 ? (
                       <span className="text-rose-600 flex items-center gap-1">
                         -{entry.debit.toFixed(2)}€ <ArrowDownLeft className="w-3 h-3"/>
                       </span>
                    ) : (
                       <span className="text-emerald-600 flex items-center gap-1">
                         +{entry.credit.toFixed(2)}€ <ArrowUpRight className="w-3 h-3"/>
                       </span>
                    )}
                 </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};