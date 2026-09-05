// frontend/src/components/DashboardSkeletons.jsx
// YouTube-style skeleton components for dashboard elements
// Replaces old MUI Skeleton with custom shimmer implementation

import React from 'react';
import { Box, Stack } from '@mui/material';
import { SkeletonText, SkeletonCircle, SkeletonBox } from './SkeletonLoaders';

export const ShiftInfoSkeleton = () => (
    <Stack spacing={3}>
        <Box>
            <SkeletonText width="60%" height="24px" />
            <SkeletonText width="40%" height="20px" sx={{ mt: 1 }} />
        </Box>
        <Box>
            <SkeletonText width="70%" height="24px" />
            <SkeletonText width="50%" height="20px" sx={{ mt: 1 }} />
        </Box>
        <Box>
            <SkeletonText width="65%" height="24px" />
            <SkeletonText width="45%" height="20px" sx={{ mt: 1 }} />
        </Box>
    </Stack>
);

export const RecentActivitySkeleton = () => (
    <Stack spacing={2}>
        {[1, 2, 3, 4].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <SkeletonCircle size={40} />
                <Box sx={{ flex: 1 }}>
                    <SkeletonText width="80%" height="20px" />
                    <SkeletonText width="60%" height="16px" sx={{ mt: 0.5 }} />
                </Box>
                <SkeletonBox width="60px" height="24px" borderRadius="12px" />
            </Box>
        ))}
    </Stack>
);

export const SaturdayScheduleSkeleton = () => (
    <Stack spacing={2}>
        {[1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonText width="40%" height="20px" />
                <SkeletonBox width="80px" height="24px" borderRadius="12px" />
            </Box>
        ))}
    </Stack>
);

export const WeeklyTimeCardsSkeleton = () => (
    <Stack spacing={2}>
        <SkeletonBox width="100%" height="80px" borderRadius="8px" />
        <SkeletonBox width="100%" height="80px" borderRadius="8px" />
        <SkeletonBox width="100%" height="80px" borderRadius="8px" />
    </Stack>
);









