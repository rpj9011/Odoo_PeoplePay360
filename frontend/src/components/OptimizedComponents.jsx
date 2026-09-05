// Optimized reusable components with React.memo
import React, { memo, useCallback, useMemo } from 'react';
import { 
  Typography, 
  Button, 
  Card, 
  CardContent, 
  Box, 
  IconButton,
  Tooltip 
} from '@mui/material';

// Memoized Typography component
export const OptimizedTypography = memo(({ 
  variant = 'body1', 
  children, 
  sx = {}, 
  ...props 
}) => (
  <Typography variant={variant} sx={sx} {...props}>
    {children}
  </Typography>
));

// Memoized Button component
export const OptimizedButton = memo(({ 
  children, 
  onClick, 
  variant = 'contained',
  color = 'primary',
  disabled = false,
  sx = {},
  ...props 
}) => {
  const handleClick = useCallback((event) => {
    if (onClick && !disabled) {
      onClick(event);
    }
  }, [onClick, disabled]);

  return (
    <Button
      variant={variant}
      color={color}
      disabled={disabled}
      onClick={handleClick}
      sx={sx}
      {...props}
    >
      {children}
    </Button>
  );
});

// Memoized Card component
export const OptimizedCard = memo(({ 
  children, 
  elevation = 1,
  sx = {},
  onClick,
  ...props 
}) => {
  const handleClick = useCallback((event) => {
    if (onClick) {
      onClick(event);
    }
  }, [onClick]);

  return (
    <Card 
      elevation={elevation} 
      sx={{ cursor: onClick ? 'pointer' : 'default', ...sx }}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Card>
  );
});

// Memoized IconButton component
export const OptimizedIconButton = memo(({ 
  children, 
  onClick, 
  tooltip,
  disabled = false,
  sx = {},
  ...props 
}) => {
  const handleClick = useCallback((event) => {
    if (onClick && !disabled) {
      onClick(event);
    }
  }, [onClick, disabled]);

  const button = (
    <IconButton
      disabled={disabled}
      onClick={handleClick}
      sx={sx}
      {...props}
    >
      {children}
    </IconButton>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip}>
        {button}
      </Tooltip>
    );
  }

  return button;
});

// Memoized Loading component
export const OptimizedLoading = memo(({ 
  size = 40, 
  message = 'Loading...',
  sx = {} 
}) => (
  <Box 
    sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      p: 2,
      ...sx 
    }}
  >
    <Box
      sx={{
        width: size,
        height: size,
        border: '3px solid #f3f3f3',
        borderTop: '3px solid #3498db',
        borderRadius: '50%',
        animation: 'spin-fast 0.5s linear infinite',
        '@keyframes spin-fast': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      }}
    />
    {message && (
      <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
        {message}
      </Typography>
    )}
  </Box>
));

// Memoized Error component
export const OptimizedError = memo(({ 
  message = 'Something went wrong', 
  onRetry,
  sx = {} 
}) => {
  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    }
  }, [onRetry]);

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        p: 3,
        textAlign: 'center',
        ...sx 
      }}
    >
      <Typography variant="h6" color="error" gutterBottom>
        Error
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {message}
      </Typography>
      {onRetry && (
        <OptimizedButton onClick={handleRetry} variant="outlined" size="small">
          Retry
        </OptimizedButton>
      )}
    </Box>
  );
});

// Memoized Empty State component
export const OptimizedEmptyState = memo(({ 
  title = 'No data available',
  description = 'There is no data to display at the moment.',
  action,
  sx = {} 
}) => (
  <Box 
    sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      p: 4,
      textAlign: 'center',
      ...sx 
    }}
  >
    <Typography variant="h6" color="text.secondary" gutterBottom>
      {title}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      {description}
    </Typography>
    {action}
  </Box>
));

// Performance monitoring hook
export const usePerformanceMonitor = (componentName) => {
  const startTime = useMemo(() => performance.now(), []);
  
  useMemo(() => {
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`${componentName} render time: ${renderTime.toFixed(2)}ms`);
    }
  }, [componentName, startTime]);
};








