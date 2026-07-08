import React, { useState, useRef, useMemo } from 'react';
import {
  Upload, Calendar, Home, Users, Euro, Search, Filter,
  ChevronDown, ChevronUp, X, Check, AlertTriangle, FileText,
  Download, Trash2, Edit2, Save, XCircle, Receipt, Wallet, CalendarDays, Baby
} from 'lucide-react';
import { Reservation, ReservationChannel, ReservationStatus, Apartment, AppSettings } from '../types';
import { useToast } from './Toast';
import { DEFAULT_TAX_CONFIG } from '../config/defaultSettings';
import { useIsReadOnly } from '../context/FiscalYearContext';

interface ReservationManagerProps {
  reservations: Reservation[];
  apartments: Apartment[];
  settings?: AppSettings;
  onAddReservations: (reservations: Omit<Reservation, 'id'>[]) => void;
  onUpdateReservation: (id: string, data: Partial<Reservation>) => void;
  onDeleteReservation: (id: string) => void;
  onLinkApartment: (reservationId: string, apartmentId: string) => void;
}

type SortField = 'checkIn' | 'checkOut' | 'totalAmount' | 'nights' | 'apartmentName';
type SortOrder = 'asc' | 'desc';

// Parse Spanish number format (1.234,56 -> 1234.56)
const parseSpanishNumber = (value: string): number => {
  if (!value || value.trim() === '') return 0;
  // Remove thousands separator (.) and replace decimal comma with dot
  const normalized = value.trim()
    .replace(/\./g, '')  // Remove thousands separators
    .replace(',', '.');   // Replace decimal comma
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
};

// Extract initials from full name (GDPR compliant)
const extractInitials = (fullName: string): string => {
  if (!fullName || fullName.trim() === '') return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase() + '.';
  }
  return parts.map(p => p.charAt(0).toUpperCase()).join('.') + '.';
};

// Map channel string to ReservationChannel type
const mapChannel = (channel: string): ReservationChannel => {
  const normalized = channel.toLowerCase().trim();
  if (normalized.includes('booking')) return 'Booking';
  if (normalized.includes('airbnb')) return 'Airbnb';
  if (normalized.includes('direct') || normalized.includes('directo')) return 'Direct';
  if (normalized.includes('agoda')) return 'Agoda';
  if (normalized.includes('vrbo') || normalized.includes('homeaway')) return 'Vrbo';
  return 'Other';
};

// Map status string to ReservationStatus type
const mapStatus = (status: string): ReservationStatus => {
  const normalized = status.toLowerCase().trim();
  if (normalized === 'new' || normalized === 'nuevo' || normalized === 'nueva') return 'New';
  if (normalized === 'confirmed' || normalized === 'confirmado' || normalized === 'confirmada') return 'Confirmed';
  if (normalized === 'paid' || normalized === 'pagado' || normalized === 'pagada') return 'Paid';
  if (normalized === 'paidcc' || normalized === 'pagadocc') return 'PaidCC';
  if (normalized === 'cancelled' || normalized === 'cancelado' || normalized === 'cancelada') return 'Cancelled';
  if (normalized === 'completed' || normalized === 'completado' || normalized === 'completada') return 'Completed';
  return 'New';
};

// Parse CSV line (handles quoted fields)
const parseCSVLine = (line: string, separator: string = ';'): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

// Channel badge colors
const channelColors: Record<ReservationChannel, string> = {
  Booking: 'bg-blue-100 text-blue-700 border-blue-200',
  Airbnb: 'bg-rose-100 text-rose-700 border-rose-200',
  Direct: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Agoda: 'bg-purple-100 text-purple-700 border-purple-200',
  Vrbo: 'bg-amber-100 text-amber-700 border-amber-200',
  Other: 'bg-slate-100 text-slate-700 border-slate-200'
};

// Status badge colors
const statusColors: Record<ReservationStatus, string> = {
  New: 'bg-sky-100 text-sky-700',
  Confirmed: 'bg-indigo-100 text-indigo-700',
  Paid: 'bg-emerald-100 text-emerald-700',
  PaidCC: 'bg-teal-100 text-teal-700',
  Cancelled: 'bg-red-100 text-red-700',
  Completed: 'bg-slate-100 text-slate-700'
};

