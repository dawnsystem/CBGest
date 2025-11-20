export interface AccountOption {
  code: string;
  name: string;
}

// Plan Contable simplificado y adaptado para CB Inmobiliaria/Turismo
export const ACCOUNT_PLAN: AccountOption[] = [
  // GRUPO 6 - GASTOS
  { code: '600', name: 'Compras de mercaderías' },
  { code: '621', name: 'Arrendamientos y cánones (Alquileres pagados)' },
  { code: '622', name: 'Reparaciones y conservación' },
  { code: '623', name: 'Servicios de profesionales independientes (Gestor, Abogado)' },
  { code: '624', name: 'Transportes' },
  { code: '625', name: 'Primas de seguros (Hogar, RC)' },
  { code: '626', name: 'Servicios bancarios y similares (Comisiones)' },
  { code: '627', name: 'Publicidad, propaganda y RRPP' },
  { code: '628', name: 'Suministros (Luz, Agua, Gas, Internet)' },
  { code: '629', name: 'Otros servicios (Comisiones Booking/Airbnb)' },
  { code: '631', name: 'Otros tributos (IBI, Basuras, Vados)' },
  { code: '640', name: 'Sueldos y salarios' },
  { code: '642', name: 'Seguridad Social a cargo de la empresa' },
  { code: '681', name: 'Amortización del inmovilizado material' },
  
  // GRUPO 7 - INGRESOS
  { code: '705', name: 'Prestación de servicios (Ingresos Alquiler)' },
  { code: '750', name: 'Otros ingresos de gestión' },
  { code: '769', name: 'Otros ingresos financieros' },
  
  // CUENTAS ESPECÍFICAS DE GESTIÓN (Grupo 4/5 para uso directo si procede)
  { code: '470', name: 'Hacienda Pública, deudora por diversos conceptos' },
  { code: '475', name: 'Hacienda Pública, acreedora por conceptos fiscales' },
  { code: '550', name: 'Titular de la explotación' },
  { code: '570', name: 'Caja, euros' },
  { code: '572', name: 'Bancos e instituciones de crédito' },
  
  // ESPECÍFICO TURISMO
  { code: '705.1', name: 'Ingresos Tasa Turística (Si aplica)' },
];