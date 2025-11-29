import React, { useState, useMemo } from 'react';
import { BankTransaction, AccountingEntry, Invoice, Supplier, RecurringExpense, AIMatchSuggestion, getEntryLines, calculateEntryTotals } from '../types';
import { ArrowRightLeft, Check, AlertCircle, Plus, BookOpen, Building2, Sparkles, Zap, FileText, RefreshCw } from 'lucide-react';
import { generateMatchSuggestions } from '../utils/aiMatching';
import { isTreasuryAccount } from '../utils/accountingPlan';

// Helper to check if an entry has any treasury/bank lines
const entryHasBankLine = (entry: AccountingEntry): boolean => {
  const lines = getEntryLines(entry);
  return lines.some(line => isTreasuryAccount(line.accountCode));
};

// Get the bank line amount from an entry (positive for debit, negative for credit)
const getBankLineAmount = (entry: AccountingEntry): number => {
  const lines = getEntryLines(entry);
  for (const line of lines) {
    if (isTreasuryAccount(line.accountCode)) {
      // Debit on bank = money coming in (positive)
      // Credit on bank = money going out (negative)
      return line.debit > 0 ? line.debit : -line.credit;
    }
  }
  return 0;
};

// Get the bank account code from an entry
const getBankAccountCode = (entry: AccountingEntry): string => {
  const lines = getEntryLines(entry);
  for (const line of lines) {
    if (isTreasuryAccount(line.accountCode)) {
      return line.accountCode;
    }
  }
  return '';
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
  invoices: Invoice[];
  suppliers: Supplier[];
  recurringExpenses: RecurringExpense[];
  /**
   * Called when reconciling a movement with an entry.
   * @param sourceId - ID of the source movement (transaction ID if IMPORTED, bank entry ID if ACCOUNTING)
   * @param matchedEntryId - ID of the entry being matched
   * @param sourceType - Whether the source is an imported transaction or an accounting entry
   */
  onReconcile: (sourceId: string, matchedEntryId: string, sourceType: 'IMPORTED' | 'ACCOUNTING') => void;
  onCreateEntryFromTransaction: (transaction: BankTransaction) => void;
}

