import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import useIdleDetection from '../hooks/useIdleDetection';
import AutoBreakModal from './AutoBreakModal';

const IdleDetectionProvider = ({ children }) => {
  const auth = useAuth();
  // Safely handle case where auth context might not be available yet
  const isAuthenticated = auth?.isAuthenticated || false;
  const user = auth?.user || null;
  const [isEndingBreak, setIsEndingBreak] = useState(false);
  
  const {
    isIdle,
    idleTime,
    autoBreakActive,
    showIdleWarning,
    autoBreakEnabled,
    endAutoBreak,
    resetIdleTimer
  } = useIdleDetection();

  // Only show auto-break features for authenticated users with auto-break enabled
  if (!isAuthenticated || !autoBreakEnabled) {
    return children;
  }

  const handleEndBreak = async () => {
    setIsEndingBreak(true);
    try {
      await endAutoBreak();
    } catch (error) {
      console.error('Failed to end auto-break:', error);
    } finally {
      setIsEndingBreak(false);
    }
  };

  const handleCloseWarning = () => {
    // Reset the timer when user closes the warning
    resetIdleTimer();
  };

  return (
    <>
      {children}
      
      {/* Auto-Break Warning Modal */}
      <AutoBreakModal
        open={showIdleWarning}
        onClose={handleCloseWarning}
        onEndBreak={handleEndBreak}
        idleTime={idleTime}
        isEndingBreak={isEndingBreak}
        showWarning={true}
      />
      
      {/* Auto-Break Active Modal */}
      <AutoBreakModal
        open={autoBreakActive}
        onClose={() => {}} // Don't allow closing auto-break modal
        onEndBreak={handleEndBreak}
        idleTime={idleTime}
        isEndingBreak={isEndingBreak}
        showWarning={false}
      />
    </>
  );
};

export default IdleDetectionProvider;


