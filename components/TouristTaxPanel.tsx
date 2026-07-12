import React, { useEffect, useState, useMemo } from 'react';
import {
  Receipt, Calendar, Users, Euro, Download, Check, X,
  AlertTriangle, ChevronDown, ChevronUp, Palmtree, Baby
} from 'lucide-react';
import { Reservation, Apartment, AppSettings } from '../types';
import { DEFAULT_TAX_CONFIG } from '../config/defaultSettings';
import { useIsReadOnly, useFiscalYear } from '../context/FiscalYearContext';

interface TouristTaxPanelProps {
  reservations: Reservation[];
  apartments: Apartment[];
  settings: AppSettings;
  onUpdateReservation: (id: string, data: Partial<Reservation>) => void;
}

// Helper to normalize guest names for comparison
const normalizeGuestName = (name: string | undefined): string => {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
};

/**
 * Check if two ISO date strings represent the same calendar day.
 *
 * BUG-003 fix: compare year/month/day components extracted directly from the
 * YYYY-MM-DD string instead of using setHours(0,0,0,0) on a Date constructed
 * via new Date(isoStr) — that constructor interprets YYYY-MM-DD as UTC midnight,
 * so in UTC+2 the local day is shifted by two hours, breaking areDatesConsecutive
 * for late-night check-outs.
 */
const areDatesConsecutive = (checkOut: string, checkIn: string): boolean => {
  // Extract YYYY-MM-DD part (handles full ISO datetimes too)
  const d1Str = checkOut.substring(0, 10);
  const d2Str = checkIn.substring(0, 10);
  return d1Str === d2Str;
};

// Group consecutive stays by guest
interface ConsecutiveStayGroup {
  id: string;
  guestName: string;
  reservations: Reservation[];
  totalNights: number;
  taxableNights: number; // Max 7
  totalGuests: number;        // Adults (≥17 years) - subject to tourist tax
  totalChildren: number;      // Children (≤16 years) - exempt from tourist tax
  totalTax: number;
  taxableUnits: number;       // Unidades sujetas a tasa: adults × taxableNights
  exemptUnits: number;        // Unidades exentas: children × taxableNights
  allCollected: boolean;
}

