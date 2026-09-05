/**
 * FILTER CONTROLS COMPONENT
 *
 * Provides filtering interface for attendance analytics.
 * Includes:
 *  - Quick Month Selector (new)
 *  - Date range picker
 *  - Department / Shift Type / Employment Status filters
 *  - Apply & Clear buttons that actually work
 *
 * FIX: localFilters is now kept in sync with the parent `filters` prop so that
 *      an external "Clear" action (or any parent-driven reset) is reflected here.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getISTDateString, getISTNow } from '../../utils/istTime';
import './FilterControls.css';

// Month names for the quick-select picker
const MONTHS = [
    { value: 1,  label: 'January' },
    { value: 2,  label: 'February' },
    { value: 3,  label: 'March' },
    { value: 4,  label: 'April' },
    { value: 5,  label: 'May' },
    { value: 6,  label: 'June' },
    { value: 7,  label: 'July' },
    { value: 8,  label: 'August' },
    { value: 9,  label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
];

/** Build YYYY-MM-DD strings for the full month */
function getMonthDateRange(year, month) {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    return {
        startDate: `${year}-${mm}-01`,
        endDate:   `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
}

/** Derive { month, year } from a YYYY-MM-DD start date string */
function parseDateToMonthYear(dateStr) {
    if (!dateStr) return null;
    const [y, m] = dateStr.split('-');
    return { year: parseInt(y, 10), month: parseInt(m, 10) };
}

function FilterControls({ filters, onFilterChange }) {
    // ── local state mirrors parent ──────────────────────────────────────────
    // KEY FIX: sync whenever the parent filters reference changes so that a
    // parent-initiated clear is reflected in the local inputs immediately.
    const [localFilters, setLocalFilters] = useState(() => ({ ...filters }));

    useEffect(() => {
        setLocalFilters({ ...filters });
    }, [filters]);   // <-- this is the critical fix for "filters never clear"

    // Derive current selected month/year from localFilters.startDate
    const parsedMY = parseDateToMonthYear(localFilters.startDate);
    const [selectedMonth, setSelectedMonth] = useState(parsedMY?.month ?? (getISTNow().getMonth() + 1));
    const [selectedYear,  setSelectedYear]  = useState(parsedMY?.year  ?? getISTNow().getFullYear());

    // Keep month/year selects in sync when localFilters.startDate changes
    useEffect(() => {
        const parsed = parseDateToMonthYear(localFilters.startDate);
        if (parsed) {
            setSelectedMonth(parsed.month);
            setSelectedYear(parsed.year);
        }
    }, [localFilters.startDate]);

    // Build a sensible year list: 3 years back to current year
    const currentYear = getISTNow().getFullYear();
    const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - 3 + i);

    // ── handlers ────────────────────────────────────────────────────────────

    const handleChange = (field, value) => {
        setLocalFilters(prev => ({ ...prev, [field]: value }));
    };

    /** When user picks a month or year from the quick-select, update date range */
    const handleMonthYearChange = useCallback((newMonth, newYear) => {
        setSelectedMonth(newMonth);
        setSelectedYear(newYear);
        const { startDate, endDate } = getMonthDateRange(newYear, newMonth);
        setLocalFilters(prev => ({ ...prev, startDate, endDate }));
    }, []);

    const handleApplyFilters = () => {
        onFilterChange(localFilters);
    };

    const handleClearFilters = () => {
        const now = getISTNow();
        const year  = now.getFullYear();
        const month = now.getMonth() + 1;
        const { startDate, endDate } = getMonthDateRange(year, month);

        const clearedFilters = {
            startDate,
            endDate,
            department:        '',
            location:          '',
            shiftType:         '',
            employmentStatus:  '',
            search:            '',
        };

        setLocalFilters(clearedFilters);
        setSelectedMonth(month);
        setSelectedYear(year);
        onFilterChange(clearedFilters);
    };

    // Detect if any non-date filter is active (to show a badge)
    const hasActiveFilters = !!(
        localFilters.department ||
        localFilters.location ||
        localFilters.shiftType ||
        localFilters.employmentStatus ||
        localFilters.search
    );

    return (
        <div className="filter-controls">
            <div className="filter-header">
                <h3>Filters</h3>
                {hasActiveFilters && (
                    <span className="filter-active-badge">Filters Active</span>
                )}
            </div>

            {/* Quick Month Selector */}
            <div className="month-selector-section">
                <span className="month-selector-label">Quick Month Select</span>
                <div className="month-selector-row">
                    <select
                        className="filter-input year-select"
                        value={selectedYear}
                        onChange={e => handleMonthYearChange(selectedMonth, parseInt(e.target.value, 10))}
                    >
                        {yearOptions.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    <div className="month-pill-grid">
                        {MONTHS.map(({ value, label }) => {
                            const isActive = selectedMonth === value && selectedYear === (parseDateToMonthYear(localFilters.startDate)?.year ?? selectedYear);
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    className={`month-pill${isActive ? ' month-pill--active' : ''}`}
                                    onClick={() => handleMonthYearChange(value, selectedYear)}
                                >
                                    {label.slice(0, 3)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Date Range + Other Filters */}
            <div className="filter-grid">
                <div className="filter-group">
                    <label htmlFor="startDate">Start Date</label>
                    <input
                        type="date"
                        id="startDate"
                        value={localFilters.startDate || ''}
                        onChange={e => handleChange('startDate', e.target.value)}
                        className="filter-input"
                    />
                </div>

                <div className="filter-group">
                    <label htmlFor="endDate">End Date</label>
                    <input
                        type="date"
                        id="endDate"
                        value={localFilters.endDate || ''}
                        onChange={e => handleChange('endDate', e.target.value)}
                        className="filter-input"
                    />
                </div>

                <div className="filter-group">
                    <label htmlFor="department">Department</label>
                    <input
                        type="text"
                        id="department"
                        value={localFilters.department || ''}
                        onChange={e => handleChange('department', e.target.value)}
                        placeholder="Enter department"
                        className="filter-input"
                    />
                </div>

                <div className="filter-group">
                    <label htmlFor="shiftType">Shift Type</label>
                    <select
                        id="shiftType"
                        value={localFilters.shiftType || ''}
                        onChange={e => handleChange('shiftType', e.target.value)}
                        className="filter-input"
                    >
                        <option value="">All</option>
                        <option value="Fixed">Fixed</option>
                        <option value="Flexible">Flexible</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label htmlFor="employmentStatus">Employment Status</label>
                    <select
                        id="employmentStatus"
                        value={localFilters.employmentStatus || ''}
                        onChange={e => handleChange('employmentStatus', e.target.value)}
                        className="filter-input"
                    >
                        <option value="">All</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>
            </div>

            <div className="filter-actions">
                <button onClick={handleApplyFilters} className="btn-apply">
                    Apply Filters
                </button>
                <button onClick={handleClearFilters} className="btn-clear">
                    Clear Filters
                </button>
            </div>
        </div>
    );
}

export default FilterControls;
