import React, { useState } from 'react';
import { Partner, PartnerTaxInfo, DisabilityLevel } from '../types';
import { X, Save, Calculator, HelpCircle, ChevronDown, ChevronUp, User, Wallet, Users, Heart, PiggyBank } from 'lucide-react';

interface PartnerTaxFormProps {
  partner: Partner;
  onSave: (partnerId: string, taxInfo: PartnerTaxInfo) => void;
  onClose: () => void;
}

// Helper component for tooltips
const Tooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="group relative inline-block ml-1">
    <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
    <div className="invisible group-hover:visible absolute z-50 w-64 p-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg shadow-lg -left-28 bottom-6">
      {text}
      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white border-r border-b border-slate-200 rotate-45"></div>
    </div>
  </div>
);

// Collapsible section component
const FormSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
}> = ({ title, icon, isOpen, onToggle, children, badge }) => (
  <div className="border border-slate-200 rounded-lg overflow-hidden">
    <button
      type="button"
      onClick={onToggle}
      className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-slate-500">{icon}</span>
        <span className="font-medium text-slate-700">{title}</span>
        {badge && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{badge}</span>
        )}
      </div>
      {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
    </button>
    {isOpen && <div className="p-4 space-y-4">{children}</div>}
  </div>
);

// Get current year for age calculation
const currentYear = new Date().getFullYear();

// Migrate old data format to new format
const migrateOldTaxInfo = (oldInfo: Partial<PartnerTaxInfo>): PartnerTaxInfo => {
  return {
    // Datos personales
    birthYear: oldInfo.birthYear || 1980,
    disabilityLevel: oldInfo.disabilityLevel || (oldInfo.disability ? 'LEVEL_33_65' : 'NONE'),

    // Ingresos
    otherWorkIncome: oldInfo.otherWorkIncome || 0,
    otherActivitiesIncome: oldInfo.otherActivitiesIncome || 0,
    numberOfPayers: oldInfo.numberOfPayers || 1,
    secondPayerAmount: oldInfo.secondPayerAmount || 0,

    // Situación familiar
    taxResidency: oldInfo.taxResidency || 'CATALUÑA',
    maritalStatus: oldInfo.maritalStatus || 'SINGLE',
    jointDeclaration: oldInfo.jointDeclaration || false,

    // Hijos - migrar del campo antiguo si existe
    childrenUnder3: oldInfo.childrenUnder3 || 0,
    childrenFrom3To25: oldInfo.childrenFrom3To25 || (oldInfo.childrenCount || 0),
    childrenWithDisability: oldInfo.childrenWithDisability || 0,

    // Ascendientes
    ascendantsOver65: oldInfo.ascendantsOver65 || 0,
    ascendantsOver75: oldInfo.ascendantsOver75 || 0,
    ascendantsWithDisability: oldInfo.ascendantsWithDisability || 0,

    // Deducciones
    deductibleExpenses: oldInfo.deductibleExpenses || 0,
    pensionContributions: oldInfo.pensionContributions || 0,
  };
};

