import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Alert, Snackbar } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import api from '../api/axios';

const AnonymousFeedbackBox = () => {
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const handleSubmit = async () => {
        if (!message.trim()) {
            setSnackbar({ open: true, message: 'Please enter a message', severity: 'warning' });
            return;
        }

        setSubmitting(true);
        try {
            await api.post('/policies/anonymous-feedback', { message });
            setSnackbar({ open: true, message: 'Feedback submitted anonymously', severity: 'success' });
            setMessage('');
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            setSnackbar({ 
                open: true, 
                message: 'Failed to submit feedback. Please try again.', 
                severity: 'error' 
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box>
            <TextField
                multiline
                rows={3}
                fullWidth
                placeholder="Write your feedback here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                sx={{
                    mb: 1.5,
                    '& .MuiOutlinedInput-root': {
                        borderRadius: '8px',
                        backgroundColor: '#fafafa',
                        fontSize: '0.8rem'
                    },
                    '& .MuiInputBase-input': {
                        padding: '10px 12px'
                    }
                }}
            />
            
            <Button
                variant="contained"
                endIcon={<SendIcon sx={{ fontSize: '0.9rem' }} />}
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
                fullWidth
                size="small"
                sx={{
                    backgroundColor: '#9e9e9e',
                    borderRadius: '6px',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    '&:hover': {
                        backgroundColor: '#757575'
                    },
                    '&:disabled': {
                        backgroundColor: '#e0e0e0'
                    }
                }}
            >
                {submitting ? 'Submitting...' : 'Submit Anonymously'}
            </Button>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default AnonymousFeedbackBox;
