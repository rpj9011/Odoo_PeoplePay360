import React, { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Stack,
    Divider,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button
} from '@mui/material';
import MessageIcon from '@mui/icons-material/Message';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../api/axios';

const AnonymousMessagesList = ({ messages, loading, onDelete }) => {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [messageToDelete, setMessageToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleDeleteClick = (msg) => {
        setMessageToDelete(msg);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!messageToDelete) return;

        setDeleting(true);
        try {
            await api.delete(`/policies/anonymous-feedback/${messageToDelete._id}`);
            console.log('✅ Anonymous feedback deleted successfully');
            
            // Call parent callback to refresh the list
            if (onDelete) {
                onDelete(messageToDelete._id);
            }
            
            setDeleteDialogOpen(false);
            setMessageToDelete(null);
        } catch (error) {
            console.error('Failed to delete feedback:', error);
            alert('Failed to delete feedback. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
        setMessageToDelete(null);
    };

    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                Loading messages...
            </Typography>
        );
    }

    if (messages.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 6 }}>
                <MessageIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                <Typography variant="body2" color="text.secondary">
                    No anonymous messages yet
                </Typography>
            </Box>
        );
    }

    return (
        <>
            <Stack spacing={2}>
                {messages.map((msg, index) => (
                    <Paper
                        key={msg._id || index}
                        elevation={0}
                        sx={{
                            p: 2.5,
                            border: '1px solid #e8e8e8',
                            borderRadius: '12px',
                            backgroundColor: '#fafafa',
                            transition: 'all 0.2s ease',
                            position: 'relative',
                            '&:hover': {
                                backgroundColor: '#f5f5f5',
                                borderColor: '#d0d0d0',
                                '& .delete-button': {
                                    opacity: 1
                                }
                            }
                        }}
                    >
                        <Stack spacing={1.5}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MessageIcon sx={{ fontSize: 18, color: '#666' }} />
                                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                                    Anonymous Employee
                                </Typography>
                                <Box sx={{ flex: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    {formatDate(msg.submittedAt)}
                                </Typography>
                                <Tooltip title="Delete message">
                                    <IconButton
                                        className="delete-button"
                                        size="small"
                                        onClick={() => handleDeleteClick(msg)}
                                        sx={{
                                            opacity: 0,
                                            transition: 'opacity 0.2s ease',
                                            color: '#d32f2f',
                                            '&:hover': {
                                                backgroundColor: 'rgba(211, 47, 47, 0.08)'
                                            }
                                        }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                            
                            <Divider />
                            
                            <Typography
                                variant="body2"
                                sx={{
                                    color: '#333',
                                    lineHeight: 1.6,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}
                            >
                                {msg.message}
                            </Typography>
                        </Stack>
                    </Paper>
                ))}
            </Stack>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={handleDeleteCancel}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Delete Anonymous Message?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this anonymous feedback message? This action cannot be undone.
                    </DialogContentText>
                    {messageToDelete && (
                        <Box
                            sx={{
                                mt: 2,
                                p: 2,
                                backgroundColor: '#f5f5f5',
                                borderRadius: '8px',
                                border: '1px solid #e0e0e0'
                            }}
                        >
                            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                                Message Preview:
                            </Typography>
                            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                                "{messageToDelete.message.substring(0, 100)}{messageToDelete.message.length > 100 ? '...' : ''}"
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleDeleteCancel} disabled={deleting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteConfirm}
                        color="error"
                        variant="contained"
                        disabled={deleting}
                    >
                        {deleting ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AnonymousMessagesList;
