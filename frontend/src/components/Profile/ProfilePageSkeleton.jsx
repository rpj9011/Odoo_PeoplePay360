import '../../styles/ProfilePage.css';

/**
 * ProfilePageSkeleton - Matches exact layout of redesigned ProfilePage
 * Prevents FOUC by maintaining card shells and layout structure during load
 */
const ProfilePageSkeleton = () => {
    return (
        <div className="profile-page">
            <div className="profile-container">
                {/* Hero Banner Skeleton */}
                <div className="profile-hero">
                    <div className="profile-hero-banner"></div>
                    <div className="profile-hero-content">
                        <div className="profile-hero-avatar">
                            <div className="profile-hero-avatar-circle">
                                <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: '22px' }} />
                            </div>
                        </div>
                        <div className="profile-hero-info">
                            <div className="skeleton" style={{ height: 28, width: 180, marginBottom: 8 }} />
                            <div className="skeleton" style={{ height: 14, width: 140, marginBottom: 12 }} />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div className="skeleton" style={{ height: 24, width: 80, borderRadius: 20 }} />
                                <div className="skeleton" style={{ height: 24, width: 100, borderRadius: 20 }} />
                                <div className="skeleton" style={{ height: 24, width: 120, borderRadius: 20 }} />
                            </div>
                        </div>
                        <div className="profile-hero-actions">
                            <div className="skeleton" style={{ height: 36, width: 100, borderRadius: 10 }} />
                            <div className="skeleton" style={{ height: 36, width: 120, borderRadius: 10 }} />
                        </div>
                    </div>
                </div>

                {/* Stats Row Skeleton */}
                <div className="profile-stats-row">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="profile-stat-card">
                            <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
                            <div style={{ flex: 1 }}>
                                <div className="skeleton" style={{ height: 11, width: 60, marginBottom: 4 }} />
                                <div className="skeleton" style={{ height: 18, width: 100 }} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Grid Layout Skeleton */}
                <div className="profile-grid">
                    {/* Team Card Skeleton */}
                    <div className="profile-card">
                        <div className="profile-card-header">
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <div className="profile-card-title-dot"></div>
                                    <div className="skeleton" style={{ height: 15, width: 140 }} />
                                </div>
                                <div className="skeleton" style={{ height: 12, width: 200 }} />
                            </div>
                        </div>
                        <div className="profile-manager-block">
                            <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 12 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="skeleton" style={{ height: 14, width: 120, marginBottom: 4 }} />
                                <div className="skeleton" style={{ height: 11, width: 160 }} />
                            </div>
                            <div className="skeleton" style={{ height: 24, width: 80, borderRadius: 20 }} />
                        </div>
                        <div className="profile-divider"></div>
                        <div className="profile-field-grid">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="profile-field">
                                    <div className="skeleton" style={{ height: 11, width: 100, marginBottom: 6 }} />
                                    <div className="skeleton" style={{ height: 14, width: 140 }} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Feedback Card Skeleton */}
                    <div className="profile-card">
                        <div className="profile-card-header">
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <div className="profile-card-title-dot"></div>
                                    <div className="skeleton" style={{ height: 15, width: 160 }} />
                                </div>
                                <div className="skeleton" style={{ height: 12, width: 220 }} />
                            </div>
                        </div>
                        <div className="skeleton" style={{ height: 90, width: '100%', marginBottom: 12 }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <div className="skeleton" style={{ height: 32, width: 80, borderRadius: 8 }} />
                        </div>
                    </div>
                </div>

                {/* Personal Details Card Skeleton */}
                <div className="profile-card">
                    <div className="profile-card-header">
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <div className="profile-card-title-dot"></div>
                                <div className="skeleton" style={{ height: 15, width: 140 }} />
                            </div>
                            <div className="skeleton" style={{ height: 12, width: 280 }} />
                        </div>
                    </div>
                    <div className="profile-form-grid">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="profile-form-field">
                                <div className="skeleton" style={{ height: 11, width: 100, marginBottom: 6 }} />
                                <div className="skeleton" style={{ height: 40, width: '100%' }} />
                            </div>
                        ))}
                        <div className="profile-form-field profile-form-field-full">
                            <div className="skeleton" style={{ height: 11, width: 100, marginBottom: 6 }} />
                            <div className="skeleton" style={{ height: 40, width: '100%' }} />
                        </div>
                    </div>
                    <div className="profile-divider"></div>
                    <div className="profile-form-grid">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="profile-form-field">
                                <div className="skeleton" style={{ height: 11, width: 100, marginBottom: 6 }} />
                                <div className="skeleton" style={{ height: 40, width: '100%' }} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Identity & Bank Card Skeleton */}
                <div className="profile-card">
                    <div className="profile-card-header">
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <div className="profile-card-title-dot"></div>
                                <div className="skeleton" style={{ height: 15, width: 200 }} />
                            </div>
                            <div className="skeleton" style={{ height: 12, width: 260 }} />
                        </div>
                    </div>
                    <div className="profile-security-notice">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                            <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="#30D158" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <div className="skeleton" style={{ height: 11, width: 240 }} />
                    </div>
                    <div className="profile-form-grid">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="profile-form-field">
                                <div className="skeleton" style={{ height: 11, width: 100, marginBottom: 6 }} />
                                <div className="skeleton" style={{ height: 40, width: '100%' }} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePageSkeleton;
