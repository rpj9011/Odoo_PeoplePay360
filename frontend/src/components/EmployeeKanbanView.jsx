// frontend/src/components/EmployeeKanbanView.jsx
// Kanban card grid view for the Employees page.
// Reads from the same `employees` array already managed by EmployeesPage —
// no second data-fetching path. Clicking a card calls the same
// handleOpenProfileDialog handler used by the List view.

import { memo } from 'react';
import { Box, Typography, Chip, Grid, Tooltip } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import UserAvatar from './common/UserAvatar';

import {
    TEXT, MUTED, BORDER, SURFACE,
    cardSx,
} from './adminEmployee/adminEmployeeTheme';

// ── Card ─────────────────────────────────────────────────────────────────────

const EmployeeCard = memo(({ employee, onOpen }) => {
    const isActive = employee.isActive !== false;

    return (
        <Box
            onClick={() => onOpen(employee, 'view')}
            role="button"
            tabIndex={0}
            aria-label={`Open profile for ${employee.fullName}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(employee, 'view'); }}
            sx={{
                ...cardSx,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.25,
                py: 3,
                px: 2.5,
                textAlign: 'center',
                transition: 'box-shadow 0.18s ease, transform 0.18s ease',
                '&:hover': {
                    boxShadow: '0 6px 24px rgba(229, 57, 53, 0.12)',
                    transform: 'translateY(-2px)',
                    borderColor: '#FBBCBC',
                },
                '&:focus-visible': {
                    outline: '2px solid #E53935',
                    outlineOffset: '2px',
                },
            }}
        >
            {/* Avatar */}
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
                <UserAvatar user={employee} size="lg" lazy />
                {/* Active / Inactive status dot */}
                <Box
                    aria-label={isActive ? 'Active' : 'Inactive'}
                    sx={{
                        position: 'absolute',
                        bottom: 3,
                        right: 3,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: isActive ? '#22c55e' : '#ef4444',
                        border: '2px solid #fff',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                    }}
                />
            </Box>

            {/* Name */}
            <Box sx={{ width: '100%' }}>
                <Typography
                    variant="body1"
                    fontWeight={700}
                    color={TEXT}
                    noWrap
                    title={employee.fullName}
                    sx={{ fontSize: '0.9375rem', lineHeight: 1.3 }}
                >
                    {employee.fullName}
                </Typography>

                {/* Designation */}
                {employee.designation ? (
                    <Typography
                        variant="body2"
                        sx={{ color: MUTED, fontSize: '0.8rem', mt: 0.25 }}
                        noWrap
                        title={employee.designation}
                    >
                        {employee.designation}
                    </Typography>
                ) : null}
            </Box>

            {/* Department */}
            {employee.department ? (
                <Tooltip title={employee.department} enterDelay={600}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            maxWidth: '100%',
                            overflow: 'hidden',
                        }}
                    >
                        <BusinessIcon sx={{ fontSize: 13, color: MUTED, flexShrink: 0 }} />
                        <Typography
                            variant="caption"
                            sx={{ color: MUTED, fontWeight: 500, fontSize: '0.75rem' }}
                            noWrap
                        >
                            {employee.department}
                        </Typography>
                    </Box>
                </Tooltip>
            ) : null}

            {/* Status chip */}
            <Chip
                size="small"
                label={isActive ? '● Active' : '● Inactive'}
                sx={{
                    height: 22,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    bgcolor: isActive ? '#f0fdf4' : '#fef2f2',
                    color: isActive ? '#166534' : '#991b1b',
                    border: `1px solid ${isActive ? '#bbf7d0' : '#fecaca'}`,
                    letterSpacing: 0.1,
                }}
            />

            {/* Employee code — subtle footer */}
            <Typography
                variant="caption"
                sx={{
                    color: '#94a3b8',
                    fontSize: '0.7rem',
                    mt: 'auto',
                    letterSpacing: 0.3,
                }}
            >
                {employee.employeeCode || '—'}
            </Typography>
        </Box>
    );
});

EmployeeCard.displayName = 'EmployeeCard';

// ── Grid ─────────────────────────────────────────────────────────────────────

const EmployeeKanbanView = ({ employees, onOpen }) => {
    if (!employees || employees.length === 0) {
        return (
            <Box
                sx={{
                    py: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1.5,
                    color: MUTED,
                }}
            >
                <WorkOutlineIcon sx={{ fontSize: 48, opacity: 0.35 }} />
                <Typography variant="body1" fontWeight={500} sx={{ color: MUTED }}>
                    No employees found.
                </Typography>
            </Box>
        );
    }

    return (
        <Grid container spacing={2} sx={{ pt: 0.5 }}>
            {employees.map((employee) => (
                <Grid
                    item
                    key={employee._id}
                    xs={12}
                    sm={6}
                    md={4}
                    lg={3}
                >
                    <EmployeeCard employee={employee} onOpen={onOpen} />
                </Grid>
            ))}
        </Grid>
    );
};

export default EmployeeKanbanView;
