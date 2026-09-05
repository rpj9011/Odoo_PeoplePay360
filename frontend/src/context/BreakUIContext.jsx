import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const BreakUIContext = createContext(null);

const getBackendActiveBreak = (dailyStatus) => {
  const breaks = dailyStatus?.breaks;
  if (Array.isArray(breaks)) {
    const active = breaks.find((b) => b && !b.endTime);
    if (active && active.startTime) {
      return {
        id: active._id || active.id || 'backend',
        type: active.breakType || active.type,
        startTime: active.startTime,
        source: 'backend',
      };
    }
  }

  const activeBreak = dailyStatus?.activeBreak;
  if (activeBreak && activeBreak.startTime) {
    return {
      id: activeBreak._id || activeBreak.id || 'backend',
      type: activeBreak.breakType || activeBreak.type,
      startTime: activeBreak.startTime,
      source: 'backend',
    };
  }

  return null;
};

export const BreakUIProvider = ({ children }) => {
  const [uiBreakState, setUiBreakState] = useState(null);

  const lastClearedAtRef = useRef(0);
  const lastClearedBreakKeyRef = useRef(null);

  const startUiBreak = useCallback((breakType) => {
    const now = Date.now();
    setUiBreakState({
      id: 'local',
      type: breakType,
      startTime: now,
      source: 'ui',
    });
  }, []);

  const endUiBreak = useCallback(() => {
    setUiBreakState((prev) => {
      lastClearedAtRef.current = Date.now();
      lastClearedBreakKeyRef.current = prev?.id || prev?.startTime || null;
      return null;
    });
  }, []);

  const reconcileFromBackend = useCallback((dailyStatus) => {
    const backend = getBackendActiveBreak(dailyStatus);

    const ignoreBackendUntil = lastClearedAtRef.current
      ? lastClearedAtRef.current + 90 * 1000
      : 0;

    setUiBreakState((current) => {
      if (current) {
        if (current.source === 'ui' && backend) {
          return {
            id: backend.id,
            type: backend.type,
            startTime: backend.startTime,
            source: 'backend',
          };
        }
        return current;
      }

      if (!backend) return null;

      if (ignoreBackendUntil && Date.now() < ignoreBackendUntil) {
        return null;
      }

      const lastKey = lastClearedBreakKeyRef.current;
      const isSameAsCleared = lastKey && (String(lastKey) === String(backend.id) || String(lastKey) === String(backend.startTime));
      if (isSameAsCleared) {
        return null;
      }

      return backend;
    });
  }, []);

  const value = useMemo(
    () => ({
      uiBreakState,
      setUiBreakState,
      startUiBreak,
      endUiBreak,
      reconcileFromBackend,
    }),
    [uiBreakState, startUiBreak, endUiBreak, reconcileFromBackend]
  );

  return <BreakUIContext.Provider value={value}>{children}</BreakUIContext.Provider>;
};

export const useBreakUI = () => {
  const ctx = useContext(BreakUIContext);
  if (!ctx) {
    throw new Error('useBreakUI must be used within a BreakUIProvider');
  }
  return ctx;
};
