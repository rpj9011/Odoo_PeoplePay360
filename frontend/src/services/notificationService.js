import { io } from 'socket.io-client';

class NotificationService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second

    // Event listeners
    this.notificationListeners = [];
    this.connectionListeners = [];
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isConnected) {
        this.requestNotificationPermission();
      }
    });

    // Handle focus events
    window.addEventListener('focus', () => {
      if (this.isConnected) {
        this.requestNotificationPermission();
      }
    });
  }

  // Connect to WebSocket server
  connect(token, userType) {
    if (this.socket && this.isConnected) {
      return;
    }

    try {
      let serverUrl;
      
      // Use environment variable for socket URL
      serverUrl = import.meta.env.VITE_SOCKET_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      
      this.socket = io(serverUrl, {
        auth: (cb) => {
          // Try to get token from parameter first
          let authToken = token;
          
          // If no token provided, try to get from sessionStorage first, then localStorage
          if (!authToken) {
            authToken = sessionStorage.getItem('token') || sessionStorage.getItem('ams_token') ||
                        localStorage.getItem('token') || localStorage.getItem('ams_token');
          }
          
          // If still no token, try to get from cookies
          if (!authToken) {
            const cookies = document.cookie.split(';');
            const tokenCookie = cookies.find(cookie => cookie.trim().startsWith('token='));
            if (tokenCookie) {
              authToken = tokenCookie.split('=')[1];
            }
          }
          
          cb({ token: authToken });
        },
        // A2 Hosting: Polling first for better compatibility
        transports: ['polling', 'websocket'], // Polling first (A2 Hosting compatible), websocket as upgrade
        timeout: 30000, // 30 seconds timeout (A2 Hosting optimized)
        reconnection: true,
        reconnectionAttempts: 10, // More attempts for A2 Hosting stability
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 15000, // Increased max delay for A2 Hosting
        path: '/api/socket.io',
        forceNew: false, // Don't force new connection, reuse if possible
        upgrade: true, // Allow upgrade from polling to websocket if available
        rememberUpgrade: false, // Don't remember failed upgrades (A2 Hosting compatibility)
        autoConnect: true,
        withCredentials: true, // Important for cross-origin with credentials
        // Add extra configuration for production stability
        closeOnBeforeunload: false, // Don't close on page unload
        rejectUnauthorized: false // Allow self-signed certificates in development
      });

      this.setupSocketEventHandlers();

    } catch (error) {
      this.notifyConnectionChange(false);
    }
  }

  setupSocketEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.notifyConnectionChange(true);
      
      // Set up engine event listeners after connection
      if (this.socket.io && this.socket.io.engine) {
        // Handle WebSocket upgrade failures gracefully
        this.socket.io.engine.on('upgradeError', (error) => {
          console.warn('[NotificationService] WebSocket upgrade failed, continuing with polling');
          // Note: Polling will continue to work, so we don't need to disable upgrades
        });
      }
      
      // Request notification permission when connected
      this.requestNotificationPermission();
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
        console.warn('[NotificationService] WebSocket upgrade failed (polling is working)');
        return; // Don't disconnect or notify error
      }
      
      // For actual connection errors, handle normally
      this.isConnected = false;
      this.notifyConnectionChange(false);
      
      this.reconnectAttempts++;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Exponential backoff, max 30s
      }
    });

    // Notification events
    this.socket.on('new-notification', (notification) => {
      // Always show browser notification for team members
      // This ensures they see all notifications immediately
      this.showBrowserNotification(notification);
      
      // Notify all listeners
      this.notifyListeners(notification);
    });

    // Legacy event handlers for backward compatibility
    this.socket.on('notification', (data) => {
      const notification = {
        type: 'system',
        title: 'AMS Notification',
        message: data.message,
        data: data,
        timestamp: data.createdAt || new Date().toISOString(),
        priority: 'medium'
      };
      this.showBrowserNotification(notification);
      this.notifyListeners(notification);
    });

    this.socket.on('admin_notification', (data) => {
      const notification = {
        type: 'system',
        title: 'Admin Alert',
        message: data.message,
        data: data,
        timestamp: data.timestamp || new Date().toISOString(),
        priority: 'high'
      };
      this.showBrowserNotification(notification);
      this.notifyListeners(notification);
    });

    this.socket.on('leave_request', (data) => {
      const notification = {
        type: 'leave',
        title: 'Leave Request',
        message: data.message,
        data: data,
        timestamp: data.timestamp || new Date().toISOString(),
        priority: 'high'
      };
      this.showBrowserNotification(notification);
      this.notifyListeners(notification);
    });

    this.socket.on('extra_break_request', (data) => {
      const notification = {
        type: 'break',
        title: 'Extra Break Request',
        message: data.message,
        data: data,
        timestamp: data.timestamp || new Date().toISOString(),
        priority: 'medium'
      };
      this.showBrowserNotification(notification);
      this.notifyListeners(notification);
    });

    this.socket.on('leave_response', (data) => {
      const notification = {
        type: 'leave',
        title: 'Leave Response',
        message: data.message,
        data: data,
        timestamp: data.timestamp || new Date().toISOString(),
        priority: 'medium'
      };
      this.showBrowserNotification(notification);
      this.notifyListeners(notification);
    });

    this.socket.on('user_activity', (data) => {
      const notification = {
        type: 'attendance',
        title: 'User Activity',
        message: data.message,
        data: data,
        timestamp: data.timestamp || new Date().toISOString(),
        priority: 'low'
      };
      this.showBrowserNotification(notification);
      this.notifyListeners(notification);
    });

    // Room management events
    this.socket.on('joined-project', (projectId) => {
      console.log(`✅ Joined project room: ${projectId}`);
    });

    this.socket.on('joined-projects', (projectIds) => {
      console.log(`✅ Joined project rooms: ${projectIds.join(', ')}`);
    });
  }

  // Join project room (for admins)
  joinProject(projectId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('join-project', projectId);
    }
  }

  // Join assigned project rooms (for team members)
  joinAssignedProjects(projectIds) {
    if (this.socket && this.isConnected) {
      this.socket.emit('join-assigned-projects', projectIds);
    }
  }

  // Disconnect from server
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.notifyConnectionChange(false);
    }
  }

  // Add notification listener
  onNotification(callback) {
    this.notificationListeners.push(callback);
    return () => {
      const index = this.notificationListeners.indexOf(callback);
      if (index > -1) {
        this.notificationListeners.splice(index, 1);
      }
    };
  }

  // Add connection status listener
  onConnectionChange(callback) {
    this.connectionListeners.push(callback);
    return () => {
      const index = this.connectionListeners.indexOf(callback);
      if (index > -1) {
        this.connectionListeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners
  notifyListeners(notification) {
    this.notificationListeners.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }

  // Notify connection status change
  notifyConnectionChange(connected) {
    this.connectionListeners.forEach(callback => {
      try {
        callback(connected);
      } catch (error) {
        console.error('Error in connection listener:', error);
      }
    });
  }

  // Request browser notification permission
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        // Silent fail for production
      }
    }
  }

  // Show browser notification
  showBrowserNotification(notification) {
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'default') {
      this.requestNotificationPermission().then(() => {
        // Retry after permission is granted
        this.showBrowserNotification(notification);
      });
      return;
    }

    if (Notification.permission === 'denied') {
      this.showPermissionDeniedMessage();
      return;
    }

    if (Notification.permission === 'granted') {
      try {
        const browserNotification = new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: `notification-${notification.type}-${notification.data.id || Date.now()}`,
          requireInteraction: notification.priority === 'high',
          silent: false,
          badge: '/favicon.ico'
        });

        // Auto-close low priority notifications after 5 seconds
        if (notification.priority === 'low') {
          setTimeout(() => {
            browserNotification.close();
          }, 5000);
        }

        // Handle click on notification
        browserNotification.onclick = () => {
          window.focus();
          browserNotification.close();
          
          // You can add navigation logic here
          // For example, navigate to the specific task or project
          if (notification.data.navigationData) {
            const { page } = notification.data.navigationData;
            const isAdmin = ['Admin', 'HR', 'Manager'].includes(notification.data.userRole);
            
            let navigateTo = null;
            switch (page) {
              case 'leaves': navigateTo = isAdmin ? '/admin/leaves' : '/leaves'; break;
              case 'attendance': navigateTo = isAdmin ? '/admin/attendance-summary' : '/dashboard'; break;
              case 'admin': navigateTo = '/admin/dashboard'; break;
              default: navigateTo = isAdmin ? '/admin/dashboard' : '/dashboard';
            }
            
            if (navigateTo) {
              window.location.href = navigateTo;
            }
          }
        };

        // Handle notification close
        browserNotification.onclose = () => {
          // Silent close
        };

        // Handle notification error
        browserNotification.onerror = (error) => {
          // Silent error handling
        };

      } catch (error) {
        // Silent error handling for production
      }
    }
  }

  // Show message when notifications are denied
  showPermissionDeniedMessage() {
    // Create a temporary toast-like message
    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        max-width: 300px;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>🔔</span>
          <span>Notifications are disabled. Please enable them in your browser settings.</span>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="
          position: absolute;
          top: 4px;
          right: 8px;
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 18px;
        ">×</button>
      </div>
    `;
    
    document.body.appendChild(messageDiv);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
      if (messageDiv.parentElement) {
        messageDiv.remove();
      }
    }, 8000);
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  // Test connection
  testConnection() {
    return this.isConnected;
  }
}

// Create singleton instance
const notificationService = new NotificationService();

export default notificationService;