import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Notification, NotificationContextType, AppSettings } from '../types';
import { useAuth } from './AuthContext';
import { databaseService } from '../services/appwriteService';

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

// Helper to check if using Appwrite
const isUsingAppwrite = (): boolean => {
  try {
    const saved = localStorage.getItem('gestcb_settings');
    if (!saved) return false;
    const settings: AppSettings = JSON.parse(saved);
    return settings.dataConfig?.type === 'APPWRITE' && !!settings.dataConfig.appwriteProjectId;
  } catch {
    return false;
  }
};

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load notifications on mount (from Appwrite or localStorage)
  useEffect(() => {
    const loadNotifications = async () => {
      if (isUsingAppwrite()) {
        try {
          const loadedNotifications = await databaseService.getNotifications();
          setNotifications(loadedNotifications);
        } catch (error) {
          console.error('Error loading notifications from Appwrite:', error);
          // Fallback to empty array
          setNotifications([]);
        }
      } else {
        // Load from localStorage
        const saved = localStorage.getItem('gestcb_notifications');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setNotifications(parsed);
          } catch (error) {
            console.error('Error loading notifications from localStorage:', error);
            setNotifications([]);
          }
        }
      }
      setIsLoading(false);
    };

    loadNotifications();
  }, []);

  // Save notifications (to Appwrite or localStorage) - only in localStorage mode
  useEffect(() => {
    if (isLoading) return; // Don't save during initial load

    if (!isUsingAppwrite()) {
      // Only save to localStorage in LOCAL_STORAGE mode
      localStorage.setItem('gestcb_notifications', JSON.stringify(notifications));
    }
    // In Appwrite mode, individual operations handle persistence
  }, [notifications, isLoading]);

  const addNotification = async (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    // Don't create notification for own actions
    if (user && notification.userId === user.$id) {
      return;
    }

    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false
    };

    if (isUsingAppwrite()) {
      try {
        const savedNotif = await databaseService.createNotification(newNotification);
        setNotifications(prev => [savedNotif, ...prev]);
      } catch (error) {
        console.error('Error creating notification in Appwrite:', error);
        // Fallback to local state
        setNotifications(prev => [newNotification, ...prev]);
      }
    } else {
      setNotifications(prev => [newNotification, ...prev]);
    }
  };

  const markAsRead = async (id: string) => {
    if (isUsingAppwrite()) {
      try {
        const notif = notifications.find(n => n.id === id);
        if (notif) {
          const updated = { ...notif, read: true };
          await databaseService.updateNotification(updated);
          setNotifications(prev =>
            prev.map(n => n.id === id ? updated : n)
          );
        }
      } catch (error) {
        console.error('Error updating notification in Appwrite:', error);
        // Still update local state
        setNotifications(prev =>
          prev.map(notif => notif.id === id ? { ...notif, read: true } : notif)
        );
      }
    } else {
      setNotifications(prev =>
        prev.map(notif => notif.id === id ? { ...notif, read: true } : notif)
      );
    }
  };

  const markAllAsRead = async () => {
    if (isUsingAppwrite()) {
      try {
        // Update all unread notifications
        const unreadNotifs = notifications.filter(n => !n.read);
        await Promise.all(
          unreadNotifs.map(notif =>
            databaseService.updateNotification({ ...notif, read: true })
          )
        );
        setNotifications(prev =>
          prev.map(notif => ({ ...notif, read: true }))
        );
      } catch (error) {
        console.error('Error marking all as read in Appwrite:', error);
        // Still update local state
        setNotifications(prev =>
          prev.map(notif => ({ ...notif, read: true }))
        );
      }
    } else {
      setNotifications(prev =>
        prev.map(notif => ({ ...notif, read: true }))
      );
    }
  };

  const deleteNotification = async (id: string) => {
    if (isUsingAppwrite()) {
      try {
        await databaseService.deleteNotification(id);
        setNotifications(prev => prev.filter(notif => notif.id !== id));
      } catch (error) {
        console.error('Error deleting notification in Appwrite:', error);
        // Still update local state
        setNotifications(prev => prev.filter(notif => notif.id !== id));
      }
    } else {
      setNotifications(prev => prev.filter(notif => notif.id !== id));
    }
  };

  const clearAll = async () => {
    if (isUsingAppwrite()) {
      try {
        await databaseService.deleteAllNotifications();
        setNotifications([]);
      } catch (error) {
        console.error('Error clearing all notifications in Appwrite:', error);
        // Still update local state
        setNotifications([]);
      }
    } else {
      setNotifications([]);
    }
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
