import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    IconButton,
    Paper,
    Stack,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Divider,
    Tooltip,
    Badge,
    CircularProgress,
    Alert
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import api from '../api/axios';

const HRQueryChat = () => {
    const [queries, setQueries] = useState([]);
    const [selectedQuery, setSelectedQuery] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [newQueryData, setNewQueryData] = useState({
        subject: '',
        category: 'General',
        message: '',
        anonymousToHR: false
    });
    const messagesEndRef = useRef(null);
    const [error, setError] = useState('');

    const categories = [
        'Policy',
        'Leave',
        'Attendance',
        'Payroll',
        'Benefits',
        'Compliance',
        'General',
        'Other'
    ];

    const statusColors = {
        open: '#ff9800',
        'in-progress': '#2196f3',
        resolved: '#4caf50',
        closed: '#9e9e9e'
    };

    useEffect(() => {
        fetchQueries();
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [selectedQuery?.messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchQueries = async () => {
        setLoading(true);
        try {
            const response = await api.get('/hr-queries/my-queries');
            setQueries(response.data);
        } catch (error) {
            console.error('Failed to fetch queries:', error);
            setError('Failed to load your queries');
        } finally {
            setLoading(false);
        }
    };

    const fetchQueryDetails = async (queryId) => {
        try {
            const response = await api.get(`/hr-queries/${queryId}`);
            setSelectedQuery(response.data);
            
            // Update the query in the list to reflect read status
            setQueries(prevQueries =>
                prevQueries.map(q =>
                    q._id === queryId ? { ...q, unreadCount: 0 } : q
                )
            );
        } catch (error) {
            console.error('Failed to fetch query details:', error);
            setError('Failed to load query details');
        }
    };

    const handleCreateQuery = async () => {
        if (!newQueryData.subject.trim() || !newQueryData.message.trim()) {
            setError('Subject and message are required');
            return;
        }

        setSending(true);
        try {
            await api.post('/hr-queries/create', newQueryData);
            setCreateDialogOpen(false);
            setNewQueryData({
                subject: '',
                category: 'General',
                message: '',
                anonymousToHR: false
            });
            await fetchQueries();
        } catch (error) {
            console.error('Failed to create query:', error);
            setError('Failed to submit query');
        } finally {
            setSending(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;

        setSending(true);
        try {
            await api.post(`/hr-queries/${selectedQuery._id}/message`, {
                message: newMessage
            });
            setNewMessage('');
            await fetchQueryDetails(selectedQuery._id);
        } catch (error) {
            console.error('Failed to send message:', error);
            setError('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleCloseQuery = async (queryId) => {
        try {
            await api.patch(`/hr-queries/${queryId}/status`, { status: 'closed' });
            await fetchQueries();
            if (selectedQuery?._id === queryId) {
                setSelectedQuery(null);
            }
        } catch (error) {
            console.error('Failed to close query:', error);
            setError('Failed to close query');
        }
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getSenderIcon = (sender) => {
        switch (sender) {
            case 'employee':
                return <PersonIcon sx={{ fontSize: 18 }} />;
            case 'hr':
                return <SupportAgentIcon sx={{ fontSize: 18 }} />;
            case 'admin':
                return <AdminPanelSettingsIcon sx={{ fontSize: 18 }} />;
            default:
                return <PersonIcon sx={{ fontSize: 18 }} />;
        }
    };

    // List View
    if (!selectedQuery) {
        return (
            <Box>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="body2" fontWeight={600} color="#666">
                        Your HR Queries
                    </Typography>
                    <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setCreateDialogOpen(true)}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.75rem',
                            backgroundColor: '#1976d2',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: '#1565c0'
                            }
                        }}
                    >
                        New Query
                    </Button>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={30} />
                    </Box>
                ) : queries.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <QuestionAnswerIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                            No queries yet. Start a conversation with HR!
                        </Typography>
                        <Button
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={() => setCreateDialogOpen(true)}
                            sx={{ mt: 2, textTransform: 'none' }}
                        >
                            Ask a Question
                        </Button>
                    </Box>
                ) : (
                    <Stack spacing={1}>
                        {queries.map((query) => (
                            <Paper
                                key={query._id}
                                elevation={0}
                                onClick={() => fetchQueryDetails(query._id)}
                                sx={{
                                    p: 1.5,
                                    border: '1px solid #e8e8e8',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        backgroundColor: '#f5f5f5',
                                        borderColor: '#1976d2'
                                    }
                                }}
                            >
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1, fontSize: '0.8rem' }}>
                                        {query.subject}
                                    </Typography>
                                    {query.unreadCount > 0 && (
                                        <Badge badgeContent={query.unreadCount} color="error" sx={{ ml: 1 }} />
                                    )}
                                </Box>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Chip
                                        label={query.status}
                                        size="small"
                                        sx={{
                                            height: '18px',
                                            fontSize: '0.65rem',
                                            backgroundColor: statusColors[query.status],
                                            color: 'white',
                                            fontWeight: 600
                                        }}
                                    />
                                    <Chip
                                        label={query.category}
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                            height: '18px',
                                            fontSize: '0.65rem'
                                        }}
                                    />
                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontSize: '0.65rem' }}>
                                        {formatTimestamp(query.lastMessageAt)}
                                    </Typography>
                                </Box>
                            </Paper>
                        ))}
                    </Stack>
                )}

                {/* Create Query Dialog */}
                <Dialog
                    open={createDialogOpen}
                    onClose={() => setCreateDialogOpen(false)}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle>
                        Ask HR a Question
                        <IconButton
                            onClick={() => setCreateDialogOpen(false)}
                            sx={{ position: 'absolute', right: 8, top: 8 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TextField
                                label="Subject"
                                fullWidth
                                value={newQueryData.subject}
                                onChange={(e) => setNewQueryData({ ...newQueryData, subject: e.target.value })}
                                placeholder="Brief description of your question"
                            />
                            <FormControl fullWidth>
                                <InputLabel>Category</InputLabel>
                                <Select
                                    value={newQueryData.category}
                                    onChange={(e) => setNewQueryData({ ...newQueryData, category: e.target.value })}
                                    label="Category"
                                >
                                    {categories.map((cat) => (
                                        <MenuItem key={cat} value={cat}>
                                            {cat}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField
                                label="Your Question"
                                fullWidth
                                multiline
                                rows={4}
                                value={newQueryData.message}
                                onChange={(e) => setNewQueryData({ ...newQueryData, message: e.target.value })}
                                placeholder="Describe your question in detail..."
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setCreateDialogOpen(false)} disabled={sending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateQuery}
                            variant="contained"
                            disabled={sending || !newQueryData.subject.trim() || !newQueryData.message.trim()}
                        >
                            {sending ? 'Submitting...' : 'Submit Query'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        );
    }

    // Chat View
    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {error && (
                <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, pb: 1, borderBottom: '1px solid #e8e8e8' }}>
                <IconButton size="small" onClick={() => setSelectedQuery(null)}>
                    <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                        {selectedQuery.subject}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        <Chip
                            label={selectedQuery.status}
                            size="small"
                            sx={{
                                height: '16px',
                                fontSize: '0.6rem',
                                backgroundColor: statusColors[selectedQuery.status],
                                color: 'white',
                                fontWeight: 600
                            }}
                        />
                        <Chip
                            label={selectedQuery.category}
                            size="small"
                            variant="outlined"
                            sx={{
                                height: '16px',
                                fontSize: '0.6rem'
                            }}
                        />
                    </Box>
                </Box>
                {selectedQuery.status !== 'closed' && (
                    <Tooltip title="Close Query">
                        <IconButton
                            size="small"
                            onClick={() => handleCloseQuery(selectedQuery._id)}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            {/* Messages */}
            <Box
                sx={{
                    flex: 1,
                    overflowY: 'auto',
                    mb: 2,
                    maxHeight: '300px',
                    '&::-webkit-scrollbar': {
                        width: '6px'
                    },
                    '&::-webkit-scrollbar-thumb': {
                        backgroundColor: '#ccc',
                        borderRadius: '3px'
                    }
                }}
            >
                <Stack spacing={1.5}>
                    {selectedQuery.messages.map((msg, index) => {
                        const isEmployee = msg.sender === 'employee';
                        return (
                            <Box
                                key={index}
                                sx={{
                                    display: 'flex',
                                    justifyContent: isEmployee ? 'flex-end' : 'flex-start'
                                }}
                            >
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 1.5,
                                        maxWidth: '75%',
                                        backgroundColor: isEmployee ? '#e3f2fd' : '#f5f5f5',
                                        borderRadius: '12px',
                                        border: `1px solid ${isEmployee ? '#90caf9' : '#e0e0e0'}`
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                        {getSenderIcon(msg.sender)}
                                        <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.7rem' }}>
                                            {msg.senderName}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontSize: '0.65rem' }}>
                                            {formatTimestamp(msg.timestamp)}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                                        {msg.message}
                                    </Typography>
                                </Paper>
                            </Box>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </Stack>
            </Box>

            {/* Input */}
            {selectedQuery.status !== 'closed' && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        fullWidth
                        size="small"
                        multiline
                        maxRows={3}
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '8px',
                                fontSize: '0.8rem'
                            }
                        }}
                    />
                    <IconButton
                        color="primary"
                        onClick={handleSendMessage}
                        disabled={sending || !newMessage.trim()}
                        sx={{
                            backgroundColor: '#1976d2',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: '#1565c0'
                            },
                            '&:disabled': {
                                backgroundColor: '#e0e0e0',
                                color: '#999'
                            }
                        }}
                    >
                        <SendIcon fontSize="small" />
                    </IconButton>
                </Box>
            )}
        </Box>
    );
};

export default HRQueryChat;
