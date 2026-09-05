import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  OutlinedInput
} from '@mui/material';
import {
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { CIF_SEVERITIES, CIF_STATUSES, CIF_CATEGORIES, CONFIDENTIAL_LEVELS } from '../../constants/cifConstants';

const SEVERITY_OPTIONS = CIF_SEVERITIES;
const STATUS_OPTIONS = CIF_STATUSES;
const CATEGORY_OPTIONS = CIF_CATEGORIES;
const CONFIDENTIAL_LEVEL_OPTIONS = CONFIDENTIAL_LEVELS;

const CIFFilterPanel = ({ filters, onFilterChange, onClearFilters }) => {
  const [expanded, setExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleFilterChange = (field, value) => {
    const newFilters = { ...localFilters, [field]: value };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleClearAll = () => {
    const emptyFilters = {
      severity: [],
      status: [],
      category: [],
      confidentialLevel: [],
      dateFrom: '',
      dateTo: '',
      includeArchived: false
    };
    setLocalFilters(emptyFilters);
    onClearFilters();
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (localFilters.severity?.length > 0) count++;
    if (localFilters.status?.length > 0) count++;
    if (localFilters.category?.length > 0) count++;
    if (localFilters.confidentialLevel?.length > 0) count++;
    if (localFilters.dateFrom) count++;
    if (localFilters.dateTo) count++;
    if (localFilters.includeArchived) count++;
    return count;
  };

  const activeCount = getActiveFilterCount();

  return (
    <Accordion
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      sx={{
        borderRadius: '12px !important',
        border: '1px solid #E5E7EB',
        boxShadow: 'none',
        '&:before': { display: 'none' },
        mb: 3
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          borderRadius: '12px',
          '&:hover': { bgcolor: '#F9FAFB' }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
          <FilterListIcon sx={{ color: '#6B7280' }} />
          <Typography variant="body1" fontWeight={600} sx={{ color: '#111827' }}>
            Advanced Filters
          </Typography>
          {activeCount > 0 && (
            <Chip
              label={`${activeCount} active`}
              size="small"
              sx={{
                bgcolor: '#DC2626',
                color: 'white',
                fontWeight: 600,
                height: '24px'
              }}
            />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Row 1: Multi-select filters */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
            {/* Severity Filter */}
            <FormControl size="small" fullWidth>
              <InputLabel>Severity</InputLabel>
              <Select
                multiple
                value={localFilters.severity || []}
                onChange={(e) => handleFilterChange('severity', e.target.value)}
                input={<OutlinedInput label="Severity" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip
                        key={value}
                        label={SEVERITY_OPTIONS.find(o => o.value === value)?.label}
                        size="small"
                        sx={{ height: '24px' }}
                      />
                    ))}
                  </Box>
                )}
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Status Filter */}
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                multiple
                value={localFilters.status || []}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                input={<OutlinedInput label="Status" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip
                        key={value}
                        label={STATUS_OPTIONS.find(o => o.value === value)?.label}
                        size="small"
                        sx={{ height: '24px' }}
                      />
                    ))}
                  </Box>
                )}
              >
                {STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Category Filter */}
            <FormControl size="small" fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                multiple
                value={localFilters.category || []}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                input={<OutlinedInput label="Category" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip
                        key={value}
                        label={CATEGORY_OPTIONS.find(o => o.value === value)?.label}
                        size="small"
                        sx={{ height: '24px' }}
                      />
                    ))}
                  </Box>
                )}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Confidential Level Filter */}
            <FormControl size="small" fullWidth>
              <InputLabel>Confidential Level</InputLabel>
              <Select
                multiple
                value={localFilters.confidentialLevel || []}
                onChange={(e) => handleFilterChange('confidentialLevel', e.target.value)}
                input={<OutlinedInput label="Confidential Level" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip
                        key={value}
                        label={CONFIDENTIAL_LEVEL_OPTIONS.find(o => o.value === value)?.label}
                        size="small"
                        sx={{ height: '24px' }}
                      />
                    ))}
                  </Box>
                )}
              >
                {CONFIDENTIAL_LEVEL_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Row 2: Date range */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
            <TextField
              label="Date From"
              type="date"
              size="small"
              value={localFilters.dateFrom || ''}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Date To"
              type="date"
              size="small"
              value={localFilters.dateTo || ''}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>

          {/* Row 3: Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<ClearIcon />}
              onClick={handleClearAll}
              disabled={activeCount === 0}
              sx={{
                textTransform: 'none',
                borderColor: '#E5E7EB',
                color: '#6B7280',
                '&:hover': {
                  borderColor: '#DC2626',
                  color: '#DC2626',
                  bgcolor: '#FEE2E2'
                }
              }}
            >
              Clear All
            </Button>
          </Box>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default CIFFilterPanel;
