import React from 'react';
import { LayoutDashboard, FileText, BookOpen, PieChart, Settings, FileCheck, Scale } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export const Sidebar: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FileText, label: 'Facturas', path: '/invoices' },
    { icon: BookOpen, label: 'Libros Contables', path: '/books' },
    { icon: Scale, label: 'Conciliación Banco', path: '/reconciliation' },
    { icon: FileCheck, label: 'Modelos Fiscales', path: '/taxes' },
    { icon: Settings, label: 'Configuración', path: '/settings' },
  ];

  return (
    <aside className="hidden md:flex w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex-col shadow-xl z-30">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">
            G
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">CBGest</h1>
            <p className="text-xs text-slate-300">Cataluña Edition</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1">
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

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-lg p-4">
          <p className="text-xs text-slate-300 mb-2">Bitácora Estado</p>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-xs font-mono text-emerald-400">ONLINE</span>
          </div>
        </div>
      </div>
    </aside>
  );
};