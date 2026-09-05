import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import socket from '../socket';
import { useAuth } from './AuthContext';
import useDesktopNotification from '../hooks/useDesktopNotification';
import {
  buildTeaBreakStateFromPayload,
  computeTeaBreakRemainingSeconds,
} from '../utils/teaBreakTimer';

const TeaBreakContext = createContext({
  teaBreakData: null,
  clearTeaBreak: () => {},
});

function teaBreakEndedStorageKey(announcementId) {
  return `tea_break_ended_${announcementId}`;
}

function teaBreakNotifiedStorageKey(announcementId) {
  return `tea_break_notified_${announcementId}`;
}

function hasLocallyEndedTeaBreak(announcementId) {
  if (!announcementId) return false;
  return localStorage.getItem(teaBreakEndedStorageKey(announcementId)) === '1';
}

function wasTeaBreakNotified(announcementId) {
  if (!announcementId) return false;
  return sessionStorage.getItem(teaBreakNotifiedStorageKey(announcementId)) === '1';
}

function markTeaBreakNotified(announcementId) {
  if (!announcementId) return;
  sessionStorage.setItem(teaBreakNotifiedStorageKey(announcementId), '1');
}

function normalizeAnnouncementId(id) {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id.$oid) return id.$oid;
  return String(id);
}

