import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Tabs,
  Tab,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  FolderOpen as FolderOpenIcon,
  Add as AddIcon,
  Download as DownloadIcon,
  Analytics as AnalyticsIcon,
  List as ListIcon
} from '@mui/icons-material';
import api from '../api/axios';
import CIFDrawer from '../components/CIF/CIFDrawer';
import CIFAnalytics from '../components/CIF/CIFAnalytics';
import CIFFilterPanel from '../components/CIF/CIFFilterPanel';
import CIFRecordsList from '../components/CIF/CIFRecordsList';
import PageHeroHeader from '../components/PageHeroHeader';
import '../styles/CIFManagement.css';

const CIFManagementEnhanced = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'list');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState({
    severity: [],
    status: [],
    category: [],
    confidentialLevel: [],
    dateFrom: '',
    dateTo: '',
    includeArchived: false
  });
  const [exporting, setExporting] = useState(false);

  // Sync tab with URL
  useEffect(() => {
    const tab = searchParams.get('tab') || 'list';
    setActiveTab(tab);
  }, [searchParams]);

  // Load filters from URL on mount
  useEffect(() => {
    const urlFilters = {
      severity: searchParams.get('severity')?.split(',').filter(Boolean) || [],
      status: searchParams.get('status')?.split(',').filter(Boolean) || [],
      category: searchParams.get('category')?.split(',').filter(Boolean) || [],
      confidentialLevel: searchParams.get('confidentialLevel')?.split(',').filter(Boolean) || [],
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
      includeArchived: searchParams.get('includeArchived') === 'true'
    };
    setFilters(urlFilters);
  }, []);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setSearchParams({ tab: newValue });
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    
    // Update URL with filters
    const params = new URLSearchParams(searchParams);
    params.set('tab', activeTab);
    
    // Add filter params
    Object.entries(newFilters).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length > 0) {
        params.set(key, value.join(','));
      } else if (value && !Array.isArray(value)) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    
    setSearchParams(params);
  };

  const handleClearFilters = () => {
    const emptyFilters = {
      severity: [],
      status: [],
      category: [],
      confidentialLevel: [],
      dateFrom: '',
      dateTo: '',
      includeArchived: false
    };
    setFilters(emptyFilters);
    setSearchParams({ tab: activeTab });
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      
      // Build query params from filters
      const params = new URLSearchParams();
      if (filters.severity.length > 0) params.set('severity', filters.severity.join(','));
      if (filters.status.length > 0) params.set('status', filters.status.join(','));
      if (filters.category.length > 0) params.set('category', filters.category.join(','));
      if (filters.confidentialLevel.length > 0) params.set('confidentialLevel', filters.confidentialLevel.join(','));
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.includeArchived) params.set('includeArchived', 'true');

      const response = await api.get(`/admin/cif/export?${params.toString()}`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `cif-export-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CIF records:', error);
      alert('Failed to export CIF records. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleOpenDrawer = () => {
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  const handleSaveSuccess = () => {
    handleCloseDrawer();
    // Trigger refresh in child component if needed
    window.dispatchEvent(new CustomEvent('cif-refresh'));
  };

  return (
    <Box className="cif-management-page">
      {/* Hero Header */}
      <PageHeroHeader
        eyebrow="HR Operations"
        title="Critical Incident Files"
        description="Manage incident records and HR documentation."
        icon={<FolderOpenIcon />}
        actionArea={
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Export Button (Super Admin Only) */}
            <Tooltip title="Export to CSV (Max 5000 records)">
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleExport}
                disabled={exporting}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: '#DC2626',
                  color: '#DC2626',
                  '&:hover': {
                    borderColor: '#B91C1C',
                    bgcolor: '#FEE2E2'
                  }
                }}
              >
                {exporting ? 'Exporting...' : 'Export CSV'}
              </Button>
            </Tooltip>

            {/* New CIF Button */}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenDrawer}
              sx={{
                bgcolor: '#DC2626',
                color: 'white',
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                py: 1.25,
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                '&:hover': {
                  bgcolor: '#B91C1C',
                  boxShadow: '0 6px 16px rgba(220, 38, 38, 0.4)'
                }
              }}
            >
              New CIF Record
            </Button>
          </Box>
        }
      />

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '1rem',
              minHeight: '48px',
              color: '#6B7280',
              '&.Mui-selected': {
                color: '#DC2626'
              }
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#DC2626',
              height: '3px'
            }
          }}
        >
          <Tab
            icon={<ListIcon />}
            iconPosition="start"
            label="CIF Records"
            value="list"
          />
          <Tab
            icon={<AnalyticsIcon />}
            iconPosition="start"
            label="Analytics"
            value="analytics"
          />
        </Tabs>
      </Box>

      {/* Filter Panel (only show on list tab) */}
      {activeTab === 'list' && (
        <CIFFilterPanel
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />
      )}

      {/* Tab Content */}
      {activeTab === 'list' && (
        <CIFRecordsList filters={filters} />
      )}
      {activeTab === 'analytics' && (
        <CIFAnalytics />
      )}

      {/* CIF Drawer */}
      <CIFDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        onSaveSuccess={handleSaveSuccess}
        mode="create"
      />
    </Box>
  );
};

export default CIFManagementEnhanced;
