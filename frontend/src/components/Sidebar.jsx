// frontend/src/components/Sidebar.jsx

import React, { useState, useTransition } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import Collapse from '@mui/material/Collapse';
import Badge from '@mui/material/Badge';

// Importing icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import EventNoteIcon from '@mui/icons-material/EventNote';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import AssessmentIcon from '@mui/icons-material/Assessment';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PolicyIcon from '@mui/icons-material/Policy';
import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CategoryIcon from '@mui/icons-material/Category';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PaymentsIcon from '@mui/icons-material/Payments';

import useNewNotifications from '../hooks/useNewNotifications';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import './Sidebar.css';

const Logo = () => (
    <img src="/BL.svg" alt="Company Logo" style={{ height: '40px' }} />
);

// Updated to accept notification props and mobile menu props
const Sidebar = ({ onNotificationClick, isMobileOpen = false, onClose = () => {} }) => {
    const { user } = useAuth();
    const { unreadCount } = useNewNotifications();
    const { canAccess, rolePermissions } = usePermissions();
    const navigate = useNavigate();
    const location = useLocation();
    const [isPending, startTransition] = useTransition();
    // Tracks which parent item's submenu is open (by item.text)
    const [openSubmenu, setOpenSubmenu] = useState(null);

    const menuItems = [
        { text: 'Home', icon: <DashboardIcon />, path: '/dashboard', roles: ['Employee', 'Intern', 'HR', 'Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'] },
        { 
            text: 'Summary', 
            icon: <AssessmentIcon />, 
            path: (user && ['Admin', 'HR', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'].includes(user?.role)) ? '/admin/attendance-summary' : '/attendance-summary',
            roles: ['Employee', 'Intern', 'HR', 'Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'],
            tourId: 'sidebar-attendance',
        },
        { text: 'Employees', icon: <PeopleIcon />, path: '/employees', roles: ['HR', 'Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'] },
        { text: 'Contracts', icon: <DescriptionOutlinedIcon />, path: '/contracts', roles: ['Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'] },

        // ── Payroll parent ─────────────────────────────────────────────────────
        {
            text: 'Payroll',
            icon: <PaymentsIcon />,
            roles: ['Admin', 'HRPayrollUser', 'HRPayrollManager'],
            children: [
                {
                    text: 'Dashboard',
                    icon: <BarChartIcon />,
                    path: '/payroll',
                    roles: ['Admin', 'HRPayrollUser', 'HRPayrollManager'],
                },
                {
                    text: 'Payruns',
                    icon: <AssessmentIcon />,
                    path: '/payroll',
                    roles: ['Admin', 'HRPayrollUser', 'HRPayrollManager'],
                },
                {
                    text: 'Salary Structures',
                    icon: <DescriptionOutlinedIcon />,
                    path: '/payroll/salary-structures',
                    roles: ['Admin', 'HRPayrollManager'],
                },
                {
                    text: 'Salary Rules',
                    icon: <CategoryIcon />,
                    path: '/payroll/salary-rules',
                    roles: ['Admin', 'HRPayrollManager'],
                },
            ],
        },

        { text: 'Scheduling', icon: <TimelapseIcon />, path: '/scheduling-management', roles: ['Admin'] },
        { text: 'Policies & CIF', icon: <PolicyIcon />, path: '/admin/policies', roles: ['Admin'], hidden: true },
        { text: 'Manage Section', icon: <AdminPanelSettingsIcon />, path: '/manage-section', roles: ['Admin'], hidden: true },
        { text: 'Probation', icon: <AssessmentIcon />, path: '/probation', roles: ['Admin', 'HR', 'HRManager'], hidden: true },

        // ── Time Off parent (replaces the flat "Leaves" item) ──────────────────
        // Children are rendered in a Collapse beneath the parent icon.
        {
            text: 'Time Off',
            icon: <EventNoteIcon />,
            roles: ['Employee', 'Intern', 'HR', 'Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'],
            permissionCheck: () => canAccess.leaves(),
            tourId: 'sidebar-leaves',
            // Children visible to all roles that see the parent; role filtering applied per child
            children: [
                {
                    text: 'Requests',
                    icon: <BeachAccessIcon />,
                    // Keep the exact same role-conditional path logic that the old flat item used
                    path: (user && ['Admin', 'HR', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'].includes(user?.role))
                        ? '/admin/leaves'
                        : '/leaves',
                    roles: ['Employee', 'Intern', 'HR', 'Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'],
                },
                {
                    text: 'Allocations',
                    icon: <AssignmentIcon />,
                    path: '/time-off/allocations',
                    roles: ['HR', 'Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'],
                },
                {
                    text: 'Types',
                    icon: <CategoryIcon />,
                    path: '/time-off/types',
                    // Only Admin and HRManager can manage time-off type configuration
                    roles: ['Admin', 'HRManager'],
                },
            ],
        },

        {
            text: 'Requests',
            icon: <Inventory2Icon />,
            path: '/requests',
            roles: ['Employee', 'Intern'],
        },
        {
            text: 'Resources',
            tooltip: 'Resource Requests',
            icon: <Inventory2Icon />,
            path: '/resource-requests/manage',
            roles: ['Employee', 'Intern', 'HR', 'Manager', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'],
            permissionCheck: () => canAccess.manageResourceRequests(),
        },
        { 
            text: 'Reports', 
            icon: <AdminPanelSettingsIcon />, 
            path: '/reports', 
            roles: ['Admin', 'HR', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'],
            permissionCheck: () => canAccess.viewReports(),
            tourId: 'sidebar-reports',
        },
        { 
            text: 'Analytics', 
            icon: <BarChartIcon />, 
            path: '/analytics/attendance', 
            roles: ['Admin', 'HR', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'],
            hidden: true,
        },
        {
            text: 'Live Board',
            tooltip: 'Live Attendance',
            icon: <GroupsIcon />,
            path: '/live-attendance',
            roles: ['Employee', 'Intern'],
            permissionCheck: () => canAccess.viewLiveAttendance(),
        },
        { text: 'Activity Log', icon: <AssessmentIcon />, path: '/activity-log', roles: ['Admin', 'HR', 'Manager', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'], hidden: true },
    ];
    
    // Notification item config for all users
    const notificationItem = {
        text: 'Notifications',
        icon: <NotificationsIcon />,
        roles: ['Employee', 'Intern', 'HR', 'Admin', 'Manager', 'HRManager', 'HRPayrollUser', 'HRPayrollManager']
    };

    if (!user) {
        return <aside className="sidebar"></aside>;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    const resolvedPath = (item) =>
        typeof item.path === 'function' ? item.path(user) : item.path;

    // True when any child of a parent item matches the current route
    const isChildActive = (item) =>
        item.children?.some((child) => location.pathname.startsWith(resolvedPath(child)));

    const handleFlatItemClick = (e, item) => {
        e.preventDefault();
        const targetPath = resolvedPath(item);
        setOpenSubmenu(null);
        startTransition(() => navigate(targetPath));
        onClose();
    };

    const handleParentClick = (e, item) => {
        e.preventDefault();
        setOpenSubmenu(prev => (prev === item.text ? null : item.text));
    };

    const handleChildClick = (e, child) => {
        e.preventDefault();
        const targetPath = resolvedPath(child);
        startTransition(() => navigate(targetPath));
        onClose();
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const visibleItems = menuItems.filter(item => {
        if (item.hidden) return false;
        if (!item.roles.includes(user.role)) return false;
        if (item.permissionCheck && !item.permissionCheck()) return false;
        return true;
    });

    return (
        <aside className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-header">
                <Logo />
            </div>

            <nav className="sidebar-nav">
                {visibleItems.map((item) => {
                    // ── Parent item with children ───────────────────────────
                    if (item.children) {
                        const isOpen = openSubmenu === item.text;
                        const anyChildActive = isChildActive(item);

                        // Filter children to roles the current user has
                        const visibleChildren = item.children.filter(child =>
                            child.roles.includes(user.role)
                        );
                        if (visibleChildren.length === 0) return null;

                        return (
                            <div key={item.text} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                {/* Parent trigger */}
                                <div
                                    className={`sidebar-link${anyChildActive || isOpen ? ' submenu-parent-active' : ''}`}
                                    data-tooltip={item.tooltip || item.text}
                                    data-tour={item.tourId || undefined}
                                    onClick={(e) => handleParentClick(e, item)}
                                    style={{ cursor: 'pointer', position: 'relative' }}
                                    role="button"
                                    aria-expanded={isOpen}
                                    aria-label={item.text}
                                >
                                    <div className="icon-container">
                                        {item.icon}
                                    </div>
                                    <span className="sidebar-label">{item.text}</span>
                                    {/* Tiny chevron to signal expandability */}
                                    <ExpandMoreIcon
                                        style={{
                                            position: 'absolute',
                                            bottom: 1,
                                            right: 1,
                                            fontSize: 10,
                                            color: '#BDBDBD',
                                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.2s',
                                        }}
                                    />
                                </div>

                                {/* Children */}
                                <Collapse in={isOpen} timeout={180} unmountOnExit>
                                    <div className="sidebar-submenu">
                                        {visibleChildren.map((child) => {
                                            const childPath = resolvedPath(child);
                                            const childActive = location.pathname.startsWith(childPath);
                                            return (
                                                <NavLink
                                                    key={child.text}
                                                    to={childPath}
                                                    className={() => `sidebar-submenu-child${childActive ? ' active' : ''}`}
                                                    data-tooltip={child.text}
                                                    onClick={(e) => handleChildClick(e, child)}
                                                >
                                                    <div className="icon-container">
                                                        {child.icon}
                                                    </div>
                                                    <span className="sidebar-label">{child.text}</span>
                                                </NavLink>
                                            );
                                        })}
                                    </div>
                                </Collapse>
                            </div>
                        );
                    }

                    // ── Regular flat item ───────────────────────────────────
                    return (
                        <NavLink
                            key={item.text}
                            to={resolvedPath(item)}
                            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                            data-tooltip={item.tooltip || item.text}
                            data-tour={item.tourId || undefined}
                            onClick={(e) => handleFlatItemClick(e, item)}
                        >
                            <div className="icon-container">
                                {item.icon}
                            </div>
                            <span className="sidebar-label">{item.text}</span>
                        </NavLink>
                    );
                })}
            </nav>

            {/* --- Notification Bell at the bottom --- */}
            {notificationItem.roles.includes(user.role) && (
                <div className="sidebar-footer">
                    <div
                        className="sidebar-link"
                        data-tooltip={notificationItem.text}
                        onClick={() => { onNotificationClick(); onClose(); }}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="icon-container">
                            <Badge 
                                badgeContent={unreadCount} 
                                color="error"
                                max={99}
                            >
                                {notificationItem.icon}
                            </Badge>
                        </div>
                        <span className="sidebar-label">{notificationItem.text}</span>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default Sidebar;
