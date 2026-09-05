// frontend/src/App.jsx

import React, { Suspense, useEffect, useRef } from 'react';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BreakUIProvider } from './context/BreakUIContext';
import { TeaBreakProvider } from './context/TeaBreakContext';
import { ActiveYearProvider } from './context/ActiveYearContext';
import { NewNotificationProvider } from './hooks/useNewNotifications.jsx'; // Corrected import path
import { CssBaseline, ThemeProvider, Box } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import optimizedTheme from './theme/optimizedTheme';
import { consumeSsoTokenIfPresent } from './utils/ssoConsumer';

// Import Layout and Pages
import MainLayout from './components/MainLayout';
import LoginPage from './pages/LoginPage';
import SSOLoginPage from './pages/SSOLoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import PermissionProtectedRoute from './components/PermissionProtectedRoute';
import IdleDetectionProvider from './components/IdleDetectionProvider';
import { OnboardingProvider } from './context/OnboardingContext';
import StandalonePolicyModal from './components/onboarding/StandalonePolicyModal';
import './styles/OnboardingStyles.css';

// Lazy load all pages
const EmployeeDashboardPage = lazy(() => import('./pages/EmployeeDashboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const DeactivatedEmployeesPage = lazy(() => import('./pages/DeactivatedEmployeesPage'));
const ShiftsPage = lazy(() => import('./pages/ShiftsPage'));
const LeavesPage = lazy(() => import('./pages/LeavesPage'));
const AdminLeavesPage = lazy(() => import('./pages/AdminLeavesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const AttendanceSummaryPage = lazy(() => import('./pages/AttendanceSummaryPage'));
const AdminAttendanceSummaryPage = lazy(() => import('./pages/AdminAttendanceSummaryPage'));
const NewActivityLogPage = lazy(() => import('./pages/NewActivityLogPage'));
const OfficeLocationsPage = lazy(() => import('./pages/OfficeLocationsPage'));
const ManageSectionPage = lazy(() => import('./pages/ManageSectionPage'));
const SSOCallbackPage = lazy(() => import('./pages/SSOCallbackPage'));
const EmployeeMusterRollPage = lazy(() => import('./pages/EmployeeMusterRollPage'));
const LeavesTrackerPage = lazy(() => import('./pages/LeavesTrackerPage'));
const LeaveRequestDetailPage = lazy(() => import('./pages/LeaveRequestDetailPage'));
const PayrollManagementPage = lazy(() => import('./pages/PayrollManagementPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const LiveAttendancePage = lazy(() => import('./pages/LiveAttendancePage'));
const EmployeeDetailedAnalyticsPage = lazy(() => import('./pages/EmployeeDetailedAnalyticsPage'));
const PayrunProcessingPage = lazy(() => import('./pages/PayrunProcessingPage'));
const SalaryStructuresPage = lazy(() => import('./pages/SalaryStructuresPage'));
const SalaryRulesPage = lazy(() => import('./pages/SalaryRulesPage'));
// FIX: Static import to prevent skeleton flash during auth resolution
import ProfilePage from './pages/ProfilePage';
const AdminPoliciesPage = lazy(() => import('./pages/AdminPoliciesPage'));
const CIFManagementPage = lazy(() => import('./pages/CIFManagement'));
const EmployeeCIFDetailsPage = lazy(() => import('./pages/EmployeeCIFDetails'));
const SchedulingManagementPage = lazy(() => import('./pages/SchedulingManagementPage'));
const ProbationPage = lazy(() => import('./pages/ProbationPage'));
const RequestsPage = lazy(() => import('./pages/RequestsPage'));
const AdminRequestsPage = lazy(() => import('./pages/AdminRequestsPage'));
const HolidayManagementPage = lazy(() => import('./pages/admin/HolidayManagementPage'));
const TimeOffTypesListPage = lazy(() => import('./pages/TimeOffTypesListPage'));
const AllocationsListPage = lazy(() => import('./pages/AllocationsListPage'));
const ContractsPage = lazy(() => import('./pages/ContractsPage'));
// Static import - must render before auth resolves, no login required
import PublicProfileForm from './pages/PublicProfileForm';

// Import skeleton loaders
import { PageSkeleton } from './components/SkeletonLoaders';
import ProfilePageSkeleton from './components/Profile/ProfilePageSkeleton';

// Import prefetch utilities
import { setupPrefetchListeners, routePrefetchMap } from './utils/prefetch';

// Import resource preloading utilities
import { preloadCriticalResources, preloadAssets } from './utils/resourcePreloader';

// Delayed fallback component - only shows skeleton after 300ms delay
const DelayedFallback = ({ children, delay = 300 }) => {
    const [show, setShow] = React.useState(false);
    
    React.useEffect(() => {
        const timer = setTimeout(() => setShow(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);
    
    return show ? children : null;
};

// Enhanced loading component for Suspense - uses skeleton loaders
const PageLoader = ({ type = 'default' }) => (
    <Box sx={{ 
        width: '100%', 
        minHeight: 'calc(100vh - 200px)',
        p: 3 
    }}>
        <PageSkeleton type={type} />
    </Box>
);

// Use optimized theme

// DashboardRouter - routes to appropriate dashboard based on user role
// ProtectedRoute already gates on authStatus === 'unknown', so user is set here.
const DashboardRouter = () => {
    const { user } = useAuth();

    if (!user) {
        return null;
    }

    // Route to appropriate dashboard based on role
    if (user.role === 'Admin' || user.role === 'HR') {
        return <AdminDashboardPage />;
    }
    return <EmployeeDashboardPage />;
};

// Root route component - redirects based on authentication status
// NON-BLOCKING: Shows skeleton when authStatus === 'unknown', redirects only when backend confirms state
const RootRoute = () => {
    const { isAuthenticated, authStatus } = useAuth();
    
    // NON-BLOCKING: authStatus === 'unknown' shows skeleton, NOT redirect
    // This allows UI to render immediately while auth resolves in background
    // Backend is source of truth - we wait for /api/auth/me response
    if (authStatus === 'unknown') {
        return <PageLoader />;
    }
    
    // Backend confirmed: user is authenticated - redirect to dashboard
    if (authStatus === 'authenticated' && isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }
    
    // Backend confirmed: user is not authenticated - redirect to login
    return <Navigate to="/login" replace />;
};

function App() {
    // Ref to prevent multiple redirects on refresh
    const ssoTokenProcessedRef = useRef(false);
    
    // Handle SSO token consumption on app startup
    // This handles both SSO tokens from SSO portal and AMS tokens from backend middleware auto-login
    useEffect(() => {
        // Prevent multiple executions (especially in React StrictMode)
        if (ssoTokenProcessedRef.current) {
            return;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        
        // Check for AMS token from backend middleware auto-login
        const amsToken = urlParams.get('ams_token');
        const ssoAutoLogin = urlParams.get('sso_auto_login') === 'true';
        
        if (amsToken && ssoAutoLogin) {
            // Mark as processed immediately to prevent re-execution
            ssoTokenProcessedRef.current = true;
            
            console.log('[App] AMS token received from backend SSO auto-login - setting header and redirecting');
            // Phase 1: set the Authorization header so the redirect can use the token.
            // AuthContext will restore the session via the httpOnly refresh cookie on load.
            // No storage writes — the token lives only in the header for this navigation.
            if (amsToken) {
                import('./api/axios').then(({ default: api }) => {
                    api.defaults.headers.common['Authorization'] = `Bearer ${amsToken}`;
                });
            }
            
            // Clean up URL parameters
            const url = new URL(window.location);
            const redirectPath = url.pathname || '/dashboard';
            url.searchParams.delete('ams_token');
            url.searchParams.delete('sso_auto_login');
            window.history.replaceState({}, document.title, redirectPath + (url.search ? url.search : ''));
            
            window.location.href = redirectPath;
            return;
        }
        
        // Check for SSO token from SSO portal (only if not on login page or public form)
        if (
            window.location.pathname !== '/login' &&
            window.location.pathname !== '/' &&
            window.location.pathname !== '/public-form'
        ) {
            const ssoToken = urlParams.get('sso_token') || urlParams.get('token');
            if (ssoToken) {
                // Mark as processed immediately to prevent re-execution
                ssoTokenProcessedRef.current = true;
                
                console.log('[App] SSO token found in URL, but not on login page - redirecting to login');
                window.location.href = `/login?${ssoToken ? `token=${ssoToken}` : ''}`;
                return;
            }
        }
        
        // Mark as processed if no tokens found (to prevent re-checking)
        ssoTokenProcessedRef.current = true;
    }, []);

    // Setup route prefetching for performance optimization
    useEffect(() => {
        setupPrefetchListeners(routePrefetchMap);
    }, []);

    // Preload critical resources for performance
    useEffect(() => {
        preloadAssets();
        preloadCriticalResources();
    }, []);

    // Register service worker for caching
    useEffect(() => {
        if ('serviceWorker' in navigator && import.meta.env.PROD) {
            navigator.serviceWorker
                .register('/sw.js')
                .then((registration) => {
                    console.log('[SW] Service worker registered:', registration);
                })
                .catch((error) => {
                    console.error('[SW] Service worker registration failed:', error);
                });
        }
    }, []);

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <ThemeProvider theme={optimizedTheme}>
                <CssBaseline />
                <Router>
                    <AuthProvider>
                        <ActiveYearProvider>
                            <BreakUIProvider>
                                <TeaBreakProvider>
                                <NewNotificationProvider> {/* <-- CORRECT NESTING */}
                                    <IdleDetectionProvider>
                                        <OnboardingProvider>
                                            {/* Standalone Policy Modal for existing employees */}
                                            <StandalonePolicyModal />
                                        <Routes>
                                    {/* Public routes - accessible without authentication */}
                                    <Route path="/login" element={<LoginPage />} />
                                    <Route path="/sso-login" element={<SSOLoginPage />} />
                                    <Route path="/auth/sso-callback" element={
                                        <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                            <SSOCallbackPage />
                                        </Suspense>
                                    } />
                                    
                                    {/* Public Profile Form - No authentication required */}
                                    <Route path="/public-form" element={<PublicProfileForm />} />
                                    
                                    {/* Root route - smart redirect based on authentication */}
                                    <Route path="/" element={<RootRoute />} />
                                    
                                    {/* Protected routes - require authentication */}
                                    <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                                        <Route path="/dashboard" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="dashboard" /></DelayedFallback>}>
                                                <DashboardRouter />
                                            </Suspense>
                                        } />

                                        <Route path="/leaves" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="list" /></DelayedFallback>}>
                                                <PermissionProtectedRoute requiredPermission="leaves">
                                                    <LeavesPage />
                                                </PermissionProtectedRoute>
                                            </Suspense>
                                        } />
                                        <Route path="/attendance-summary" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <AttendanceSummaryPage />
                                            </Suspense>
                                        } />
                                        <Route path="/profile" element={<ProfilePage />} />
                                        <Route path="/requests" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="list" /></DelayedFallback>}>
                                                <RequestsPage />
                                            </Suspense>
                                        } />
                                        
                                        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                                        <Route path="/admin/dashboard" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <AdminDashboardPage />
                                            </Suspense>
                                        } />
                                        <Route path="/employees" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <EmployeesPage />
                                            </Suspense>
                                        } />
                                        <Route path="/employees/deactivated" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <DeactivatedEmployeesPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/leaves" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <AdminLeavesPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/requests" element={<Navigate to="/activity-log?tab=requests" replace />} />
                                        <Route path="/resource-requests/manage" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <PermissionProtectedRoute requiredPermission="manageResourceRequests">
                                                    <AdminRequestsPage />
                                                </PermissionProtectedRoute>
                                            </Suspense>
                                        } />
                                        <Route path="/reports" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <PermissionProtectedRoute requiredPermission="viewReports">
                                                    <ReportsPage />
                                                </PermissionProtectedRoute>
                                            </Suspense>
                                        } />
                                        <Route path="/activity-log" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <NewActivityLogPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/attendance-summary" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <AdminAttendanceSummaryPage />
                                            </Suspense>
                                        } />
                                        <Route path="/scheduling-management" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <SchedulingManagementPage />
                                            </Suspense>
                                        } />
                                        <Route path="/shifts" element={<Navigate to="/scheduling-management" replace />} />
                                        <Route path="/office-locations" element={<Navigate to="/scheduling-management" replace />} />
                                        <Route path="/manage-section" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <ManageSectionPage />
                                            </Suspense>
                                        } />
                                        <Route path="/probation" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <ProbationPage />
                                            </Suspense>
                                        } />
                                        <Route path="/employee-muster-roll" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <EmployeeMusterRollPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/leaves/more-options/leaves-tracker" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <LeavesTrackerPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/leaves/requests/:requestId" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <LeaveRequestDetailPage />
                                            </Suspense>
                                        } />

                                        {/* ── Time Off sub-routes (reachable via Sidebar "Time Off ▼") ── */}
                                        <Route path="/time-off/types" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <TimeOffTypesListPage />
                                            </Suspense>
                                        } />
                                        <Route path="/time-off/allocations" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <AllocationsListPage />
                                            </Suspense>
                                        } />
                                        {/* ── Contracts ── */}
                                        <Route path="/contracts" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <ContractsPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/policies" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <AdminPoliciesPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/cif" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <CIFManagementPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/cif/employee/:employeeId" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <EmployeeCIFDetailsPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/compliance/cif" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <CIFManagementPage />
                                            </Suspense>
                                        } />
                                        <Route path="/analytics/attendance" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <AnalyticsPage />
                                            </Suspense>
                                        } />
                                        <Route path="/live-attendance" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <PermissionProtectedRoute requiredPermission="viewLiveAttendance" adminBypass={false}>
                                                    <LiveAttendancePage />
                                                </PermissionProtectedRoute>
                                            </Suspense>
                                        } />
                                        <Route path="/analytics/employee/:employeeId" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <EmployeeDetailedAnalyticsPage />
                                            </Suspense>
                                        } />
                                        <Route path="/admin/holidays" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <HolidayManagementPage />
                                            </Suspense>
                                        } />
                                    </Route>

                                        {/* ── Payroll ── */}
                                        <Route path="/payroll" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader /></DelayedFallback>}>
                                                <PayrollManagementPage />
                                            </Suspense>
                                        } />
                                        <Route path="/payroll/payruns/:id" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <PayrunProcessingPage />
                                            </Suspense>
                                        } />
                                        <Route path="/payroll/salary-structures" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <SalaryStructuresPage />
                                            </Suspense>
                                        } />
                                        <Route path="/payroll/salary-rules" element={
                                            <Suspense fallback={<DelayedFallback><PageLoader type="table" /></DelayedFallback>}>
                                                <SalaryRulesPage />
                                            </Suspense>
                                        } />

                                    {/* Catch-all route - redirect to login for unknown routes */}
                                    <Route path="*" element={<Navigate to="/login" replace />} />
                                </Routes>
                                        </OnboardingProvider>
                            </IdleDetectionProvider>
                        </NewNotificationProvider>
                                </TeaBreakProvider>
                    </BreakUIProvider>
                </ActiveYearProvider>
            </AuthProvider>
        </Router>
        </ThemeProvider>
    </LocalizationProvider>
);

}

export default App;