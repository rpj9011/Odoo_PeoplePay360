import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Alert, IconButton } from '@mui/material';
import { SkeletonBox } from '../components/SkeletonLoaders';
import {
  AccessTime as AccessTimeIcon,
  Close as CloseIcon,
  PlayArrow as PlayArrowIcon
} from '@mui/icons-material';

const AutoBreakModal = ({ 
  open, 
  onClose, 
  onEndBreak, 
  idleTime, 
  isEndingBreak,
  showWarning = false 
}) => {
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        backgroundColor: showWarning ? '#fff3cd' : '#f8d7da',
        color: showWarning ? '#856404' : '#721c24',
        borderBottom: `2px solid ${showWarning ? '#ffeaa7' : '#f5c6cb'}`
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccessTimeIcon />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {showWarning ? 'Inactivity Warning' : 'Auto-Break Active'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ padding: '24px' }}>
        {showWarning ? (
          <Box>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                You have been inactive for {formatTime(idleTime)}.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                The system will automatically place you on an unpaid break in 30 seconds if no activity is detected.
              </Typography>
            </Alert>
            
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 2 }}>
              Move your mouse or press any key to reset the timer.
            </Typography>
          </Box>
        ) : (
          <Box>
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                You have been placed on an unpaid break due to inactivity.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                You have been idle for {formatTime(idleTime)}. Please click "End Break" when you resume work.
              </Typography>
            </Alert>

            <Box sx={{ 
              backgroundColor: '#f8f9fa', 
              padding: '16px', 
              borderRadius: '8px',
              textAlign: 'center',
              mt: 2
            }}>
              <Typography variant="h4" sx={{ 
                color: '#e53935', 
                fontWeight: 600,
                fontFamily: 'monospace'
              }}>
                {formatTime(idleTime)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Time on auto-break
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 2 }}>
              Work-related actions are disabled while on break. Click "End Break" to resume work.
            </Typography>
          </Box>
        )}
      </DialogContent>

      {!showWarning && (
        <DialogActions sx={{ padding: '16px 24px', gap: 2 }}>
          <Button
            onClick={onEndBreak}
            variant="contained"
            startIcon={isEndingBreak ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : <PlayArrowIcon />}
            disabled={isEndingBreak}
            sx={{
              background: 'linear-gradient(135deg, #e53935 0%, #d32f2f 100%)',
              borderRadius: '25px',
              padding: '10px 24px',
              fontWeight: 600,
              '&:hover': {
                background: 'linear-gradient(135deg, #d32f2f 0%, #c62828 100%)',
              }
            }}
          >
            {isEndingBreak ? 'Ending Break...' : 'End Break'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default AutoBreakModal;


