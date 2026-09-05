import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Paper,
    Stack,
    Chip,
    TextField,
    Button,
    IconButton,
    Grid,
    Card,
    CardContent,
    Tabs,
    Tab,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    CircularProgress,
    Alert,
    Divider,
    Avatar,
    Badge
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import api from '../../api/axios';

const HRQueryManagement = () => {
    const [queries, setQueries] = useState([]);
    const [selectedQuery, setSelectedQuery] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [activeTab, setActiveTab] = useState(0);
    const [stats, setStats] = useState({
        totalQueries: 0,
        openQueries: 0,
        inProgressQueries: 0,
        resolvedQueries: 0,
        unreadMessages: 0
    });
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);

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
        fetchStats();
    }, [filterStatus, filterCategory]);

    useEffect(() => {
        scrollToBottom();
    }, [selectedQuery?.messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchQueries = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.append('status', filterStatus);
            if (filterCategory) params.append('category', filterCategory);

            const response = await api.get(`/hr-queries/admin/all?${params.toString()}`);
            setQueries(response.data);
        } catch (error) {
            console.error('Failed to fetch queries:', error);
            setError('Failed to load queries');
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await api.get('/hr-queries/admin/stats/overview');
            setStats(response.data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const fetchQueryDetails = async (queryId) => {
        try {
            const response = await api.get(`/hr-queries/${queryId}`);
            setSelectedQuery(response.data);

            // Update query in list to reflect read status
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

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;

        setSending(true);
        try {
            await api.post(`/hr-queries/admin/${selectedQuery._id}/respond`, {
                message: newMessage
            });
            setNewMessage('');
            await fetchQueryDetails(selectedQuery._id);
            await fetchStats();
        } catch (error) {
            console.error('Failed to send message:', error);
            setError('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleStatusChange = async (queryId, newStatus) => {
        try {
            await api.patch(`/hr-queries/admin/${queryId}`, { status: newStatus });
            await fetchQueries();
            await fetchStats();
            if (selectedQuery?._id === queryId) {
                await fetchQueryDetails(queryId);
            }
        } catch (error) {
            console.error('Failed to update status:', error);
            setError('Failed to update status');
        }
    };

    const handlePriorityChange = async (queryId, newPriority) => {
        try {
            await api.patch(`/hr-queries/admin/${queryId}`, { priority: newPriority });
            await fetchQueries();
            if (selectedQuery?._id === queryId) {
                await fetchQueryDetails(queryId);
            }
        } catch (error) {
            console.error('Failed to update priority:', error);
            setError('Failed to update priority');
        }
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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

    const getFilteredQueries = () => {
        let filtered = queries;

        if (activeTab === 1) {
            filtered = queries.filter(q => q.status === 'open');
        } else if (activeTab === 2) {
            filtered = queries.filter(q => q.status === 'in-progress');
        } else if (activeTab === 3) {
            filtered = queries.filter(q => q.status === 'resolved' || q.status === 'closed');
        }

        return filtered;
    };

    return (
        <Box>
            <Typography variant="h5" fontWeight={700} mb={3}>
                HR Query Management
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Stats Cards */}
            <Grid container spacing={2} mb={3}>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <QuestionAnswerIcon sx={{ color: '#1976d2' }} />
                                <Box>
                                    <Typography variant="h6" fontWeight={700}>
                                        {stats.totalQueries}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Total Queries
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PendingActionsIcon sx={{ color: '#ff9800' }} />
                                <Box>
                                    <Typography variant="h6" fontWeight={700}>
                                        {stats.openQueries}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Open
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PendingActionsIcon sx={{ color: '#2196f3' }} />
                                <Box>
                                    <Typography variant="h6" fontWeight={700}>
                                        {stats.inProgressQueries}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        In Progress
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircleIcon sx={{ color: '#4caf50' }} />
                                <Box>
                                    <Typography variant="h6" fontWeight={700}>
                                        {stats.resolvedQueries}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Resolved
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Badge badgeContent={stats.unreadMessages} color="error">
                                    <QuestionAnswerIcon sx={{ color: '#f44336' }} />
                                </Badge>
                                <Box>
                                    <Typography variant="h6" fontWeight={700}>
                                        {stats.unreadMessages}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Unread
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                {/* Query List */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" fontWeight={700} mb={2}>
                            Queries
                        </Typography>

                        {/* Tabs */}
                        <Tabs
                            value={activeTab}
                            onChange={(e, val) => setActiveTab(val)}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
                        >
                            <Tab label="All" />
                            <Tab label="Open" />
                            <Tab label="In Progress" />
                            <Tab label="Resolved" />
                        </Tabs>

                        {/* Filters */}
                        <Stack spacing={1} mb={2}>
                            <FormControl size="small" fullWidth>
                                <InputLabel>Category</InputLabel>
                                <Select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    label="Category"
                                >
                                    <MenuItem value="">All Categories</MenuItem>
                                    {categories.map(cat => (
                                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>

                        {/* Query List */}
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : getFilteredQueries().length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography variant="body2" color="text.secondary">
                                    No queries found
                                </Typography>
                            </Box>
                        ) : (
                            <Stack spacing={1} sx={{ maxHeight: '600px', overflowY: 'auto' }}>
                                {getFilteredQueries().map((query) => (
                                    <Paper
                                        key={query._id}
                                        elevation={selectedQuery?._id === query._id ? 3 : 0}
                                        onClick={() => fetchQueryDetails(query._id)}
                                        sx={{
                                            p: 2,
                                            border: selectedQuery?._id === query._id
                                                ? '2px solid #1976d2'
                                                : '1px solid #e0e0e0',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            '&:hover': {
                                                backgroundColor: '#f5f5f5'
                                            }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                            <Typography variant="subtitle2" fontWeight={600}>
                                                {query.subject}
                                            </Typography>
                                            {query.unreadCount > 0 && (
                                                <Badge badgeContent={query.unreadCount} color="error" />
                                            )}
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                                            {query.employeeId?.fullName || 'Unknown'} · {query.employeeId?.employeeId || 'N/A'}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                            <Chip
                                                label={query.status}
                                                size="small"
                                                sx={{
                                                    height: '20px',
                                                    fontSize: '0.7rem',
                                                    backgroundColor: statusColors[query.status],
                                                    color: 'white',
                                                    fontWeight: 600
                                                }}
                                            />
                                            <Chip
                                                label={query.category}
                                                size="small"
                                                variant="outlined"
                                                sx={{ height: '20px', fontSize: '0.7rem' }}
                                            />
                                            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                                {formatTimestamp(query.lastMessageAt)}
                                            </Typography>
                                        </Box>
                                    </Paper>
                                ))}
                            </Stack>
                        )}
                    </Paper>
                </Grid>

                {/* Query Details */}
                <Grid item xs={12} md={8}>
                    {!selectedQuery ? (
                        <Paper sx={{ p: 4, textAlign: 'center', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Box>
                                <QuestionAnswerIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
                                <Typography variant="body1" color="text.secondary">
                                    Select a query to view details
                                </Typography>
                            </Box>
                        </Paper>
                    ) : (
                        <Paper sx={{ p: 3, minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
                            {/* Header */}
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="h6" fontWeight={700} mb={1}>
                                    {selectedQuery.subject}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Avatar sx={{ width: 32, height: 32, fontSize: '0.9rem' }}>
                                        {selectedQuery.employeeId?.fullName?.charAt(0) || '?'}
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>
                                            {selectedQuery.employeeId?.fullName || 'Unknown'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {selectedQuery.employeeId?.employeeId || 'N/A'} · {selectedQuery.employeeId?.department || 'N/A'}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Stack direction="row" spacing={1} mb={2}>
                                    <FormControl size="small" sx={{ minWidth: 150 }}>
                                        <InputLabel>Status</InputLabel>
                                        <Select
                                            value={selectedQuery.status}
                                            onChange={(e) => handleStatusChange(selectedQuery._id, e.target.value)}
                                            label="Status"
                                        >
                                            <MenuItem value="open">Open</MenuItem>
                                            <MenuItem value="in-progress">In Progress</MenuItem>
                                            <MenuItem value="resolved">Resolved</MenuItem>
                                            <MenuItem value="closed">Closed</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <FormControl size="small" sx={{ minWidth: 120 }}>
                                        <InputLabel>Priority</InputLabel>
                                        <Select
                                            value={selectedQuery.priority}
                                            onChange={(e) => handlePriorityChange(selectedQuery._id, e.target.value)}
                                            label="Priority"
                                        >
                                            <MenuItem value="low">Low</MenuItem>
                                            <MenuItem value="medium">Medium</MenuItem>
                                            <MenuItem value="high">High</MenuItem>
                                            <MenuItem value="urgent">Urgent</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <Chip label={selectedQuery.category} variant="outlined" />
                                </Stack>
                                <Divider />
                            </Box>

                            {/* Messages */}
                            <Box sx={{ flex: 1, overflowY: 'auto', mb: 2 }}>
                                <Stack spacing={2}>
                                    {selectedQuery.messages.map((msg, index) => {
                                        const isEmployee = msg.sender === 'employee';
                                        return (
                                            <Box
                                                key={index}
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: isEmployee ? 'flex-start' : 'flex-end'
                                                }}
                                            >
                                                <Paper
                                                    elevation={0}
                                                    sx={{
                                                        p: 2,
                                                        maxWidth: '70%',
                                                        backgroundColor: isEmployee ? '#f5f5f5' : '#e3f2fd',
                                                        border: `1px solid ${isEmployee ? '#e0e0e0' : '#90caf9'}`
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                        {getSenderIcon(msg.sender)}
                                                        <Typography variant="body2" fontWeight={600}>
                                                            {msg.senderName}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                                            {formatTimestamp(msg.timestamp)}
                                                        </Typography>
                                                    </Box>
                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
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
                                <Box>
                                    <Divider sx={{ mb: 2 }} />
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <TextField
                                            fullWidth
                                            multiline
                                            maxRows={4}
                                            placeholder="Type your response..."
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                        />
                                        <Button
                                            variant="contained"
                                            endIcon={<SendIcon />}
                                            onClick={handleSendMessage}
                                            disabled={sending || !newMessage.trim()}
                                        >
                                            Send
                                        </Button>
                                    </Box>
                                </Box>
                            )}
                        </Paper>
                    )}
                </Grid>
            </Grid>
        </Box>
    );
};

export default HRQueryManagement;
