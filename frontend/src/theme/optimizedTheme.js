// Optimized Material UI theme with tree shaking support
import { createTheme } from '@mui/material/styles';

// Import only the components we actually use
import {
  // Core components
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Fab,
  FormControl,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';

// Import only the icons we actually use
import {
  AccountCircle,
  Add,
  ArrowBack,
  ArrowForward,
  CalendarToday,
  Check,
  Close,
  Delete,
  Edit,
  Email,
  ExitToApp,
  Home,
  LocationOn,
  Menu as MenuIcon,
  MoreVert,
  Notifications,
  Person,
  Refresh,
  Save,
  Search,
  Settings,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

// Create optimized theme
const optimizedTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#dc004e',
      light: '#ff5983',
      dark: '#9a0036',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f4f6f8',
      paper: '#ffffff',
    },
    text: {
      primary: '#212121',
      secondary: '#757575',
    },
    error: {
      main: '#f44336',
    },
    warning: {
      main: '#ff9800',
    },
    info: {
      main: '#2196f3',
    },
    success: {
      main: '#4caf50',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.43,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  components: {
    // Optimize common components
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
          '@media (max-width: 768px)': {
            minHeight: '44px',
          },
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '@media (max-width: 768px)': {
            padding: '10px',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
          '@media (max-width: 768px)': {
            '& .MuiInputBase-root': {
              fontSize: '0.875rem',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          '@media (max-width: 768px)': {
            height: '28px',
            fontSize: '0.75rem',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          '@media (max-width: 600px)': {
            margin: '0 !important',
            maxHeight: '92vh !important',
            width: '100% !important',
            maxWidth: '100% !important',
            borderRadius: '20px 20px 0 0 !important',
            position: 'fixed !important',
            bottom: '0 !important',
            top: 'auto !important',
          },
        },
      },
    },
    MuiPopper: {
      defaultProps: {
        modifiers: [
          {
            name: 'preventOverflow',
            options: { boundary: 'viewport' },
          },
        ],
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        toolbar: {
          '@media (max-width: 480px)': {
            flexWrap: 'wrap',
            justifyContent: 'center',
            paddingLeft: '8px',
            paddingRight: '8px',
          },
        },
        selectLabel: {
          '@media (max-width: 480px)': {
            display: 'none',
          },
        },
        displayedRows: {
          '@media (max-width: 480px)': {
            margin: '0',
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          '@media (max-width: 768px)': {
            fontSize: '0.875rem',
          },
        },
      },
    },
    // Optimize DataGrid
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          '& .MuiDataGrid-cell': {
            borderBottom: '1px solid #f0f0f0',
          },
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: '#f8f9fa',
            borderBottom: '2px solid #e0e0e0',
          },
        },
      },
    },
  },
});

export default optimizedTheme;

// Export individual components for tree shaking
export {
  // Core components
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Fab,
  FormControl,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  // Icons
  AccountCircle,
  Add,
  ArrowBack,
  ArrowForward,
  CalendarToday,
  Check,
  Close,
  Delete,
  Edit,
  Email,
  ExitToApp,
  Home,
  LocationOn,
  MenuIcon,
  MoreVert,
  Notifications,
  Person,
  Refresh,
  Save,
  Search,
  Settings,
  Visibility,
  VisibilityOff,
};
