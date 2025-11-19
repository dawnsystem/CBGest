import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, PlusCircle, BookOpen, Settings } from 'lucide-react';

export const MobileNavigation: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 pb-safe md:hidden z-50">
      <div className="flex justify-around items-center h-16 px-2">
        <Link 
          to="/" 
          className={`flex flex-col items-center justify-center w-16 h-full space-y-1 ${isActive('/') ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-medium">Inicio</span>
        </Link>
        
        <Link 
          to="/books" 
          className={`flex flex-col items-center justify-center w-16 h-full space-y-1 ${isActive('/books') ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <BookOpen className="w-6 h-6" />
          <span className="text-[10px] font-medium">Libros</span>
        </Link>

        <Link 
          to="/invoices" 
          className="relative -top-5 bg-blue-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-blue-200 hover:scale-105 transition-transform"
        >
          <PlusCircle className="w-8 h-8" />
        </Link>

        <Link 
          to="/taxes" 
          className={`flex flex-col items-center justify-center w-16 h-full space-y-1 ${isActive('/taxes') ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <FileText className="w-6 h-6" />
          <span className="text-[10px] font-medium">Fiscal</span>
        </Link>

        <Link 
          to="/settings" 
          className={`flex flex-col items-center justify-center w-16 h-full space-y-1 ${isActive('/settings') ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-medium">Ajustes</span>
        </Link>
      </div>
    </div>
  );
};