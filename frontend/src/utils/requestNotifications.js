// Helpers to split admin notification drawer compartments

export const REQUEST_NOTIFICATION_TYPES = ['resource_request', 'resource_request_status'];

export const isRequestNotification = (notification) => {
    if (!notification) return false;
    if (notification.category === 'request') return true;
    return REQUEST_NOTIFICATION_TYPES.includes(notification.type);
};

export const partitionNotifications = (notifications = []) => {
    const attendance = [];
    const requests = [];
    for (const n of notifications) {
        if (isRequestNotification(n)) {
            requests.push(n);
        } else {
            attendance.push(n);
        }
    }
    return { attendance, requests };
};

export const countUnread = (list = []) => list.filter((n) => !n.read).length;
