import React from 'react';
import { Box, Chip, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

const YearSelector = ({ years, selectedYear, onYearChange, onCreateNew }) => {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 3,
                p: 1.5,
                bgcolor: 'white',
                borderRadius: '16px',
                border: '1px solid #e0e0e0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
        >
            {years.map((year) => (
                <Chip
                    key={year._id}
                    label={year.year}
                    onClick={() => onYearChange(year)}
                    color={selectedYear?._id === year._id ? 'error' : 'default'}
                    variant={selectedYear?._id === year._id ? 'filled' : 'outlined'}
                    icon={year.isActive ? <FiberManualRecordIcon sx={{ fontSize: 12 }} /> : null}
                    sx={{
                        fontSize: '16px',
                        fontWeight: selectedYear?._id === year._id ? 600 : 400,
                        transition: 'all 150ms ease',
                        cursor: 'pointer',
                        '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: 1
                        },
                        ...(selectedYear?._id === year._id && {
                            borderBottom: '2px solid',
                            borderBottomColor: 'error.main'
                        })
                    }}
                />
            ))}
            <Button
                startIcon={<AddIcon />}
                onClick={onCreateNew}
                variant="outlined"
                size="small"
                sx={{
                    ml: 'auto',
                    borderRadius: '12px',
                    textTransform: 'none',
                    transition: 'all 150ms ease',
                    '&:hover': {
                        transform: 'translateY(-2px)'
                    }
                }}
            >
                Create New Year
            </Button>
        </Box>
    );
};

export default YearSelector;
