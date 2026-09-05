// frontend/src/hooks/useDesktopNotifications.jsx
import { useCallback, useEffect, useState } from 'react';
import { openAnnouncementHub, resolveAnnouncementHubNavigation } from '../utils/announcementHubEvents';

// Check support synchronously so it's available on first render
const notificationSupported = typeof window !== 'undefined' && 'Notification' in window;

const useDesktopNotifications = () => {
    const [permission, setPermission] = useState(
        notificationSupported ? Notification.permission : 'denied'
    );
    const [isSupported] = useState(notificationSupported);

    // Keep permission state in sync if it changes externally
    useEffect(() => {
        if (!notificationSupported) return;
        setPermission(Notification.permission);
    }, []);

    const requestPermission = useCallback(async () => {
        if (!notificationSupported) return false;
        if (Notification.permission === 'granted') {
            setPermission('granted');
            return true;
        }
        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            return result === 'granted';
        } catch (error) {
            return false;
        }
    }, []);

    const showNotification = useCallback((title, message, options = {}) => {
        if (!notificationSupported || Notification.permission !== 'granted') {
            return null;
        }

        try {
            const notificationTitle = options.useTitleDirectly ? title : 'Byline People';
            const body = options.useTitleDirectly ? message : `${title}: ${message}`;

            const notification = new Notification(notificationTitle, {
                body,
                icon: options.icon || '/favicon.ico',
                badge: '/favicon.ico',
                tag: options.tag || `ams-notification-${Date.now()}`,
                renotify: false,
            });

            notification.onclick = () => {
                window.focus();
                notification.close();

                if (typeof options.onClick === 'function') {
                    options.onClick(options.data);
                    return;
                }

                const hubNav = resolveAnnouncementHubNavigation(options.data?.navigationData);
                if (hubNav) {
                    openAnnouncementHub(hubNav);
                    return;
                }

                if (options.data?.navigationData?.page) {
                    const path = options.data.navigationData.page;
                    window.location.href = path.startsWith('/') ? path : `/${path}`;
                }
            };

            setTimeout(() => notification.close(), 8000);
            return notification;
        } catch (error) {
            console.error('[Desktop Notification] Failed to show:', error);
            return null;
        }
    }, []);

    return { isSupported, permission, requestPermission, showNotification };
};


export default useDesktopNotifications;