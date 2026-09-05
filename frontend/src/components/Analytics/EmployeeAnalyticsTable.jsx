/**
 * EMPLOYEE ANALYTICS TABLE COMPONENT
 * 
 * Displays detailed per-employee attendance metrics in a sortable table.
 * Includes pagination controls and empty state handling.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatNumber, formatInt, formatHoursToHHMM } from '../../utils/analyticsFormatters';
import './EmployeeAnalyticsTable.css';

const EmployeeRow = React.memo(function EmployeeRow({ employee, index, onRowClick }) {
    return (
        <tr
            key={employee.employeeId || index}
            onClick={() => onRowClick(employee.employeeId)}
            className="clickable-row"
        >
            <td className="number rank">{employee.rank || index + 1}</td>
            <td className="analytics-employee-name">
                {employee.employeeName || 'N/A'}
                <div className="analytics-employee-code">{employee.employeeCode || ''}</div>
            </td>
            <td>{employee.department || 'N/A'}</td>
            <td className="number">{formatNumber(employee.presentDays)}</td>
            <td className="number">{formatNumber(employee.leaveDays)}</td>
            <td className="number">{formatNumber(employee.absentDays)}</td>
            <td className="number">{formatNumber(employee.nonWorkingDays)}</td>
            <td className="number">{employee.totalNetHoursFormatted || formatHoursToHHMM(employee.totalNetHours)}</td>
            <td className="number">{formatHoursToHHMM(employee.avgWorkingHours)}</td>
            <td className="number">{employee.overtimeHoursFormatted || formatHoursToHHMM(employee.overtimeHours)}</td>
            <td className="number percentage">
                {formatNumber(employee.attendancePercentage)}%
            </td>
        </tr>
    );
});

function EmployeeAnalyticsTable({ employees, pagination, onPageChange }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    
    // Handle sorting
    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    // Sort employees
    const sortedEmployees = React.useMemo(() => {
        if (!sortConfig.key) return employees;
        
        const sorted = [...employees].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];
            
            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;
            
            if (typeof aValue === 'string') {
                return sortConfig.direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }
            
            return sortConfig.direction === 'asc'
                ? aValue - bValue
                : bValue - aValue;
        });
        
        return sorted;
    }, [employees, sortConfig]);
    
    // Handle row click - navigate to employee detail page
    const handleRowClick = useCallback((employeeId) => {
        // Preserve current filters in URL params
        const month = searchParams.get('month');
        const year = searchParams.get('year');
        
        let url = `/analytics/employee/${employeeId}`;
        if (month && year) {
            url += `?month=${month}&year=${year}`;
        }
        
        navigate(url);
    }, [navigate, searchParams]);
    
    // Handle pagination
    const handlePrevPage = () => {
        if (pagination.currentPage > 1) {
            onPageChange(pagination.currentPage - 1);
        }
    };
    
    const handleNextPage = () => {
        if (pagination.currentPage < pagination.totalPages) {
            onPageChange(pagination.currentPage + 1);
        }
    };
    
    // Empty state
    if (!employees || employees.length === 0) {
        return (
            <div className="employee-analytics-table-container">
                <div className="empty-state">
                    <div className="empty-icon">📊</div>
                    <h3>No Data Available</h3>
                    <p>No employee attendance data found for the selected filters.</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="employee-analytics-table-container">
            <div className="table-wrapper">
                <table className="employee-analytics-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('rank')} className="sortable">
                                Rank {sortConfig.key === 'rank' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('employeeName')} className="sortable">
                                Employee Name {sortConfig.key === 'employeeName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('department')} className="sortable">
                                Department {sortConfig.key === 'department' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('presentDays')} className="sortable">
                                Present Days {sortConfig.key === 'presentDays' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('leaveDays')} className="sortable">
                                Leave Days {sortConfig.key === 'leaveDays' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('absentDays')} className="sortable">
                                Absent Days {sortConfig.key === 'absentDays' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('nonWorkingDays')} className="sortable">
                                Non-Working Days {sortConfig.key === 'nonWorkingDays' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('totalNetHours')} className="sortable">
                                Total Net Hours {sortConfig.key === 'totalNetHours' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('avgWorkingHours')} className="sortable">
                                Avg Working Hours {sortConfig.key === 'avgWorkingHours' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('overtimeHours')} className="sortable">
                                Overtime Hours {sortConfig.key === 'overtimeHours' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('attendancePercentage')} className="sortable">
                                Attendance % {sortConfig.key === 'attendancePercentage' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedEmployees.map((employee, index) => (
                            <EmployeeRow
                                key={employee.employeeId || index}
                                employee={employee}
                                index={index}
                                onRowClick={handleRowClick}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
            
            {pagination && pagination.totalPages > 1 && (
                <div className="pagination-controls">
                    <button
                        onClick={handlePrevPage}
                        disabled={pagination.currentPage === 1}
                        className="pagination-btn"
                    >
                        ← Previous
                    </button>
                    <span className="pagination-info">
                        Page {pagination.currentPage} of {pagination.totalPages}
                    </span>
                    <button
                        onClick={handleNextPage}
                        disabled={pagination.currentPage === pagination.totalPages}
                        className="pagination-btn"
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}

export default EmployeeAnalyticsTable;
