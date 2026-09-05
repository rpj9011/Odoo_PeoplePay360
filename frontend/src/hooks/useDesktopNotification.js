import { useEffect, useState, useCallback } from 'react';

const notificationSupported =
  typeof window !== 'undefined' && 'Notification' in window;

/**
 * Custom hook for managing desktop notifications.
 * Reads Notification.permission at call-time (not stale React state).
 */
const useDesktopNotification = () => {
  const [permission, setPermission] = useState(
    notificationSupported ? Notification.permission : 'denied'
  );
  const [isSupported] = useState(notificationSupported);

  useEffect(() => {
    if (!notificationSupported) return;
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!notificationSupported) {
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      setPermission('granted');
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      setPermission('denied');
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.error('[Notification] Permission request failed:', error);
      return 'denied';
    }
  }, []);

  const showNotification = useCallback((title, options = {}) => {
    if (!notificationSupported) {
      return null;
    }

    if (Notification.permission !== 'granted') {
      if (import.meta.env.DEV) {
        console.warn('[Notification] Skipped — permission is', Notification.permission);
      }
      return null;
    }

    if (options.onlyWhenHidden && document.visibilityState === 'visible') {
      return null;
    }

    try {
      const notification = new Notification(title, {
        body: options.body || '',
        icon: options.icon || '/AMS.webp',
        tag: options.tag || `notification-${Date.now()}`,
        requireInteraction: false,
        silent: false,
      });

      if (options.onClick) {
        notification.onclick = (event) => {
          event.preventDefault();
          window.focus();
          options.onClick();
          notification.close();
        };
      }

      setTimeout(() => notification.close(), 5000);
      return notification;
    } catch (error) {
      console.error('[Notification] Failed to show:', error);
      return null;
    }
  }, []);

  const showAnnouncementNotification = useCallback((announcement, onClick) => {
    const senderName =
      announcement.sender?.fullName ||
      `${announcement.sender?.firstName || ''} ${announcement.sender?.lastName || ''}`.trim() ||
      'Someone';

    const body =
      announcement.message.length > 100
        ? announcement.message.substring(0, 100) + '...'
        : announcement.message;

    return showNotification('New Company Announcement', {
      body: `${senderName}: ${body}`,
      icon: '/AMS.webp',
      tag: `announcement-${announcement._id}`,
      onClick:
        onClick ||
        (() => {
          window.focus();
        }),
    });
  }, [showNotification]);

  const showGeneralNotification = useCallback(
    (title, message, onClick) => {
      const body =
        message.length > 100 ? message.substring(0, 100) + '...' : message;

      return showNotification(title, {
        body,
        icon: '/AMS.webp',
        tag: `general-${Date.now()}`,
        onlyWhenHidden: true,
        onClick,
      });
    },
    [showNotification]
  );

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
    showAnnouncementNotification,
    showGeneralNotification,
  };
};

export default useDesktopNotification;
