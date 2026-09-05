// frontend/src/hooks/useEmployeeLeaveBalance.js
// Shared hook extracted from LeavesTrackerPage.jsx > fetchLeaveUsageForYear.
// Returns the same data shape that LeavesTrackerPage used internally so both
// LeavesTrackerPage and LeaveRequestDetailPage can call it without duplication.

import { useState, useEffect, useCallback } from 'react';
import axios from '../api/axios';

/**
 * @param {string|null} employeeId  - MongoDB _id of the employee
 * @param {number}      year        - The "current" year being viewed (e.g. 2026)
 * @param {object|null} employeeData - Employee document (needs leaveEntitlements + leaveBalances);
 *                                    if null the hook fetches the employee from the API itself.
 *
 * Returns:
 *  {
 *    loading,            // boolean
 *    error,              // string|null
 *    data: {
 *      year,
 *      previousYear,
 *      previousYearOpening,   // { sick, casual, paid }
 *      utilized,              // { sick, casual, paid, lop } — previous-year actuals
 *      remainingBeforeYearEnd,// { sick, casual, paid }
 *      yearEndRequests,       // raw year-end request docs
 *      yearEndByType,         // grouped by leave type key
 *      currentBalances,       // employee.leaveBalances (live running balance)
 *      currentYearEntitlements,// { sick, casual, paid }
 *      leaveRequests,         // current-year normal leave requests
 *    }|null
 *  }
 */
const useEmployeeLeaveBalance = (employeeId, year, employeeData = null) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    const fetchBalance = useCallback(async (empId, yr, empData) => {
        if (!empId || !yr) return;

        setLoading(true);
        setError(null);

        try {
            const previousYear = yr - 1;

            // Resolve employee data if not provided — fetch from employees endpoint
            let resolvedEmployee = empData;
            if (!resolvedEmployee) {
                const empRes = await axios.get(`/admin/employees/${empId}`);
                resolvedEmployee = empRes.data;
            }

            // Fetch leave requests for previous and current year + year-end requests
            // year-end-requests is best-effort: the endpoint may 400 for employees with no
            // year-end data or if filtering is unsupported — don't let it break the balance load.
            const [leaveResPrev, leaveResCurr, yearEndRes] = await Promise.allSettled([
                axios.get(`/admin/leaves/employee/${empId}?year=${previousYear}`),
                axios.get(`/admin/leaves/employee/${empId}?year=${yr}`),
                axios.get(`/admin/leaves/year-end-requests?employeeId=${empId}&year=${previousYear}`),
            ]);

            const allPrev = leaveResPrev.status === 'fulfilled' ? (leaveResPrev.value.data || []) : [];
            const allCurr = leaveResCurr.status === 'fulfilled' ? (leaveResCurr.value.data || []) : [];
            const employeeYearEndRequests = yearEndRes.status === 'fulfilled'
                ? (yearEndRes.value.data?.requests || yearEndRes.value.data || [])
                : [];

            // Strip out YEAR_END pseudo-requests
            const normalPrev = allPrev.filter(r => r.requestType !== 'YEAR_END');
            const normalCurr = allCurr.filter(r => r.requestType !== 'YEAR_END');

            // --- Utilized days in the PREVIOUS year (balance-affecting types + LOP) ---
            const utilized = { sick: 0, casual: 0, paid: 0, lop: 0 };
            normalPrev.forEach(leave => {
                if (leave.status === 'Approved') {
                    const days = leave.leaveDates.length * (leave.leaveType?.startsWith('Half Day') ? 0.5 : 1);
                    if (leave.requestType === 'Sick') utilized.sick += days;
                    else if (leave.requestType === 'Casual') utilized.casual += days;
                    else if (leave.requestType === 'Planned') utilized.paid += days;
                    else if (leave.requestType === 'Loss of Pay') utilized.lop += days;
                }
            });

            // Opening balance for the previous year (use current entitlements as proxy)
            const previousYearOpening = {
                sick: resolvedEmployee?.leaveEntitlements?.sick ?? 6,
                casual: resolvedEmployee?.leaveEntitlements?.casual ?? 6,
                paid: resolvedEmployee?.leaveEntitlements?.paid ?? 10,
            };

            // Group year-end requests by leave type
            const yearEndByType = {};
            employeeYearEndRequests.forEach(req => {
                const leaveType = req.yearEndLeaveType?.toLowerCase() || 'unknown';
                if (!yearEndByType[leaveType]) yearEndByType[leaveType] = [];
                yearEndByType[leaveType].push(req);
            });

            // Remaining at end of previous year (before year-end actions)
            const remainingBeforeYearEnd = {
                sick: Math.max(0, previousYearOpening.sick - utilized.sick),
                casual: Math.max(0, previousYearOpening.casual - utilized.casual),
                paid: Math.max(0, previousYearOpening.paid - utilized.paid),
            };

            setData({
                year: yr,
                previousYear,
                previousYearOpening,
                utilized,
                remainingBeforeYearEnd,
                yearEndRequests: employeeYearEndRequests,
                yearEndByType,
                // Live running balance (after this year's deductions) — backend is source of truth
                currentBalances: resolvedEmployee?.leaveBalances || {},
                currentYearEntitlements: {
                    sick: resolvedEmployee?.leaveEntitlements?.sick ?? 6,
                    casual: resolvedEmployee?.leaveEntitlements?.casual ?? 6,
                    paid: resolvedEmployee?.leaveEntitlements?.paid ?? 10,
                },
                leaveRequests: normalCurr,
            });
        } catch (err) {
            console.error('[useEmployeeLeaveBalance] Error fetching leave balance:', err);
            setError('Failed to load leave balance data.');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (employeeId && year) {
            fetchBalance(employeeId, year, employeeData);
        } else {
            setData(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId, year]);

    return { loading, error, data, refetch: () => fetchBalance(employeeId, year, employeeData) };
};

export default useEmployeeLeaveBalance;
