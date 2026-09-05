// frontend/src/layouts/Layout.jsx
import React, { useState } from 'react';
import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import '../styles/Layout.css';

const Layout = () => {
    // A common pattern is to have the sidebar collapsed on initial load for smaller screens
    const [isExpanded, setIsExpanded] = useState(window.innerWidth > 900);

    const handleToggleSidebar = () => {
        setIsExpanded(!isExpanded);
    };

    return (
        <Box className="app-layout">
            {/* Topbar and Sidebar are fixed and sit outside the main content flow */}
            <Topbar isSidebarExpanded={isExpanded} onToggleSidebar={handleToggleSidebar} />
            <Sidebar isExpanded={isExpanded} onToggle={handleToggleSidebar} />
            
            {/* 
              This is the main content container. 
              It gets a dynamic class to adjust its margin-left based on the sidebar's state.
              The top padding is handled by the CSS to avoid being covered by the Topbar.
            */}
            <Box
                component="main"
                className={`main-content-area ${isExpanded ? 'expanded' : 'collapsed'}`}
            >
                {/* 
                  This inner Box provides consistent padding for all pages.
                  The <Outlet/> renders the current page component (e.g., EmployeeDashboardPage).
                */}
                <Box className="page-content-wrapper">
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
};

export default Layout;