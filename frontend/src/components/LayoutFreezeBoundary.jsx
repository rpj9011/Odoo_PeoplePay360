/**
 * LAYOUT FREEZE BOUNDARY
 * Isolates pages from global layout mutations
 * 
 * CRITICAL: Use this wrapper for pages with zero-mutation requirements
 * - Profile Page
 * - Leaves Page
 */

import React from 'react';
import '../styles/LayoutFreezeBoundary.css';

const LayoutFreezeBoundary = ({ children, pageName }) => {
    return (
        <div 
            className="layout-freeze-boundary" 
            data-page={pageName}
        >
            {children}
        </div>
    );
};

export default LayoutFreezeBoundary;
