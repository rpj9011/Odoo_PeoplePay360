// frontend/src/components/SkeletonLoaders.jsx
// YouTube-style skeleton loading components with proper shimmer animation
// Optimized for 300ms performance budget and zero layout shifts

import React from 'react';
import { Box, Stack } from '@mui/material';
import { styled } from '@mui/material/styles';

/**
 * YouTube-style shimmer animation keyframes
 * - Linear gradient moving left to right
 * - Base color: #E5E7EB or #F3F4F6
 * - Shimmer color: #FFFFFF with 40-60% opacity
 * - Animation duration: 1.5s
 * - Animation timing: ease-in-out infinite
 * - Gradient angle: -45deg for diagonal shimmer
 */
const shimmerKeyframes = {
    '@keyframes youtubeShimmer': {
        '0%': {
            backgroundPosition: '-200% 0',
        },
        '100%': {
            backgroundPosition: '200% 0',
        },
    },
};

/**
 * Base skeleton component with YouTube-style shimmer
 * GPU-accelerated with transform3d for 60fps animation
 */
const ShimmerBox = styled(Box)(({ theme, width = '100%', height = '20px', borderRadius = '4px' }) => ({
    width,
    height,
    borderRadius,
    background: `linear-gradient(-45deg, #E5E7EB 25%, #F3F4F6 37%, #E5E7EB 63%)`,
    backgroundSize: '400% 100%',
    animation: 'youtubeShimmer 1.5s ease-in-out infinite',
    transform: 'translateZ(0)', // GPU acceleration
    willChange: 'background-position', // Performance optimization
    ...shimmerKeyframes,
}));

/**
 * BASE SKELETON PRIMITIVES
 * YouTube-style loading components
 */

/**
 * SkeletonBox: Rectangular placeholder
 */
export const SkeletonBox = ({
    width = '100%',
    height = '20px',
    borderRadius = '4px',
    sx = {}
}) => (
    <ShimmerBox
        width={width}
        height={height}
        sx={{
            borderRadius,
            ...sx
        }}
    />
);

/**
 * SkeletonCircle: Circular placeholder (for avatars/icons)
 */
export const SkeletonCircle = ({
    size = 40,
    sx = {}
}) => (
    <ShimmerBox
        width={size}
        height={size}
        sx={{
            borderRadius: '50%',
            ...sx
        }}
    />
);

/**
 * SkeletonText: Text line placeholder
 */
export const SkeletonText = ({
    width = '100%',
    height = '20px',
    lines = 1,
    spacing = 1,
    sx = {}
}) => (
    <Stack spacing={spacing} sx={sx}>
        {Array.from({ length: lines }).map((_, idx) => (
            <ShimmerBox
                key={idx}
                width={Array.isArray(width) ? width[idx] || '100%' : width}
                height={height}
                borderRadius="4px"
            />
        ))}
    </Stack>
);

/**
 * SkeletonCard: Card container with shimmer
 */
export const SkeletonCard = ({
    height = '120px',
    padding = 2,
    borderRadius = '8px',
    children,
    sx = {}
}) => (
    <ShimmerBox
        width="100%"
        height={height}
        sx={{
            borderRadius,
            padding,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            ...sx
        }}
    >
        {children}
    </ShimmerBox>
);

/**
 * COMPOSITE SKELETON COMPONENTS
 */

/**
 * Table Skeleton Loader
 * Matches typical table structure with exact column layouts
 */
export const TableSkeleton = ({
    rows = 8,
    columns = 4,
    columnWidths = [],
    headerHeight = 48,
    rowHeight = 56,
    showHeader = true,
    minHeight
}) => {
    return (
        <Box sx={{ width: '100%', minHeight: minHeight || '400px' }}>
            {/* Table Header */}
            {showHeader && (
                <Stack direction="row" spacing={1} sx={{ mb: 2, px: 2 }}>
                    {Array.from({ length: columns }).map((_, idx) => (
                        <ShimmerBox
                            key={`header-${idx}`}
                            width={columnWidths[idx] || '100%'}
                            height={headerHeight}
                            borderRadius="6px"
                        />
                    ))}
                </Stack>
            )}

            {/* Table Rows */}
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <Stack
                    key={`row-${rowIdx}`}
                    direction="row"
                    spacing={1}
                    sx={{ mb: 1, px: 2 }}
                >
                    {Array.from({ length: columns }).map((_, colIdx) => (
                        <ShimmerBox
                            key={`cell-${rowIdx}-${colIdx}`}
                            width={columnWidths[colIdx] || '100%'}
                            height={rowHeight}
                            borderRadius="4px"
                        />
                    ))}
                </Stack>
            ))}
        </Box>
    );
};

