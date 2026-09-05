// frontend/src/services/NewNotificationService.js
import { io } from 'socket.io-client';
import soundService from './soundService';
import { openAnnouncementHub } from '../utils/announcementHubEvents';

class NewNotificationService {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.listeners = new Map();
        this.connectionListeners = new Set();
        
        // Get backend URL - use same origin if not specified (for same-domain deployments)
        // If VITE_SOCKET_URL is set, use it; otherwise use window.location.origin
        this.backendUrl = import.meta.env.VITE_SOCKET_URL || 
            (typeof window !== 'undefined' ? window.location.origin : '');
        
        console.log('[NewNotificationService] Backend URL:', this.backendUrl);
    }

    /**
     * Connect to the notification service
     */
    connect(token, userType = 'team') {
        if (this.socket && this.isConnected) {
            return;
        }
        
        // A2 Hosting: Polling first for better compatibility
        this.socket = io(this.backendUrl, {
            path: '/api/socket.io',
            transports: ['polling', 'websocket'], // Polling first (A2 Hosting compatible)
            timeout: 30000, // 30 seconds (A2 Hosting optimized)
            reconnection: true,
            reconnectionAttempts: 10, // More attempts for A2 Hosting stability
            reconnectionDelay: this.reconnectDelay,
            reconnectionDelayMax: 15000, // Increased for A2 Hosting
            auth: { token },
            forceNew: false, // Don't force new connection
            upgrade: true, // Allow upgrade from polling to websocket if available
            rememberUpgrade: false, // Don't remember failed upgrades (A2 Hosting compatibility)
            withCredentials: true, // Important for cross-origin with credentials
            closeOnBeforeunload: false // Don't close on page unload
        });

        this.setupEventHandlers();
    }

    /**
     * Setup socket event handlers
     */
    setupEventHandlers() {
        if (!this.socket) return;

        // Connection events
        this.socket.on('connect', () => {
            console.log('[NewNotificationService] ✅ Socket connected successfully');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this.notifyConnectionChange(true);
            
            // Set up engine event listeners after connection
            if (this.socket.io && this.socket.io.engine) {
                // Handle WebSocket upgrade failures gracefully
                this.socket.io.engine.on('upgradeError', (error) => {
                    console.warn('[NewNotificationService] WebSocket upgrade failed, continuing with polling');
                    // Note: Polling will continue to work, so we don't need to disable upgrades
                });
            }
        });

        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            this.notifyConnectionChange(false);
        });

        this.socket.on('connect_error', (error) => {
            // Check if this is a WebSocket upgrade error (not critical if polling works)
            const isWebSocketError = error.message.includes('websocket') || 
                                     error.message.includes('WebSocket') ||
                                     error.type === 'TransportError';
            
            // If WebSocket upgrade fails but we're connected via polling, don't treat as error
            if (isWebSocketError && this.isConnected) {
                console.warn('[NewNotificationService] WebSocket upgrade failed (polling is working)');
                return; // Don't disconnect or notify error
            }
            
            // For actual connection errors, handle normally
            this.isConnected = false;
            this.notifyConnectionChange(false);
            
            console.error('[NewNotificationService] Connection error:', error.message);
            console.error('[NewNotificationService] Error details:', {
                message: error.message,
                description: error.description,
                url: this.backendUrl,
                path: '/api/socket.io'
            });
            
            this.reconnectAttempts++;
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
            }
        });

        // Notification events
        this.socket.on('new-notification', (notification) => {
            this.notifyListeners('new-notification', notification);
            this.showBrowserNotification(notification);
        });

        this.socket.on('admin-notification', (notification) => {
            this.notifyListeners('admin-notification', notification);
            this.showBrowserNotification(notification);
        });
    }

    /**
     * Show browser notification
     */
    showBrowserNotification(notification) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        const title = this.getNotificationTitle(notification.type);
        const options = {
            body: notification.message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: `ams-${notification.type}-${notification.id}`,
            renotify: true,
            data: {
                notificationId: notification.id,
                type: notification.type,
                navigationData: notification.navigationData,
                actionData: notification.actionData
            }
        };

        try {
            const browserNotification = new Notification(title, options);
            
            // Play appropriate sound based on notification type
            this.playNotificationSound(notification);
            
            browserNotification.onclick = () => {
                window.focus();
                browserNotification.close();
                
                if (notification.navigationData) {
                    this.handleNotificationClick(notification.navigationData);
                }
            };

            // Auto-close after 8 seconds
            setTimeout(() => {
                browserNotification.close();
            }, 8000);

        } catch (error) {
            console.error('Error showing browser notification:', error);
        }
    }

    /**
     * Get notification title based on type
     */
    getNotificationTitle(type) {
        const titles = {
            checkin: 'Check-in Notification',
            checkout: 'Check-out Notification',
            break_start: 'Break Started',
            break_end: 'Break Ended',
            leave_request: 'Leave Request',
            leave_approval: 'Leave Approved',
            leave_rejection: 'Leave Rejected',
            extra_break_request: 'Extra Break Request',
            extra_break_approval: 'Extra Break Approved',
            extra_break_rejection: 'Extra Break Rejected',
            policy_added: 'New Policy Added',
            policy_updated: 'Policy Updated',
            hr_query_new: 'New HR Query',
            hr_query_response: 'HR Query Message',
            hr_query_status_changed: 'HR Query Status Update',
            system: 'System Notification',
            info: 'Information',
            success: 'Success',
            warning: 'Warning',
            error: 'Error'
        };
        
        return titles[type] || 'AMS Notification';
    }

    /**
     * Play appropriate notification sound based on type
     */
    playNotificationSound(notification) {
        try {
            // Determine sound type based on notification type and metadata
            if (notification.type === 'policy_added' || notification.type === 'policy_updated') {
                // Policy notifications get unique sound
                soundService.playPolicyUpdateSound();
            } else if (notification.type === 'leave_rejection') {
                soundService.playLeaveRejectionSound();
            } else if (notification.type === 'leave_approval' || 
                      notification.type === 'leave_rejection' ||
                      notification.metadata?.fromAdmin) {
                // Admin-to-employee notifications
                soundService.playAdminNotificationSound();
            } else {
                // Regular notifications
                soundService.playNotificationSound();
            }
        } catch (error) {
            console.warn('Error playing notification sound:', error);
        }
    }

    /**
     * Handle notification click navigation
     */
    handleNotificationClick(navigationData, notificationType, metadata) {
        if (!navigationData || !navigationData.page) return;
        
        // Handle HR QUERY notifications
        if (notificationType === 'hr_query_new' || 
            notificationType === 'hr_query_response' || 
            notificationType === 'hr_query_status_changed') {
            // Open the floating chat - it will auto-open the specific query if needed
            // The FAB component will handle the navigation
            window.location.reload(); // Refresh to ensure the FAB picks up the notification
            return;
        }
        
        // Handle POLICY notifications - navigate to profile page
        if (notificationType === 'policy_added' || notificationType === 'policy_updated') {
            const policyId = metadata?.policyId || navigationData?.params?.policyId;
            if (policyId) {
                window.location.href = `/profile?section=policies&policyId=${policyId}`;
            } else {
                window.location.href = '/profile?section=policies';
            }
            return;
        }
        
        // Handle YEAR_END_LEAVE notifications - navigate to year-end tab
        // Check both explicit type and metadata type for compatibility
        const isYearEndLeave = notificationType === 'YEAR_END_LEAVE' || 
                              (notificationType === 'leave_request' && metadata?.type === 'YEAR_END_LEAVE') ||
                              metadata?.type === 'YEAR_END_LEAVE';
        
        if (isYearEndLeave) {
            const requestId = metadata?.requestId || 
                             navigationData?.params?.requestId || 
                             navigationData?.params?.actionId;
            if (requestId) {
                // Navigate to admin leaves page with year-end tab and requestId
                window.location.href = `/admin/leaves?tab=year-end&actionId=${requestId}`;
                return;
            }
            // Fallback to year-end tab
            window.location.href = '/admin/leaves?tab=year-end';
            return;
        }
        
        // Handle YEAR_END_LEAVE_RESPONSE notifications - navigate to employee leaves page
        if (notificationType === 'YEAR_END_LEAVE_RESPONSE' || (notificationType === 'leave_approval' || notificationType === 'leave_rejection') && metadata?.type === 'YEAR_END_LEAVE_RESPONSE') {
            // Navigate to employee leaves page and open Year-End modal
            window.location.href = '/leaves';
            // The modal will be opened based on notification metadata
            return;
        }
        
        // Handle LEAVE_REQUEST notifications - navigate to leave requests tab
        if (notificationType === 'LEAVE_REQUEST') {
            const leaveId = metadata?.leaveId || navigationData?.leaveId;
            if (leaveId) {
                // Navigate to admin leaves page with leave requests tab and highlight
                window.location.href = `/admin/leaves?tab=requests&leaveId=${leaveId}`;
                return;
            }
            // Fallback to leave requests tab
            window.location.href = '/admin/leaves?tab=requests';
            return;
        }

        const isAdmin = ['Admin', 'HR', 'Manager'].includes(
            JSON.parse(sessionStorage.getItem('user') || '{}').role
        );

        if (navigationData.page === 'announcements') {
            openAnnouncementHub({
                tab: navigationData.params?.tab || 'insights',
                announcementId: navigationData.params?.announcementId || metadata?.announcementId || null,
            });
            return;
        }

        let url = '/dashboard';
        switch (navigationData.page) {
            case 'profile':
                const section = navigationData.params?.section;
                const policyId = navigationData.params?.policyId;
                if (section === 'policies' && policyId) {
                    url = `/profile?section=policies&policyId=${policyId}`;
                } else if (section === 'policies') {
                    url = '/profile?section=policies';
                } else {
                    url = '/profile';
                }
                break;
            case 'leaves':
                url = isAdmin ? '/admin/leaves' : '/leaves';
                break;
            case 'attendance':
                url = isAdmin ? '/admin/attendance-summary' : '/dashboard';
                break;
            case 'admin':
                url = '/admin/dashboard';
                break;
            default:
                url = isAdmin ? '/admin/dashboard' : '/dashboard';
        }

        window.location.href = url;
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        
        // Return unsubscribe function
        return () => {
            const eventListeners = this.listeners.get(event);
            if (eventListeners) {
                eventListeners.delete(callback);
            }
        };
    }

    /**
     * Add connection status listener
     */
    onConnectionChange(callback) {
        this.connectionListeners.add(callback);
        
        // Return unsubscribe function
        return () => {
            this.connectionListeners.delete(callback);
        };
    }

    /**
     * Notify all listeners for an event
     */
    notifyListeners(event, data) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error in notification listener:', error);
                }
            });
        }
    }

    /**
     * Notify connection status change
     */
    notifyConnectionChange(connected) {
        this.connectionListeners.forEach(callback => {
            try {
                callback(connected);
            } catch (error) {
                console.error('Error in connection listener:', error);
            }
        });
    }

    /**
     * Disconnect from the service
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
        }
        
        // Clear all listeners
        this.listeners.clear();
        this.connectionListeners.clear();
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            socket: this.socket
        };
    }

    /**
     * Request notification permission
     */
    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission === 'denied') {
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (error) {
            return false;
        }
    }
}

// Create singleton instance
const newNotificationService = new NewNotificationService();

export default newNotificationService;











