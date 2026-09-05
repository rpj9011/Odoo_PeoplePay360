// frontend/src/pages/OfficeLocationsPage.jsx
import React, { useRef } from 'react';
import { Box, Button } from '@mui/material';
import { Add } from '@mui/icons-material';
import OfficeLocationManager from '../components/OfficeLocationManager';
import '../styles/OfficeLocationsPage.css';
import PageHeroHeader from '../components/PageHeroHeader';

const OfficeLocationsPage = () => {
    const managerRef = useRef();

    const handleAddLocation = () => {
        if (managerRef.current) {
            managerRef.current.openAddDialog();
        }
    };

    return (
        <div className="office-locations-page">
            <PageHeroHeader
                eyebrow="Locations"
                title="Office Locations"
                description="Maintain check-in boundaries and compliance-ready geo fences for every site."
                actionArea={
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={handleAddLocation}
                    >
                        Add Office Location
                    </Button>
                }
            />
            <Box sx={{ p: 3 }}>
                <OfficeLocationManager ref={managerRef} />
            </Box>
        </div>
    );
};

export default OfficeLocationsPage;