/**
 * Card Skeleton Loader
 * Matches typical card layout with YouTube-style shimmer
 */
export const CardSkeletonLoader = ({ count = 1, minHeight, showTitle = true, showContent = true }) => {
    return (
        <Stack spacing={2} sx={{ width: '100%', minHeight: minHeight || '200px' }}>
            {Array.from({ length: count }).map((_, idx) => (
                <Box key={`card-${idx}`} sx={{ p: 2, borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    {/* Card Title */}
                    {showTitle && (
                        <SkeletonText
                            width="60%"
                            height="32px"
                            sx={{ mb: 2 }}
                        />
                    )}

                    {/* Card Content */}
                    {showContent && (
                        <Stack spacing={1.5}>
                            <SkeletonText
                                width={['100%', '80%', '90%']}
                                height="20px"
                                lines={3}
                                spacing={1}
                            />
                            <SkeletonBox
                                width="100%"
                                height="120px"
                                borderRadius="8px"
                                sx={{ mt: 2 }}
                            />
                        </Stack>
                    )}
                </Box>
            ))}
        </Stack>
    );
};

/**
 * Form Skeleton Loader
 * Matches typical form structure with YouTube-style shimmer
 */
export const FormSkeleton = ({
    fields = 5,
    minHeight,
    showTitle = true,
    showSubmitButton = true,
    titleWidth = '40%'
}) => {
    return (
        <Box sx={{ width: '100%', minHeight: minHeight || '400px', p: 3 }}>
            <Stack spacing={3}>
                {/* Form Title */}
                {showTitle && (
                    <SkeletonText
                        width={titleWidth}
                        height="40px"
                    />
                )}

                {/* Form Fields */}
                {Array.from({ length: fields }).map((_, idx) => (
                    <Box key={`field-${idx}`}>
                        <SkeletonText
                            width="30%"
                            height="20px"
                            sx={{ mb: 1 }}
                        />
                        <SkeletonBox
                            width="100%"
                            height="56px"
                            borderRadius="8px"
                        />
                    </Box>
                ))}

                {/* Submit Button */}
                {showSubmitButton && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <SkeletonBox
                            width="120px"
                            height="40px"
                            borderRadius="8px"
                        />
                    </Box>
                )}
            </Stack>
        </Box>
    );
};

/**
 * Dashboard Skeleton Loader
 * Matches typical dashboard layout with cards and stats
 */
export const DashboardSkeleton = ({ minHeight }) => {
    return (
        <Box sx={{ width: '100%', minHeight: minHeight || '600px', p: 3 }}>
            {/* Dashboard Header */}
            <SkeletonText
                width="40%"
                height="48px"
                sx={{ mb: 4 }}
            />

            {/* Stats Cards Row */}
            <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
                {Array.from({ length: 4 }).map((_, idx) => (
                    <Box
                        key={`stat-${idx}`}
                        sx={{
                            flex: 1,
                            p: 2,
                            borderRadius: 2,
                            border: '1px solid #E5E7EB',
                        }}
                    >
                        <SkeletonText
                            width="60%"
                            height="20px"
                            sx={{ mb: 1 }}
                        />
                        <SkeletonText
                            width="80%"
                            height="40px"
                        />
                    </Box>
                ))}
            </Stack>

            {/* Content Cards */}
            <Stack direction="row" spacing={2}>
                <Box sx={{ flex: 2 }}>
                    <CardSkeletonLoader count={2} />
                </Box>
                <Box sx={{ flex: 1 }}>
                    <CardSkeletonLoader count={1} />
                </Box>
            </Stack>
        </Box>
    );
};

/**
 * List Skeleton Loader
 * For simple list items with YouTube-style shimmer
 */
export const ListSkeleton = ({ items = 5, minHeight, showAvatar = true }) => {
    return (
        <Stack spacing={1.5} sx={{ width: '100%', minHeight: minHeight || '300px', p: 2 }}>
            {Array.from({ length: items }).map((_, idx) => (
                <Box
                    key={`list-item-${idx}`}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        p: 2,
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                    }}
                >
                    {showAvatar && (
                        <SkeletonCircle size={40} />
                    )}
                    <Box sx={{ flex: 1 }}>
                        <SkeletonText
                            width="70%"
                            height="24px"
                            sx={{ mb: 0.5 }}
                        />
                        <SkeletonText
                            width="50%"
                            height="20px"
                        />
                    </Box>
                </Box>
            ))}
        </Stack>
    );
};

