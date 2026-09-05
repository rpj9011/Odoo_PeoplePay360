import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Fab,
    Badge,
    Drawer,
    Typography,
    TextField,
    IconButton,
    Avatar,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    ListItemButton,
    Divider,
    Paper,
    Stack,
    Chip,
    InputAdornment,
    CircularProgress,
    Tooltip,
    Fade,
    Slide,
    Button,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from '@mui/material';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import AssignmentIcon from '@mui/icons-material/Assignment';
import InventoryIcon from '@mui/icons-material/Inventory';
import ComputerIcon from '@mui/icons-material/Computer';
import api from '../api/axios';
import { format, formatDistanceToNow } from 'date-fns';

const HRQueryFloatingChat = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [queries, setQueries] = useState([]);
    const [selectedQuery, setSelectedQuery] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [totalUnread, setTotalUnread] = useState(0);
    const messagesEndRef = useRef(null);
    const messageListRef = useRef(null);

    // Theme colors matching application
    const theme = {
        primary: '#2C3E50',
        primaryDark: '#1a252f',
        primaryLight: '#34495e',
        success: '#27ae60',
        warning: '#f39c12',
        error: '#e74c3c',
        info: '#3498db',
        border: '#e0e0e0',
        borderStrong: '#bdc3c7',
        subtle: '#ecf0f1',
        subtleStrong: '#dfe6e9',
        background: '#f8f9fa',
        textPrimary: '#2c3e50',
        textSecondary: '#7f8c8d'
    };

    // Fetch queries on mount and when drawer opens
    useEffect(() => {
        if (isOpen) {
            fetchQueries();
        }
    }, [isOpen]);

    // Auto-refresh queries every 30 seconds when drawer is open
    useEffect(() => {
        if (isOpen) {
            const interval = setInterval(fetchQueries, 30000);
            return () => clearInterval(interval);
        }
    }, [isOpen]);

    // Always fetch unread count (even when drawer is closed)
    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        if (selectedQuery && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedQuery?.messages]);

    const fetchUnreadCount = async () => {
        try {
            const response = await api.get('/hr-queries/admin/all');
            const unreadCount = response.data.reduce((sum, query) => sum + (query.unreadCount || 0), 0);
            setTotalUnread(unreadCount);
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    };

    const fetchQueries = async () => {
        setLoading(true);
        try {
            const response = await api.get('/hr-queries/admin/all');
            // Sort by last message time (most recent first)
            const sortedQueries = response.data.sort((a, b) => 
                new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
            );
            setQueries(sortedQueries);
            
            // Calculate total unread
            const unreadCount = sortedQueries.reduce((sum, query) => sum + (query.unreadCount || 0), 0);
            setTotalUnread(unreadCount);
        } catch (error) {
            console.error('Failed to fetch queries:', error);
        } finally {
            setLoading(false);
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
            
            // Update total unread count
            setTotalUnread(prev => Math.max(0, prev - (queries.find(q => q._id === queryId)?.unreadCount || 0)));
        } catch (error) {
            console.error('Failed to fetch query details:', error);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedQuery) return;

        setSending(true);
        try {
            await api.post(`/hr-queries/admin/${selectedQuery._id}/respond`, {
                message: newMessage.trim()
            });

            // Refresh query details
            await fetchQueryDetails(selectedQuery._id);
            setNewMessage('');
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setSending(false);
        }
    };

    const handleQueryClick = (query) => {
        setSelectedQuery(null); // Reset first
        
        // Handle resource requests differently - they don't have messages
        if (query.itemType === 'resource_request') {
            setTimeout(() => {
                setSelectedQuery(query);
                // Clear unread count for this resource request
                setQueries(prevQueries =>
                    prevQueries.map(q =>
                        q._id === query._id ? { ...q, unreadCount: 0 } : q
                    )
                );
                setTotalUnread(prev => Math.max(0, prev - (query.unreadCount || 0)));
            }, 0);
        } else {
            // For HR queries, fetch full details
            setTimeout(() => fetchQueryDetails(query._id), 0);
        }
    };

    const handleBack = () => {
        setSelectedQuery(null);
        fetchQueries(); // Refresh list
    };

    const getStatusColor = (status) => {
        const colors = {
            open: theme.warning,
            'in-progress': theme.info,
            resolved: theme.success,
            closed: theme.textSecondary,
            pending: theme.warning,
            fulfilled: theme.success,
            rejected: theme.error,
            cancelled: theme.textSecondary
        };
        return colors[status] || theme.textSecondary;
    };
    
    const getItemIcon = (query) => {
        if (query.itemType === 'resource_request') {
            if (query.category?.toLowerCase().includes('hardware') || query.category?.toLowerCase().includes('it')) {
                return <ComputerIcon sx={{ fontSize: '1.3rem' }} />;
            } else if (query.category?.toLowerCase().includes('stationery')) {
                return <AssignmentIcon sx={{ fontSize: '1.3rem' }} />;
            } else {
                return <InventoryIcon sx={{ fontSize: '1.3rem' }} />;
            }
        }
        return <PersonIcon sx={{ fontSize: '1.3rem' }} />;
    };

    const filteredQueries = queries.filter(query => {
        const searchLower = searchTerm.toLowerCase();
        return (
            query.subject?.toLowerCase().includes(searchLower) ||
            query.employeeId?.fullName?.toLowerCase().includes(searchLower) ||
            query.employeeId?.employeeId?.toLowerCase().includes(searchLower) ||
            query.category?.toLowerCase().includes(searchLower)
        );
    });

    return (
        <>
            {/* Floating Action Button */}
            <Tooltip title="HR Queries" placement="left">
                <Fab
                    color="primary"
                    aria-label="hr-queries"
                    onClick={() => setIsOpen(true)}
                    sx={{
                        position: 'fixed',
                        bottom: 24,
                        right: 24,
                        zIndex: 1200,
                        background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryLight} 100%)`,
                        color: 'white',
                        boxShadow: '0 8px 24px rgba(44, 62, 80, 0.3)',
                        '&:hover': {
                            background: `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.primary} 100%)`,
                            boxShadow: '0 12px 32px rgba(44, 62, 80, 0.4)',
                            transform: 'translateY(-2px)',
                        },
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                >
                    <Badge badgeContent={totalUnread} color="error" max={99}>
                        <QuestionAnswerIcon />
                    </Badge>
                </Fab>
            </Tooltip>

            {/* Drawer */}
            <Drawer
                anchor="right"
                open={isOpen}
                onClose={() => setIsOpen(false)}
                className="hr-query-drawer"
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 420 },
                        maxWidth: '100%',
                    }
                }}
            >
                <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Header */}
                    <Box
                        sx={{
                            p: 2.5,
                            background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryLight} 100%)`,
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            boxShadow: '0 2px 12px rgba(44, 62, 80, 0.2)'
                        }}
                    >
                        {selectedQuery && (
                            <IconButton 
                                onClick={handleBack} 
                                sx={{ 
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.1)'
                                    }
                                }}
                            >
                                <ArrowBackIcon />
                            </IconButton>
                        )}
                        <Box sx={{ flex: 1 }}>
                            {!selectedQuery ? (
                                <>
                                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.3px' }}>
                                        HR QUERY CENTER
                                    </Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.75rem' }}>
                                        Manage employee queries
                                    </Typography>
                                </>
                            ) : (
                                <>
                                    <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', mb: 0.25 }}>
                                        {selectedQuery.subject}
                                    </Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.75rem' }}>
                                        {selectedQuery.employeeId?.fullName || 'Anonymous'}
                                    </Typography>
                                </>
                            )}
                        </Box>
                        {!selectedQuery && (
                            <Badge badgeContent={totalUnread} color="error" max={99}
                                sx={{
                                    '& .MuiBadge-badge': {
                                        fontWeight: 700,
                                        fontSize: '0.7rem'
                                    }
                                }}
                            >
                                <QuestionAnswerIcon sx={{ fontSize: '1.5rem' }} />
                            </Badge>
                        )}
                        <IconButton 
                            onClick={() => setIsOpen(false)} 
                            sx={{ 
                                color: 'white',
                                '&:hover': {
                                    backgroundColor: 'rgba(255, 255, 255, 0.1)'
                                }
                            }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Box>

                    {/* Query List View */}
                    {!selectedQuery && (
                        <>
                            {/* Search Bar */}
                            <Box sx={{ p: 2, borderBottom: `1px solid ${theme.border}`, bgcolor: 'white' }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Search queries..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon fontSize="small" sx={{ color: theme.textSecondary }} />
                                            </InputAdornment>
                                        )
                                    }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '&:hover fieldset': {
                                                borderColor: theme.primary,
                                            },
                                            '&.Mui-focused fieldset': {
                                                borderColor: theme.primary,
                                            }
                                        }
                                    }}
                                />
                            </Box>

                            {/* Query List */}
                            <Box sx={{ flex: 1, overflow: 'auto' }}>
                                {loading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                        <CircularProgress />
                                    </Box>
                                ) : filteredQueries.length === 0 ? (
                                    <Box sx={{ 
                                        p: 4, 
                                        textAlign: 'center', 
                                        color: 'text.secondary',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 2,
                                        mt: 4
                                    }}>
                                        <QuestionAnswerIcon sx={{ fontSize: 64, opacity: 0.2 }} />
                                        <Box>
                                            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: theme.textPrimary }}>
                                                {searchTerm ? 'No queries found' : 'No HR queries yet'}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: theme.textSecondary }}>
                                                {searchTerm ? 'Try adjusting your search terms' : 'Employee queries will appear here'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ) : (
                                    <List sx={{ p: 0 }}>
                                        {filteredQueries.map((query, index) => (
                                            <React.Fragment key={query._id}>
                                                <ListItemButton
                                                    onClick={() => handleQueryClick(query)}
                                                    sx={{
                                                        py: 2,
                                                        px: 2.5,
                                                        backgroundColor: query.unreadCount > 0 ? theme.subtle : 'transparent',
                                                        borderLeft: query.unreadCount > 0 ? `4px solid ${theme.primary}` : '4px solid transparent',
                                                        '&:hover': {
                                                            backgroundColor: query.unreadCount > 0 ? theme.subtleStrong : theme.subtle,
                                                            borderLeftColor: theme.primary
                                                        },
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <ListItemAvatar>
                                                        <Avatar sx={{ 
                                                            bgcolor: getStatusColor(query.status),
                                                            width: 44,
                                                            height: 44,
                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                                                        }}>
                                                            {getItemIcon(query)}
                                                        </Avatar>
                                                    </ListItemAvatar>
                                                    <ListItemText
                                                        primary={
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                                <Typography 
                                                                    variant="subtitle2" 
                                                                    sx={{ 
                                                                        flex: 1, 
                                                                        fontWeight: query.unreadCount > 0 ? 700 : 600,
                                                                        color: theme.textPrimary,
                                                                        fontSize: '0.95rem'
                                                                    }}
                                                                >
                                                                    {query.employeeId?.fullName || 'Anonymous'}
                                                                </Typography>
                                                                {query.unreadCount > 0 && (
                                                                    <Box
                                                                        sx={{
                                                                            minWidth: 24,
                                                                            height: 24,
                                                                            borderRadius: '12px',
                                                                            backgroundColor: '#e74c3c',
                                                                            color: 'white',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontSize: '0.7rem',
                                                                            fontWeight: 700,
                                                                            px: 0.75
                                                                        }}
                                                                    >
                                                                        {query.unreadCount > 99 ? '99+' : query.unreadCount}
                                                                    </Box>
                                                                )}
                                                            </Box>
                                                        }
                                                        secondary={
                                                            <Box>
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{
                                                                        fontWeight: query.unreadCount > 0 ? 600 : 400,
                                                                        color: query.unreadCount > 0 ? theme.textPrimary : theme.textSecondary,
                                                                        mb: 0.75,
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                        fontSize: '0.85rem'
                                                                    }}
                                                                >
                                                                    {query.subject}
                                                                </Typography>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                    <Chip
                                                                        label={query.status.replace('-', ' ').toUpperCase()}
                                                                        size="small"
                                                                        sx={{
                                                                            height: 22,
                                                                            fontSize: '0.65rem',
                                                                            backgroundColor: getStatusColor(query.status),
                                                                            color: 'white',
                                                                            fontWeight: 700,
                                                                            letterSpacing: '0.3px'
                                                                        }}
                                                                    />
                                                                    <Chip
                                                                        label={query.category}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        sx={{ 
                                                                            height: 22, 
                                                                            fontSize: '0.65rem',
                                                                            borderColor: theme.primary,
                                                                            color: theme.primary,
                                                                            fontWeight: 600,
                                                                            borderWidth: '1.5px'
                                                                        }}
                                                                    />
                                                                    <Typography variant="caption" sx={{ 
                                                                        color: theme.textSecondary,
                                                                        fontSize: '0.7rem',
                                                                        ml: 'auto'
                                                                    }}>
                                                                        {formatDistanceToNow(new Date(query.lastMessageAt), { addSuffix: true })}
                                                                    </Typography>
                                                                </Box>
                                                            </Box>
                                                        }
                                                    />
                                                </ListItemButton>
                                                {index < filteredQueries.length - 1 && <Divider />}
                                            </React.Fragment>
                                        ))}
                                    </List>
                                )}
                            </Box>
                        </>
                    )}

                    {/* Chat View */}
                    {selectedQuery && selectedQuery.itemType === 'hr_query' && (
                        <>
                            {/* Query Info */}
                            <Box sx={{ 
                                p: 2, 
                                borderBottom: `1px solid ${theme.border}`, 
                                backgroundColor: 'white'
                            }}>
                                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Chip
                                        label={selectedQuery.status.replace('-', ' ').toUpperCase()}
                                        size="small"
                                        sx={{
                                            backgroundColor: getStatusColor(selectedQuery.status),
                                            color: 'white',
                                            fontWeight: 600,
                                            fontSize: '0.7rem',
                                            height: 24,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}
                                    />
                                    <Chip 
                                        label={selectedQuery.category} 
                                        size="small" 
                                        variant="outlined" 
                                        sx={{ 
                                            borderColor: theme.primary,
                                            color: theme.primary,
                                            fontWeight: 600,
                                            fontSize: '0.7rem',
                                            height: 24,
                                            borderWidth: '1.5px'
                                        }}
                                    />
                                    {selectedQuery.priority && selectedQuery.priority !== 'medium' && (
                                        <Chip
                                            label={selectedQuery.priority.toUpperCase()}
                                            size="small"
                                            sx={{ 
                                                backgroundColor: selectedQuery.priority === 'urgent' ? '#e74c3c' : 
                                                                 selectedQuery.priority === 'high' ? '#f39c12' : '#95a5a6',
                                                color: 'white',
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                height: 24
                                            }}
                                        />
                                    )}
                                </Box>
                                <Typography variant="caption" sx={{ 
                                    color: theme.textSecondary,
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5
                                }}>
                                    <PersonIcon sx={{ fontSize: '0.9rem' }} />
                                    Employee ID: {selectedQuery.employeeId?.employeeId || 'N/A'}
                                </Typography>
                            </Box>

                            {/* Messages */}
                            <Box
                                ref={messageListRef}
                                sx={{
                                    flex: 1,
                                    overflow: 'auto',
                                    p: 2,
                                    backgroundColor: '#f5f7fa',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 1.5
                                }}
                            >
                                {selectedQuery.messages?.map((msg, index) => {
                                    const isEmployee = msg.sender === 'employee';
                                    return (
                                        <Fade in key={index} timeout={300}>
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: isEmployee ? 'flex-end' : 'flex-start',
                                                    mb: 0.5
                                                }}
                                            >
                                                <Paper
                                                    elevation={0}
                                                    sx={{
                                                        p: 1.5,
                                                        maxWidth: '75%',
                                                        backgroundColor: isEmployee ? theme.primary : 'white',
                                                        color: isEmployee ? 'white' : theme.textPrimary,
                                                        borderRadius: 2.5,
                                                        border: isEmployee ? 'none' : `1px solid ${theme.border}`,
                                                        boxShadow: isEmployee 
                                                            ? '0 2px 8px rgba(44, 62, 80, 0.15)' 
                                                            : '0 1px 3px rgba(0,0,0,0.08)',
                                                        position: 'relative'
                                                    }}
                                                >
                                                    <Typography 
                                                        variant="caption" 
                                                        sx={{ 
                                                            fontWeight: 700, 
                                                            opacity: isEmployee ? 0.95 : 0.8,
                                                            color: isEmployee ? 'white' : theme.primary,
                                                            fontSize: '0.7rem',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.3px',
                                                            display: 'block',
                                                            mb: 0.5
                                                        }}
                                                    >
                                                        {msg.senderName}
                                                    </Typography>
                                                    <Typography 
                                                        variant="body2" 
                                                        sx={{ 
                                                            whiteSpace: 'pre-wrap', 
                                                            wordBreak: 'break-word',
                                                            lineHeight: 1.5,
                                                            fontSize: '0.9rem'
                                                        }}
                                                    >
                                                        {msg.message}
                                                    </Typography>
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            display: 'block',
                                                            mt: 0.75,
                                                            opacity: 0.7,
                                                            fontSize: '0.65rem',
                                                            textAlign: 'right'
                                                        }}
                                                    >
                                                        {format(new Date(msg.timestamp), 'MMM dd, hh:mm a')}
                                                    </Typography>
                                                </Paper>
                                            </Box>
                                        </Fade>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </Box>

                            {/* Message Input */}
                            <Box sx={{ 
                                p: 2.5, 
                                borderTop: `1px solid ${theme.border}`, 
                                backgroundColor: 'white',
                                boxShadow: '0 -2px 12px rgba(0,0,0,0.04)'
                            }}>
                                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
                                    <TextField
                                        fullWidth
                                        multiline
                                        maxRows={4}
                                        placeholder="Type your message..."
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        disabled={sending}
                                        sx={{
                                            '& .MuiOutlinedInput-root': {
                                                borderRadius: '12px',
                                                backgroundColor: theme.background,
                                                '& fieldset': {
                                                    borderColor: theme.border,
                                                },
                                                '&:hover fieldset': {
                                                    borderColor: theme.primary,
                                                },
                                                '&.Mui-focused fieldset': {
                                                    borderColor: theme.primary,
                                                    borderWidth: '2px'
                                                },
                                                '& .MuiInputBase-input': {
                                                    padding: '12px 14px',
                                                    fontSize: '0.9rem'
                                                }
                                            }
                                        }}
                                    />
                                    <Box
                                        onClick={handleSendMessage}
                                        sx={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '50%',
                                            backgroundColor: !newMessage.trim() || sending ? theme.subtleStrong : theme.primary,
                                            color: !newMessage.trim() || sending ? theme.textSecondary : 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: !newMessage.trim() || sending ? 'not-allowed' : 'pointer',
                                            boxShadow: !newMessage.trim() || sending ? 'none' : '0 4px 12px rgba(44, 62, 80, 0.2)',
                                            transition: 'all 0.2s ease',
                                            flexShrink: 0,
                                            '&:hover': !newMessage.trim() || sending ? {} : {
                                                backgroundColor: theme.primaryDark,
                                                boxShadow: '0 6px 16px rgba(44, 62, 80, 0.3)',
                                                transform: 'translateY(-1px)'
                                            },
                                            '&:active': !newMessage.trim() || sending ? {} : {
                                                transform: 'translateY(0px)',
                                                boxShadow: '0 2px 8px rgba(44, 62, 80, 0.2)'
                                            }
                                        }}
                                    >
                                        {sending ? <CircularProgress size={24} sx={{ color: 'white' }} /> : <SendIcon />}
                                    </Box>
                                </Box>
                            </Box>
                        </>
                    )}
                    
                    {/* Resource Request Detail View */}
                    {selectedQuery && selectedQuery.itemType === 'resource_request' && (
                        <ResourceRequestDetailView 
                            request={selectedQuery}
                            theme={theme}
                            getStatusColor={getStatusColor}
                            onStatusUpdate={fetchQueries}
                        />
                    )}
                </Box>
            </Drawer>
        </>
    );
};

