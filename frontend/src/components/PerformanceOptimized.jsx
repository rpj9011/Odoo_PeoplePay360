// Performance-optimized components for better loading times
import React, { memo, useMemo, useCallback, lazy, Suspense, useRef, useState } from 'react';
import { Box, Skeleton } from '@mui/material';

// Lazy load heavy components
export const LazyDataGrid = lazy(() => import('@mui/x-data-grid').then(module => ({ default: module.DataGrid })));
export const LazyDatePicker = lazy(() => import('@mui/x-date-pickers').then(module => ({ default: module.DatePicker })));
export const LazyCharts = lazy(() => import('recharts').then(module => ({ default: module.ResponsiveContainer })));

import { SkeletonBox } from '../components/SkeletonLoaders';
// Memoized loading components
export const PageLoader = memo(() => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
    <SkeletonBox width="24px" height="24px" borderRadius="50%" />
  </Box>
));

export const SkeletonLoader = memo(({ variant = 'rectangular', width = '100%', height = 200 }) => (
  <Skeleton variant={variant} width={width} height={height} animation="wave" />
));

// Optimized table skeleton
export const TableSkeleton = memo(({ rows = 5, columns = 4 }) => (
  <Box>
    {Array.from({ length: rows }).map((_, index) => (
      <Box key={index} sx={{ display: 'flex', gap: 2, mb: 1 }}>
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton key={colIndex} variant="rectangular" width="100%" height={40} />
        ))}
      </Box>
    ))}
  </Box>
));

// Optimized card skeleton
export const CardSkeleton = memo(() => (
  <Box sx={{ p: 2 }}>
    <Skeleton variant="text" width="60%" height={32} />
    <Skeleton variant="text" width="40%" height={24} sx={{ mt: 1 }} />
    <Skeleton variant="rectangular" width="100%" height={120} sx={{ mt: 2 }} />
  </Box>
));

// Performance wrapper for heavy components
export const PerformanceWrapper = memo(({ children, fallback = <PageLoader /> }) => (
  <Suspense fallback={fallback}>
    {children}
  </Suspense>
));

// Memoized data formatter
export const useMemoizedData = (data, dependencies = []) => {
  return useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  }, [data, ...dependencies]);
};

// Optimized search hook
export const useOptimizedSearch = (data, searchFields, searchTerm) => {
  return useMemo(() => {
    if (!searchTerm || !data) return data;
    
    const term = searchTerm.toLowerCase();
    return data.filter(item => 
      searchFields.some(field => {
        const value = item[field];
        return value && value.toString().toLowerCase().includes(term);
      })
    );
  }, [data, searchFields, searchTerm]);
};

// Debounced callback hook
export const useDebouncedCallback = (callback, delay) => {
  const timeoutRef = useRef();
  
  return useCallback((...args) => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]);
};

// Virtual scrolling component for large lists
export const VirtualList = memo(({ items, itemHeight = 50, containerHeight = 400, renderItem }) => {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleItems = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(startIndex + Math.ceil(containerHeight / itemHeight) + 1, items.length);
    
    return items.slice(startIndex, endIndex).map((item, index) => ({
      ...item,
      index: startIndex + index
    }));
  }, [items, scrollTop, itemHeight, containerHeight]);
  
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);
  
  return (
    <Box
      sx={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative'
      }}
      onScroll={handleScroll}
    >
      <Box sx={{ height: items.length * itemHeight, position: 'relative' }}>
        {visibleItems.map((item) => (
          <Box
            key={item.index}
            sx={{
              position: 'absolute',
              top: item.index * itemHeight,
              left: 0,
              right: 0,
              height: itemHeight
            }}
          >
            {renderItem(item)}
          </Box>
        ))}
      </Box>
    </Box>
  );
});

// Image optimization component
export const OptimizedImage = memo(({ src, alt, width, height, ...props }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  
  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);
  
  const handleError = useCallback(() => {
    setError(true);
  }, []);
  
  return (
    <Box sx={{ position: 'relative', width, height }}>
      {!loaded && !error && <Skeleton variant="rectangular" width="100%" height="100%" />}
      {error ? (
        <Box sx={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'grey.100',
          color: 'grey.500'
        }}>
          Image not available
        </Box>
      ) : (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            display: loaded ? 'block' : 'none',
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
          {...props}
        />
      )}
    </Box>
  );
});

// Export all components
export default {
  LazyDataGrid,
  LazyDatePicker,
  LazyCharts,
  PageLoader,
  SkeletonLoader,
  TableSkeleton,
  CardSkeleton,
  PerformanceWrapper,
  useMemoizedData,
  useOptimizedSearch,
  useDebouncedCallback,
  VirtualList,
  OptimizedImage,
};