export const ReservationManager: React.FC<ReservationManagerProps> = ({
  reservations,
  apartments,
  settings,
  onAddReservations,
  onUpdateReservation,
  onDeleteReservation,
  onLinkApartment
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast, showConfirm } = useToast();
  const isReadOnly = useIsReadOnly();
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<Omit<Reservation, 'id'>[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterChannel, setFilterChannel] = useState<ReservationChannel | 'ALL'>('ALL');
  const [filterApartment, setFilterApartment] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<SortField>('checkIn');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false); // Ocultar canceladas por defecto
  
  // Date filter state
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  
  // Editing guests state (adults)
  const [editingGuestsId, setEditingGuestsId] = useState<string | null>(null);
  const [editingGuestsValue, setEditingGuestsValue] = useState<number>(1);
  
  // Editing children state (minors ≤16 years - exempt from tourist tax)
  const [editingChildrenId, setEditingChildrenId] = useState<string | null>(null);
  const [editingChildrenValue, setEditingChildrenValue] = useState<number>(0);
  
  // Get tax config
  const taxConfig = settings?.touristTaxConfig || DEFAULT_TAX_CONFIG;

  // Parse CSV file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');

      const parsed: Omit<Reservation, 'id'>[] = [];
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i], ';');

        // Expected columns based on user's format:
        // 0: Alojamiento, 1: llegada, 2: salida, 3: (empty), 4: noches,
        // 5: precio noche, 6: total, 7: paid amount, 8: nombre cliente,
        // 9: domicilio, 10: e-mail, 11: telefono, 12: (empty),
        // 13: canal, 14: numero de reserva, 15: estado, 16: (empty), 17: numero presupuesto

        if (fields.length < 15) {
          errors.push(`Línea ${i + 1}: formato inválido (${fields.length} campos)`);
          continue;
        }

        const apartmentName = fields[0] || '';
        const checkIn = fields[1] || '';
        const checkOut = fields[2] || '';
        const nights = parseInt(fields[4]) || 0;
        const pricePerNight = parseSpanishNumber(fields[5]);
        const totalAmount = parseSpanishNumber(fields[6]);
        const paidAmount = parseSpanishNumber(fields[7]);
        const guestName = fields[8] || '';
        const channel = fields[13] || '';
        const reservationNumber = fields[14] || '';
        const status = fields[15] || 'New';

        // Validate required fields
        if (!apartmentName || !checkIn || !checkOut) {
          errors.push(`Línea ${i + 1}: faltan campos obligatorios`);
          continue;
        }

        // Try to match apartment
        const apartmentNameLower = apartmentName.toLowerCase();
        const matchedApartment = apartments.find(apt => {
          const aptNameLower = apt.name?.toLowerCase() || '';
          const aptCodeLower = apt.code?.toLowerCase() || '';
          return aptNameLower.includes(apartmentNameLower) ||
                 apartmentNameLower.includes(aptNameLower) ||
                 (aptCodeLower && aptCodeLower === apartmentNameLower);
        });

        // Calculate nights if not provided, handling invalid dates
        let calculatedNights = nights;
        if (!calculatedNights || calculatedNights <= 0) {
          const checkInDate = new Date(checkIn);
          const checkOutDate = new Date(checkOut);
          if (!isNaN(checkInDate.getTime()) && !isNaN(checkOutDate.getTime())) {
            calculatedNights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
          } else {
            calculatedNights = 1; // Default fallback
          }
        }

        // Parse number of guests from CSV if available (column index may vary)
        // NoBeds typically includes guests in a specific column
        const numberOfGuestsRaw = fields[9] || '1'; // Adjust index based on your CSV format
        const numberOfGuests = parseInt(numberOfGuestsRaw) || 1;
        
        parsed.push({
          apartmentId: matchedApartment?.id,
          apartmentName,
          checkIn,
          checkOut,
          nights: calculatedNights > 0 ? calculatedNights : 1,
          pricePerNight,
          totalAmount: totalAmount || (pricePerNight * calculatedNights),
          paidAmount,
          channel: mapChannel(channel),
          reservationNumber,
          status: mapStatus(status),
          guestInitials: extractInitials(guestName),
          guestName: guestName, // Keep full name for consecutive stay detection
          numberOfGuests: numberOfGuests,
          numberOfChildren: 0, // Default, editable in app
          touristTaxAmount: 0, // Will be calculated
          touristTaxCollected: false,
          touristTaxNightsCounted: 0,
          depositAmount: 0, // Will be set based on apartment type
          depositCollected: false,
          depositReturned: false,
          depositRetainedAmount: 0,
          importedAt: new Date().toISOString()
        });
      }

      if (errors.length > 0 && parsed.length === 0) {
        setImportError(`Errores al importar:\n${errors.slice(0, 5).join('\n')}`);
      } else {
        setImportPreview(parsed);
        if (errors.length > 0) {
          console.warn('Algunas líneas tuvieron errores:', errors);
        }
      }
    } catch (err) {
      setImportError(`Error al leer el archivo: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Confirm import
  const confirmImport = () => {
    if (importPreview && importPreview.length > 0) {
      onAddReservations(importPreview);
      setImportPreview(null);
    }
  };

  // Cancel import
  const cancelImport = () => {
    setImportPreview(null);
    setImportError(null);
  };

  // Filter and sort reservations
  const filteredReservations = useMemo(() => {
    let result = [...reservations];

    // IMPORTANTE: Ocultar reservas canceladas por defecto
    // Solo se muestran si showCancelled es true O si se filtra específicamente por Cancelled
    if (!showCancelled && filterStatus !== 'Cancelled') {
      result = result.filter(r => r.status !== 'Cancelled');
    }

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.apartmentName?.toLowerCase().includes(term) ||
        r.reservationNumber?.toLowerCase().includes(term) ||
        r.guestInitials?.toLowerCase().includes(term)
      );
    }

    // Filter by channel
    if (filterChannel !== 'ALL') {
      result = result.filter(r => r.channel === filterChannel);
    }

    // Filter by apartment
    if (filterApartment !== 'ALL') {
      result = result.filter(r => r.apartmentId === filterApartment);
    }

    // Filter by status
    if (filterStatus !== 'ALL') {
      result = result.filter(r => r.status === filterStatus);
    }

    // Filter by date range (check-in date)
    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom);
      result = result.filter(r => {
        const checkInDate = new Date(r.checkIn);
        return !isNaN(checkInDate.getTime()) && checkInDate >= fromDate;
      });
    }
    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999); // Include the entire day
      result = result.filter(r => {
        const checkInDate = new Date(r.checkIn);
        return !isNaN(checkInDate.getTime()) && checkInDate <= toDate;
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'checkIn': {
          const dateA = a.checkIn ? new Date(a.checkIn).getTime() : 0;
          const dateB = b.checkIn ? new Date(b.checkIn).getTime() : 0;
          comparison = (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
          break;
        }
        case 'checkOut': {
          const dateA = a.checkOut ? new Date(a.checkOut).getTime() : 0;
          const dateB = b.checkOut ? new Date(b.checkOut).getTime() : 0;
          comparison = (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
          break;
        }
        case 'totalAmount':
          comparison = (a.totalAmount || 0) - (b.totalAmount || 0);
          break;
        case 'nights':
          comparison = (a.nights || 0) - (b.nights || 0);
          break;
        case 'apartmentName':
          comparison = (a.apartmentName || '').localeCompare(b.apartmentName || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [reservations, searchTerm, filterChannel, filterApartment, filterStatus, sortField, sortOrder, showCancelled, filterDateFrom, filterDateTo]);

  // Calculate summary stats
  // IMPORTANTE: Las canceladas NUNCA cuentan en los totales, independientemente de si se muestran
  const stats = useMemo(() => {
    // Filtrar las canceladas para los cálculos de totales
    const activeReservations = filteredReservations.filter(r => r.status !== 'Cancelled');

    const total = activeReservations.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const paid = activeReservations.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
    const nights = activeReservations.reduce((sum, r) => sum + (r.nights || 0), 0);
    const cancelled = filteredReservations.filter(r => r.status === 'Cancelled').length;
    const unlinked = activeReservations.filter(r => !r.apartmentId).length;
    
    // Calculate pernoctaciones (nights × guests) for tourist apartments only
    const pernoctaciones = activeReservations.reduce((sum, r) => {
      const apt = apartments.find(a => a.id === r.apartmentId);
      if (apt?.apartmentType === 'TOURIST') {
        return sum + ((r.nights || 0) * (r.numberOfGuests || 1));
      }
      return sum;
    }, 0);
    
    // Tourist tax stats
    const taxCollected = activeReservations.reduce((sum, r) => {
      if (r.touristTaxCollected) {
        return sum + (r.touristTaxAmount || 0);
      }
      return sum;
    }, 0);
    
    const taxPending = activeReservations.reduce((sum, r) => {
      if (!r.touristTaxCollected) {
        return sum + (r.touristTaxAmount || 0);
      }
      return sum;
    }, 0);

    // count es solo de reservas activas (no canceladas)
    return { total, paid, nights, count: activeReservations.length, cancelled, unlinked, pernoctaciones, taxCollected, taxPending };
  }, [filteredReservations, apartments]);

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Format date for display (dd/mm/aaaa)
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Reservas</h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Gestiona las reservas
          </p>
        </div>

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            className="absolute w-0 h-0 opacity-0 overflow-hidden"
            style={{ position: 'absolute', left: '-9999px' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || isReadOnly}
            className="flex items-center gap-2 px-3 py-2 md:px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">{importing ? 'Importando...' : 'Importar CSV'}</span>
            <span className="sm:hidden">{importing ? '...' : 'CSV'}</span>
          </button>
        </div>
      </div>

      {/* Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Vista previa de importación
                </h3>
                <p className="text-sm text-slate-500">
                  {importPreview.length} reservas encontradas
                </p>
              </div>
              <button onClick={cancelImport} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Alojamiento</th>
                    <th className="text-left p-2">Entrada</th>
                    <th className="text-left p-2">Salida</th>
                    <th className="text-right p-2">Noches</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-left p-2">Canal</th>
                    <th className="text-left p-2">Estado</th>
                    <th className="text-center p-2">Vinculado</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 50).map((res, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="p-2">{res.apartmentName}</td>
                      <td className="p-2">{formatDate(res.checkIn)}</td>
                      <td className="p-2">{formatDate(res.checkOut)}</td>
                      <td className="p-2 text-right">{res.nights}</td>
                      <td className="p-2 text-right font-medium">
                        {res.totalAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td className="p-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${channelColors[res.channel]}`}>
                          {res.channel}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[res.status]}`}>
                          {res.status}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        {res.apartmentId ? (
                          <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.length > 50 && (
                <p className="text-center text-sm text-slate-500 mt-2">
                  ... y {importPreview.length - 50} más
                </p>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="text-sm text-slate-600">
                <span className="font-medium">{importPreview.filter(r => r.apartmentId).length}</span> vinculados,
                <span className="font-medium text-amber-600 ml-1">
                  {importPreview.filter(r => !r.apartmentId).length}
                </span> sin vincular
              </div>
              <div className="flex gap-2">
                <button
                  onClick={cancelImport}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmImport}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Importar {importPreview.length} reservas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Error */}
      {importError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Error al importar</p>
            <pre className="text-xs text-red-700 mt-1 whitespace-pre-wrap">{importError}</pre>
          </div>
          <button onClick={() => setImportError(null)} className="p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Stats Cards - Grid on mobile */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
        <div className="bg-white p-2 md:p-4 rounded-lg md:rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-1 md:gap-2 text-slate-500 text-[10px] md:text-xs mb-0.5 md:mb-1">
            <Calendar className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
            <span>Reservas</span>
          </div>
          <p className="text-base md:text-xl font-bold text-slate-900">{stats.count}</p>
        </div>
        <div className="bg-white p-2 md:p-4 rounded-lg md:rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-1 md:gap-2 text-slate-500 text-[10px] md:text-xs mb-0.5 md:mb-1">
            <Home className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
            <span>Noches</span>
          </div>
          <p className="text-base md:text-xl font-bold text-slate-900">{stats.nights}</p>
        </div>
        <div className="bg-white p-2 md:p-4 rounded-lg md:rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-1 md:gap-2 text-purple-600 text-[10px] md:text-xs mb-0.5 md:mb-1">
            <Users className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
            <span>Pernoc.</span>
          </div>
          <p className="text-base md:text-xl font-bold text-purple-600">{stats.pernoctaciones}</p>
        </div>
        <div className="bg-white p-2 md:p-4 rounded-lg md:rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-1 md:gap-2 text-emerald-600 text-[10px] md:text-xs mb-0.5 md:mb-1">
            <Euro className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
            <span>Total</span>
          </div>
          <p className="text-sm md:text-xl font-bold text-emerald-600 truncate">
            {stats.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-white p-2 md:p-4 rounded-lg md:rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-1 md:gap-2 text-blue-600 text-[10px] md:text-xs mb-0.5 md:mb-1">
            <Euro className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
            <span>Cobrado</span>
          </div>
          <p className="text-sm md:text-xl font-bold text-blue-600 truncate">
            {stats.paid.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-white p-2 md:p-4 rounded-lg md:rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-1 md:gap-2 text-amber-600 text-[10px] md:text-xs mb-0.5 md:mb-1">
            <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
            <span>Pendiente</span>
          </div>
          <p className="text-base md:text-xl font-bold text-amber-600">{stats.unlinked}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 md:p-4 mt-4">
        <div className="flex gap-2 md:gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 md:pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 border rounded-lg text-sm transition-colors whitespace-nowrap ${
              showFilters ? 'bg-slate-100 border-slate-300' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtros</span>
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Canal</label>
                <select
                  value={filterChannel}
                  onChange={e => setFilterChannel(e.target.value as ReservationChannel | 'ALL')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="ALL">Todos los canales</option>
                  <option value="Booking">Booking</option>
                  <option value="Airbnb">Airbnb</option>
                  <option value="Direct">Directo</option>
                  <option value="Agoda">Agoda</option>
                  <option value="Vrbo">Vrbo</option>
                  <option value="Other">Otro</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Apartamento</label>
                <select
                  value={filterApartment}
                  onChange={e => setFilterApartment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="ALL">Todos los apartamentos</option>
                  {apartments.map(apt => (
                    <option key={apt.id} value={apt.id}>
                      {apt.code || apt.name} {apt.apartmentType === 'TOURIST' ? '🏖️' : '🏠'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Estado</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as ReservationStatus | 'ALL')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="ALL">Todos los estados</option>
                  <option value="New">Nuevo</option>
                  <option value="Confirmed">Confirmado</option>
                  <option value="Paid">Pagado</option>
                  <option value="PaidCC">Pagado CC</option>
                  <option value="Cancelled">Cancelado</option>
                  <option value="Completed">Completado</option>
                </select>
              </div>
            </div>
            
            {/* Date Range Filter */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> Desde (Check-in)
                </label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> Hasta (Check-in)
                </label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setFilterDateFrom('');
                    setFilterDateTo('');
                    setFilterChannel('ALL');
                    setFilterApartment('ALL');
                    setFilterStatus('ALL');
                    setSearchTerm('');
                  }}
                  className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
            {/* Checkbox para mostrar canceladas */}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={e => setShowCancelled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-600">
                  Mostrar reservas canceladas
                </span>
                {stats.cancelled > 0 && (
                  <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                    {stats.cancelled} canceladas
                  </span>
                )}
              </label>
              <p className="text-xs text-slate-400 mt-1 ml-6">
                Las reservas canceladas no cuentan en los totales
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Reservations Table */}
      <div className="-mx-4 md:mx-0">
        <div className="bg-white md:rounded-xl border-y md:border border-slate-200 shadow-sm">
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full" style={{ minWidth: '900px' }}>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                  onClick={() => toggleSort('apartmentName')}
                >
                  <div className="flex items-center gap-1">
                    Alojamiento
                    {sortField === 'apartmentName' && (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                  onClick={() => toggleSort('checkIn')}
                >
                  <div className="flex items-center gap-1">
                    Llegada
                    {sortField === 'checkIn' && (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                  onClick={() => toggleSort('checkOut')}
                >
                  <div className="flex items-center gap-1">
                    Salida
                    {sortField === 'checkOut' && (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                  onClick={() => toggleSort('nights')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Noches
                    {sortField === 'nights' && (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Adultos
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Menores
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                  onClick={() => toggleSort('totalAmount')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total
                    {sortField === 'totalAmount' && (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Canal
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Nº Reserva
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No hay reservas</p>
                    <p className="text-xs mt-1">Importa un archivo CSV para comenzar</p>
                  </td>
                </tr>
              ) : (
                filteredReservations.map(reservation => (
                  <tr key={reservation.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!reservation.apartmentId && (
                          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-slate-900 text-sm">
                            {reservation.apartmentName}
                          </p>
                          {reservation.guestInitials && (
                            <p className="text-xs text-slate-400">{reservation.guestInitials}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDate(reservation.checkIn)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDate(reservation.checkOut)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 text-right font-medium">
                      {reservation.nights}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingGuestsId === reservation.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={editingGuestsValue}
                            onChange={e => setEditingGuestsValue(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-14 px-2 py-1 text-sm border border-slate-300 rounded text-center"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              onUpdateReservation(reservation.id, { numberOfGuests: editingGuestsValue });
                              setEditingGuestsId(null);
                            }}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditingGuestsId(null)}
                            className="p-1 text-slate-400 hover:bg-slate-50 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (!isReadOnly) {
                              setEditingGuestsId(reservation.id);
                              setEditingGuestsValue(reservation.numberOfGuests || 1);
                            }
                          }}
                          disabled={isReadOnly}
                          className="flex items-center justify-center gap-1 px-2 py-1 text-sm text-purple-700 hover:bg-purple-50 rounded transition-colors group disabled:cursor-default disabled:hover:bg-transparent"
                          title={isReadOnly ? undefined : 'Clic para editar adultos (≥17 años)'}
                        >
                          <Users className="w-3 h-3 text-purple-400 group-hover:text-purple-600" />
                          {reservation.numberOfGuests || 1}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingChildrenId === reservation.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={editingChildrenValue}
                            onChange={e => setEditingChildrenValue(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-14 px-2 py-1 text-sm border border-slate-300 rounded text-center"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              onUpdateReservation(reservation.id, { numberOfChildren: editingChildrenValue });
                              setEditingChildrenId(null);
                            }}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditingChildrenId(null)}
                            className="p-1 text-slate-400 hover:bg-slate-50 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (!isReadOnly) {
                              setEditingChildrenId(reservation.id);
                              setEditingChildrenValue(reservation.numberOfChildren || 0);
                            }
                          }}
                          disabled={isReadOnly}
                          className={`flex items-center justify-center gap-1 px-2 py-1 text-sm rounded transition-colors group disabled:cursor-default ${
                            (reservation.numberOfChildren || 0) > 0 
                              ? 'text-cyan-700 hover:bg-cyan-50' 
                              : 'text-slate-400 hover:bg-slate-100'
                          } ${isReadOnly ? 'disabled:hover:bg-transparent' : ''}`}
                          title={isReadOnly ? undefined : 'Clic para editar menores (≤16 años, exentos de tasa turística)'}
                        >
                          <Baby className={`w-3 h-3 ${
                            (reservation.numberOfChildren || 0) > 0 
                              ? 'text-cyan-400 group-hover:text-cyan-600' 
                              : 'text-slate-300 group-hover:text-slate-500'
                          }`} />
                          {reservation.numberOfChildren || 0}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-bold text-slate-900 text-sm">
                        {reservation.totalAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </p>
                      <p className="text-xs text-slate-400">
                        {reservation.pricePerNight.toFixed(0)}€/noche
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border ${channelColors[reservation.channel]}`}>
                        {reservation.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${statusColors[reservation.status]}`}>
                        {reservation.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {reservation.reservationNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {!reservation.apartmentId && !isReadOnly && (
                          <div className="relative">
                            <button
                              onClick={() => setLinkingId(linkingId === reservation.id ? null : reservation.id)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                              title="Vincular apartamento"
                            >
                              <Home className="w-4 h-4" />
                            </button>
                            {linkingId === reservation.id && (
                              <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-[160px]">
                                <div className="p-2 text-xs font-medium text-slate-500 border-b border-slate-100">
                                  Vincular a:
                                </div>
                                {apartments.map(apt => (
                                  <button
                                    key={apt.id}
                                    onClick={() => {
                                      onLinkApartment(reservation.id, apt.id);
                                      setLinkingId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Home className="w-3 h-3 text-slate-400" />
                                    {apt.code || apt.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={async () => {
                            if (await showConfirm('¿Estás seguro de eliminar esta reserva?')) {
                              onDeleteReservation(reservation.id);
                            }
                          }}
                          disabled={isReadOnly}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Help Text */}
      <div className="bg-slate-50 rounded-lg p-3 md:p-4 text-sm text-slate-600 mt-4">
        <p className="font-medium mb-1 md:mb-2 text-xs md:text-sm">Formato CSV esperado:</p>
        <p className="text-[10px] md:text-xs text-slate-500 font-mono break-all">
          Alojamiento;llegada;salida;;noches;precio/noche;total;pagado;nombre;...;canal;nº reserva;estado
        </p>
        <p className="text-[10px] md:text-xs text-slate-400 mt-1 md:mt-2">
          Separador: ; • Números: español • Sin cabecera
        </p>
      </div>
    </div>
  );
};
