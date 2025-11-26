import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, PlusCircle, BookOpen, MoreHorizontal, Settings, Building2, Scale, X, CalendarCheck } from 'lucide-react';

export const MobileNavigation: React.FC = () => {
  const location = useLocation();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname === path;
  const isMoreActive = ['/settings', '/suppliers', '/reconciliation', '/reservations'].includes(location.pathname);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);

  // Close menu handler - called when clicking menu links
  // Using useCallback to ensure stable reference for event handlers
  const closeMenu = useCallback(() => setShowMoreMenu(false), []);

  return (
    <>
      {/* More Menu Overlay */}
      {showMoreMenu && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden" onClick={() => setShowMoreMenu(false)} />
      )}

      {/* More Menu Panel */}
      {showMoreMenu && (
        <div
          ref={menuRef}
          className="fixed bottom-20 right-4 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 md:hidden animate-fade-in-up min-w-[200px]"
        >
          <div className="p-2 space-y-1">
            <Link
              to="/suppliers"
              onClick={closeMenu}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/suppliers') ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Building2 className="w-5 h-5" />
              <span className="text-sm font-medium">Proveedores</span>
            </Link>
            <Link
              to="/reservations"
              onClick={closeMenu}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/reservations') ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CalendarCheck className="w-5 h-5" />
              <span className="text-sm font-medium">Reservas</span>
            </Link>
            <Link
              to="/reconciliation"
              onClick={closeMenu}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/reconciliation') ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Scale className="w-5 h-5" />
              <span className="text-sm font-medium">Conciliación</span>
            </Link>
            <Link
              to="/settings"
              onClick={closeMenu}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/settings') ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="text-sm font-medium">Ajustes</span>
            </Link>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
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

          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex flex-col items-center justify-center w-16 h-full space-y-1 ${isMoreActive || showMoreMenu ? 'text-blue-600' : 'text-slate-400'}`}
          >
            {showMoreMenu ? <X className="w-6 h-6" /> : <MoreHorizontal className="w-6 h-6" />}
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </div>
    </>
  );
};