// Resource Request Detail View Component
const ResourceRequestDetailView = ({ request, theme, getStatusColor, onStatusUpdate }) => {
    const [status, setStatus] = useState(request.status);
    const [adminNotes, setAdminNotes] = useState(request.resourceRequestData?.adminNotes || '');
    const [updating, setUpdating] = useState(false);

    const handleUpdateStatus = async () => {
        setUpdating(true);
        try {
            await api.patch(`/hr-queries/admin/resource-request/${request._id}/status`, {
                status,
                adminNotes
            });
            
            // Refresh the list
            if (onStatusUpdate) {
                await onStatusUpdate();
            }
            
            alert('Resource request updated successfully');
        } catch (error) {
            console.error('Failed to update resource request:', error);
            alert('Failed to update resource request');
        } finally {
            setUpdating(false);
        }
    };

    return (
        <>
            {/* Request Info */}
            <Box sx={{ 
                p: 2, 
                borderBottom: `1px solid ${theme.border}`, 
                backgroundColor: 'white'
            }}>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip
                        label={status.replace('-', ' ').toUpperCase()}
                        size="small"
                        sx={{
                            backgroundColor: getStatusColor(status.toLowerCase().replace(' ', '-')),
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 24,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}
                    />
                    <Chip 
                        label={request.category} 
                        size="small" 
                        variant="outlined" 
                        sx={{ 
                            borderColor: theme.primary,
                            color: theme.primary,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 24,
                            borderWidth: '1.5px'
                        }}
                    />
                    {request.priority && request.priority !== 'medium' && (
                        <Chip
                            label={request.priority.toUpperCase()}
                            size="small"
                            sx={{ 
                                backgroundColor: request.priority === 'high' ? '#f39c12' : '#95a5a6',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                height: 24
                            }}
                        />
                    )}
                </Box>
                <Typography variant="caption" sx={{ 
                    color: theme.textSecondary,
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5
                }}>
                    <PersonIcon sx={{ fontSize: '0.9rem' }} />
                    {request.employeeId?.fullName} ({request.employeeId?.employeeId || 'N/A'})
                </Typography>
            </Box>

            {/* Request Details */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2.5, backgroundColor: '#f5f7fa' }}>
                <Paper elevation={0} sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                    <Typography variant="h6" sx={{ 
                        fontWeight: 600, 
                        mb: 2, 
                        color: theme.textPrimary,
                        fontSize: '1.1rem'
                    }}>
                        {request.resourceRequestData?.title || request.subject}
                    </Typography>
                    
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" sx={{ 
                            fontWeight: 700, 
                            color: theme.textSecondary, 
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            fontSize: '0.7rem'
                        }}>
                            Description
                        </Typography>
                        <Typography variant="body2" sx={{ 
                            mt: 0.5, 
                            color: theme.textPrimary,
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap'
                        }}>
                            {request.resourceRequestData?.description || request.description}
                        </Typography>
                    </Box>
                    
                    <Divider sx={{ my: 2 }} />
                    
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <Box>
                            <Typography variant="caption" sx={{ 
                                fontWeight: 700, 
                                color: theme.textSecondary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                fontSize: '0.7rem'
                            }}>
                                Quantity
                            </Typography>
                            <Typography variant="body2" sx={{ 
                                mt: 0.5, 
                                color: theme.textPrimary,
                                fontWeight: 600
                            }}>
                                {request.quantity || 1}
                            </Typography>
                        </Box>
                        
                        <Box>
                            <Typography variant="caption" sx={{ 
                                fontWeight: 700, 
                                color: theme.textSecondary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                fontSize: '0.7rem'
                            }}>
                                Requested On
                            </Typography>
                            <Typography variant="body2" sx={{ 
                                mt: 0.5, 
                                color: theme.textPrimary 
                            }}>
                                {format(new Date(request.createdAt), 'MMM dd, yyyy')}
                            </Typography>
                        </Box>
                    </Box>
                    
                    {request.resourceRequestData?.reviewedByName && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <Box>
                                <Typography variant="caption" sx={{ 
                                    fontWeight: 700, 
                                    color: theme.textSecondary,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    fontSize: '0.7rem'
                                }}>
                                    Reviewed By
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                    mt: 0.5, 
                                    color: theme.textPrimary 
                                }}>
                                    {request.resourceRequestData.reviewedByName} on{' '}
                                    {format(new Date(request.resourceRequestData.reviewedAt), 'MMM dd, yyyy')}
                                </Typography>
                            </Box>
                        </>
                    )}
                </Paper>

                {/* Update Status Section */}
                <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2 }}>
                    <Typography variant="subtitle2" sx={{ 
                        fontWeight: 700, 
                        mb: 2, 
                        color: theme.textPrimary 
                    }}>
                        Update Status
                    </Typography>
                    
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Status</InputLabel>
                        <Select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            label="Status"
                        >
                            <MenuItem value="Pending">Pending</MenuItem>
                            <MenuItem value="In Progress">In Progress</MenuItem>
                            <MenuItem value="Fulfilled">Fulfilled</MenuItem>
                            <MenuItem value="Rejected">Rejected</MenuItem>
                        </Select>
                    </FormControl>
                    
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Admin Notes"
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Add notes about this request..."
                        sx={{ mb: 2 }}
                    />
                    
                    <Button
                        fullWidth
                        variant="contained"
                        onClick={handleUpdateStatus}
                        disabled={updating}
                        sx={{
                            backgroundColor: theme.primary,
                            '&:hover': {
                                backgroundColor: theme.primaryDark
                            },
                            textTransform: 'none',
                            fontWeight: 600,
                            py: 1.2
                        }}
                    >
                        {updating ? <CircularProgress size={24} /> : 'Update Request'}
                    </Button>
                </Paper>
            </Box>
        </>
    );
};

export default HRQueryFloatingChat;
