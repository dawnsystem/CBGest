import React, { useState, useRef, useMemo } from 'react';
import {
  Upload, Calendar, Home, Users, Euro, Search, Filter,
  ChevronDown, ChevronUp, X, Check, AlertTriangle, FileText,
  Download, Trash2, Edit2, Save, XCircle
} from 'lucide-react';
import { Reservation, ReservationChannel, ReservationStatus, Apartment } from '../types';

interface ReservationManagerProps {
  reservations: Reservation[];
  apartments: Apartment[];
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
  onAddReservations,
  onUpdateReservation,
  onDeleteReservation,
  onLinkApartment
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        const matchedApartment = apartments.find(apt =>
          apt.name.toLowerCase().includes(apartmentName.toLowerCase()) ||
          apartmentName.toLowerCase().includes(apt.name.toLowerCase()) ||
          (apt.code && apt.code.toLowerCase() === apartmentName.toLowerCase())
        );

        parsed.push({
          apartmentId: matchedApartment?.id,
          apartmentName,
          checkIn,
          checkOut,
          nights: nights || Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)),
          pricePerNight,
          totalAmount: totalAmount || (pricePerNight * nights),
          paidAmount,
          channel: mapChannel(channel),
          reservationNumber,
          status: mapStatus(status),
          guestInitials: extractInitials(guestName),
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

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.apartmentName.toLowerCase().includes(term) ||
        r.reservationNumber.toLowerCase().includes(term) ||
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

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'checkIn':
          comparison = new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime();
          break;
        case 'checkOut':
          comparison = new Date(a.checkOut).getTime() - new Date(b.checkOut).getTime();
          break;
        case 'totalAmount':
          comparison = a.totalAmount - b.totalAmount;
          break;
        case 'nights':
          comparison = a.nights - b.nights;
          break;
        case 'apartmentName':
          comparison = a.apartmentName.localeCompare(b.apartmentName);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [reservations, searchTerm, filterChannel, filterApartment, filterStatus, sortField, sortOrder]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const total = filteredReservations.reduce((sum, r) => sum + r.totalAmount, 0);
    const paid = filteredReservations.reduce((sum, r) => sum + r.paidAmount, 0);
    const nights = filteredReservations.reduce((sum, r) => sum + r.nights, 0);
    const cancelled = filteredReservations.filter(r => r.status === 'Cancelled').length;
    const unlinked = filteredReservations.filter(r => !r.apartmentId).length;

    return { total, paid, nights, count: filteredReservations.length, cancelled, unlinked };
  }, [filteredReservations]);

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reservas</h2>
          <p className="text-sm text-slate-500 mt-1">
            Gestiona las reservas de tus apartamentos
          </p>
        </div>

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Importando...' : 'Importar CSV'}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Calendar className="w-4 h-4" />
            Reservas
          </div>
          <p className="text-xl font-bold text-slate-900">{stats.count}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Home className="w-4 h-4" />
            Noches
          </div>
          <p className="text-xl font-bold text-slate-900">{stats.nights}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 text-xs mb-1">
            <Euro className="w-4 h-4" />
            Total Facturado
          </div>
          <p className="text-xl font-bold text-emerald-600">
            {stats.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
            <Euro className="w-4 h-4" />
            Cobrado
          </div>
          <p className="text-xl font-bold text-blue-600">
            {stats.paid.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600 text-xs mb-1">
            <AlertTriangle className="w-4 h-4" />
            Sin Vincular
          </div>
          <p className="text-xl font-bold text-amber-600">{stats.unlinked}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por alojamiento, nº reserva..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition-colors ${
              showFilters ? 'bg-slate-100 border-slate-300' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtros
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
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
                    {apt.code || apt.name}
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
        )}
      </div>

      {/* Reservations Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
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
                    Fechas
                    {sortField === 'checkIn' && (
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
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
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
                      {formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 text-right font-medium">
                      {reservation.nights}
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
                        {!reservation.apartmentId && (
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
                          onClick={() => onDeleteReservation(reservation.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
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

      {/* Help Text */}
      <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
        <p className="font-medium mb-2">Formato CSV esperado:</p>
        <p className="text-xs text-slate-500 font-mono">
          Alojamiento;llegada;salida;;noches;precio/noche;total;pagado;nombre;...;canal;nº reserva;estado
        </p>
        <p className="text-xs text-slate-400 mt-2">
          • Separador: punto y coma (;) • Formato números: español (1.234,56) • Sin cabecera
        </p>
      </div>
    </div>
  );
};
