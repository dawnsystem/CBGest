import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Notification, NotificationContextType } from '../types';
import { useAuth } from './AuthContext';
import { protectedDatabase } from '../lib/appwrite/protectedDatabase';
import { generateId } from '../utils/defaults';

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load notifications from Appwrite on mount and when user changes
  useEffect(() => {
    const loadNotifications = async () => {
      setIsLoading(true);

      if (!user) {
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      try {
        const loadedNotifications = await protectedDatabase.getNotifications();
        setNotifications(loadedNotifications);
      } catch (error) {
        console.error('Error cargando notificaciones:', error);
        setNotifications([]);
      }
      setIsLoading(false);
    };

    loadNotifications();
  }, [user]);

  const addNotification = async (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    // Don't create notification for own actions
    if (user && notification.userId === user.$id) {
      return;
    }

    const newNotification: Notification = {
      ...notification,
      id: generateId(),
      timestamp: Date.now(),
      read: false
    };

    try {
      const savedNotif = await protectedDatabase.createNotification(newNotification);
      setNotifications(prev => [savedNotif, ...prev]);
    } catch (error) {
      console.error('Error creating notification:', error);
      // Still add locally for UX even if remote save fails
      setNotifications(prev => [newNotification, ...prev]);
    }
  };

  const markAsRead = async (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      const updated = { ...notif, read: true };
      await protectedDatabase.updateNotification(updated);
      setNotifications(prev =>
        prev.map(n => n.id === id ? updated : n)
      );
    }
  };

  const markAllAsRead = async () => {
    await protectedDatabase.markAllNotificationsRead();
    setNotifications(prev =>
      prev.map(notif => ({ ...notif, read: true }))
    );
  };

  const deleteNotification = async (id: string) => {
    await protectedDatabase.deleteNotification(id);
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  const clearAll = async () => {
    await protectedDatabase.deleteAllNotifications();
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
