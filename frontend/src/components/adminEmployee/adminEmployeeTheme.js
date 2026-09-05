export const RED = '#E53935';
export const RED_DARK = '#C62828';
export const RED_BG = '#FDECEC';
export const RED_LIGHT = '#FFF5F5';
export const TEXT = '#1A1A1A';
export const MUTED = '#6B7280';
export const BORDER = '#E5E7EB';
export const SURFACE = '#F8F9FB';

export const cardSx = {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px',
    border: `1px solid ${BORDER}`,
};

export const sectionTitleSx = {
    fontWeight: 600,
    color: TEXT,
    fontSize: '0.875rem',
    mb: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
};

export const primaryBtnSx = {
    background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`,
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '8px',
    boxShadow: 'none',
    px: 3,
    '&:hover': {
        background: `linear-gradient(135deg, ${RED_DARK} 0%, #B71C1C 100%)`,
        boxShadow: 'none',
    },
};

export const tabSx = {
    minHeight: 42,
    '& .MuiTab-root': {
        textTransform: 'none',
        fontWeight: 600,
        fontSize: '0.8125rem',
        minHeight: 42,
        color: MUTED,
        py: 1,
    },
    '& .Mui-selected': { color: RED },
    '& .MuiTabs-indicator': { backgroundColor: RED, height: 2 },
};
