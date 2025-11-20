
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppwriteUser } from '../types';
import { getCurrentUser, logout as apiLogout } from '../services/appwriteService';

interface AuthContextType {
  user: AppwriteUser | null;
  loading: boolean;
  checkSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSession = async () => {
    setLoading(true);
    const currentUser = await getCurrentUser();
    setUser(currentUser as AppwriteUser);
    setLoading(false);
  };

  const signOut = async () => {
    await apiLogout();
    setUser(null);
  };

  useEffect(() => {
    // Initial check
    checkSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, checkSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
