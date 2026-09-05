import { memo, useState, useRef, useCallback } from 'react';
import { CircularProgress, Snackbar, Alert } from '@mui/material';
import UserAvatar from '../common/UserAvatar';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const ProfileSidebar = memo(({ user }) => {
    const { updateUserContext, refreshUserData } = useAuth();
    const [uploading, setUploading] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const fileInputRef = useRef(null);

    const formatDate = (dateString) => {
        if (!dateString) return 'Not specified';
        try {
            return new Date(dateString).toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
        } catch {
            return 'Not specified';
        }
    };

    const getStatusLabel = () => {
        if (user?.employmentStatus) return user.employmentStatus;
        if (user?.role) return user.role;
        return 'Staff';
    };

    const handleAvatarClick = () => {
        if (!uploading) fileInputRef.current?.click();
    };

    const handleFileSelect = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        event.target.value = '';

        if (!file.type.startsWith('image/')) {
            setSnackbar({ open: true, message: 'Please select a valid image file (JPEG, PNG, GIF, or WebP)', severity: 'error' });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setSnackbar({ open: true, message: 'File size exceeds 5 MB. Please choose a smaller image.', severity: 'error' });
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('profileImage', file);
            const response = await api.post('/users/upload-avatar', formData);
            const newImageUrl = response.data.imageUrl;
            updateUserContext({ profileImageUrl: newImageUrl });
            try { await refreshUserData(); } catch { /* non-fatal */ }
            setSnackbar({ open: true, message: 'Profile photo updated!', severity: 'success' });
        } catch (error) {
            setSnackbar({ open: true, message: error.response?.data?.error || 'Upload failed. Please try again.', severity: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveAvatar = useCallback(async () => {
        if (uploading || !user?.profileImageUrl) return;
        setUploading(true);
        try {
            await api.delete('/users/remove-avatar');
            updateUserContext({ profileImageUrl: '' });
            try { await refreshUserData(); } catch { /* non-fatal */ }
            setSnackbar({ open: true, message: 'Profile photo removed.', severity: 'success' });
        } catch (error) {
            setSnackbar({ open: true, message: error.response?.data?.error || 'Could not remove photo.', severity: 'error' });
        } finally {
            setUploading(false);
        }
    }, [uploading, user?.profileImageUrl, updateUserContext, refreshUserData]);

    return (
        <div className="psb-card">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                disabled={uploading}
            />

            {/* ── Avatar ─────────────────────────────── */}
            <div className="psb-avatar-wrap">
                <div
                    className={`psb-avatar-click${uploading ? ' psb-avatar-uploading' : ''}`}
                    onClick={handleAvatarClick}
                    title="Change profile photo"
                >
                    <UserAvatar
                        user={user}
                        size="lg"
                        key={user?.profileImageUrl}
                        sx={{ width: 90, height: 90, fontSize: '2rem', boxShadow: '0 4px 16px rgba(198,40,40,0.20)' }}
                    />

                    {/* Hover overlay */}
                    <div className="psb-avatar-overlay">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="12" cy="13" r="4" stroke="white" strokeWidth="2"/>
                        </svg>
                        <span>Change</span>
                    </div>

                    {uploading && (
                        <div className="psb-avatar-spinner">
                            <CircularProgress size={26} sx={{ color: 'white' }} />
                        </div>
                    )}
                </div>

                {/* Remove button */}
                {user?.profileImageUrl && !uploading && (
                    <button
                        className="psb-remove-btn"
                        onClick={(e) => { e.stopPropagation(); handleRemoveAvatar(); }}
                        title="Remove photo"
                    >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                )}
            </div>

            {/* ── Name & role ─────────────────────────── */}
            <div className="psb-identity">
                <h2 className="psb-name">{user?.fullName || '—'}</h2>
                <p className="psb-designation">{user?.designation || 'Employee'}</p>
                <div className="psb-chips">
                    <span className="psb-chip psb-chip--code">{user?.employeeCode || '—'}</span>
                    <span className="psb-chip psb-chip--status">{getStatusLabel()}</span>
                </div>
            </div>

            {/* ── Divider ─────────────────────────────── */}
            <div className="psb-divider" />

            {/* ── Detail rows ─────────────────────────── */}
            <div className="psb-details">

                <div className="psb-detail-row">
                    <div className="psb-detail-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <div className="psb-detail-body">
                        <span className="psb-detail-label">Department</span>
                        <span className="psb-detail-value">{user?.department || '—'}</span>
                    </div>
                </div>

                <div className="psb-detail-row">
                    <div className="psb-detail-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <div className="psb-detail-body">
                        <span className="psb-detail-label">Joined</span>
                        <span className="psb-detail-value">{formatDate(user?.joiningDate)}</span>
                    </div>
                </div>

                <div className="psb-detail-row">
                    <div className="psb-detail-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <div className="psb-detail-body">
                        <span className="psb-detail-label">Work Email</span>
                        <span className="psb-detail-value psb-detail-value--email" title={user?.email || ''}>{user?.email || '—'}</span>
                    </div>
                </div>

            </div>

            {/* ── Snackbar ─────────────────────────────── */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </div>
    );
});

ProfileSidebar.displayName = 'ProfileSidebar';
export default ProfileSidebar;
