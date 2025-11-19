import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react';
import { Invoice, AppSettings } from '../types';

interface DashboardProps {
  invoices: Invoice[];
  settings: AppSettings;
}

export const Dashboard: React.FC<DashboardProps> = ({ invoices, settings }) => {
  
  // Cálculo condicional de gastos e ingresos según régimen
  const isRental = settings.fiscalRegime === 'ALQUILER_EXENTO';

  const totalIncome = invoices.filter(i => i.type === 'INCOME').reduce((acc, curr) => acc + curr.baseAmount, 0);
  
  const totalExpense = invoices.filter(i => i.type === 'EXPENSE').reduce((acc, curr) => {
    // Si es alquiler exento, el gasto deducible es el TOTAL (base + iva)
    return acc + (isRental ? curr.totalAmount : curr.baseAmount);
  }, 0);

  const netResult = totalIncome - totalExpense;

  const chartData = [
    { name: 'Ene', ingresos: 4000, gastos: 2400 },
    { name: 'Feb', ingresos: 3000, gastos: 1398 },
    { name: 'Mar', ingresos: 2000, gastos: 9800 },
    { name: 'Abr', ingresos: 2780, gastos: 3908 },
    { name: 'May', ingresos: 1890, gastos: 4800 },
    { name: 'Jun', ingresos: 2390, gastos: 3800 },
    { name: 'Jul', ingresos: 3490, gastos: 4300 },
  ];

  const StatCard = ({ title, amount, type, icon: Icon }: any) => (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <span className="text-slate-500 text-sm font-medium uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-lg ${
          type === 'positive' ? 'bg-emerald-100 text-emerald-600' : 
          type === 'negative' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <h3 className="text-2xl font-bold text-slate-900">{amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</h3>
      </div>
      <p className="text-xs text-slate-400 mt-2">
          {isRental && title.includes('Neto') ? 'Rendimiento Inmobiliario' : '+2.5% respecto al mes anterior'}
      </p>
    </div>
  );

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Panel General</h2>
          <p className="text-slate-500">
              {isRental ? 'Gestión de Patrimonio Inmobiliario (Exento IVA)' : 'Resumen financiero y estado de la CB'}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white text-slate-700 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50">
            Informe Trimestral
          </button>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm shadow-blue-200">
            Nueva Factura
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Ingresos Rentas" amount={totalIncome} type="positive" icon={TrendingUp} />
        <StatCard title="Gastos Deducibles" amount={totalExpense} type="negative" icon={TrendingDown} />
        <StatCard title="Resultado Neto" amount={netResult} type="neutral" icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Evolución Tesorería</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(value) => `€${value}`} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
                <Bar dataKey="gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Solo mostramos proyección fiscal IVA si no es Alquiler Exento, o mostramos gráfico de ocupación/rentabilidad si lo es */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">
             {isRental ? 'Rentabilidad Acumulada' : 'Proyección Fiscal (IVA)'}
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip />
                <Line type="monotone" dataKey="ingresos" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff'}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

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
    </div>
  );
};