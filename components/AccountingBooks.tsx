import React, { useState, useMemo } from 'react';
import { Book, ArrowUpRight, ArrowDownLeft, Eye, Filter, X, Plus, Edit3, Trash, Save } from 'lucide-react';
import { AccountingEntry } from '../types';

interface AccountingBooksProps {
  entries: AccountingEntry[];
  onAddEntry: (entry: AccountingEntry) => void;
  onUpdateEntry: (entry: AccountingEntry) => void;
  onDeleteEntry: (id: string) => void;
  onViewDocument: (file: File) => void;
}

export const AccountingBooks: React.FC<AccountingBooksProps> = ({ 
  entries, 
  onAddEntry, 
  onUpdateEntry, 
  onDeleteEntry, 
  onViewDocument 
}) => {
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  
  // Edit/Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);

  // Get unique accounts
  const uniqueAccounts = useMemo(() => {
    const accounts = new Set(entries.map(e => `${e.accountCode} - ${e.accountName}`));
    return Array.from(accounts);
  }, [entries]);

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    const matchStartDate = startDate ? entry.date >= startDate : true;
    const matchEndDate = endDate ? entry.date <= endDate : true;
    const matchAccount = selectedAccount ? `${entry.accountCode} - ${entry.accountName}` === selectedAccount : true;
    return matchStartDate && matchEndDate && matchAccount;
  });

  const openNewEntryModal = () => {
    setEditingEntry({
      id: '',
      date: new Date().toISOString().split('T')[0],
      concept: '',
      accountCode: '',
      accountName: '',
      debit: 0,
      credit: 0,
      reconciled: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (entry: AccountingEntry) => {
    setEditingEntry({ ...entry });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    if (!editingEntry.id) {
       // Create
       const newEntry = { ...editingEntry, id: `MANUAL-${Date.now()}` };
       onAddEntry(newEntry);
    } else {
       // Update
       onUpdateEntry(editingEntry);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Libro Diario</h2>
           <p className="text-slate-500">Gestión integral de asientos contables</p>
        </div>
        <button 
          onClick={openNewEntryModal}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors text-sm font-medium"
        >
            <Plus className="w-4 h-4" /> Nuevo Asiento
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-3 text-slate-700 font-medium text-sm">
            <Filter className="w-4 h-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900" />
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900">
                <option value="">Todas las cuentas</option>
                {uniqueAccounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
            </select>
            <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedAccount(''); }} className="bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium">Limpiar</button>
        </div>
      </div>

      {/* Table */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Cuenta</th>
                    <th className="px-6 py-4">Concepto</th>
                    <th className="px-6 py-4 text-right">Debe</th>
                    <th className="px-6 py-4 text-right">Haber</th>
                    <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                        <td className="px-6 py-4 text-sm"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono text-xs">{entry.accountCode}</span> {entry.accountName}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900 flex items-center gap-2">
                           {entry.concept}
                           {entry.reconciled && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded border border-emerald-200">CONCILIADO</span>}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-right text-rose-600">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                        <td className="px-6 py-4 text-sm font-mono text-right text-emerald-600">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                        <td className="px-6 py-4 flex justify-center gap-2">
                            {entry.referenceDoc && (
                                <button onClick={() => onViewDocument(entry.referenceDoc!)} className="p-1 text-slate-400 hover:text-blue-600"><Eye className="w-4 h-4"/></button>
                            )}
                            <button onClick={() => openEditModal(entry)} className="p-1 text-slate-400 hover:text-amber-600"><Edit3 className="w-4 h-4"/></button>
                            <button onClick={() => onDeleteEntry(entry.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash className="w-4 h-4"/></button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {filteredEntries.map(entry => (
            <div key={entry.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-100">
                <div className="flex justify-between mb-2">
                    <span className="text-xs text-slate-500">{entry.date}</span>
                    <span className="text-xs font-mono bg-slate-100 px-2 rounded">{entry.accountCode}</span>
                </div>
                <p className="font-semibold text-slate-900 mb-2">{entry.concept}</p>
                <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                    <div className="text-sm font-bold">
                        {entry.debit > 0 ? <span className="text-rose-600">-{entry.debit.toFixed(2)}€</span> : <span className="text-emerald-600">+{entry.credit.toFixed(2)}€</span>}
                    </div>
                    <button onClick={() => openEditModal(entry)} className="text-blue-600 text-sm font-medium">Editar</button>
                </div>
            </div>
        ))}
      </div>

      {/* Edit Modal */}
      {isModalOpen && editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <form onSubmit={handleSave} className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-900">{editingEntry.id ? 'Editar Asiento' : 'Nuevo Asiento'}</h3>
                    <button type="button" onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs text-slate-500">Fecha</label><input type="date" required value={editingEntry.date} onChange={e => setEditingEntry({...editingEntry, date: e.target.value})} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" /></div>
                        <div><label className="block text-xs text-slate-500">Cuenta (Código)</label><input type="text" required value={editingEntry.accountCode} onChange={e => setEditingEntry({...editingEntry, accountCode: e.target.value})} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" placeholder="Ej: 628.1" /></div>
                    </div>
                    <div><label className="block text-xs text-slate-500">Nombre Cuenta</label><input type="text" required value={editingEntry.accountName} onChange={e => setEditingEntry({...editingEntry, accountName: e.target.value})} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" placeholder="Ej: Suministros" /></div>
                    <div><label className="block text-xs text-slate-500">Concepto</label><input type="text" required value={editingEntry.concept} onChange={e => setEditingEntry({...editingEntry, concept: e.target.value})} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs text-slate-500">Debe</label><input type="number" step="0.01" value={editingEntry.debit} onChange={e => setEditingEntry({...editingEntry, debit: parseFloat(e.target.value), credit: 0})} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" /></div>
                        <div><label className="block text-xs text-slate-500">Haber</label><input type="number" step="0.01" value={editingEntry.credit} onChange={e => setEditingEntry({...editingEntry, credit: parseFloat(e.target.value), debit: 0})} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" /></div>
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancelar</button>
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"><Save className="w-4 h-4"/> Guardar</button>
                </div>
            </form>
        </div>
      )}
    </div>
  );
};