export const TouristTaxPanel: React.FC<TouristTaxPanelProps> = ({
  reservations,
  apartments,
  settings,
  onUpdateReservation
}) => {
  const today = new Date();
  const systemCurrentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const { activeFiscalYear } = useFiscalYear();
  const defaultYear = activeFiscalYear?.year ?? systemCurrentYear;
  const yearOptions = useMemo(() => {
    const candidateYears = [
      defaultYear - 1,
      defaultYear,
      defaultYear + 1,
      systemCurrentYear - 1,
      systemCurrentYear
    ];
    const uniqueYears = [...new Set(candidateYears)];
    const minYear = Math.min(...uniqueYears);
    const maxYear = Math.max(...uniqueYears);
    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  }, [defaultYear, systemCurrentYear]);
  
  // Determine current semester
  const defaultSemester = currentMonth <= 6 ? 1 : 2;
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(defaultSemester as 1 | 2);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedYear(defaultYear);
  }, [defaultYear]);
  
  const taxConfig = settings.touristTaxConfig || DEFAULT_TAX_CONFIG;
  const isReadOnly = useIsReadOnly();

  // Filter reservations for selected period and tourist apartments only
  const filteredReservations = useMemo(() => {
    const startMonth = selectedSemester === 1 ? 1 : 7;
    const endMonth = selectedSemester === 1 ? 6 : 12;
    
    const startDate = new Date(selectedYear, startMonth - 1, 1);
    const endDate = new Date(selectedYear, endMonth, 0, 23, 59, 59);
    
    return reservations.filter(r => {
      // Only non-cancelled reservations
      if (r.status === 'Cancelled') return false;
      
      // Check if in tourist apartment
      const apt = apartments.find(a => a.id === r.apartmentId);
      if (!apt || apt.apartmentType !== 'TOURIST') return false;
      
      // Check if check-in is in the selected period
      const checkIn = new Date(r.checkIn);
      return checkIn >= startDate && checkIn <= endDate;
    });
  }, [reservations, apartments, selectedYear, selectedSemester]);

  // Group consecutive stays
  const consecutiveStayGroups = useMemo((): ConsecutiveStayGroup[] => {
    // Sort by guest name and check-in date
    const sorted = [...filteredReservations].sort((a, b) => {
      const nameCompare = normalizeGuestName(a.guestName).localeCompare(normalizeGuestName(b.guestName));
      if (nameCompare !== 0) return nameCompare;
      return new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime();
    });

    const groups: ConsecutiveStayGroup[] = [];
    let currentGroup: Reservation[] = [];
    let currentGuestName = '';

    for (const reservation of sorted) {
      const guestName = normalizeGuestName(reservation.guestName);
      
      if (currentGroup.length === 0) {
        // Start new group
        currentGroup = [reservation];
        currentGuestName = guestName;
      } else if (
        guestName === currentGuestName &&
        areDatesConsecutive(currentGroup[currentGroup.length - 1].checkOut, reservation.checkIn)
      ) {
        // Add to current group (consecutive stay)
        currentGroup.push(reservation);
      } else {
        // Save current group and start new one
        if (currentGroup.length > 0) {
          const totalNights = currentGroup.reduce((sum, r) => sum + (r.nights || 0), 0);
          const taxableNights = Math.min(totalNights, taxConfig.maxNights);
          // BUG-001 fix: SUM guests across all reservations in the stay group,
          // not Math.max — a group of 3 reservations with 2 guests each has 6
          // taxable person-nights, not 2.
          const totalGuests = currentGroup.reduce((sum, r) => sum + (r.numberOfGuests || 1), 0);
          const totalChildren = currentGroup.reduce((sum, r) => sum + (r.numberOfChildren || 0), 0);
          const taxableUnits = taxableNights * totalGuests;
          const exemptUnits = taxableNights * totalChildren;
          const totalTax = taxableUnits * taxConfig.rate;
          const allCollected = currentGroup.every(r => r.touristTaxCollected);
          
          groups.push({
            id: currentGroup.map(r => r.id).join('-'),
            guestName: currentGuestName || 'Huésped',
            reservations: currentGroup,
            totalNights,
            taxableNights,
            totalGuests,
            totalChildren,
            totalTax,
            taxableUnits,
            exemptUnits,
            allCollected
          });
        }
        currentGroup = [reservation];
        currentGuestName = guestName;
      }
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      const totalNights = currentGroup.reduce((sum, r) => sum + (r.nights || 0), 0);
      const taxableNights = Math.min(totalNights, taxConfig.maxNights);
      // BUG-001 fix: SUM guests (same as above)
      const totalGuests = currentGroup.reduce((sum, r) => sum + (r.numberOfGuests || 1), 0);
      const totalChildren = currentGroup.reduce((sum, r) => sum + (r.numberOfChildren || 0), 0);
      const taxableUnits = taxableNights * totalGuests;
      const exemptUnits = taxableNights * totalChildren;
      const totalTax = taxableUnits * taxConfig.rate;
      const allCollected = currentGroup.every(r => r.touristTaxCollected);
      
      groups.push({
        id: currentGroup.map(r => r.id).join('-'),
        guestName: currentGuestName || 'Huésped',
        reservations: currentGroup,
        totalNights,
        taxableNights,
        totalGuests,
        totalChildren,
        totalTax,
        taxableUnits,
        exemptUnits,
        allCollected
      });
    }

    return groups;
  }, [filteredReservations, taxConfig]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalReservations = filteredReservations.length;
    const totalNights = consecutiveStayGroups.reduce((sum, g) => sum + g.totalNights, 0);
    const totalTaxableNights = consecutiveStayGroups.reduce((sum, g) => sum + g.taxableNights, 0);
    // Unidades sujetas a tasa (adultos × noches tasables)
    const totalTaxableUnits = consecutiveStayGroups.reduce((sum, g) => sum + g.taxableUnits, 0);
    // Unidades exentas (menores ≤16 años × noches tasables, máx 7)
    const totalExemptUnits = consecutiveStayGroups.reduce((sum, g) => sum + g.exemptUnits, 0);
    // Total pernoctaciones (adultos + niños)
    const totalPernoctaciones = totalTaxableUnits + totalExemptUnits;
    const totalTaxExpected = consecutiveStayGroups.reduce((sum, g) => sum + g.totalTax, 0);
    const totalTaxCollected = consecutiveStayGroups
      .filter(g => g.allCollected)
      .reduce((sum, g) => sum + g.totalTax, 0);
    const totalTaxPending = totalTaxExpected - totalTaxCollected;
    const groupsCollected = consecutiveStayGroups.filter(g => g.allCollected).length;
    const groupsPending = consecutiveStayGroups.length - groupsCollected;
    
    return {
      totalReservations,
      totalNights,
      totalTaxableNights,
      totalTaxableUnits,
      totalExemptUnits,
      totalPernoctaciones,
      totalTaxExpected,
      totalTaxCollected,
      totalTaxPending,
      groupsCollected,
      groupsPending,
      totalGroups: consecutiveStayGroups.length
    };
  }, [filteredReservations, consecutiveStayGroups]);

  // Toggle group expansion
  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  // Mark group as collected
  const markGroupCollected = (group: ConsecutiveStayGroup) => {
    const today = new Date().toISOString().split('T')[0];
    group.reservations.forEach(r => {
      onUpdateReservation(r.id, {
        touristTaxCollected: true,
        touristTaxCollectedDate: today,
        touristTaxAmount: group.totalTax / group.reservations.length, // Distribute evenly
        touristTaxNightsCounted: Math.min(r.nights || 0, taxConfig.maxNights)
      });
    });
  };

  // Mark group as not collected
  const markGroupNotCollected = (group: ConsecutiveStayGroup) => {
    group.reservations.forEach(r => {
      onUpdateReservation(r.id, {
        touristTaxCollected: false,
        touristTaxCollectedDate: undefined,
        touristTaxAmount: 0,
        touristTaxNightsCounted: 0
      });
    });
  };

  // Export data for IEET
  const exportIEETData = () => {
    const semesterName = selectedSemester === 1 ? 'Ene-Jun' : 'Jul-Dic';
    const headers = [
      'Apartamento',
      'Ref. Catastral',
      'Licencia HUT',
      'Huésped',
      'Check-in',
      'Check-out',
      'Noches',
      'Noches Tasables',
      'Adultos (≥17)',
      'Menores (≤16)',
      'Uds. Sujetas',
      'Uds. Exentas',
      'Tasa (€)',
      'Cobrada'
    ];

    const rows = consecutiveStayGroups.flatMap(group => {
      return group.reservations.map((r, idx) => {
        const apt = apartments.find(a => a.id === r.apartmentId);
        return [
          apt?.name || r.apartmentName || '',
          apt?.cadastralRef || '',
          apt?.licenseNumber || '',
          group.guestName,
          r.checkIn,
          r.checkOut,
          r.nights || 0,
          idx === 0 ? group.taxableNights : 0, // Only count on first reservation of group
          r.numberOfGuests || 1,
          r.numberOfChildren || 0,
          idx === 0 ? group.taxableUnits : 0, // Unidades sujetas (adultos × noches)
          idx === 0 ? group.exemptUnits : 0,  // Unidades exentas (menores × noches)
          idx === 0 ? group.totalTax.toFixed(2) : '0.00',
          group.allCollected ? 'Sí' : 'No'
        ].join(';');
      });
    });

    // Add summary row
    const summaryRow = [
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      totals.totalNights,
      totals.totalTaxableNights,
      '',
      '',
      totals.totalTaxableUnits,
      totals.totalExemptUnits,
      totals.totalTaxExpected.toFixed(2),
      ''
    ].join(';');

    const csv = [headers.join(';'), ...rows, '', summaryRow].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IEET_${selectedYear}_${semesterName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Receipt className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Tasa Turística (IEET)</h2>
              <p className="text-sm text-slate-500">
                Impost sobre Estades en Establiments Turístics
              </p>
            </div>
          </div>
        </div>

          {/* Period Selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            {yearOptions.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setSelectedSemester(1)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                selectedSemester === 1
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              1º Sem (Ene-Jun)
            </button>
            <button
              onClick={() => setSelectedSemester(2)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                selectedSemester === 2
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              2º Sem (Jul-Dic)
            </button>
          </div>
          <button
            onClick={exportIEETData}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">Configuración actual:</p>
            <ul className="list-disc ml-4 space-y-1">
              <li>Tarifa: <strong>{taxConfig.rate}€</strong> por noche y adulto (≥{taxConfig.minAge} años)</li>
              <li><strong>Exentos:</strong> Menores de {taxConfig.minAge} años (≤{taxConfig.minAge - 1}) - se declaran pero no pagan</li>
              <li>Máximo: <strong>{taxConfig.maxNights} noches</strong> por estancia (incluso si es consecutiva)</li>
              <li>Las estancias consecutivas del mismo huésped cuentan como una única estancia</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Calendar className="w-4 h-4" />
            Estancias
          </div>
          <p className="text-2xl font-bold text-slate-900">{totals.totalGroups}</p>
          <p className="text-xs text-slate-400">{totals.totalReservations} reservas</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-sm">
          <div className="flex items-center gap-2 text-purple-600 text-xs mb-1">
            <Users className="w-4 h-4" />
            Uds. Sujetas
          </div>
          <p className="text-2xl font-bold text-purple-600">{totals.totalTaxableUnits}</p>
          <p className="text-xs text-slate-400">Adultos (≥{taxConfig.minAge})</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-cyan-200 shadow-sm">
          <div className="flex items-center gap-2 text-cyan-600 text-xs mb-1">
            <Baby className="w-4 h-4" />
            Uds. Exentas
          </div>
          <p className="text-2xl font-bold text-cyan-600">{totals.totalExemptUnits}</p>
          <p className="text-xs text-slate-400">Menores (≤{taxConfig.minAge - 1})</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600 text-xs mb-1">
            <Euro className="w-4 h-4" />
            A Recaudar
          </div>
          <p className="text-2xl font-bold text-amber-600">
            {totals.totalTaxExpected.toFixed(2)}€
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 text-xs mb-1">
            <Check className="w-4 h-4" />
            Recaudado
          </div>
          <p className="text-2xl font-bold text-emerald-600">
            {totals.totalTaxCollected.toFixed(2)}€
          </p>
          <p className="text-xs text-slate-400">{totals.groupsCollected} estancias</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-rose-600 text-xs mb-1">
            <AlertTriangle className="w-4 h-4" />
            Pendiente
          </div>
          <p className="text-2xl font-bold text-rose-600">
            {totals.totalTaxPending.toFixed(2)}€
          </p>
          <p className="text-xs text-slate-400">{totals.groupsPending} estancias</p>
        </div>
      </div>

      {/* Stays List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Estancias del Período</h3>
        </div>

        {consecutiveStayGroups.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Palmtree className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No hay estancias turísticas en este período</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {consecutiveStayGroups.map(group => (
              <div key={group.id} className="group">
                {/* Group Header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                    group.allCollected ? 'bg-emerald-50/50' : ''
                  }`}
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="flex items-center gap-3">
                    <button className="p-1 hover:bg-slate-200 rounded">
                      {expandedGroups.has(group.id) ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    <div>
                      <p className="font-medium text-slate-900">{group.guestName}</p>
                      <p className="text-xs text-slate-500">
                        {group.reservations.length > 1 
                          ? `${group.reservations.length} reservas consecutivas`
                          : '1 reserva'}
                        {' · '}
                        {group.reservations.map(r => {
                          const apt = apartments.find(a => a.id === r.apartmentId);
                          return apt?.name || r.apartmentName;
                        }).filter((v, i, a) => a.indexOf(v) === i).join(' → ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-purple-600 font-medium" title="Unidades sujetas a tasa">
                          <Users className="w-3 h-3 inline mr-1" />
                          {group.taxableUnits} uds.
                        </span>
                        {group.totalChildren > 0 && (
                          <span className="text-cyan-600 font-medium" title="Unidades exentas">
                            <Baby className="w-3 h-3 inline mr-1" />
                            {group.exemptUnits} exentas
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {group.taxableNights} noches × ({group.totalGuests} ad.{group.totalChildren > 0 && ` + ${group.totalChildren} niños`})
                        {group.totalNights > group.taxableNights && (
                          <span className="text-amber-600 ml-1">
                            (máx. {taxConfig.maxNights})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="text-lg font-bold text-amber-600">{group.totalTax.toFixed(2)}€</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {group.allCollected ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markGroupNotCollected(group);
                          }}
                          disabled={isReadOnly}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <Check className="w-4 h-4" />
                          Cobrada
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markGroupCollected(group);
                          }}
                          disabled={isReadOnly}
                          className="flex items-center gap-1 px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <X className="w-4 h-4" />
                          Pendiente
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedGroups.has(group.id) && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500">
                          <th className="text-left pb-2">Apartamento</th>
                          <th className="text-left pb-2">Check-in</th>
                          <th className="text-left pb-2">Check-out</th>
                          <th className="text-right pb-2">Noches</th>
                          <th className="text-right pb-2">Adultos</th>
                          <th className="text-right pb-2">Menores</th>
                          <th className="text-right pb-2">Canal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.reservations.map(r => {
                          const apt = apartments.find(a => a.id === r.apartmentId);
                          return (
                            <tr key={r.id} className="border-t border-slate-100">
                              <td className="py-2">{apt?.name || r.apartmentName}</td>
                              <td className="py-2">{formatDate(r.checkIn)}</td>
                              <td className="py-2">{formatDate(r.checkOut)}</td>
                              <td className="py-2 text-right">{r.nights}</td>
                              <td className="py-2 text-right">
                                <span className="text-purple-600 font-medium">{r.numberOfGuests || 1}</span>
                              </td>
                              <td className="py-2 text-right">
                                <span className={`font-medium ${(r.numberOfChildren || 0) > 0 ? 'text-cyan-600' : 'text-slate-400'}`}>
                                  {r.numberOfChildren || 0}
                                </span>
                              </td>
                              <td className="py-2 text-right">
                                <span className="text-xs px-2 py-0.5 bg-slate-100 rounded">
                                  {r.channel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
        <p className="font-medium mb-2">📋 Recordatorio de liquidación IEET:</p>
        <ul className="list-disc ml-4 space-y-1 text-xs text-slate-500">
          <li><strong>1º Semestre (Ene-Jun):</strong> Liquidar antes del 20 de Octubre</li>
          <li><strong>2º Semestre (Jul-Dic):</strong> Liquidar antes del 20 de Abril del año siguiente</li>
          <li>Presentación: Portal de la Agència Tributària de Catalunya (Modelo 950)</li>
        </ul>
      </div>
    </div>
  );
};

export default TouristTaxPanel;
