
import React, { useState, useRef, useEffect } from 'react';
import { Bell, Search, User, ShieldCheck, LogOut, X, FileText, BookOpen, DollarSign, Settings as SettingsIcon, LogIn, Lock, LockOpen, ChevronDown } from 'lucide-react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { useToast } from './Toast';
import { NotificationType } from '../types';
import { createLogger } from '../services/logger';

interface HeaderProps {
  isLocalFileMode?: boolean;
}

const headerLogger = createLogger('Header');

export const Header: React.FC<HeaderProps> = ({ isLocalFileMode }) => {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { fiscalYears, activeFiscalYear, selectFiscalYear, isReadOnly } = useFiscalYear();
  const { showToast } = useToast();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showFiscalYearDropdown, setShowFiscalYearDropdown] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const notificationRef = useRef<HTMLDivElement>(null);
  const fiscalYearRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') ?? '');

  // Close fiscal year dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fiscalYearRef.current && !fiscalYearRef.current.contains(event.target as Node)) {
        setShowFiscalYearDropdown(false);
      }
    };
    if (showFiscalYearDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFiscalYearDropdown]);

  // Close notifications panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      headerLogger.error('Error al cerrar sesión', error);
      showToast('Error al cerrar sesión. Por favor, intenta de nuevo.', 'error');
    }
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      navigate('/');
      return;
    }
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'INVOICE_CREATED':
      case 'INVOICE_UPDATED':
      case 'INVOICE_DELETED':
        return <FileText className="w-4 h-4" />;
      case 'ENTRY_CREATED':
      case 'ENTRY_UPDATED':
      case 'ENTRY_DELETED':
        return <BookOpen className="w-4 h-4" />;
      case 'TRANSACTION_ADDED':
        return <DollarSign className="w-4 h-4" />;
      case 'SETTINGS_UPDATED':
        return <SettingsIcon className="w-4 h-4" />;
      case 'USER_LOGIN':
        return <LogIn className="w-4 h-4" />;
      case 'USER_LOGOUT':
        return <LogOut className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: NotificationType) => {
    if (type.includes('DELETED')) return 'text-red-600 bg-red-50';
    if (type.includes('UPDATED')) return 'text-amber-600 bg-amber-50';
    if (type.includes('CREATED') || type.includes('ADDED')) return 'text-emerald-600 bg-emerald-50';
    if (type.includes('LOGIN')) return 'text-blue-600 bg-blue-50';
    return 'text-slate-600 bg-slate-50';
  };

  // useCallback ensures this function is stable across renders
  // BUG-019 fix: both Date.now() and the stored timestamp are UTC epoch
  // milliseconds so the diff is already timezone-agnostic.  For older
  // notifications (>24 h) we now render the full locale date so the user
  // can tell exactly when the event occurred.
  const formatTimestamp = React.useCallback((timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    // For anything older than a day show the actual date in local time
    return new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-3 md:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        {/* Mobile Logo */}
        <div className="md:hidden flex-shrink-0">
             <img 
               src="/assets/logo.png" 
               alt="CBGest" 
               className="w-10 h-12 object-contain"
               loading="eager"
               decoding="async"
               fetchPriority="high"
               width="40"
               height="48"
             />
        </div>

        {/* Search - hidden on very small screens, visible on larger mobile */}
        <form className="relative flex-1 min-w-0 max-w-md hidden xs:block" onSubmit={handleSearchSubmit}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            aria-label="Buscar en la aplicación"
          />
        </form>
      </div>

      <div className="flex items-center gap-1 md:gap-4 flex-shrink-0">
        {isLocalFileMode && (
            <div className="hidden md:flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full border border-blue-100" title="Base de Datos Encriptada Activa">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-xs font-bold tracking-wide">SECURE MODE</span>
            </div>
        )}

        {/* Fiscal Year Selector */}
        {fiscalYears.length > 0 && (
          <div className="relative" ref={fiscalYearRef}>
            <button
              onClick={() => setShowFiscalYearDropdown(!showFiscalYearDropdown)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                isReadOnly
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              }`}
              title={isReadOnly ? 'Ejercicio cerrado — solo consulta' : 'Seleccionar ejercicio'}
            >
              {isReadOnly ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {activeFiscalYear ? `Ej. ${activeFiscalYear.year}` : 'Sin ejercicio'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {showFiscalYearDropdown && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Ejercicios</span>
                  <Link
                    to="/fiscal-years"
                    onClick={() => setShowFiscalYearDropdown(false)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    Gestionar
                  </Link>
                </div>
                <div className="py-1 max-h-64 overflow-y-auto">
                  {[...fiscalYears].sort((a, b) => b.year - a.year).map(fy => (
                    <button
                      key={fy.id}
                      onClick={() => { selectFiscalYear(fy.appwriteId || fy.id); setShowFiscalYearDropdown(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                        (activeFiscalYear?.id === fy.id || activeFiscalYear?.appwriteId === fy.id)
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {fy.status === 'OPEN'
                          ? <LockOpen className="w-3.5 h-3.5 text-emerald-500" />
                          : <Lock className="w-3.5 h-3.5 text-slate-400" />
                        }
                        <span className="font-medium">Ejercicio {fy.year}</span>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        fy.status === 'OPEN'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {fy.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <Bell className="w-5 h-5 text-slate-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
              </span>
            )}
          </button>

          {/* Notifications Panel */}
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-[calc(100vw-1rem)] xs:w-80 sm:w-96 bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden animate-fade-in-up max-h-[70vh] sm:max-h-[600px] flex flex-col -right-1 xs:-right-2 sm:right-0">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Notificaciones</h3>
                  {unreadCount > 0 && (
                    <p className="text-xs text-slate-500">{unreadCount} sin leer</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Marcar todas
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No hay notificaciones</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {notifications.map(notif => (
                      <div
                        key={notif.id}
                        className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer relative ${
                          !notif.read ? 'bg-blue-50/50' : ''
                        }`}
                        onClick={() => {
                          if (!notif.read) {
                            markAsRead(notif.id);
                          }
                        }}
                      >
                        <div className="flex gap-3">
                          <div className={`shrink-0 w-10 h-10 rounded-full ${getNotificationColor(notif.type)} flex items-center justify-center`}>
                            {getNotificationIcon(notif.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-slate-900">{notif.title}</h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNotification(notif.id);
                                }}
                                className="text-slate-400 hover:text-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-xs text-slate-600 mb-1">{notif.message}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span className="font-medium">{notif.userName}</span>
                              <span>•</span>
                              <span>{formatTimestamp(notif.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                        {!notif.read && (
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-600 rounded-full"></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 md:border-l border-slate-200">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium text-slate-900 truncate max-w-[120px]">{user?.name || 'Usuario'}</p>
            <p className="text-xs text-slate-500 truncate max-w-[120px]">{user?.email || 'Invitado'}</p>
          </div>
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center border border-blue-200 flex-shrink-0">
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
            title="Cerrar Sesión"
          >
             <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
