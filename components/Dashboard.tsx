
import React, { useState, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, AlertCircle, Calculator, FileText, LucideIcon } from 'lucide-react';
import { ChartWrapper } from './ChartWrapper';
import { Invoice, AppSettings, Partner, PartnerTaxInfo, DisabilityLevel, Apartment, RecurringExpense, Reservation } from '../types';
import { PartnerTaxForm } from './PartnerTaxForm';
import { ExpensesByApartment } from './ExpensesByApartment';
import { ExpenseProjections } from './ExpenseProjections';
import { ProfitabilityByApartment } from './ProfitabilityByApartment';
import { useNavigate } from 'react-router-dom';
import { downloadPDF, generatePartnerCertificate } from '../services/pdfService';
import { sanitizeFileNameSegment } from '../utils/fileHelpers';
import { useToast } from './Toast';

// StatCard component moved OUTSIDE of Dashboard to prevent recreation on each render
// This is critical for performance - components defined inside render functions lose their state on every render
interface StatCardProps {
  title: string;
  amount: number;
  type: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  isRental?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, amount, type, icon: Icon, isRental = false }) => (
  <div className="bg-white p-3 md:p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-4">
      <div className={`p-1 md:p-2 rounded-lg flex-shrink-0 ${
        type === 'positive' ? 'bg-emerald-100 text-emerald-600' :
        type === 'negative' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
      }`}>
        <Icon className="w-3 h-3 md:w-5 md:h-5" />
      </div>
      <span className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-wider truncate">{title}</span>
    </div>
    <h3 className="text-sm md:text-2xl font-bold text-slate-900 truncate">
      {amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
    </h3>
    <p className="text-[8px] md:text-xs text-slate-400 mt-1 md:mt-2 hidden md:block">
        {isRental && title.includes('Neto') ? 'Rendimiento Inmobiliario (YTD)' : 'Acumulado Año Actual'}
    </p>
  </div>
);

interface DashboardProps {
  invoices: Invoice[];
  settings: AppSettings;
  apartments: Apartment[];
  recurringExpenses: RecurringExpense[];
  reservations?: Reservation[];
  onUpdateSettings?: (settings: AppSettings) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ invoices, settings, apartments, recurringExpenses, reservations = [], onUpdateSettings }) => {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { showToast, showConfirm } = useToast();

  // SAFE GUARD: Ensure partners array exists
  const partners = settings.partners || [];

  // --- 1. REAL DATA CALCULATION ---
  
  const isRental = settings.fiscalRegime === 'ALQUILER_EXENTO';

  // Totals for Top Cards
  // BUG-011 fix: apply the same amount selector to both income and expenses so
  // that totals are consistent within each fiscal regime.
  //   ALQUILER_EXENTO: income is VAT-exempt so totalAmount == baseAmount, but
  //     expenses include non-deductible VAT → use totalAmount for expenses.
  //   GENERAL: VAT is fully deductible; only the net base matters everywhere.
  const invoiceAmount = useCallback(
    (inv: { type: string; baseAmount: number; totalAmount: number }) =>
      isRental && inv.type === 'EXPENSE' ? inv.totalAmount : inv.baseAmount,
    [isRental]
  );

  const totalIncome = invoices
    .filter(i => i.type === 'INCOME' && i.status !== 'PENDING')
    .reduce((acc, curr) => acc + invoiceAmount(curr), 0);
  
  const totalExpense = invoices
    .filter(i => i.type === 'EXPENSE' && i.status !== 'PENDING')
    .reduce((acc, curr) => acc + invoiceAmount(curr), 0);

  const netResult = totalIncome - totalExpense;

  // Chart Data Grouping (By Month)
  const chartData = useMemo(() => {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const data = months.map(m => ({ name: m, ingresos: 0, gastos: 0 }));

    invoices.forEach(inv => {
        if (inv.status === 'PENDING') return;
        const date = new Date(inv.date);
        const monthIndex = date.getMonth();
        const amount = invoiceAmount(inv);
        
        if (inv.type === 'INCOME') {
            data[monthIndex].ingresos += amount;
        } else {
            data[monthIndex].gastos += amount;
        }
    });
    
    // Filter out future months or empty tail if desired, or keep full year
    const currentMonth = new Date().getMonth();
    return data.slice(0, currentMonth + 1);
  }, [invoices, invoiceAmount]);


  // --- 2. TAX ESTIMATION LOGIC (COMPLETE IRPF 2024) ---
  const currentYear = new Date().getFullYear();

  // Helper: Calculate disability minimum
  const getDisabilityMinimum = (level: DisabilityLevel): number => {
    switch (level) {
      case 'LEVEL_33_65': return 3000;
      case 'LEVEL_65_PLUS': return 9000;
      case 'LEVEL_65_MOBILITY': return 12000;
      default: return 0;
    }
  };

  // Helper: Calculate children minimum (IRPF Spain 2024)
  const getChildrenMinimum = (info: PartnerTaxInfo): number => {
    const totalChildren = info.childrenUnder3 + info.childrenFrom3To25;
    if (totalChildren === 0) return 0;

    // Base minimums per child (progressive)
    const baseAmounts = [2400, 2700, 4000, 4500]; // 1st, 2nd, 3rd, 4th+
    let minimum = 0;

    for (let i = 0; i < totalChildren; i++) {
      minimum += baseAmounts[Math.min(i, 3)];
    }

    // Additional 2,800€ for children under 3
    minimum += info.childrenUnder3 * 2800;

    // Additional for children with disability (using average 3,000€)
    minimum += info.childrenWithDisability * 3000;

    return minimum;
  };

  // Helper: Calculate ascendants minimum
  const getAscendantsMinimum = (info: PartnerTaxInfo): number => {
    let minimum = 0;

    // Ascendants >65 years: 1,150€ each
    minimum += info.ascendantsOver65 * 1150;

    // Ascendants >75 years: additional 1,400€ (total 2,550€)
    minimum += info.ascendantsOver75 * 1400;

    // Ascendants with disability (using average 3,000€)
    minimum += info.ascendantsWithDisability * 3000;

    return minimum;
  };

  const calculateEstimatedTax = (partner: Partner) => {
    if (!partner.taxInfo) return 0;

    const info = partner.taxInfo;

    // --- 1. GROSS INCOME ---
    // Attributable Yield from CB
    const cbYield = netResult * (partner.participation / 100);

    // Total work income (including CB yield)
    const totalWorkIncome = info.otherWorkIncome + cbYield;

    // Other income (activities, capital gains, etc.)
    const otherIncome = info.otherActivitiesIncome;

    // --- 2. DEDUCTIONS FROM GROSS INCOME ---
    // SS contributions and other deductible expenses
    const deductibleExpenses = info.deductibleExpenses;

    // Pension plan contributions (max 1,500€)
    const pensionContributions = Math.min(info.pensionContributions || 0, 1500);

    // Work income reduction (for incomes < 21,000€)
    let workIncomeReduction = 0;
    if (totalWorkIncome <= 14852) {
      workIncomeReduction = 6498;
    } else if (totalWorkIncome <= 17673.52) {
      workIncomeReduction = 6498 - 1.14 * (totalWorkIncome - 14852);
    } else if (totalWorkIncome <= 21000) {
      // Reduced amount
      workIncomeReduction = 3700;
    }

    // --- 3. TAX BASE (Base Liquidable) ---
    const netWorkIncome = Math.max(0, totalWorkIncome - deductibleExpenses - pensionContributions - workIncomeReduction);
    const taxBase = netWorkIncome + otherIncome;

    if (taxBase <= 0) return 0;

    // --- 4. PERSONAL AND FAMILY MINIMUMS ---
    // Personal minimum (5,550€ base)
    let personalMinimum = 5550;

    // Age adjustment
    const age = currentYear - (info.birthYear || 1980);
    if (age >= 75) {
      personalMinimum += 1400; // Additional for >75
    }
    if (age >= 65) {
      personalMinimum += 1150; // Additional for >65
    }

    // Disability minimum (contributor)
    personalMinimum += getDisabilityMinimum(info.disabilityLevel || 'NONE');

    // Joint declaration minimum
    if (info.jointDeclaration) {
      personalMinimum += 3400;
    }

    // Children minimum
    const childrenMinimum = getChildrenMinimum(info);

    // Ascendants minimum
    const ascendantsMinimum = getAscendantsMinimum(info);

    // Total minimum
    const totalMinimum = personalMinimum + childrenMinimum + ascendantsMinimum;

    // --- 5. PROGRESSIVE TAX BRACKETS (Spain/Catalunya 2024) ---
    const brackets = [
      { limit: 12450, rate: 0.19 },   // 0 - 12,450€
      { limit: 7750, rate: 0.24 },    // 12,450€ - 20,200€
      { limit: 15000, rate: 0.30 },   // 20,200€ - 35,200€
      { limit: 24800, rate: 0.37 },   // 35,200€ - 60,000€
      { limit: Infinity, rate: 0.45 } // > 60,000€
    ];

    // Apply brackets to tax base
    const applyBrackets = (base: number): number => {
      let tax = 0;
      let remaining = base;

      for (const bracket of brackets) {
        if (remaining <= 0) break;
        const taxableAmount = Math.min(remaining, bracket.limit);
        tax += taxableAmount * bracket.rate;
        remaining -= taxableAmount;
      }

      return tax;
    };

    // Tax on base
    const grossTax = applyBrackets(taxBase);

    // Tax reduction from minimums (apply brackets to minimum)
    const minimumReduction = applyBrackets(totalMinimum);

    // --- 6. FINAL TAX ---
    const finalTax = Math.max(0, grossTax - minimumReduction);

    return finalTax;
  };

  // Helper: Check if declaration is mandatory
  const isDeclarationMandatory = (partner: Partner): { mandatory: boolean; reason: string } => {
    if (!partner.taxInfo) return { mandatory: false, reason: 'Sin datos fiscales' };

    const info = partner.taxInfo;
    const cbYield = netResult * (partner.participation / 100);
    const totalWorkIncome = info.otherWorkIncome + cbYield;

    // Multiple payers rule
    const hasMultiplePayers = (info.numberOfPayers || 1) >= 2;
    const secondPayerOver1500 = (info.secondPayerAmount || 0) > 1500;

    // Income limits
    const limit = (hasMultiplePayers && secondPayerOver1500) ? 15000 : 22000;

    if (totalWorkIncome > limit) {
      return {
        mandatory: true,
        reason: hasMultiplePayers && secondPayerOver1500
          ? `Ingresos > ${limit.toLocaleString()}€ (2+ pagadores)`
          : `Ingresos > ${limit.toLocaleString()}€`
      };
    }

    // CB income rule: if CB yields > 1,000€, generally must declare
    if (cbYield > 1000) {
      return { mandatory: true, reason: 'Rendimientos CB > 1.000€' };
    }

    return { mandatory: false, reason: 'Bajo límites de declaración' };
  };

  // --- EVENT HANDLERS ---

  const handleSavePartnerTaxInfo = (id: string, info: PartnerTaxInfo) => {
      if (!onUpdateSettings) {
          showToast("Error: No se puede guardar. Función de actualización no disponible.", "error");
          return;
      }

      const updatedPartners = settings.partners.map(p =>
          p.id === id ? { ...p, taxInfo: info } : p
      );

      onUpdateSettings({
          ...settings,
          partners: updatedPartners
      });

      setSelectedPartnerId(null);
  };

  const handleDownloadPartnerDraft = (partner: Partner) => {
      const fileName = `Borrador_IRPF_${sanitizeFileNameSegment(partner.name)}_${currentYear}.pdf`;
      const draft = generatePartnerCertificate(partner, settings, netResult, currentYear);
      downloadPDF(draft, fileName);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 animate-fade-in pb-24 md:pb-8">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Panel General</h2>
          <p className="text-sm text-slate-500 mt-0.5">
              {isRental ? 'Gestión de Patrimonio Inmobiliario' : 'Resumen financiero y estado de la CB'}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => navigate('/taxes')}
            className="flex-1 sm:flex-none bg-white text-slate-700 px-3 py-2.5 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Informe Trimestral
          </button>
          <button
            onClick={() => navigate('/invoices')}
            className="flex-1 sm:flex-none bg-blue-600 text-white px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 shadow-sm shadow-blue-200 transition-colors whitespace-nowrap"
          >
            Nueva Factura
          </button>
        </div>
      </div>

      {/* 1. KEY METRICS (REAL DATA) */}
      <div className="grid grid-cols-3 gap-2 md:gap-6">
        <StatCard title="Ingresos" amount={totalIncome} type="positive" icon={TrendingUp} isRental={isRental} />
        <StatCard title="Gastos" amount={totalExpense} type="negative" icon={TrendingDown} isRental={isRental} />
        <StatCard title="Neto" amount={netResult} type="neutral" icon={Wallet} isRental={isRental} />
      </div>

      {/* 2. CHARTS (REAL DATA) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-4 md:mb-6">Evolución Tesorería (Real)</h3>
          <ChartWrapper className="h-56 md:h-72" minHeight={224}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(value) => `€${value}`} />
              <Tooltip 
                contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                cursor={{fill: '#f8fafc'}}
                formatter={(value: number) => [`${value.toFixed(2)}€`, '']}
              />
              <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
              <Bar dataKey="gastos" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={32} />
            </BarChart>
          </ChartWrapper>
        </div>

        {/* 3. TAX ESTIMATION WIDGET (NEW) */}
        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-100 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4 md:mb-6">
              <div>
                <h3 className="text-base md:text-lg font-semibold text-slate-900">Estimación IRPF (Renta)</h3>
                <p className="text-[10px] md:text-xs text-slate-500 mt-1">Simulación de cuota a pagar por comunero.</p>
              </div>
              <div className="bg-purple-100 p-1.5 md:p-2 rounded-lg">
                  <Calculator className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {partners.length === 0 && (
                  <div className="text-center py-4 text-slate-400 text-sm">
                      No hay comuneros registrados. Ve a Configuración.
                  </div>
              )}
              
              {partners.map(partner => {
                  const estimatedPay = calculateEstimatedTax(partner);
                  const hasData = !!partner.taxInfo;
                  const declarationStatus = isDeclarationMandatory(partner);
                  const cbYield = netResult * (partner.participation / 100);

                  return (
                      <div key={partner.id} className="p-4 border border-slate-100 rounded-lg bg-slate-50">
                          <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                      {partner.name.charAt(0)}
                                  </div>
                                  <span className="text-sm font-medium text-slate-700">{partner.name}</span>
                              </div>
                              {hasData ? (
                                  <span className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                                      {partner.participation}% Part.
                                  </span>
                              ) : (
                                  <button
                                    onClick={() => setSelectedPartnerId(partner.id)}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                      + Añadir Datos
                                  </button>
                              )}
                          </div>

                          {hasData ? (
                              <>
                                {/* Rendimiento CB atribuible */}
                                <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                                    <span>Rendimiento CB:</span>
                                    <span className="font-medium">{cbYield.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                                </div>

                                {/* Cuota estimada */}
                                <div className="flex justify-between items-end mt-2 pt-2 border-t border-slate-200">
                                    <span className="text-xs text-slate-500">Cuota Estimada:</span>
                                    <span className="text-lg font-bold text-purple-700">
                                        ~{estimatedPay.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                    </span>
                                </div>

                                {/* Obligación de declarar */}
                                <div className={`mt-2 px-2 py-1 rounded text-xs ${
                                  declarationStatus.mandatory
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                    {declarationStatus.mandatory ? '⚠️' : '✓'} {declarationStatus.reason}
                                </div>

                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => setSelectedPartnerId(partner.id)} className="flex-1 text-xs text-slate-500 hover:text-slate-800 bg-white border border-slate-200 py-1 rounded">
                                        Editar Datos
                                    </button>
                                    <button
                                      onClick={() => handleDownloadPartnerDraft(partner)}
                                      className="flex-1 text-xs text-purple-700 hover:text-purple-900 bg-purple-100 border border-purple-200 py-1 rounded flex items-center justify-center gap-1"
                                    >
                                        <FileText className="w-3 h-3" /> Borrador PDF
                                    </button>
                                </div>
                              </>
                          ) : (
                              <div className="text-center py-2">
                                  <p className="text-xs text-slate-400 italic">Faltan datos personales para calcular.</p>
                              </div>
                          )}
                      </div>
                  );
              })}
          </div>
        </div>
      </div>

      {/* 3. EXPENSES BY APARTMENT */}
      <ExpensesByApartment invoices={invoices} apartments={apartments} />

      {/* 4. EXPENSE PROJECTIONS */}
      <ExpenseProjections recurringExpenses={recurringExpenses} apartments={apartments} />

      {/* 5. PROFITABILITY BY APARTMENT */}
      <ProfitabilityByApartment invoices={invoices} apartments={apartments} recurringExpenses={recurringExpenses} reservations={reservations} />

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-amber-800">Avisos Importantes</h4>
          <p className="text-sm text-amber-700 mt-1">
            {isRental 
                ? 'Recuerda solicitar las facturas de suministros a nombre de la CB para deducirlas correctamente en el Modelo 184.'
                : 'El Modelo 303 (IVA) del 3T vence en 15 días.'}
          </p>
        </div>
      </div>

      {/* MODAL FOR PARTNER TAX DATA */}
      {selectedPartnerId && (
          <PartnerTaxForm 
            partner={partners.find(p => p.id === selectedPartnerId)!}
            onSave={(id, info) => handleSavePartnerTaxInfo(id, info)}
            onClose={() => setSelectedPartnerId(null)}
          />
      )}
    </div>
  );
};
