import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, FileSpreadsheet, Check, AlertCircle, ArrowRight, ChevronDown, ChevronUp, Save, RefreshCw, Loader2 } from 'lucide-react';
import readXlsxFile from 'read-excel-file';
import {
  findMatchingMapping,
  saveMapping,
  validateMapping,
} from '../services/xlsxMappingService';
import { storageService } from '../services/appwriteService';

interface XlsxColumnMapperProps {
  /** Base64 data del archivo (legacy - para compatibilidad) */
  base64Data?: string;
  /** ID del archivo en Appwrite Storage (nuevo sistema) */
  storageFileId?: string;
  fileName: string;
  onConfirm: (transactions: { date: string; concept: string; amount: number }[]) => void;
  onCancel: () => void;
}

interface ColumnMapping {
  dateColumn: number | null;
  conceptColumn: number | null;
  amountColumn: number | null;
  // For separate debit/credit columns
  debitColumn: number | null;
  creditColumn: number | null;
}

type AmountMode = 'single' | 'separate';
type SpreadsheetCell = unknown;

// Parse helpers moved outside component - pure functions
const parseDate = (value: unknown): string => {
  if (!value) return '';

  // Handle Date objects (ExcelJS returns actual Date objects for date cells)
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const str = String(value).trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Excel serial number (days since 1900-01-01)
  if (!isNaN(Number(str))) {
    const serial = Number(str);
    // Excel serial date: days since 1899-12-30 (accounts for Excel's fake leap year 1900).
    // BUG-007 fix: use Date.UTC for epoch so that adding ms-per-day is always exactly
    // 24 h regardless of DST transitions, preventing off-by-one around clock changes.
    const excelEpochMs = Date.UTC(1899, 11, 30);
    const dateMs = excelEpochMs + serial * 24 * 60 * 60 * 1000;
    const date = new Date(dateMs);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
};

const parseAmount = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const str = String(value).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
};

