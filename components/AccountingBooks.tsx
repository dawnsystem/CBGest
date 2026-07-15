
import React, { useState, useMemo } from 'react';
import { Filter, X, Plus, Edit3, Trash, Save, Paperclip, ChevronDown, ChevronRight, AlertTriangle, Check, PlusCircle, MinusCircle, FileEdit, Info, Clock } from 'lucide-react';
import { AccountingEntry, AccountingEntryLine, getEntryLines, calculateEntryTotals } from '../types';
import { AccountSelector } from './AccountSelector';
import { getAccountName } from '../utils/accountingPlan';
import { useToast } from './Toast';
import { useIsReadOnly } from '../context/FiscalYearContext';
import { ENTRY_TEMPLATES } from '../utils/entryTemplates';
import { buildFormalEntryToSave } from '../utils/accountingEntrySave';

interface AccountingBooksProps {
  entries: AccountingEntry[];
  onAddEntry: (entry: AccountingEntry) => void;
  onUpdateEntry: (entry: AccountingEntry) => void;
  onDeleteEntry: (id: string) => void;
  onViewDocument: (file: File) => void;
}

// Empty line template
const createEmptyLine = (): AccountingEntryLine => ({
  accountCode: '',
  accountName: '',
  debit: 0,
  credit: 0
});

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
  
  // Expanded entries (to show all lines)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  
  // Help banner state
  const [helpBannerOpen, setHelpBannerOpen] = useState(false);
  // Template selector controlled state (resets to '' after applying)
  const [selectedTemplate, setSelectedTemplate] = useState('');
  
  // Edit/Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);
  const { showToast } = useToast();
  const isReadOnly = useIsReadOnly();

  // Get unique accounts from all entry lines
  const uniqueAccounts = useMemo(() => {
    const accounts = new Set<string>();
    entries.forEach(e => {
      const lines = getEntryLines(e);
      lines.forEach(line => {
        if (line.accountCode) {
          accounts.add(`${line.accountCode} - ${line.accountName || getAccountName(line.accountCode)}`);
        }
      });
    });
    return Array.from(accounts).sort();
  }, [entries]);

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    const matchStartDate = startDate ? entry.date >= startDate : true;
    const matchEndDate = endDate ? entry.date <= endDate : true;
    
    // Match by account - check if any line matches
    let matchAccount = true;
    if (selectedAccount) {
      const lines = getEntryLines(entry);
      matchAccount = lines.some(line => 
        `${line.accountCode} - ${line.accountName}` === selectedAccount ||
        line.accountCode === selectedAccount.split(' - ')[0]
      );
    }
    
    return matchStartDate && matchEndDate && matchAccount;
  });

  // Calculate totals
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    filteredEntries.forEach(entry => {
      const entryTotals = calculateEntryTotals(entry);
      totalDebit += entryTotals.totalDebit;
      totalCredit += entryTotals.totalCredit;
    });
    return { totalDebit, totalCredit };
  }, [filteredEntries]);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedEntries(newExpanded);
  };

  const openNewEntryModal = () => {
    setSelectedTemplate('');
    setEditingEntry({
      id: '',
      date: new Date().toISOString().split('T')[0],
      concept: '',
      lines: [
        createEmptyLine(), // Debe
        createEmptyLine()  // Haber
      ],
      reconciled: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (entry: AccountingEntry) => {
    // Ensure entry has lines array
    const lines = getEntryLines(entry);
    setSelectedTemplate('');
    setEditingEntry({
      ...entry,
      lines: lines.length > 0 ? [...lines] : [createEmptyLine(), createEmptyLine()]
    });
    setIsModalOpen(true);
  };

  const handleLineChange = (index: number, field: keyof AccountingEntryLine, value: string | number) => {
    if (!editingEntry) return;
    
    const newLines = [...editingEntry.lines];
    
    if (field === 'accountCode' || field === 'accountName') {
      // If value is in "CODE - NAME" format, split it
      const strValue = String(value);
      if (strValue.includes(' - ')) {
        const parts = strValue.split(' - ');
        newLines[index] = {
          ...newLines[index],
          accountCode: parts[0].trim(),
          accountName: parts.slice(1).join(' - ').trim()
        };
      } else {
        newLines[index] = {
          ...newLines[index],
          [field]: strValue
        };
      }
    } else {
      newLines[index] = {
        ...newLines[index],
        [field]: Number(value) || 0
      };
    }
    
    setEditingEntry({ ...editingEntry, lines: newLines });
  };

  const addLine = () => {
    if (!editingEntry) return;
    setEditingEntry({
      ...editingEntry,
      lines: [...editingEntry.lines, createEmptyLine()]
    });
  };

  const removeLine = (index: number) => {
    if (!editingEntry || editingEntry.lines.length <= 2) return; // Minimum 2 lines
    const newLines = editingEntry.lines.filter((_, i) => i !== index);
    setEditingEntry({ ...editingEntry, lines: newLines });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    // Validate: must have at least one debit and one credit
    const totals = calculateEntryTotals(editingEntry);
    if (!totals.isBalanced) {
      showToast(`El asiento no cuadra. Debe: ${totals.totalDebit.toFixed(2)}€ | Haber: ${totals.totalCredit.toFixed(2)}€`, 'warning');
      return;
    }

    // Filter out empty lines
    const validLines = editingEntry.lines.filter(line => 
      line.accountCode && (line.debit > 0 || line.credit > 0)
    );

    if (validLines.length < 2) {
      showToast('El asiento necesita al menos 2 líneas con cuenta e importe.', 'warning');
      return;
    }

    const hasDebitLine = validLines.some(l => l.debit > 0);
    const hasCreditLine = validLines.some(l => l.credit > 0);
    if (!hasDebitLine || !hasCreditLine) {
      showToast('El asiento debe tener al menos una línea en el Debe y una en el Haber.', 'warning');
      return;
    }

    // CTB-001: forzar isDraft:false al guardar formal (un borrador cuadrado no debe seguir como borrador)
    const entryToSave: AccountingEntry = buildFormalEntryToSave(editingEntry, validLines);

    if (!editingEntry.id) {
       // Create
       const newEntry = { ...entryToSave, id: `MANUAL-${Date.now()}` };
       onAddEntry(newEntry);
    } else {
       // Update
       onUpdateEntry(entryToSave);
    }
    setIsModalOpen(false);
  };

  // Get entry totals for display
  const getEntryDisplayTotals = (entry: AccountingEntry) => {
    return calculateEntryTotals(entry);
  };

  /** Saves entry as draft — skips balance validation but requires date, concept and at least one account line */
  const handleSaveDraft = () => {
    if (!editingEntry) return;
    if (!editingEntry.date) {
      showToast('El borrador necesita una fecha.', 'warning');
      return;
    }
    if (!editingEntry.concept?.trim()) {
      showToast('El borrador necesita un concepto.', 'warning');
      return;
    }
    const linesWithData = editingEntry.lines.filter(line => line.accountCode);
    if (linesWithData.length === 0) {
      showToast('El borrador necesita al menos una línea con cuenta asignada.', 'warning');
      return;
    }
    const draftEntry: AccountingEntry = {
      ...editingEntry,
      lines: linesWithData,
      isDraft: true,
      reconciled: false,
      accountCode: linesWithData[0].accountCode,
      accountName: linesWithData[0].accountName,
      debit: linesWithData[0].debit,
      credit: linesWithData[0].credit,
    };
    if (!editingEntry.id) {
      onAddEntry({ ...draftEntry, id: `DRAFT-${Date.now()}` });
    } else {
      onUpdateEntry(draftEntry);
    }
    setIsModalOpen(false);
    showToast('Asiento guardado como borrador.', 'warning');
  };

  /** Applies a template to the editing entry: pre-fills account lines */
  const applyTemplate = (templateId: string) => {
    if (!editingEntry || !templateId) return;
    const template = ENTRY_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    setEditingEntry({
      ...editingEntry,
      concept: editingEntry.concept || template.defaultConcept,
      lines: template.lines.map(l => ({ ...l })),
    });
    setSelectedTemplate(''); // reset selector after applying
  };


  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8 overflow-x-hidden">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Libro Diario</h2>
           <p className="text-slate-500">Asientos contables con partida doble</p>
        </div>
        <button 
          onClick={openNewEntryModal}
          disabled={isReadOnly}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors text-sm font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
            <Plus className="w-4 h-4" /> Nuevo Asiento
        </button>
      </div>

      {/* Collapsible help banner */}
      <div className="mb-4 border border-blue-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setHelpBannerOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-sm text-blue-800 font-medium"
        >
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            ¿Cómo funciona la conciliación bancaria?
          </span>
          {helpBannerOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        </button>
        {helpBannerOpen && (
          <div className="px-4 py-4 bg-blue-50/50 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-700">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">1</span>
              <div>
                <p className="font-semibold text-slate-900 mb-1">Importa el extracto bancario</p>
                <p className="text-slate-500">Sube tu fichero CSV/OFX del banco en la sección <strong>Conciliación</strong>. Las transacciones aparecerán en estado PENDIENTE.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">2</span>
              <div>
                <p className="font-semibold text-slate-900 mb-1">Empareja con asientos</p>
                <p className="text-slate-500">Asocia cada transacción bancaria a su asiento contable. Los asientos pasarán a estado CONCILIADO automáticamente.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">3</span>
              <div>
                <p className="font-semibold text-slate-900 mb-1">Verifica el cuadre</p>
                <p className="text-slate-500">Comprueba que el saldo contable coincide con el saldo real del banco. Los asientos sin transacción asociada quedan como MANUAL.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-3 text-slate-700 font-medium text-sm">
            <Filter className="w-4 h-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="accountingbooks-startdate-input" className="sr-only">Fecha inicio</label>
              <input id="accountingbooks-startdate-input" name="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="accountingbooks-enddate-input" className="sr-only">Fecha fin</label>
              <input id="accountingbooks-enddate-input" name="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="accountingbooks-account-select" className="sr-only">Cuenta</label>
              <select id="accountingbooks-account-select" name="selectedAccount" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="w-full border-slate-200 rounded-lg text-sm bg-white text-slate-900">
                  <option value="">Todas las cuentas</option>
                  {uniqueAccounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
              </select>
            </div>
            <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedAccount(''); }} className="bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium">Limpiar</button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 rounded-xl mb-6 flex justify-between items-center">
        <div className="flex gap-8">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Total Debe</p>
            <p className="text-xl font-bold font-mono">{totals.totalDebit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Total Haber</p>
            <p className="text-xl font-bold font-mono">{totals.totalCredit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          Math.abs(totals.totalDebit - totals.totalCredit) < 0.01 
            ? 'bg-emerald-500/20 text-emerald-300' 
            : 'bg-red-500/20 text-red-300'
        }`}>
          {Math.abs(totals.totalDebit - totals.totalCredit) < 0.01 ? (
            <span className="flex items-center gap-1"><Check className="w-4 h-4" /> Cuadrado</span>
          ) : (
            <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Descuadre: {Math.abs(totals.totalDebit - totals.totalCredit).toFixed(2)}€</span>
          )}
        </div>
      </div>

      {/* Table - Desktop */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                    <th className="px-4 py-4 w-8"></th>
                    <th className="px-4 py-4">Fecha</th>
                    <th className="px-4 py-4">Concepto</th>
                    <th className="px-4 py-4">Estado</th>
                    <th className="px-4 py-4">Cuentas</th>
                    <th className="px-4 py-4 text-right">Debe</th>
                    <th className="px-4 py-4 text-right">Haber</th>
                    <th className="px-4 py-4 text-center w-16">Doc</th>
                    <th className="px-4 py-4 text-center w-24">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredEntries.map(entry => {
                    const lines = getEntryLines(entry);
                    const entryTotals = getEntryDisplayTotals(entry);
                    const isExpanded = expandedEntries.has(entry.id);
                    const hasMultipleLines = lines.length > 1;
                    
                    // Determine reconciliation status badge
                    const isManual = !entry.transactionId && !entry.invoiceId;
                    const statusBadge = entry.isDraft
                      ? <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-300 flex items-center gap-0.5"><Clock className="w-3 h-3"/>BORRADOR</span>
                      : entry.reconciled
                        ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">CONCILIADO</span>
                        : isManual
                          ? <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">MANUAL</span>
                          : <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">PENDIENTE</span>;

                    return (
                      <React.Fragment key={entry.id}>
                        <tr className={`hover:bg-slate-50 ${!entryTotals.isBalanced && !entry.isDraft ? 'bg-red-50' : ''} ${entry.isDraft ? 'opacity-70' : ''}`}>
                            <td className="px-4 py-4">
                              {hasMultipleLines && (
                                <button 
                                  onClick={() => toggleExpanded(entry.id)}
                                  className="p-1 hover:bg-slate-200 rounded"
                                >
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-600">{entry.date}</td>
                            <td className="px-4 py-4 text-sm font-medium text-slate-900">
                               <div className="flex items-center gap-2">
                                 {entry.concept}
                                 {!entryTotals.isBalanced && !entry.isDraft && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded border border-red-200">DESCUADRADO</span>}
                               </div>
                               {hasMultipleLines && !isExpanded && (
                                 <p className="text-xs text-slate-400 mt-1">
                                   {lines.length} líneas: {lines.map(l => l.accountCode).join(', ')}
                                 </p>
                               )}
                            </td>
                            <td className="px-4 py-4">
                              {statusBadge}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              {!hasMultipleLines || !isExpanded ? (
                                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono text-xs">
                                  {lines[0]?.accountCode}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">Ver detalle ↓</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm font-mono text-right text-rose-600 font-medium">
                              {entryTotals.totalDebit > 0 ? entryTotals.totalDebit.toFixed(2) : '-'}
                            </td>
                            <td className="px-4 py-4 text-sm font-mono text-right text-emerald-600 font-medium">
                              {entryTotals.totalCredit > 0 ? entryTotals.totalCredit.toFixed(2) : '-'}
                            </td>
                            <td className="px-4 py-4 text-center">
                                 {(entry.referenceDoc || entry.fileData) && (
                                    <button 
                                        onClick={() => entry.referenceDoc && onViewDocument(entry.referenceDoc)} 
                                        className="p-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                                        title="Ver documento adjunto"
                                    >
                                        <Paperclip className="w-4 h-4"/>
                                    </button>
                                )}
                            </td>
                            <td className="px-4 py-4 flex justify-center gap-2">
                                <button onClick={() => openEditModal(entry)} disabled={isReadOnly} className="p-1 text-slate-400 hover:text-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"><Edit3 className="w-4 h-4"/></button>
                                <button onClick={() => onDeleteEntry(entry.id)} disabled={isReadOnly} className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"><Trash className="w-4 h-4"/></button>
                            </td>
                        </tr>
                        
                        {/* Expanded lines */}
                        {isExpanded && lines.map((line, idx) => (
                          <tr key={`${entry.id}-line-${idx}`} className="bg-slate-50/50">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-xs text-slate-500 pl-8">
                              └ Línea {idx + 1}
                            </td>
                            <td className="px-4 py-2">
                              <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono text-xs">
                                {line.accountCode}
                              </span>
                              <span className="text-xs text-slate-500 ml-2">{line.accountName}</span>
                            </td>
                            <td className="px-4 py-2 text-xs font-mono text-right text-rose-500">
                              {line.debit > 0 ? line.debit.toFixed(2) : '-'}
                            </td>
                            <td className="px-4 py-2 text-xs font-mono text-right text-emerald-500">
                              {line.credit > 0 ? line.credit.toFixed(2) : '-'}
                            </td>
                            <td></td>
                            <td></td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                })}
            </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {filteredEntries.map(entry => {
            const lines = getEntryLines(entry);
            const entryTotals = getEntryDisplayTotals(entry);
            const isExpanded = expandedEntries.has(entry.id);
            const isManual = !entry.transactionId && !entry.invoiceId;
            
            return (
              <div key={entry.id} className={`bg-white p-4 rounded-lg shadow-sm border ${!entryTotals.isBalanced && !entry.isDraft ? 'border-red-200 bg-red-50' : 'border-slate-100'} ${entry.isDraft ? 'opacity-70' : ''}`}>
                  <div className="flex justify-between mb-2">
                      <span className="text-xs text-slate-500">{entry.date}</span>
                      <div className="flex gap-1">
                        {entry.isDraft
                          ? <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-300">BORRADOR</span>
                          : entry.reconciled
                            ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">CONCILIADO</span>
                            : isManual
                              ? <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">MANUAL</span>
                              : <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">PENDIENTE</span>
                        }
                        {!entryTotals.isBalanced && !entry.isDraft && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">DESCUADRADO</span>
                        )}
                      </div>
                  </div>
                  
                  <p className="font-semibold text-slate-900 mb-2 text-sm">{entry.concept}</p>
                  
                  {/* Toggle for lines */}
                  <button 
                    onClick={() => toggleExpanded(entry.id)}
                    className="w-full text-left text-xs text-slate-500 mb-2 flex items-center gap-1"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {lines.length} líneas
                  </button>
                  
                  {isExpanded && (
                    <div className="space-y-1 mb-3 bg-slate-50 p-2 rounded">
                      {lines.map((line, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="font-mono text-slate-600">{line.accountCode} - {line.accountName}</span>
                          <span className={line.debit > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {line.debit > 0 ? `-${line.debit.toFixed(2)}` : `+${line.credit.toFixed(2)}`}€
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      <div className="text-sm font-bold flex gap-4">
                        <span className="text-rose-600">D: {entryTotals.totalDebit.toFixed(2)}€</span>
                        <span className="text-emerald-600">H: {entryTotals.totalCredit.toFixed(2)}€</span>
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => openEditModal(entry)} disabled={isReadOnly} className="text-blue-600 text-xs font-medium uppercase disabled:opacity-40 disabled:cursor-not-allowed">Editar</button>
                          <button onClick={() => onDeleteEntry(entry.id)} disabled={isReadOnly} className="text-red-500 text-xs font-medium uppercase disabled:opacity-40 disabled:cursor-not-allowed">Borrar</button>
                      </div>
                  </div>
              </div>
            );
        })}
      </div>

      {/* Edit/Create Modal */}
      {isModalOpen && editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <form onSubmit={handleSave} className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <h3 className="font-bold text-slate-900">{editingEntry.id ? 'Editar Asiento' : 'Nuevo Asiento'}</h3>
                    <button type="button" onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto">
                    {/* Template selector */}
                    <div>
                      <label htmlFor="entry-template-select" className="block text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                        <FileEdit className="w-3 h-3" /> Usar plantilla (opcional)
                      </label>
                      <select
                        id="entry-template-select"
                        value={selectedTemplate}
                        onChange={e => {
                          setSelectedTemplate(e.target.value);
                          applyTemplate(e.target.value);
                        }}
                        className="w-full border-slate-200 rounded-lg p-2.5 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">— Seleccionar plantilla —</option>
                        {ENTRY_TEMPLATES.map(t => (
                          <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Date and Concept */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <label htmlFor="entry-date-input" className="block text-xs font-bold text-slate-500 mb-1.5">Fecha</label>
                          <input
                              id="entry-date-input"
                              name="date"
                              type="date"
                              required
                              value={editingEntry.date}
                              onChange={e => setEditingEntry({...editingEntry, date: e.target.value})}
                              className="w-full border-slate-200 rounded-lg p-2.5 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                              autoComplete="off"
                          />
                      </div>
                      <div>
                          <label htmlFor="entry-concept-input" className="block text-xs font-bold text-slate-500 mb-1.5">Concepto</label>
                          <input
                              id="entry-concept-input"
                              name="concept"
                              type="text"
                              required
                              value={editingEntry.concept}
                              onChange={e => setEditingEntry({...editingEntry, concept: e.target.value})}
                              className="w-full border-slate-200 rounded-lg p-2.5 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="Descripción del asiento..."
                              autoComplete="off"
                          />
                      </div>
                    </div>

                    {/* Lines Editor */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-500">Líneas del Asiento (Partida Doble)</label>
                        <button
                          type="button"
                          onClick={addLine}
                          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <PlusCircle className="w-4 h-4" /> Añadir línea
                        </button>
                      </div>
                      
                      <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 text-xs font-bold text-slate-500 uppercase">
                          <div className="col-span-5">Cuenta</div>
                          <div className="col-span-3 text-right">Debe</div>
                          <div className="col-span-3 text-right">Haber</div>
                          <div className="col-span-1"></div>
                        </div>
                        
                        {editingEntry.lines.map((line, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-slate-200 items-center">
                            <div className="col-span-5">
                              <AccountSelector
                                value={line.accountCode ? `${line.accountCode} - ${line.accountName}` : ''}
                                onChange={(val) => handleLineChange(idx, 'accountCode', val)}
                                className="text-xs"
                              />
                            </div>
                            <div className="col-span-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.debit || ''}
                                onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                                className="w-full border-slate-200 rounded p-2 text-sm font-mono text-right bg-rose-50 focus:ring-2 focus:ring-rose-500 outline-none"
                                placeholder="0.00"
                              />
                            </div>
                            <div className="col-span-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.credit || ''}
                                onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                                className="w-full border-slate-200 rounded p-2 text-sm font-mono text-right bg-emerald-50 focus:ring-2 focus:ring-emerald-500 outline-none"
                                placeholder="0.00"
                              />
                            </div>
                            <div className="col-span-1 flex justify-center">
                              {editingEntry.lines.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  className="p-1 text-slate-400 hover:text-red-500"
                                >
                                  <MinusCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {/* Totals Row */}
                        <div className="grid grid-cols-12 gap-2 px-3 py-3 border-t-2 border-slate-300 bg-slate-100 font-bold">
                          <div className="col-span-5 text-xs text-slate-600">TOTALES</div>
                          <div className="col-span-3 text-right font-mono text-sm text-rose-700">
                            {editingEntry.lines.reduce((sum, l) => sum + (l.debit || 0), 0).toFixed(2)}€
                          </div>
                          <div className="col-span-3 text-right font-mono text-sm text-emerald-700">
                            {editingEntry.lines.reduce((sum, l) => sum + (l.credit || 0), 0).toFixed(2)}€
                          </div>
                          <div className="col-span-1"></div>
                        </div>
                      </div>
                      
                      {/* Balance Check */}
                      {(() => {
                        const totalDebit = editingEntry.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
                        const totalCredit = editingEntry.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
                        const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
                        
                        return (
                          <div className={`p-3 rounded-lg flex items-center gap-2 ${
                            isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {isBalanced ? (
                              <><Check className="w-4 h-4" /> El asiento está cuadrado</>
                            ) : (
                              <><AlertTriangle className="w-4 h-4" /> Descuadre de {Math.abs(totalDebit - totalCredit).toFixed(2)}€</>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="px-4 py-2 text-sm text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
                      title="Guarda el asiento sin validar el cuadre"
                    >
                      <Clock className="w-4 h-4 text-slate-400" /> Guardar borrador
                    </button>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                      <button 
                        type="submit" 
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={(() => {
                          const totalDebit = editingEntry.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
                          const totalCredit = editingEntry.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
                          return Math.abs(totalDebit - totalCredit) >= 0.01;
                        })()}
                      >
                          <Save className="w-4 h-4"/> Guardar Asiento
                      </button>
                    </div>
                </div>
            </form>
        </div>
      )}
    </div>
  );
};
