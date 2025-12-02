import React from 'react';
import { LayoutDashboard, FileText, BookOpen, PieChart, Settings, FileCheck, Scale, Cloud, HardDrive, Wifi, Building2, Home, RefreshCw, CalendarCheck, Bookmark, BarChart3 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  connectionStatus: 'APPWRITE' | 'LOCAL' | 'OFFLINE';
  connectionHealth: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  isLocalFileMode?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ connectionStatus, connectionHealth, isLocalFileMode }) => {
  const location = useLocation();

  // Determine color and animation based on health
  const getStatusColor = () => {
    if (connectionHealth === 'CONNECTED') return 'bg-emerald-500';
    if (connectionHealth === 'RECONNECTING') return 'bg-orange-500';
    return 'bg-red-500'; // DISCONNECTED
  };

  const getStatusTextColor = () => {
    if (connectionHealth === 'CONNECTED') return 'text-emerald-400';
    if (connectionHealth === 'RECONNECTING') return 'text-orange-400';
    return 'text-red-400'; // DISCONNECTED
  };

  const getStatusText = () => {
    if (connectionHealth === 'CONNECTED') return 'Conectado';
    if (connectionHealth === 'RECONNECTING') return 'Reconectando...';
    return 'Desconectado'; // DISCONNECTED
  };

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FileText, label: 'Facturas', path: '/invoices' },
    { icon: Building2, label: 'Proveedores', path: '/suppliers' },
    { icon: Home, label: 'Apartamentos', path: '/apartments' },
    { icon: CalendarCheck, label: 'Reservas', path: '/reservations' },
    { icon: RefreshCw, label: 'Gastos Fijos', path: '/recurring' },
    { icon: BookOpen, label: 'Libro Diario', path: '/books' },
    { icon: Bookmark, label: 'Libro Mayor', path: '/ledger' },
    { icon: BarChart3, label: 'Balance Sumas/Saldos', path: '/trial-balance' },
    { icon: Scale, label: 'Conciliación Banco', path: '/reconciliation' },
    { icon: FileCheck, label: 'Modelos Fiscales', path: '/taxes' },
    { icon: Settings, label: 'Configuración', path: '/settings' },
  ];

  return (
    <aside className="hidden md:flex w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex-col shadow-xl z-30">
      {/* Header - fixed height */}
      <div className="flex-shrink-0 p-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <img 
            src="/assets/logo.png" 
            alt="CBGest" 
            className="w-12 h-14 object-contain"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width="48"
            height="56"
          />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">CBGest</h1>
            <p className="text-xs text-slate-400">Gestión Contable</p>
          </div>
        </div>
      </div>

      {/* Navigation - scrollable area with proper spacing */}
      <nav className="flex-1 min-h-0 py-4 px-3 space-y-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              isActive(item.path) 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon className={`w-5 h-5 ${isActive(item.path) ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Connection Status Widget - always visible at bottom */}
      <div className="flex-shrink-0 p-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-lg p-4">
          <p className="text-xs text-slate-300 mb-2">Estado de Conexión</p>

          {connectionStatus === 'APPWRITE' && (
            <div className="flex items-center gap-2">
              <Cloud className={`w-4 h-4 ${connectionHealth === 'CONNECTED' ? 'text-pink-400' : connectionHealth === 'RECONNECTING' ? 'text-orange-400' : 'text-red-400'}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 ${getStatusColor()} rounded-full animate-pulse`}></span>
                  <span className="text-xs font-mono text-pink-400">APPWRITE CLOUD</span>
                </div>
                <p className={`text-[10px] ${getStatusTextColor()}`}>{getStatusText()}</p>
              </div>
            </div>
          )}

          {connectionStatus === 'LOCAL' && !isLocalFileMode && (
            <div className="flex items-center gap-2">
              <HardDrive className={`w-4 h-4 ${connectionHealth === 'CONNECTED' ? 'text-blue-400' : connectionHealth === 'RECONNECTING' ? 'text-orange-400' : 'text-red-400'}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 ${getStatusColor()} rounded-full ${connectionHealth !== 'DISCONNECTED' ? 'animate-pulse' : ''}`}></span>
                  <span className="text-xs font-mono text-blue-400">LOCAL STORAGE</span>
                </div>
                <p className={`text-[10px] ${getStatusTextColor()}`}>{getStatusText()}</p>
              </div>
            </div>
          )}

          {isLocalFileMode && (
            <div className="flex items-center gap-2">
              <HardDrive className={`w-4 h-4 ${connectionHealth === 'CONNECTED' ? 'text-emerald-400' : connectionHealth === 'RECONNECTING' ? 'text-orange-400' : 'text-red-400'}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 ${getStatusColor()} rounded-full animate-pulse`}></span>
                  <span className={`text-xs font-mono ${getStatusTextColor()}`}>ARCHIVO SEGURO</span>
                </div>
                <p className={`text-[10px] ${getStatusTextColor()}`}>{getStatusText()}</p>
              </div>
            </div>
          )}

          {connectionStatus === 'OFFLINE' && (
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-slate-500" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-xs font-mono text-slate-400">SIN CONEXIÓN</span>
                </div>
                <p className="text-[10px] text-red-400">No configurado</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};