export const BankReconciliation: React.FC<BankReconciliationProps> = ({
  transactions,
  entries,
  invoices,
  suppliers,
  recurringExpenses,
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
  // An entry with a bank account line (572, 573, etc.) represents a bank movement
  const accountingMovements: BankMovement[] = useMemo(() =>
    entries
      .filter(e => !e.reconciled && entryHasBankLine(e))
      .map(entry => {
        // Get amount from the bank line
        const amount = getBankLineAmount(entry);
        const bankAccountCode = getBankAccountCode(entry);
        return {
          id: `entry-${entry.id}`,
          date: entry.date,
          concept: entry.concept,
          amount: amount,
          source: 'ACCOUNTING' as const,
          originalEntry: entry,
          accountCode: bankAccountCode,
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

  // Get entries that do NOT have bank account lines (for matching panel)
  const nonBankEntries = useMemo(() =>
    entries.filter(e => !e.reconciled && !entryHasBankLine(e)),
    [entries]
  );

  // Find potential matches - entries without bank accounts with matching total amount
  const getMatches = (movement: BankMovement) => {
    const movementAmountAbs = Math.abs(movement.amount);
    return nonBankEntries.filter(entry => {
      const totals = calculateEntryTotals(entry);
      // Use the larger of debit/credit totals as the entry amount
      const entryAmount = Math.max(totals.totalDebit, totals.totalCredit);
      return Math.abs(movementAmountAbs - entryAmount) < 0.05; // 5 cent tolerance
    });
  };

  // Get AI suggestions for a movement
  const getAISuggestions = (movement: BankMovement): AIMatchSuggestion[] => {
    if (movement.source !== 'IMPORTED' || !movement.originalTransaction) {
      return [];
    }
    return generateMatchSuggestions(
      movement.originalTransaction,
      invoices,
      suppliers,
      recurringExpenses
    );
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (confidence >= 60) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (confidence >= 40) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  // Get suggestion icon
  const getSuggestionIcon = (suggestion: AIMatchSuggestion) => {
    if (suggestion.platform) return <Zap className="w-3.5 h-3.5" />;
    if (suggestion.invoiceId) return <FileText className="w-3.5 h-3.5" />;
    if (suggestion.supplierId) return <Building2 className="w-3.5 h-3.5" />;
    if (suggestion.category) return <RefreshCw className="w-3.5 h-3.5" />;
    return <Sparkles className="w-3.5 h-3.5" />;
  };

  // Handle reconciliation based on movement source
  const handleReconcile = (movementId: string, entryId: string) => {
    const movement = allPendingMovements.find(m => m.id === movementId);
    if (!movement) return;

    if (movement.source === 'IMPORTED' && movement.originalTransaction) {
      onReconcile(movement.originalTransaction.id, entryId, 'IMPORTED');
    } else if (movement.source === 'ACCOUNTING' && movement.originalEntry) {
      // For accounting-sourced movements, reconcile the bank entry with the matched entry
      onReconcile(movement.originalEntry.id, entryId, 'ACCOUNTING');
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
                           <div className="mt-3 pt-3 border-t border-indigo-200 space-y-3">
                               {/* AI Suggestions */}
                               {(() => {
                                 const suggestions = getAISuggestions(movement);
                                 if (suggestions.length === 0) return null;
                                 return (
                                   <div className="space-y-1.5">
                                     <div className="flex items-center gap-1 text-xs text-purple-600 font-medium">
                                       <Sparkles className="w-3 h-3" />
                                       <span>Sugerencias IA</span>
                                     </div>
                                     {suggestions.slice(0, 3).map((suggestion, idx) => (
                                       <div
                                         key={idx}
                                         className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs ${getConfidenceColor(suggestion.confidence)}`}
                                       >
                                         {getSuggestionIcon(suggestion)}
                                         <span className="flex-1 truncate">
                                           {suggestion.platform || suggestion.invoiceName || suggestion.supplierName || suggestion.category}
                                         </span>
                                         <span className="font-bold">{suggestion.confidence}%</span>
                                       </div>
                                     ))}
                                   </div>
                                 );
                               })()}

                               <div className="flex justify-end">
                                 <button
                                   onClick={(e) => { e.stopPropagation(); handleCreateEntry(movement); }}
                                   className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 flex items-center gap-1"
                                 >
                                    <Plus className="w-3 h-3" /> Crear Asiento
                                 </button>
                               </div>
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
                        {getMatches(selectedMovementData).map(match => {
                            const matchTotals = calculateEntryTotals(match);
                            const matchLines = getEntryLines(match);
                            return (
                            <div key={match.id} className="bg-white p-4 rounded-lg border border-emerald-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="font-bold text-slate-800">{match.concept}</p>
                                        <p className="text-xs text-slate-500">{match.date}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-mono font-bold">
                                            {matchTotals.totalDebit.toFixed(2)}€
                                        </span>
                                    </div>
                                </div>
                                {/* Show lines summary */}
                                <div className="text-xs text-slate-500 mb-2 space-y-0.5">
                                    {matchLines.slice(0, 3).map((line, idx) => (
                                        <div key={idx} className="flex justify-between">
                                            <span className="font-mono">{line.accountCode}</span>
                                            <span>{line.debit > 0 ? `D:${line.debit}` : `H:${line.credit}`}</span>
                                        </div>
                                    ))}
                                    {matchLines.length > 3 && (
                                        <span className="text-slate-400">+{matchLines.length - 3} más...</span>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleReconcile(selectedMovement, match.id)}
                                    className="w-full bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-600 flex items-center justify-center gap-1"
                                >
                                    <Check className="w-3 h-3" /> CASAR
                                </button>
                            </div>
                            );
                        })}

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
