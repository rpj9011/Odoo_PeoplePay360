// frontend/src/components/MainLayout.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Snackbar } from '@mui/material';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import NewNotificationDrawer from './NewNotificationDrawer';
import EarlyCheckoutApprovalModal from './EarlyCheckoutApprovalModal';
import NotificationPermissionPrompt from './NotificationPermissionPrompt';
import PageTransition from './PageTransition';
import useNewNotifications from '../hooks/useNewNotifications';
import OnboardingOrchestrator from './onboarding/OnboardingOrchestrator';
import HRQueryFloatingChat from './HRQueryFloatingChat';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import '../styles/MainLayout.css';

const MainLayout = () => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [ecrModal, setEcrModal] = useState({ open: false, requestId: null });
    const [toast, setToast] = useState({ open: false, message: '' });
    const location = useLocation();
    const mainContentRef = useRef(null);
    const scrollPositionsRef = useRef({});

    const { fetchNotifications } = useNewNotifications();
    const { user } = useAuth();
    const { canAccess } = usePermissions();

    // Preserve scroll position when navigating
    useEffect(() => {
        const currentPath = location.pathname;
        
        // Save scroll position before navigation
        return () => {
            if (mainContentRef.current) {
                scrollPositionsRef.current[currentPath] = mainContentRef.current.scrollTop;
            }
        };
    }, [location.pathname]);

    // Restore scroll position after navigation (only for back/forward)
    useEffect(() => {
        const savedPosition = scrollPositionsRef.current[location.pathname];
        if (savedPosition !== undefined && mainContentRef.current) {
            // Restore after a brief delay to ensure layout is complete
            requestAnimationFrame(() => {
                if (mainContentRef.current) {
                    mainContentRef.current.scrollTop = savedPosition;
                }
            });
        } else if (mainContentRef.current) {
            // New page - scroll to top instantly
            mainContentRef.current.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [location.pathname]);

    const handleNotificationIconClick = () => {
        setIsDrawerOpen(true);
    };

    const handleDrawerClose = () => {
        setIsDrawerOpen(false);
    };

    const handleHamburgerClick = () => setIsMobileSidebarOpen(prev => !prev);
    
    const handleOverlayClick = () => setIsMobileSidebarOpen(false);

    const handleOpenECRModal = useCallback((requestId) => {
        setEcrModal({ open: true, requestId });
    }, []);

    const handleECRModalClose = useCallback(() => {
        setEcrModal({ open: false, requestId: null });
    }, []);

    const handleECRSuccess = useCallback((message) => {
        setToast({ open: true, message: message || 'Done.' });
        if (typeof fetchNotifications === 'function') fetchNotifications();
    }, [fetchNotifications]);

    const handleNotificationPermissionChange = (permission) => {
        console.log('Desktop notification permission changed to:', permission);
    };

    return (
        <div className="app-container">
            {/* Onboarding flow — manages policy modal, tour, and profile prompt */}
            <OnboardingOrchestrator />
            <Topbar 
                onNotificationClick={handleNotificationIconClick}
                onHamburgerClick={handleHamburgerClick}
            />
            <Sidebar 
                onNotificationClick={handleNotificationIconClick}
                isMobileOpen={isMobileSidebarOpen}
                onClose={() => setIsMobileSidebarOpen(false)}
            />
            
            <div
                className={`mobile-sidebar-overlay ${isMobileSidebarOpen ? 'active' : ''}`}
                onClick={handleOverlayClick}
                aria-hidden="true"
            />
            
            <main className="main-content" ref={mainContentRef}>
                <PageTransition>
                <Outlet />
                </PageTransition>
            </main>
            
            <NewNotificationDrawer 
                open={isDrawerOpen} 
                onClose={handleDrawerClose}
                onOpenECRModal={handleOpenECRModal}
            />
            
            <EarlyCheckoutApprovalModal
                open={ecrModal.open}
                requestId={ecrModal.requestId}
                onClose={handleECRModalClose}
                onSuccess={handleECRSuccess}
            />
            
            <Snackbar
                open={toast.open}
                autoHideDuration={4000}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
                message={toast.message}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            />
            
            <NotificationPermissionPrompt 
                onPermissionChange={handleNotificationPermissionChange}
            />
            
            {/* HR Query Floating Chat - Visible for Admin, HR, and users with canManageHRQueries permission */}
            {(user?.role === 'Admin' || user?.role === 'HR' || canAccess?.manageHRQueries?.()) && (
                <HRQueryFloatingChat />
            )}
        </div>
    );
};

export default MainLayout;