import React, { useState, useMemo } from 'react';
import { BankTransaction, AccountingEntry } from '../types';
import { ArrowRightLeft, Check, AlertCircle, Plus, BookOpen, Building2 } from 'lucide-react';

// Bank account codes (cuentas de tesorería PGC)
const BANK_ACCOUNT_PREFIXES = ['570', '571', '572', '573', '574', '575', '576', '577'];

// Check if an account code is a bank/cash account
const isBankAccount = (accountCode: string): boolean => {
  return BANK_ACCOUNT_PREFIXES.some(prefix => accountCode.startsWith(prefix));
};

// Union type for bank movements (imported or from accounting entries)
interface BankMovement {
  id: string;
  date: string;
  concept: string;
  amount: number; // Negative for expenses, positive for income
  source: 'IMPORTED' | 'ACCOUNTING';
  originalTransaction?: BankTransaction;
  originalEntry?: AccountingEntry;
  accountCode?: string;
  status: 'PENDING' | 'MATCHED';
}

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
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);

  // Convert imported transactions to unified format
  const importedMovements: BankMovement[] = useMemo(() =>
    transactions
      .filter(t => t.status === 'PENDING')
      .map(tx => ({
        id: `tx-${tx.id}`,
        date: tx.date,
        concept: tx.concept,
        amount: tx.amount,
        source: 'IMPORTED' as const,
        originalTransaction: tx,
        status: tx.status
      })),
    [transactions]
  );

  // Convert accounting entries with bank accounts to movements
  // An entry with a bank account (572, 573, etc.) represents a bank movement
  const accountingMovements: BankMovement[] = useMemo(() =>
    entries
      .filter(e => !e.reconciled && isBankAccount(e.accountCode))
      .map(entry => {
        // If debit > 0 on bank account = money coming IN (positive)
        // If credit > 0 on bank account = money going OUT (negative)
        const amount = entry.debit > 0 ? entry.debit : -entry.credit;
        return {
          id: `entry-${entry.id}`,
          date: entry.date,
          concept: entry.concept,
          amount: amount,
          source: 'ACCOUNTING' as const,
          originalEntry: entry,
          accountCode: entry.accountCode,
          status: 'PENDING' as const
        };
      }),
    [entries]
  );

  // Combine all movements and sort by date
  const allPendingMovements = useMemo(() =>
    [...importedMovements, ...accountingMovements]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [importedMovements, accountingMovements]
  );

  // Get entries that are NOT bank accounts (for matching panel)
  const nonBankEntries = useMemo(() =>
    entries.filter(e => !e.reconciled && !isBankAccount(e.accountCode)),
    [entries]
  );

  // Find potential matches - entries that are NOT bank accounts with matching amount
  const getMatches = (movement: BankMovement) => {
    const movementAmountAbs = Math.abs(movement.amount);
    return nonBankEntries.filter(entry => {
      const entryAmount = entry.debit > 0 ? entry.debit : entry.credit;
      return Math.abs(movementAmountAbs - entryAmount) < 0.05; // 5 cent tolerance
    });
  };

  // Handle reconciliation based on movement source
  const handleReconcile = (movementId: string, entryId: string) => {
    const movement = allPendingMovements.find(m => m.id === movementId);
    if (!movement) return;

    if (movement.source === 'IMPORTED' && movement.originalTransaction) {
      onReconcile(movement.originalTransaction.id, entryId);
    } else if (movement.source === 'ACCOUNTING' && movement.originalEntry) {
      // For accounting-sourced movements, reconcile the bank entry with the matched entry
      onReconcile(movement.originalEntry.id, entryId);
    }
    setSelectedMovement(null);
  };

  // Handle creating entry from imported transaction
  const handleCreateEntry = (movement: BankMovement) => {
    if (movement.source === 'IMPORTED' && movement.originalTransaction) {
      onCreateEntryFromTransaction(movement.originalTransaction);
    }
  };

  const selectedMovementData = allPendingMovements.find(m => m.id === selectedMovement);

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 h-[calc(100vh-4rem)] flex flex-col">
       <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Conciliación Bancaria</h2>
           <p className="text-slate-500">Movimientos Bancarios vs Libro Diario</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
            Importados: {importedMovements.length}
          </div>
          <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium">
            Asientos 57X: {accountingMovements.length}
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
         {/* Left: Bank Movements (Imported + Accounting entries with bank accounts) */}
         <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 font-semibold text-indigo-900 flex justify-between items-center">
                <span>Movimientos Bancarios</span>
                <div className="flex gap-1">
                  <span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Importado
                  </span>
                  <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> Asiento
                  </span>
                </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-2">
                {allPendingMovements.length === 0 && (
                  <div className="text-center p-8 text-slate-400">Todo conciliado</div>
                )}
                {allPendingMovements.map(movement => (
                    <div
                        key={movement.id}
                        onClick={() => setSelectedMovement(movement.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedMovement === movement.id
                            ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                            : movement.source === 'ACCOUNTING'
                              ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-400'
                              : 'border-slate-200 hover:border-indigo-300'
                        }`}
                    >
                        <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-slate-500">{movement.date}</span>
                              {movement.source === 'ACCOUNTING' ? (
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                  {movement.accountCode}
                                </span>
                              ) : (
                                <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                                  BBVA
                                </span>
                              )}
                            </div>
                            <span className={`font-bold text-sm ${movement.amount < 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
                                {movement.amount.toLocaleString('es-ES', {style:'currency', currency: 'EUR'})}
                            </span>
                        </div>
                        <p className="text-sm text-slate-800 truncate">{movement.concept}</p>

                        {/* Action Panel when selected */}
                        {selectedMovement === movement.id && movement.source === 'IMPORTED' && (
                           <div className="mt-3 pt-3 border-t border-indigo-200 flex justify-end">
                               <button
                                 onClick={(e) => { e.stopPropagation(); handleCreateEntry(movement); }}
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

         {/* Right: Ledger Matches (entries without bank accounts) */}
         <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-semibold text-slate-800 flex justify-between">
                <span>Coincidencias en Libros</span>
                <span className="text-xs text-slate-500">Asientos sin cuenta bancaria</span>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-2 bg-slate-50/50">
                {!selectedMovement || !selectedMovementData ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <ArrowRightLeft className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm">Selecciona un movimiento bancario para buscar coincidencias.</p>
                    </div>
                ) : (
                    <>
                        {getMatches(selectedMovementData).map(match => (
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
                                        onClick={() => handleReconcile(selectedMovement, match.id)}
                                        className="bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-emerald-600 flex items-center gap-1"
                                    >
                                        <Check className="w-3 h-3" /> CASAR
                                    </button>
                                </div>
                            </div>
                        ))}

                        {getMatches(selectedMovementData).length === 0 && (
                             <div className="text-center p-6">
                                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                                <p className="text-sm text-slate-600">No se encontraron asientos con importe exacto.</p>
                                {selectedMovementData.source === 'IMPORTED' && (
                                  <p className="text-xs text-slate-400 mt-1">Usa &quot;Crear Asiento&quot; en el panel izquierdo.</p>
                                )}
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