/**
 * PAGE-SPECIFIC SKELETON COMPONENTS
 * Match exact layouts of real pages for zero layout shifts
 */

/**
 * Employee Dashboard Skeleton
 * Matches exact layout of EmployeeDashboardPage
 */
export const EmployeeDashboardSkeleton = () => (
    <Box className="employee-dashboard-container">
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
            {/* Left Column */}
            <Box sx={{ flex: 1 }}>
                <Stack spacing={3}>
                    {/* Action Card */}
                    <Box className="dashboard-card-base action-card">
                        <Box sx={{ p: 3 }}>
                            <SkeletonText width="40%" height="28px" sx={{ mb: 2 }} />
                            <SkeletonText width="50%" height="16px" />
                            <Box sx={{ mt: 3, minHeight: 200 }}>
                                <SkeletonBox width="100%" height="180px" borderRadius="8px" />
                            </Box>
                            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                                <SkeletonBox width="120px" height="40px" borderRadius="8px" />
                                <SkeletonBox width="100px" height="40px" borderRadius="8px" />
                            </Stack>
                        </Box>
                    </Box>

                    {/* Weekly Time Cards */}
                    <Box className="dashboard-card-base weekly-view-card">
                        <Box sx={{ p: 2 }}>
                            <Stack spacing={2}>
                                <SkeletonBox width="100%" height="80px" borderRadius="8px" />
                                <SkeletonBox width="100%" height="80px" borderRadius="8px" />
                                <SkeletonBox width="100%" height="80px" borderRadius="8px" />
                            </Stack>
                        </Box>
                    </Box>
                </Stack>
            </Box>

            {/* Middle Column */}
            <Box sx={{ flex: 1 }}>
                <Stack spacing={3}>
                    {/* Profile Card */}
                    <Box className="dashboard-card-base profile-card" sx={{ textAlign: 'center', p: 3 }}>
                        <SkeletonCircle size={80} sx={{ mx: 'auto', mb: 2 }} />
                        <SkeletonText width="70%" height="24px" sx={{ mb: 1 }} />
                        <SkeletonText width="50%" height="16px" sx={{ mb: 2 }} />
                        <SkeletonBox width="50px" height="2px" borderRadius="1px" sx={{ mx: 'auto', mb: 2 }} />
                        <SkeletonText width="80%" height="16px" />
                    </Box>

                    {/* Shift Info Card */}
                    <Box className="dashboard-card-base shift-info-card">
                        <Box sx={{ p: 3 }}>
                            <SkeletonText width="50%" height="24px" sx={{ mb: 2 }} />
                            <SkeletonBox width="100%" height="2px" borderRadius="1px" sx={{ mb: 3 }} />
                            <Stack spacing={3}>
                                <Box>
                                    <SkeletonText width="60%" height="20px" />
                                    <SkeletonText width="40%" height="16px" sx={{ mt: 0.5 }} />
                                </Box>
                                <Box>
                                    <SkeletonText width="70%" height="20px" />
                                    <SkeletonText width="50%" height="16px" sx={{ mt: 0.5 }} />
                                </Box>
                                <SkeletonBox width="100%" height="40px" borderRadius="8px" />
                            </Stack>
                        </Box>
                    </Box>
                </Stack>
            </Box>

            {/* Right Column */}
            <Box sx={{ flex: 1 }}>
                <Stack spacing={3}>
                    {/* Recent Activity Card */}
                    <Box className="dashboard-card-base recent-activity-card" sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                        <Box sx={{ p: 3, flexGrow: 1 }}>
                            <SkeletonText width="50%" height="24px" sx={{ mb: 3 }} />
                            <Stack spacing={2}>
                                {Array.from({ length: 4 }).map((_, idx) => (
                                    <Box key={idx} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                        <SkeletonCircle size={40} />
                                        <Box sx={{ flex: 1 }}>
                                            <SkeletonText width="80%" height="18px" />
                                            <SkeletonText width="60%" height="16px" sx={{ mt: 0.5 }} />
                                        </Box>
                                        <SkeletonBox width="60px" height="24px" borderRadius="12px" />
                                    </Box>
                                ))}
                            </Stack>
                        </Box>
                    </Box>

                    {/* Saturday Schedule Card */}
                    <Box className="dashboard-card-base saturday-schedule-card" sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                        <Box sx={{ p: 3, flexGrow: 1 }}>
                            <SkeletonText width="60%" height="24px" sx={{ mb: 2 }} />
                            <SkeletonBox width="100%" height="2px" borderRadius="1px" sx={{ mb: 3 }} />
                            <Stack spacing={2}>
                                {Array.from({ length: 3 }).map((_, idx) => (
                                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <SkeletonText width="40%" height="18px" />
                                        <SkeletonBox width="80px" height="24px" borderRadius="12px" />
                                    </Box>
                                ))}
                            </Stack>
                        </Box>
                    </Box>
                </Stack>
            </Box>
        </Stack>
    </Box>
);