export function TeaBreakProvider({ children }) {
  const { token, user, authStatus } = useAuth();
  const navigate = useNavigate();
  const { requestPermission, showNotification } = useDesktopNotification();
  const [teaBreakData, setTeaBreakData] = useState(null);
  const userRoleRef = useRef(user?.role);
  userRoleRef.current = user?.role;

  // Tracks the last break ID for which we have already shown a desktop toast this session.
  // Using a ref (not state) because updating it must never trigger a re-render.
  const lastNotifiedBreakIdRef = useRef(null);

  const clearTeaBreak = useCallback(() => {
    setTeaBreakData((prev) => {
      if (prev?.announcementId) {
        localStorage.setItem(teaBreakEndedStorageKey(prev.announcementId), '1');
      }
      return null;
    });
  }, []);

  const dismissTeaBreak = useCallback((announcementId) => {
    const id = normalizeAnnouncementId(announcementId);
    if (id) {
      localStorage.setItem(teaBreakEndedStorageKey(id), '1');
    }
    setTeaBreakData(null);
  }, []);

  const showTeaBreakDesktopNotification = useCallback(
    (data, { force = false } = {}) => {
      const announcementId = normalizeAnnouncementId(data?.announcementId);
      if (!announcementId) return;

      const currentUserId = user?._id || user?.id;
      const initiatorId = data?.initiatedByUserId;
      if (initiatorId && currentUserId && String(initiatorId) === String(currentUserId)) {
        return;
      }

      if (!force && wasTeaBreakNotified(announcementId)) return;

      const label = data.teaBreakType === 'evening' ? 'Evening' : 'Morning';
      const notification = showNotification('☕ Tea Break Started!', {
        body: `${label} tea break — 10 minutes starting now.`,
        icon: '/AMS.webp',
        tag: `tea-break-${announcementId}`,
        onClick: () => {
          const role = userRoleRef.current;
          const dashboardPath =
            role === 'Admin' || role === 'HR' ? '/admin/dashboard' : '/dashboard';
          navigate(dashboardPath);
        },
      });

      if (notification) {
        markTeaBreakNotified(announcementId);
        lastNotifiedBreakIdRef.current = announcementId;
      } else if (import.meta.env.DEV) {
        console.warn(
          '[TeaBreak] Desktop notification skipped — browser permission:',
          typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
        );
      }
    },
    [showNotification, navigate, user?._id, user?.id]
  );

  const applyTeaBreakPayload = useCallback(
    (payload, { notify = false } = {}) => {
      const isActive = payload?.active !== false && (payload?.active || payload?.teaBreakStartedAt);
      if (!isActive) {
        setTeaBreakData(null);
        return;
      }

      const state = buildTeaBreakStateFromPayload(payload);
      if (!state?.announcementId || !state.startedAt) {
        setTeaBreakData(null);
        return;
      }

      const announcementId = normalizeAnnouncementId(state.announcementId);
      if (hasLocallyEndedTeaBreak(announcementId)) {
        setTeaBreakData(null);
        return;
      }

      setTeaBreakData({
        announcementId,
        startedAt: state.startedAt,
        endsAt: state.endsAt,
        serverNow: state.serverNow,
        clockOffsetMs: state.clockOffsetMs,
        remainingSeconds: state.remainingSeconds,
        durationMinutes: state.durationMinutes,
        type: state.type,
        initiatedByUserId: state.initiatedByUserId,
      });

      if (notify) {
        showTeaBreakDesktopNotification({
          announcementId,
          teaBreakType: state.type,
          initiatedByUserId: state.initiatedByUserId,
        });
      }
    },
    [showTeaBreakDesktopNotification]
  );

  const syncActiveTeaBreak = useCallback(
    async ({ notifyIfActive = false } = {}) => {
      try {
        const { data } = await api.get('/tea-break/active');
        if (data?.active) {
          // When notifyIfActive is true (e.g. after a reconnect), only fire the desktop
          // notification if this is a break the client hasn't already toasted for.
          // This prevents a duplicate toast on reconnect when the socket event was already
          // received, while ensuring employees who missed the original event get the toast.
          if (notifyIfActive) {
            const breakId = normalizeAnnouncementId(data.announcementId || data._id);
            const alreadyNotified = breakId && lastNotifiedBreakIdRef.current === breakId;
            applyTeaBreakPayload(data, { notify: !alreadyNotified });
          } else {
            applyTeaBreakPayload(data, { notify: false });
          }
        } else {
          setTeaBreakData(null);
        }
      } catch (err) {
        console.error('[TeaBreak] Failed to fetch active tea break:', err);
      }
    },
    [applyTeaBreakPayload]
  );

  useEffect(() => {
    if (!token || typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      requestPermission();
    }
  }, [token, requestPermission]);

  useEffect(() => {
    if (!token || authStatus !== 'authenticated') return;
    syncActiveTeaBreak({ notifyIfActive: true });
  }, [token, authStatus, syncActiveTeaBreak]);

  useEffect(() => {
    if (!token || authStatus !== 'authenticated') return;

    const handleTeaBreakStarted = (payload) => {
      if (payload?.clockedInEligible) {
        // Stamp the ref before applyTeaBreakPayload so that if a reconnect sync fires
        // concurrently (very unlikely but possible), it won't double-toast.
        const breakId = normalizeAnnouncementId(payload.announcementId);
        if (breakId) {
          lastNotifiedBreakIdRef.current = breakId;
        }
        applyTeaBreakPayload(payload, { notify: true });
        return;
      }
      // Admin / non-clocked-in: refresh banner state only
      syncActiveTeaBreak({ notifyIfActive: false });
    };

    const handleTeaBreakStopped = (data) => {
      const announcementId = normalizeAnnouncementId(data?.announcementId);
      if (announcementId) {
        dismissTeaBreak(announcementId);
      } else {
        setTeaBreakData(null);
      }
      if (data?.universalStop) {
        window.dispatchEvent(new CustomEvent('dashboard-refresh-requested'));
      }
    };

    const handleSocketConnect = () => {
      // Initial connect: restore timer state silently (no toast — the live
      // tea_break_started event will handle notification for new breaks).
      syncActiveTeaBreak({ notifyIfActive: false });
    };

    const handleSocketReconnect = () => {
      // Reconnect after a disconnect: the client may have missed the tea_break_started
      // event entirely. Sync with notify so employees who were offline during the
      // break start still get the desktop toast — dedup is handled inside
      // syncActiveTeaBreak via lastNotifiedBreakIdRef.
      syncActiveTeaBreak({ notifyIfActive: true });
    };

    const handleDashboardRefresh = () => {
      syncActiveTeaBreak({ notifyIfActive: false });
    };

    socket.on('tea_break_started', handleTeaBreakStarted);
    socket.on('tea_break_stopped', handleTeaBreakStopped);
    socket.on('connect', handleSocketConnect);
    socket.on('reconnect', handleSocketReconnect);
    window.addEventListener('dashboard-refresh-requested', handleDashboardRefresh);

    if (socket.connected) {
      syncActiveTeaBreak({ notifyIfActive: false });
    }

    return () => {
      socket.off('tea_break_started', handleTeaBreakStarted);
      socket.off('tea_break_stopped', handleTeaBreakStopped);
      socket.off('connect', handleSocketConnect);
      socket.off('reconnect', handleSocketReconnect);
      window.removeEventListener('dashboard-refresh-requested', handleDashboardRefresh);
    };
  }, [token, authStatus, dismissTeaBreak, syncActiveTeaBreak, applyTeaBreakPayload]);

  const value = useMemo(
    () => ({
      teaBreakData,
      clearTeaBreak,
      setTeaBreakData,
      dismissTeaBreak,
      syncActiveTeaBreak,
      getTeaBreakRemainingSeconds: () => computeTeaBreakRemainingSeconds(teaBreakData),
    }),
    [teaBreakData, clearTeaBreak, dismissTeaBreak, syncActiveTeaBreak]
  );

  return (
    <TeaBreakContext.Provider value={value}>{children}</TeaBreakContext.Provider>
  );
}

export function useTeaBreak() {
  return useContext(TeaBreakContext);
}

export default TeaBreakContext;
