import React from 'react';
import { Bell, Search, User, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  isLocalFileMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isLocalFileMode }) => {
  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-4 w-full md:w-1/3">
        {/* Mobile Logo/Menu Placeholder */}
        <div className="md:hidden flex items-center gap-2 mr-2">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-sm">G</div>
        </div>

        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4 ml-2">
        {isLocalFileMode && (
            <div className="hidden md:flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full border border-blue-100" title="Base de Datos Encriptada Activa">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-xs font-bold tracking-wide">SECURE MODE</span>
            </div>
        )}
        
        <button className="relative p-2 hover:bg-slate-100 rounded-full transition-colors">
          <Bell className="w-5 h-5 text-slate-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
        </button>
        <div className="flex items-center gap-3 pl-2 md:pl-4 md:border-l border-slate-200">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium text-slate-900">Admin Gestor</p>
            <p className="text-xs text-slate-500">CB Cataluña Norte</p>
          </div>
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center border border-blue-200">
            <User className="w-4 h-4 text-blue-600" />
          </div>
        </div>
      </div>
    </header>
  );
};