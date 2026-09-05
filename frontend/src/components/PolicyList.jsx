import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, List, ListItem, ListItemButton, ListItemText, Chip, Stack } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';

const PolicyList = ({ policies, onPolicyClick, showActions = false }) => {
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (!policies || policies.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                    No policies available
                </Typography>
            </Box>
        );
    }

    return (
        <List sx={{ p: 0 }}>
            {policies.map((policy) => (
                <ListItem
                    key={policy._id}
                    disablePadding
                    sx={{
                        borderBottom: '1px solid #e8e8e8',
                        '&:last-child': { borderBottom: 'none' }
                    }}
                >
                    <ListItemButton
                        onClick={() => onPolicyClick(policy)}
                        sx={{
                            py: 1,
                            px: 1.2,
                            '&:hover': {
                                backgroundColor: '#f5f5f5'
                            }
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%', gap: 1 }}>
                            <DescriptionIcon sx={{ color: '#E53935', fontSize: 20, mt: 0.3 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography 
                                    variant="body2" 
                                    fontWeight={600} 
                                    color="#222"
                                    sx={{ 
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    {policy.name}
                                </Typography>
                                <Stack direction="row" spacing={0.5} mt={0.3} flexWrap="wrap">
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                        v{policy.version}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                        • {formatDate(policy.effectiveFrom)}
                                    </Typography>
                                </Stack>
                            </Box>
                            {policy.status && (
                                <Chip
                                    label={policy.status}
                                    size="small"
                                    color={policy.status === 'Active' ? 'success' : 'default'}
                                    sx={{ 
                                        fontWeight: 600,
                                        fontSize: '0.65rem',
                                        height: '18px',
                                        '& .MuiChip-label': {
                                            padding: '0 6px'
                                        }
                                    }}
                                />
                            )}
                        </Box>
                    </ListItemButton>
                </ListItem>
            ))}
        </List>
    );
};

PolicyList.propTypes = {
    policies: PropTypes.array.isRequired,
    onPolicyClick: PropTypes.func.isRequired,
    showActions: PropTypes.bool
};

export default PolicyList;
