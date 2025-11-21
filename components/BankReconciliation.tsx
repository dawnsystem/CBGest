import React, { useState } from 'react';
import { BankTransaction, AccountingEntry } from '../types';
import { ArrowRightLeft, Check, AlertCircle, Plus } from 'lucide-react';

interface BankReconciliationProps {
  transactions: BankTransaction[];
  entries: AccountingEntry[];
  onReconcile: (transactionId: string, entryId: string) => void;
  onCreateEntryFromTransaction: (transaction: BankTransaction) => void;
}

export const BankReconciliation: React.FC<BankReconciliationProps> = ({
  transactions,
  entries,
  onReconcile,
  onCreateEntryFromTransaction
}) => {
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);
  
  // Filter unreconciled items
  const pendingTransactions = transactions.filter(t => t.status === 'PENDING');
  const pendingEntries = entries.filter(e => !e.reconciled);

  // Find potential matches logic (simple amount check)
  const getMatches = (tx: BankTransaction) => {
    return pendingEntries.filter(entry => {
        // Amount absolute match (Bank usually negative for expense, Ledger debit is positive expense)
        const txAmountAbs = Math.abs(tx.amount);
        const entryAmount = entry.debit > 0 ? entry.debit : entry.credit;
        return Math.abs(txAmountAbs - entryAmount) < 0.05; // 5 cent tolerance
    });
  };

  const handleReconcile = (txId: string, entryId: string) => {
    onReconcile(txId, entryId);
    setSelectedTransaction(null);
  };

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 h-[calc(100vh-4rem)] flex flex-col">
       <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Conciliación Bancaria</h2>
           <p className="text-slate-500">BBVA Empresas vs Libro Diario</p>
        </div>
        <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
            Pendientes: {pendingTransactions.length}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
         {/* Left: Bank Statements */}
         <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 font-semibold text-indigo-900 flex justify-between">
                <span>Movimientos Banco</span>
                <span className="text-xs bg-indigo-200 px-2 py-0.5 rounded">BBVA Importado</span>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-2">
                {pendingTransactions.length === 0 && <div className="text-center p-8 text-slate-400">Todo conciliado 🎉</div>}
                {pendingTransactions.map(tx => (
                    <div 
                        key={tx.id}
                        onClick={() => setSelectedTransaction(tx.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedTransaction === tx.id 
                            ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' 
                            : 'border-slate-200 hover:border-indigo-300'
                        }`}
                    >
                        <div className="flex justify-between mb-1">
                            <span className="text-xs font-mono text-slate-500">{tx.date}</span>
                            <span className={`font-bold text-sm ${tx.amount < 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
                                {tx.amount.toLocaleString('es-ES', {style:'currency', currency: 'EUR'})}
                            </span>
                        </div>
                        <p className="text-sm text-slate-800 truncate">{tx.concept}</p>
                        
                        {/* Action Panel when selected */}
                        {selectedTransaction === tx.id && (
                           <div className="mt-3 pt-3 border-t border-indigo-200 flex justify-end">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); onCreateEntryFromTransaction(tx); }}
                                 className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 flex items-center gap-1"
                               >
                                  <Plus className="w-3 h-3" /> Crear Asiento
                               </button>
                           </div>
                        )}
                    </div>
                ))}
            </div>
         </div>

         {/* Right: Ledger Matches */}
         <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-semibold text-slate-800 flex justify-between">
                <span>Coincidencias en Libros</span>
                <span className="text-xs text-slate-500">Selecciona un mov. izquierda</span>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-2 bg-slate-50/50">
                {!selectedTransaction ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <ArrowRightLeft className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm">Selecciona un movimiento bancario para buscar coincidencias.</p>
                    </div>
                ) : (
                    <>
                        {getMatches(pendingTransactions.find(t => t.id === selectedTransaction)!).map(match => (
                            <div key={match.id} className="bg-white p-4 rounded-lg border border-emerald-200 shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-slate-800">{match.concept}</p>
                                    <p className="text-xs text-slate-500">{match.date} • {match.accountCode}</p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className="font-mono font-bold">
                                        {match.debit > 0 ? `-${match.debit}€` : `+${match.credit}€`}
                                    </span>
                                    <button 
                                        onClick={() => handleReconcile(selectedTransaction, match.id)}
                                        className="bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-emerald-600 flex items-center gap-1"
                                    >
                                        <Check className="w-3 h-3" /> CASAR
                                    </button>
                                </div>
                            </div>
                        ))}
                        
                        {getMatches(pendingTransactions.find(t => t.id === selectedTransaction)!).length === 0 && (
                             <div className="text-center p-6">
                                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                                <p className="text-sm text-slate-600">No se encontraron facturas/asientos con importe exacto.</p>
                                <p className="text-xs text-slate-400 mt-1">Usa &quot;Crear Asiento&quot; en el panel izquierdo.</p>
                             </div>
                        )}
                    </>
                )}
            </div>
         </div>
      </div>
    </div>
  );
};