/**
 * Leaves Page Skeleton
 * Matches exact layout of LeavesPage
 */
export const LeavesPageSkeleton = () => (
    <Box sx={{ width: '100%', p: 3 }}>
        <Stack spacing={3}>
            {/* Balance Cards Row */}
            <Stack direction="row" spacing={2}>
                {Array.from({ length: 3 }).map((_, idx) => (
                    <Box key={idx} className="balance-box" sx={{ flex: 1, p: 2, borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                        <SkeletonCircle size={40} sx={{ mb: 1 }} />
                        <SkeletonText width="60%" height="24px" sx={{ mb: 0.5 }} />
                        <SkeletonText width="40%" height="16px" />
                    </Box>
                ))}
            </Stack>

            {/* Company Holidays Card */}
            <Box className="content-card">
                <SkeletonText width="50%" height="28px" sx={{ mb: 2 }} />
                <Box className="scrollable-content">
                    <Stack spacing={2}>
                        {Array.from({ length: 6 }).map((_, idx) => (
                            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <SkeletonCircle size={32} />
                                    <Box>
                                        <SkeletonText width="60%" height="20px" />
                                        <SkeletonText width="40%" height="16px" sx={{ mt: 0.5 }} />
                                    </Box>
                                </Box>
                                <SkeletonBox width="80px" height="24px" borderRadius="12px" />
                            </Box>
                        ))}
                    </Stack>
                </Box>
            </Box>

            {/* Leave Requests Table */}
            <Box className="content-card">
                <SkeletonText width="40%" height="28px" sx={{ mb: 2 }} />
                <TableSkeleton
                    rows={8}
                    columns={5}
                    columnWidths={['20%', '25%', '20%', '15%', '20%']}
                    headerHeight={48}
                    rowHeight={56}
                />
            </Box>
        </Stack>
    </Box>
);

/**
 * Generic Page Skeleton
 * Full page skeleton that maintains layout structure
 */
export const PageSkeleton = ({ type = 'default', minHeight }) => {
    switch (type) {
        case 'table':
            return <TableSkeleton minHeight={minHeight} />;
        case 'dashboard':
            return <DashboardSkeleton minHeight={minHeight} />;
        case 'form':
            return <FormSkeleton minHeight={minHeight} />;
        case 'list':
            return <ListSkeleton minHeight={minHeight} />;
        case 'employee-dashboard':
            return <EmployeeDashboardSkeleton />;
        case 'leaves':
            return <LeavesPageSkeleton />;
        default:
            return <CardSkeletonLoader count={3} minHeight={minHeight} />;
    }
};

export default {
    // Base primitives
    SkeletonBox,
    SkeletonCircle,
    SkeletonText,
    SkeletonCard,

    // Composite components
    TableSkeleton,
    CardSkeletonLoader,
    FormSkeleton,
    DashboardSkeleton,
    ListSkeleton,

    // Page-specific skeletons
    EmployeeDashboardSkeleton,
    LeavesPageSkeleton,

    // Generic page skeleton
    PageSkeleton,
};