export const PartnerTaxForm: React.FC<PartnerTaxFormProps> = ({ partner, onSave, onClose }) => {
  const [info, setInfo] = useState<PartnerTaxInfo>(
    migrateOldTaxInfo(partner.taxInfo || {})
  );

  // Section states - Start with personal data open
  const [openSections, setOpenSections] = useState({
    personal: true,
    income: false,
    family: false,
    dependents: false,
    deductions: false
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(partner.id, info);
  };

  // Calculate age for display
  const age = currentYear - info.birthYear;

  // Count filled optional sections
  const getSectionBadge = (section: string): string | undefined => {
    switch (section) {
      case 'dependents':
        const totalDependents = info.childrenUnder3 + info.childrenFrom3To25 + info.childrenWithDisability +
                               info.ascendantsOver65 + info.ascendantsOver75 + info.ascendantsWithDisability;
        return totalDependents > 0 ? `${totalDependents}` : undefined;
      case 'deductions':
        const hasDeductions = info.deductibleExpenses > 0 || info.pensionContributions > 0;
        return hasDeductions ? '✓' : undefined;
      default:
        return undefined;
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-fade-in-up flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-lg">
              <Calculator className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Datos Fiscales Personales</h3>
              <p className="text-xs text-slate-500">Simulación IRPF de {partner.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form id="tax-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Info Banner */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
              <p>Introduce tus datos fiscales <strong>personales</strong>. Los rendimientos de la Comunidad de Bienes se calcularán automáticamente según tu participación.</p>
            </div>

            {/* SECTION 1: Personal Data */}
            <FormSection
              title="Datos Personales"
              icon={<User className="w-4 h-4" />}
              isOpen={openSections.personal}
              onToggle={() => toggleSection('personal')}
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                    Año de Nacimiento
                    <Tooltip text="Tu edad afecta al mínimo personal: mayores de 65 años tienen 1.150€ adicionales, y mayores de 75 años tienen 2.550€ adicionales." />
                  </label>
                  <input
                    type="number"
                    value={info.birthYear}
                    onChange={e => setInfo({...info, birthYear: Number(e.target.value)})}
                    min={1920}
                    max={currentYear}
                    className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {age >= 75 ? '≥75 años (+2.550€ mínimo)' : age >= 65 ? '≥65 años (+1.150€ mínimo)' : `${age} años`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                    Discapacidad
                    <Tooltip text="El grado de discapacidad reconocido afecta al mínimo personal y puede generar deducciones adicionales." />
                  </label>
                  <select
                    value={info.disabilityLevel}
                    onChange={e => setInfo({...info, disabilityLevel: e.target.value as DisabilityLevel})}
                    className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900"
                  >
                    <option value="NONE">Sin discapacidad</option>
                    <option value="LEVEL_33_65">33% - 65% (+3.000€)</option>
                    <option value="LEVEL_65_PLUS">≥65% (+9.000€)</option>
                    <option value="LEVEL_65_MOBILITY">≥65% + Movilidad reducida (+12.000€)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Residencia Fiscal
                  </label>
                  <select
                    value={info.taxResidency}
                    onChange={e => setInfo({...info, taxResidency: e.target.value as 'CATALUÑA' | 'OTRA'})}
                    className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900"
                  >
                    <option value="CATALUÑA">Cataluña</option>
                    <option value="OTRA">Otra CCAA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Estado Civil
                  </label>
                  <select
                    value={info.maritalStatus}
                    onChange={e => {
                      const newStatus = e.target.value as 'SINGLE' | 'MARRIED';
                      setInfo({
                        ...info,
                        maritalStatus: newStatus,
                        jointDeclaration: newStatus === 'SINGLE' ? false : info.jointDeclaration
                      });
                    }}
                    className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900"
                  >
                    <option value="SINGLE">Soltero/a / Divorciado/a / Viudo/a</option>
                    <option value="MARRIED">Casado/a</option>
                  </select>
                </div>
              </div>

              {info.maritalStatus === 'MARRIED' && (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="jointDeclaration"
                    checked={info.jointDeclaration}
                    onChange={e => setInfo({...info, jointDeclaration: e.target.checked})}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <label htmlFor="jointDeclaration" className="text-sm text-slate-700 cursor-pointer flex items-center">
                    Declaración conjunta
                    <Tooltip text="La declaración conjunta puede ser beneficiosa si uno de los cónyuges no tiene ingresos o son muy bajos. El mínimo conjunto es de 3.400€." />
                  </label>
                </div>
              )}
            </FormSection>

            {/* SECTION 2: Income */}
            <FormSection
              title="Ingresos y Pagadores"
              icon={<Wallet className="w-4 h-4" />}
              isOpen={openSections.income}
              onToggle={() => toggleSection('income')}
            >
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-xs text-amber-800 mb-2">
                El número de pagadores es importante: si tienes 2+ pagadores y el 2º te pagó más de 1.500€, el límite para estar obligado a declarar baja de 22.000€ a 15.000€.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                    Rendimientos del Trabajo
                    <Tooltip text="Suma de todas tus nóminas brutas anuales, pensiones públicas, prestaciones por desempleo, etc." />
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={info.otherWorkIncome}
                      onChange={e => setInfo({...info, otherWorkIncome: Number(e.target.value)})}
                      className="w-full border-slate-200 rounded-lg pl-8 py-2 text-sm bg-white text-slate-900"
                      placeholder="0.00"
                    />
                    <span className="absolute left-3 top-2 text-slate-400">€</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                    Otros Rendimientos
                    <Tooltip text="Otras actividades económicas, ganancias patrimoniales, rendimientos del capital, etc. (fuera de esta CB)" />
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={info.otherActivitiesIncome}
                      onChange={e => setInfo({...info, otherActivitiesIncome: Number(e.target.value)})}
                      className="w-full border-slate-200 rounded-lg pl-8 py-2 text-sm bg-white text-slate-900"
                      placeholder="0.00"
                    />
                    <span className="absolute left-3 top-2 text-slate-400">€</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                    Nº de Pagadores
                    <Tooltip text="Cuenta cada empresa/entidad que te ha pagado rendimientos del trabajo. La CB cuenta como un pagador adicional." />
                  </label>
                  <select
                    value={info.numberOfPayers}
                    onChange={e => {
                      const payers = Number(e.target.value);
                      setInfo({
                        ...info,
                        numberOfPayers: payers,
                        secondPayerAmount: payers <= 1 ? 0 : info.secondPayerAmount
                      });
                    }}
                    className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900"
                  >
                    <option value={1}>1 pagador</option>
                    <option value={2}>2 pagadores</option>
                    <option value={3}>3 o más pagadores</option>
                  </select>
                </div>

                {info.numberOfPayers >= 2 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                      Suma 2º y siguientes
                      <Tooltip text="Importe bruto total recibido del 2º pagador y siguientes. Si supera 1.500€, el límite para declarar baja a 15.000€." />
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={info.secondPayerAmount}
                        onChange={e => setInfo({...info, secondPayerAmount: Number(e.target.value)})}
                        className="w-full border-slate-200 rounded-lg pl-8 py-2 text-sm bg-white text-slate-900"
                        placeholder="0.00"
                      />
                      <span className="absolute left-3 top-2 text-slate-400">€</span>
                    </div>
                    {info.secondPayerAmount > 1500 && (
                      <p className="text-[10px] text-amber-600 mt-1">⚠️ Límite de declaración: 15.000€</p>
                    )}
                  </div>
                )}
              </div>
            </FormSection>

            {/* SECTION 3: Dependents (Children + Ascendants) */}
            <FormSection
              title="Descendientes y Ascendientes"
              icon={<Users className="w-4 h-4" />}
              isOpen={openSections.dependents}
              onToggle={() => toggleSection('dependents')}
              badge={getSectionBadge('dependents')}
            >
              <div className="space-y-4">
                {/* Children */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-pink-500" /> Hijos
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                        &lt;3 años
                        <Tooltip text="Menores de 3 años: deducción adicional de 2.800€ por cada uno." />
                      </label>
                      <input
                        type="number"
                        value={info.childrenUnder3}
                        onChange={e => setInfo({...info, childrenUnder3: Math.max(0, Number(e.target.value))})}
                        min={0}
                        className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                        3-25 años
                        <Tooltip text="Hijos de 3 a 25 años que convivan y no tengan rentas superiores a 8.000€/año." />
                      </label>
                      <input
                        type="number"
                        value={info.childrenFrom3To25}
                        onChange={e => setInfo({...info, childrenFrom3To25: Math.max(0, Number(e.target.value))})}
                        min={0}
                        className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                        Con discap.
                        <Tooltip text="Hijos con discapacidad reconocida (cualquier edad): mínimos adicionales según grado." />
                      </label>
                      <input
                        type="number"
                        value={info.childrenWithDisability}
                        onChange={e => setInfo({...info, childrenWithDisability: Math.max(0, Number(e.target.value))})}
                        min={0}
                        className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900 text-center"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Mínimos: 1º hijo 2.400€, 2º 2.700€, 3º 4.000€, 4º+ 4.500€. Menores de 3 años: +2.800€
                  </p>
                </div>

                {/* Ascendants */}
                <div className="pt-3 border-t border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-500" /> Ascendientes a cargo
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                        &gt;65 años
                        <Tooltip text="Ascendientes mayores de 65 años que convivan y no tengan rentas >8.000€/año. Mínimo: 1.150€" />
                      </label>
                      <input
                        type="number"
                        value={info.ascendantsOver65}
                        onChange={e => setInfo({...info, ascendantsOver65: Math.max(0, Number(e.target.value))})}
                        min={0}
                        className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                        &gt;75 años
                        <Tooltip text="Ascendientes mayores de 75 años: mínimo adicional de 1.400€ (total 2.550€)." />
                      </label>
                      <input
                        type="number"
                        value={info.ascendantsOver75}
                        onChange={e => setInfo({...info, ascendantsOver75: Math.max(0, Number(e.target.value))})}
                        min={0}
                        className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                        Con discap.
                        <Tooltip text="Ascendientes con discapacidad reconocida: mínimos adicionales según grado." />
                      </label>
                      <input
                        type="number"
                        value={info.ascendantsWithDisability}
                        onChange={e => setInfo({...info, ascendantsWithDisability: Math.max(0, Number(e.target.value))})}
                        min={0}
                        className="w-full border-slate-200 rounded-lg py-2 text-sm bg-white text-slate-900 text-center"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Deben convivir contigo y no tener rentas anuales superiores a 8.000€
                  </p>
                </div>
              </div>
            </FormSection>

            {/* SECTION 4: Deductions */}
            <FormSection
              title="Deducciones y Reducciones"
              icon={<PiggyBank className="w-4 h-4" />}
              isOpen={openSections.deductions}
              onToggle={() => toggleSection('deductions')}
              badge={getSectionBadge('deductions')}
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                    Gastos Deducibles
                    <Tooltip text="Cotizaciones a la Seguridad Social, cuotas sindicales, gastos de defensa jurídica (máx 300€), etc." />
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={info.deductibleExpenses}
                      onChange={e => setInfo({...info, deductibleExpenses: Number(e.target.value)})}
                      className="w-full border-slate-200 rounded-lg pl-8 py-2 text-sm bg-white text-slate-900"
                      placeholder="0.00"
                    />
                    <span className="absolute left-3 top-2 text-slate-400">€</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">SS trabajador, cuotas colegiales obligatorias...</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center">
                    Planes de Pensiones
                    <Tooltip text="Aportaciones a planes de pensiones, planes de previsión asegurados, etc. Límite máximo: 1.500€/año." />
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={info.pensionContributions}
                      onChange={e => setInfo({...info, pensionContributions: Math.min(1500, Number(e.target.value))})}
                      max={1500}
                      className="w-full border-slate-200 rounded-lg pl-8 py-2 text-sm bg-white text-slate-900"
                      placeholder="0.00"
                    />
                    <span className="absolute left-3 top-2 text-slate-400">€</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Máximo legal: 1.500€/año</p>
                </div>
              </div>
            </FormSection>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
          <p className="text-xs text-slate-400">* Cálculo orientativo. Consulta con un asesor fiscal.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="tax-form"
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2 shadow-sm"
            >
              <Save className="w-4 h-4" /> Guardar Datos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
