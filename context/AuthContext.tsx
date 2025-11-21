import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser } from '../types';
import { authService, initializeAppwrite } from '../services/appwriteService';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutos en milisegundos

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if user is already logged in on mount or page refresh
  useEffect(() => {
    const checkAuth = async () => {
      // Check if Appwrite is configured by reading settings from localStorage
      const savedSettings = localStorage.getItem('gestcb_settings');
      if (!savedSettings) {
        setLoading(false);
        return;
      }

      try {
        const settings = JSON.parse(savedSettings);
        const isAppwriteEnabled = settings?.dataConfig?.type === 'APPWRITE' &&
                                   settings?.dataConfig?.appwriteProjectId;

        if (!isAppwriteEnabled) {
          setLoading(false);
          return;
        }

        // IMPORTANT: Initialize Appwrite FIRST before trying to get current user
        const endpoint = settings.dataConfig.appwriteEndpoint || 'https://fra.cloud.appwrite.io/v1';
        console.log('🔧 Initializing Appwrite for session check...', {
          endpoint,
          projectId: settings.dataConfig.appwriteProjectId
        });

        initializeAppwrite({
          projectId: settings.dataConfig.appwriteProjectId,
          endpoint,
          databaseId: settings.dataConfig.appwriteDatabaseId || '691f288100019843d43e',
          storageBucketId: settings.dataConfig.appwriteBucketId || 'cbgest-data',
          invoicesCollectionId: 'invoices',
          entriesCollectionId: 'entries',
          transactionsCollectionId: 'transactions',
          settingsCollectionId: 'settings'
        });

        // Now try to restore session from Appwrite
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
        console.log('✅ Session restored from Appwrite:', currentUser.email);
      } catch (error: any) {
        console.log('No active session found:', error?.message || 'Unknown error');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Auto-logout after 15 minutes of inactivity
  useEffect(() => {
    if (!user) return;

    let inactivityTimer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(async () => {
        console.log('⏱️ Session expired due to inactivity (15 min)');
        try {
          await authService.logout();
          setUser(null);
        } catch (error) {
          console.error('Auto-logout error:', error);
        }
      }, INACTIVITY_TIMEOUT);
    };

    // Events that indicate user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    // Reset timer on any user activity
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Start the timer
    resetTimer();

    // Cleanup
    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const loggedInUser = await authService.login(email, password);
      setUser(loggedInUser);
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string) => {
    setLoading(true);
    try {
      const newUser = await authService.register(email, password, name);
      setUser(newUser);
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