export const XlsxColumnMapper: React.FC<XlsxColumnMapperProps> = ({
  base64Data,
  storageFileId,
  fileName,
  onConfirm,
  onCancel
}) => {
  const [rawData, setRawData] = useState<SpreadsheetCell[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataStartRow, setDataStartRow] = useState<number>(1);
  const [mapping, setMapping] = useState<ColumnMapping>({
    dateColumn: null,
    conceptColumn: null,
    amountColumn: null,
    debitColumn: null,
    creditColumn: null
  });
  const [amountMode, setAmountMode] = useState<AmountMode>('single');
  const [error, setError] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [usingSavedMapping, setUsingSavedMapping] = useState(false);
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Parse XLSX on mount and check for saved mapping
  useEffect(() => {
    const parseExcel = async () => {
      try {
        setIsLoading(true);
        let blob: Blob;
        
        // Obtener el blob del archivo - desde Storage o base64
        if (storageFileId) {
          // Nuevo sistema: descargar de Storage
          blob = await storageService.downloadFile(storageFileId);
        } else if (base64Data) {
          // Legacy: convertir base64 a blob
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          blob = new Blob([bytes.buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
        } else {
          setError('No se proporcionó archivo para procesar');
          setIsLoading(false);
          return;
        }

        // read-excel-file returns rows as arrays of cell values
        // It automatically handles dates, numbers, and strings
        const rows = await readXlsxFile(blob);

        if (!rows || rows.length < 2) {
          setError('El archivo no contiene suficientes datos');
          return;
        }

        // Convert to our expected format (array of arrays with any type)
        const data: SpreadsheetCell[][] = rows.map(row =>
          row.map(cell => {
            // read-excel-file already handles most type conversions
            // Dates are returned as Date objects, numbers as numbers
            return cell;
          })
        );

        setRawData(data);

        // Try to auto-detect header row and set initial column names
        const firstRow = data[0] || [];
        const columnNames = firstRow.map((cell: SpreadsheetCell, idx: number) =>
          cell ? String(cell).trim() : `Columna ${idx + 1}`
        );
        setHeaders(columnNames);

        // Check for saved mapping first
        const savedMapping = findMatchingMapping(columnNames);
        if (savedMapping && validateMapping(columnNames, savedMapping)) {
          // Use saved mapping
          setMapping({
            dateColumn: savedMapping.dateColumn,
            conceptColumn: savedMapping.conceptColumn,
            amountColumn: savedMapping.amountColumn,
            debitColumn: savedMapping.debitColumn,
            creditColumn: savedMapping.creditColumn
          });
          setAmountMode(savedMapping.amountMode);
          setDataStartRow(savedMapping.dataStartRow);
          setUsingSavedMapping(true);

          // Auto-process with saved mapping
          setAutoProcessing(true);
          return;
        }

        // No saved mapping - auto-detect columns based on common keywords
        const detectColumn = (keywords: string[]): number | null => {
          for (let i = 0; i < columnNames.length; i++) {
            const name = columnNames[i].toLowerCase();
            if (keywords.some(k => name.includes(k))) return i;
          }
          return null;
        };

        const dateCol = detectColumn(['fecha', 'date', 'f.valor', 'f. valor', 'f.operación', 'f. operación']);
        const conceptCol = detectColumn(['concepto', 'descripción', 'descripcion', 'concept', 'movimiento', 'detalle']);
        const amountCol = detectColumn(['importe', 'amount', 'cantidad', 'monto']);
        const debitCol = detectColumn(['cargo', 'débito', 'debito', 'debe']);
        const creditCol = detectColumn(['abono', 'crédito', 'credito', 'haber']);

        // Determine if we have separate debit/credit or single amount
        if (debitCol !== null || creditCol !== null) {
          setAmountMode('separate');
          setMapping({
            dateColumn: dateCol,
            conceptColumn: conceptCol,
            amountColumn: null,
            debitColumn: debitCol,
            creditColumn: creditCol
          });
        } else {
          setAmountMode('single');
          setMapping({
            dateColumn: dateCol,
            conceptColumn: conceptCol,
            amountColumn: amountCol,
            debitColumn: null,
            creditColumn: null
          });
        }

      } catch (err) {
        console.error('Error parsing XLSX:', err);
        setError('Error al leer el archivo Excel');
      } finally {
        setIsLoading(false);
      }
    };

    parseExcel();
  }, [base64Data, storageFileId]);

  // Preview rows (limited or all)
  const previewRows = useMemo(() => {
    if (rawData.length === 0) return [];
    const maxRows = showAllRows ? rawData.length : Math.min(15, rawData.length);
    return rawData.slice(0, maxRows);
  }, [rawData, showAllRows]);

  // Column options for dropdowns
  const columnOptions = useMemo(() => {
    if (rawData.length === 0) return [];
    const maxCols = Math.max(...rawData.slice(0, 5).map(row => row?.length || 0));
    return Array.from({ length: maxCols }, (_, i) => ({
      value: i,
      label: headers[i] || `Columna ${i + 1}`
    }));
  }, [rawData, headers]);

  // Validation
  const isValid = useMemo(() => {
    if (mapping.dateColumn === null) return false;
    if (amountMode === 'single' && mapping.amountColumn === null) return false;
    if (amountMode === 'separate' && mapping.debitColumn === null && mapping.creditColumn === null) return false;
    return true;
  }, [mapping, amountMode]);

  // Process and confirm (with option to save mapping) - wrapped in useCallback
  const processAndConfirm = useCallback((skipSave: boolean = false) => {
    if (!isValid) return;

    const transactions: { date: string; concept: string; amount: number }[] = [];

    for (let i = dataStartRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.every((cell: SpreadsheetCell) => !cell || String(cell).trim() === '')) continue;

      const date = mapping.dateColumn !== null ? parseDate(row[mapping.dateColumn]) : '';
      if (!date) continue;

      const concept = mapping.conceptColumn !== null
        ? String(row[mapping.conceptColumn] || '').trim()
        : 'Sin concepto';

      let amount = 0;
      if (amountMode === 'single' && mapping.amountColumn !== null) {
        amount = parseAmount(row[mapping.amountColumn]);
      } else if (amountMode === 'separate') {
        const debit = mapping.debitColumn !== null ? Math.abs(parseAmount(row[mapping.debitColumn])) : 0;
        const credit = mapping.creditColumn !== null ? Math.abs(parseAmount(row[mapping.creditColumn])) : 0;

        if (debit > 0) {
          amount = -Math.abs(debit);
        } else if (credit > 0) {
          amount = Math.abs(credit);
        }
      }

      if (amount === 0) continue;

      transactions.push({ date, concept, amount });
    }

    if (transactions.length === 0) {
      setError('No se encontraron transacciones validas con el mapeo seleccionado');
      setAutoProcessing(false);
      return;
    }

    // Save mapping for future use (unless it's already saved)
    if (!skipSave || !usingSavedMapping) {
      saveMapping(headers, {
        dateColumn: mapping.dateColumn,
        conceptColumn: mapping.conceptColumn,
        amountColumn: mapping.amountColumn,
        debitColumn: mapping.debitColumn,
        creditColumn: mapping.creditColumn,
        amountMode,
        dataStartRow
      });
    }

    onConfirm(transactions);
  }, [isValid, dataStartRow, rawData, mapping, amountMode, usingSavedMapping, headers, onConfirm]);

  // Auto-process when we have a saved mapping
  useEffect(() => {
    if (autoProcessing && isValid && rawData.length > 0) {
      // Small delay to show the user what's happening
      const timer = setTimeout(() => {
        processAndConfirm(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoProcessing, isValid, rawData, processAndConfirm]);

  // Handler for manual confirm button
  const handleConfirm = () => {
    processAndConfirm(false);
  };

  // Render column selector
  const renderColumnSelect = (
    label: string,
    value: number | null,
    onChange: (val: number | null) => void,
    required: boolean = false
  ) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`border rounded-lg px-3 py-2 text-sm bg-white ${
          required && value === null ? 'border-red-300' : 'border-slate-200'
        }`}
      >
        <option value="">-- Seleccionar --</option>
        {columnOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
          <h3 className="font-semibold text-lg text-slate-900 mb-2">
            Cargando archivo...
          </h3>
          <p className="text-sm text-slate-500">
            {storageFileId ? 'Descargando desde el servidor...' : 'Procesando archivo...'}
          </p>
        </div>
      </div>
    );
  }

  if (error && rawData.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle className="w-6 h-6" />
            <h3 className="font-semibold text-lg">Error</h3>
          </div>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // Show auto-processing overlay when using saved mapping
  if (autoProcessing && !error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
          <h3 className="font-semibold text-lg text-slate-900 mb-2">
            Procesando automaticamente
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Se encontro un mapeo guardado para este formato de Excel.
            <br />
            Procesando {rawData.length - dataStartRow} filas...
          </p>
          <button
            onClick={() => {
              setAutoProcessing(false);
              setUsingSavedMapping(false);
            }}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Cancelar y configurar manualmente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Mapear Columnas</h3>
              <p className="text-xs sm:text-sm text-slate-500 truncate">{fileName}</p>
            </div>
            {usingSavedMapping && (
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                <Save className="w-3 h-3" /> Mapeo guardado
              </span>
            )}
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Column Mapping Section */}
          <div className="bg-slate-50 rounded-xl p-3 sm:p-4 border border-slate-200">
            <h4 className="font-medium text-slate-900 mb-4">Configuracion de Columnas</h4>

            {/* Amount Mode Toggle */}
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-600 mb-2 block">Formato de Importe</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setAmountMode('single');
                    setMapping(m => ({ ...m, debitColumn: null, creditColumn: null }));
                  }}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    amountMode === 'single'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Una columna
                </button>
                <button
                  onClick={() => {
                    setAmountMode('separate');
                    setMapping(m => ({ ...m, amountColumn: null }));
                  }}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    amountMode === 'separate'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cargo/Abono
                </button>
              </div>
            </div>

            {/* Column Selectors */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {renderColumnSelect(
                'Fecha',
                mapping.dateColumn,
                (val) => setMapping(m => ({ ...m, dateColumn: val })),
                true
              )}

              {renderColumnSelect(
                'Concepto',
                mapping.conceptColumn,
                (val) => setMapping(m => ({ ...m, conceptColumn: val })),
                false
              )}

              {amountMode === 'single' ? (
                renderColumnSelect(
                  'Importe',
                  mapping.amountColumn,
                  (val) => setMapping(m => ({ ...m, amountColumn: val })),
                  true
                )
              ) : (
                <>
                  {renderColumnSelect(
                    'Cargo (Gastos)',
                    mapping.debitColumn,
                    (val) => setMapping(m => ({ ...m, debitColumn: val })),
                    mapping.creditColumn === null
                  )}
                  {renderColumnSelect(
                    'Abono (Ingresos)',
                    mapping.creditColumn,
                    (val) => setMapping(m => ({ ...m, creditColumn: val })),
                    mapping.debitColumn === null
                  )}
                </>
              )}
            </div>

            {/* Data Start Row */}
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Fila donde empiezan los datos (0 = primera fila)
              </label>
              <input
                type="number"
                min={0}
                max={rawData.length - 1}
                value={dataStartRow}
                onChange={(e) => setDataStartRow(Math.max(0, parseInt(e.target.value) || 0))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-24 bg-white"
              />
              <span className="text-xs text-slate-500 ml-2">
                (Normalmente 1 si la fila 0 son cabeceras)
              </span>
            </div>
          </div>

          {/* Preview Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-slate-900">Vista Previa del Archivo</h4>
              <span className="text-xs text-slate-500">
                {rawData.length} filas totales
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 w-12">#</th>
                      {columnOptions.map((col, idx) => (
                        <th
                          key={idx}
                          className={`px-3 py-2 text-left text-xs font-medium min-w-[120px] ${
                            mapping.dateColumn === idx ? 'bg-blue-100 text-blue-700' :
                            mapping.conceptColumn === idx ? 'bg-purple-100 text-purple-700' :
                            mapping.amountColumn === idx ? 'bg-emerald-100 text-emerald-700' :
                            mapping.debitColumn === idx ? 'bg-red-100 text-red-700' :
                            mapping.creditColumn === idx ? 'bg-green-100 text-green-700' :
                            'text-slate-500'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span>{col.label}</span>
                            {mapping.dateColumn === idx && <span className="text-[10px] font-normal">FECHA</span>}
                            {mapping.conceptColumn === idx && <span className="text-[10px] font-normal">CONCEPTO</span>}
                            {mapping.amountColumn === idx && <span className="text-[10px] font-normal">IMPORTE</span>}
                            {mapping.debitColumn === idx && <span className="text-[10px] font-normal">CARGO</span>}
                            {mapping.creditColumn === idx && <span className="text-[10px] font-normal">ABONO</span>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={`border-t border-slate-100 ${
                          rowIdx < dataStartRow ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2 text-xs text-slate-400 font-mono">{rowIdx}</td>
                        {columnOptions.map((_, colIdx) => (
                          <td
                            key={colIdx}
                            className={`px-3 py-2 truncate max-w-[200px] ${
                              mapping.dateColumn === colIdx ? 'bg-blue-50' :
                              mapping.conceptColumn === colIdx ? 'bg-purple-50' :
                              mapping.amountColumn === colIdx ? 'bg-emerald-50' :
                              mapping.debitColumn === colIdx ? 'bg-red-50' :
                              mapping.creditColumn === colIdx ? 'bg-green-50' : ''
                            }`}
                          >
                            {row?.[colIdx] !== undefined ? String(row[colIdx]) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rawData.length > 15 && (
                <button
                  onClick={() => setShowAllRows(!showAllRows)}
                  className="w-full py-2 text-sm text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-1 border-t border-slate-200"
                >
                  {showAllRows ? (
                    <>
                      <ChevronUp className="w-4 h-4" /> Mostrar menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" /> Mostrar todas ({rawData.length} filas)
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Row hint */}
            <p className="text-xs text-slate-500 mt-2">
              Las filas en gris (antes de la fila {dataStartRow}) se ignoraran como cabeceras.
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
          <div className="text-sm text-slate-500">
            {isValid ? (
              <span className="text-emerald-600 flex items-center gap-1">
                <Check className="w-4 h-4" /> Mapeo configurado correctamente
              </span>
            ) : (
              <span className="text-amber-600">Selecciona al menos Fecha e Importe</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 ${
                isValid
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              Procesar <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
