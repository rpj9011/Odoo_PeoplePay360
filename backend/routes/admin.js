// backend/routes/admin.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- Middleware ---
const authenticateToken = require('../middleware/authenticateToken');
const { invalidateAnalyticsCache, invalidateCacheForDate } = require('../middleware/analyticsCacheInvalidation');

// --- Models ---
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const LeaveRequest = require('../models/LeaveRequest');
const LeavePolicyService = require('../services/LeavePolicyService');
const ExtraBreakRequest = require('../models/ExtraBreakRequest');
const EarlyCheckoutRequest = require('../models/EarlyCheckoutRequest');
const BreakLog = require('../models/BreakLog');
const earlyCheckoutService = require('../services/earlyCheckoutService');
const Holiday = require('../models/Holiday');
const Setting = require('../models/Setting');
const NewNotificationService = require('../services/NewNotificationService');
const { applyBalanceOnStatusChange, validateApprovalBalances, reconcileApprovedDayAllocations } = require('../services/leaveBalanceOnStatusChange');
const { validateDayAllocations, computeEffectiveDeductions } = require('../utils/leaveDayAllocations');
const { getUserDailyStatus, recalculateLateStatus, computeCalculatedLogoutTime } = require('../services/dailyStatusService');
const { syncAttendanceOnLeaveApproval, syncAttendanceOnLeaveRejection } = require('../services/leaveAttendanceSyncService');
const { getGracePeriodMinutes } = require('../utils/gracePeriod');
const { getTodayISTKey, getISTDateString, parseISTDate, startOfISTDay, endOfISTDay, getShiftDateTimeIST, normalizeLeaveDatesForApi } = require('../utils/istTime');
const { perfLog, verboseLog } = require('../utils/logLevel');
const { fetchAbsentTodayEmployees } = require('../services/dashboardEmployeeLists');

// ── HELPER: count only Monday–Friday dates in a leaveDates array ─────────────
// Saturday-clubbing may have added weekend dates to the array. When deducting
// from leaveBalances we must count ONLY working days to stay in sync with what
// the employee portal and admin tracker display.
const countWorkingDaysInLeaveDates = (leaveDates) => {
    if (!leaveDates || leaveDates.length === 0) return 0;
    return leaveDates.filter(d => {
        const dow = new Date(d).getDay();
        return dow !== 0 && dow !== 6; // exclude Sunday(0) and Saturday(6)
    }).length;
};
// ─────────────────────────────────────────────────────────────────────────────

// Middleware to check for Admin/HR role
// Prefer req.user.role from JWT (auth includes role in payload); fallback to DB only when missing to avoid extra User.findById on every request.
const isAdminOrHr = async (req, res, next) => {
    // CRITICAL FIX: Check if req.user exists before accessing role
    // This prevents 403 errors when authentication fails or user object is missing
    if (!req.user) {
        console.error('[isAdminOrHr] req.user is missing - authentication may have failed');
        return res.status(401).json({ error: 'Authentication required. Please log in again.' });
    }

    // Check role with better error logging (use token role when present to avoid DB hit)
    let userRole = req.user.role;

    // If role is missing from token, fetch from database as fallback
    if (!userRole && req.user.userId) {
        try {
            const dbUser = await User.findById(req.user.userId).select('role').lean();
            if (dbUser && dbUser.role) {
                userRole = dbUser.role;
                // Update req.user.role for consistency
                req.user.role = userRole;
                if (process.env.NODE_ENV !== 'production') console.log('[isAdminOrHr] Fetched role from database:', userRole);
            }
        } catch (error) {
            console.error('[isAdminOrHr] Error fetching user role from database:', error);
        }
    }

    if (!userRole) {
        console.error('[isAdminOrHr] req.user.role is missing for user:', req.user.userId || req.user.email);
        return res.status(403).json({ error: 'User role not found. Please contact administrator.' });
    }

    // Normalize role (trim whitespace, handle case sensitivity)
    const normalizedRole = String(userRole).trim();
    if (!['Admin', 'HR'].includes(normalizedRole)) {
        console.warn('[isAdminOrHr] Access denied - User role:', normalizedRole, 'User ID:', req.user.userId || req.user.email);
        return res.status(403).json({
            error: 'Access forbidden: Requires Admin or HR role.'
        });
    }

    next();
};

// --- LEAVE MANAGEMENT ROUTES ---

// Build optional employee/leave search match for leaves/all aggregation (after $lookup + $unwind).
function buildLeaveListSearchMatch(search) {
    const term = (search || '').trim();
    if (!term) return null;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    return {
        $or: [
            { 'employeeData.fullName': regex },
            { 'employeeData.employeeCode': regex },
            { 'employeeData.department': regex },
            { requestType: regex },
            { leaveType: regex },
            { status: regex },
            { reason: regex },
        ],
    };
}

// GET /api/admin/leaves/all
router.get('/leaves/all', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { role } = req.query; // Optional: 'Employee' or 'Intern' to filter by role
        const searchMatch = buildLeaveListSearchMatch(req.query.search);

        // Exclude YEAR_END requests from normal leave requests
        const baseQuery = { requestType: { $ne: 'YEAR_END' } };

        // If role filter is provided, use aggregation to filter by employee role
        if (role && (role === 'Employee' || role === 'Intern')) {
            // Use aggregation to filter by employee role at database level
            const matchStage = { ...baseQuery };

            const pipeline = [
                { $match: matchStage },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'employee',
                        foreignField: '_id',
                        as: 'employeeData'
                    }
                },
                { $unwind: '$employeeData' },
                // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in lists)
                { $match: { 'employeeData.role': role, 'employeeData.isActive': true } },
                ...(searchMatch ? [{ $match: searchMatch }] : []),
                {
                    $project: {
                        employee: {
                            _id: '$employeeData._id',
                            fullName: '$employeeData.fullName',
                            employeeCode: '$employeeData.employeeCode'
                        },
                        requestType: 1,
                        leaveType: 1,
                        leaveDates: 1,
                        alternateDate: 1,
                        reason: 1,
                        status: 1,
                        isBackdated: 1,
                        approvedBy: 1,
                        approvedAt: 1,
                        rejectionNotes: 1,
                        medicalCertificate: 1,
                        appliedAfterReturn: 1,
                        halfYearPeriod: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: skip }, { $limit: limit }],
                        totalCount: [{ $count: 'count' }]
                    }
                }
            ];

            const result = await LeaveRequest.aggregate(pipeline);
            const requests = result[0]?.data || [];
            const totalCount = result[0]?.totalCount[0]?.count || 0;

            return res.json({
                requests,
                totalCount,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit)
            });
        } else {
            // No role filter - return all requests but exclude Admin and inactive users (business rule)
            // Use aggregation to filter by employee role and status at database level
            const pipeline = [
                { $match: baseQuery },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'employee',
                        foreignField: '_id',
                        as: 'employeeData'
                    }
                },
                { $unwind: '$employeeData' },
                // Filter: Exclude Admin role and inactive users
                { $match: { 'employeeData.role': { $ne: 'Admin' }, 'employeeData.isActive': true } },
                ...(searchMatch ? [{ $match: searchMatch }] : []),
                {
                    $project: {
                        employee: {
                            _id: '$employeeData._id',
                            fullName: '$employeeData.fullName',
                            employeeCode: '$employeeData.employeeCode'
                        },
                        requestType: 1,
                        leaveType: 1,
                        leaveDates: 1,
                        alternateDate: 1,
                        reason: 1,
                        status: 1,
                        isBackdated: 1,
                        approvedBy: 1,
                        approvedAt: 1,
                        rejectionNotes: 1,
                        medicalCertificate: 1,
                        appliedAfterReturn: 1,
                        halfYearPeriod: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: skip }, { $limit: limit }],
                        totalCount: [{ $count: 'count' }]
                    }
                }
            ];

            const result = await LeaveRequest.aggregate(pipeline);
            const requests = result[0]?.data || [];
            const totalCount = result[0]?.totalCount[0]?.count || 0;

            return res.json({
                requests,
                totalCount,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit)
            });
        }
    } catch (error) {
        console.error('Error fetching all leave requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests.' });
    }
});

// GET /api/admin/leaves/analytics/counts
// Performance: single aggregation returns leave counts per employee; no pagination loop.
// Query: month (1-12), year, role (Employee|Intern|All), leaveType (optional requestType), startDate, endDate (optional; overrides month/year)
router.get('/leaves/analytics/counts', [authenticateToken, isAdminOrHr], async (req, res) => {
    const cacheService = require('../services/cacheService');
    try {
        const month = parseInt(req.query.month, 10);
        const year = parseInt(req.query.year, 10);
        const role = (req.query.role || 'Employee').trim();
        const leaveTypeFilter = (req.query.leaveType || '').trim();
        let startDate = req.query.startDate ? new Date(req.query.startDate) : null;
        let endDate = req.query.endDate ? new Date(req.query.endDate) : null;

        if (!startDate || !endDate) {
            if (Number.isNaN(month) || Number.isNaN(year)) {
                return res.status(400).json({ error: 'month and year are required when startDate/endDate not provided.' });
            }
            // Build month range in IST so leaveDates comparison is IST-consistent (no off-by-one at boundaries)
            const firstDayStr = `${year}-${String(month).padStart(2, '0')}-01`;
            startDate = startOfISTDay(parseISTDate(firstDayStr));
            const lastDay = new Date(year, month, 0).getDate();
            const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            endDate = endOfISTDay(parseISTDate(lastDayStr));
        }

        const cacheKey = Number.isNaN(month) || Number.isNaN(year)
            ? `leave_counts:${startDate.getTime()}:${endDate.getTime()}:${role}:${leaveTypeFilter || 'all'}`
            : `leave_counts:${month}:${year}:${role}:${leaveTypeFilter || 'all'}`;
        const cached = cacheService.getLeaveCountsAnalytics(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const roleMatch = role === 'All'
            ? { 'employeeData.role': { $in: ['Employee', 'Intern'] }, 'employeeData.isActive': true }
            : { 'employeeData.role': role, 'employeeData.isActive': true };

        const pipeline = [
            { $match: { requestType: { $ne: 'YEAR_END' } } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'employeeData'
                }
            },
            { $unwind: '$employeeData' },
            { $match: roleMatch },
            {
                $addFields: {
                    daysInRange: {
                        $size: {
                            $filter: {
                                input: '$leaveDates',
                                as: 'd',
                                cond: {
                                    $and: [
                                        { $gte: ['$$d', startDate] },
                                        { $lte: ['$$d', endDate] }
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            { $match: { daysInRange: { $gt: 0 } } }
        ];

        if (leaveTypeFilter) {
            pipeline.push({ $match: { requestType: leaveTypeFilter } });
        }

        pipeline.push(
            {
                $addFields: {
                    effectiveDays: {
                        $cond: [
                            { $eq: ['$leaveType', 'Full Day'] },
                            '$daysInRange',
                            { $multiply: ['$daysInRange', 0.5] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: { employee: '$employee', requestType: '$requestType' },
                    leaveApplied: { $sum: 1 },
                    leaveApproved: {
                        $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] }
                    },
                    totalDays: { $sum: '$effectiveDays' }
                }
            },
            {
                $group: {
                    _id: '$_id.employee',
                    leaveApplied: { $sum: '$leaveApplied' },
                    leaveApproved: { $sum: '$leaveApproved' },
                    totalLeaveDays: { $sum: '$totalDays' },
                    leaveTypeBreakdown: {
                        $push: { requestType: '$_id.requestType', days: '$totalDays' }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    employeeId: '$_id',
                    fullName: '$user.fullName',
                    employeeCode: '$user.employeeCode',
                    leaveApplied: 1,
                    leaveApproved: 1,
                    totalLeaveDays: { $round: ['$totalLeaveDays', 1] },
                    leaveTypeBreakdown: 1
                }
            }
        );

        const result = await LeaveRequest.aggregate(pipeline);

        const payload = result.map((r) => ({
            employeeId: r.employeeId,
            fullName: r.fullName || '',
            employeeCode: r.employeeCode || '',
            leaveApplied: r.leaveApplied || 0,
            leaveApproved: r.leaveApproved || 0,
            totalLeaveDays: r.totalLeaveDays || 0,
            leaveTypeBreakdown: (r.leaveTypeBreakdown || []).reduce((acc, { requestType, days }) => {
                acc[requestType || 'Unknown'] = (acc[requestType || 'Unknown'] || 0) + days;
                return acc;
            }, {})
        }));

        cacheService.setLeaveCountsAnalytics(cacheKey, payload);
        res.json(payload);
    } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error in leave analytics counts:', err);
        }
        res.status(500).json({ error: 'Failed to load leave counts. Please try again.' });
    }
});

// POST /api/admin/leaves
router.post('/leaves', [authenticateToken, isAdminOrHr], async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { employee, requestType, leaveType, leaveDates, alternateDate, reason, medicalCertificate, adminOverrideReason, status, appliedDate } = req.body;
        
        if (!employee || !requestType || !leaveDates || !leaveType || !reason) {
            await session.abortTransaction();
            console.error("Missing required fields:", { employee, requestType, leaveDates, leaveType, reason });
            return res.status(400).json({ error: 'Missing required fields: employee, requestType, leaveDates, leaveType, reason.' });
        }

        const dateNorm = normalizeLeaveDatesForApi(leaveDates);
        if (!dateNorm.valid) {
            await session.abortTransaction();
            return res.status(400).json({ error: dateNorm.error });
        }
        let leaveDatesArray = dateNorm.dateStrings.map(d => parseISTDate(d));
        
        const employeeDoc = await User.findById(employee).session(session);
        if (!employeeDoc) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }
        
        const requestTypeNorm = LeavePolicyService.normalizeRequestType(requestType);
        
        // Apply Saturday clubbing for Planned Leave (Paid Leave) only.
        // Saturday is only clubbed when advance notice ≥ 30 days is met.
        // Casual, Sick, and LOP are never eligible for Saturday clubbing.
        if (requestTypeNorm === 'Planned') {
            // Use admin-provided appliedDate if present (for backdated admin entries), else today
            const leaveAppliedDate = appliedDate ? new Date(appliedDate) : new Date();
            const clubbedDates = LeavePolicyService.clubSaturdayInLeaveDates(
                employeeDoc,
                leaveDatesArray,
                requestTypeNorm,
                leaveAppliedDate
            );
            // Convert clubbed date strings back to Date objects
            leaveDatesArray = clubbedDates.map(d => parseISTDate(d));
        }
        
        const validation = await LeavePolicyService.validateRequest(
            employee,
            leaveDatesArray,
            requestTypeNorm,
            leaveType,
            adminOverrideReason || `Admin-applied leave by user ID: ${req.user.userId}`, // Auto-provide override for admin
            alternateDate ? parseISTDate(alternateDate) : null,
            { isAdminUpdate: true } // Flag to bypass advance notice checks for admin-created leaves
        );
        
        if (!validation.allowed && !adminOverrideReason) {
            await session.abortTransaction();
            return res.status(400).json({ 
                error: validation.reason || 'Leave request validation failed.',
                rule: validation.rule,
                errors: [validation.reason]
            });
        }
        
        // Validate appliedDate if provided
        let employeeAppliedDate = appliedDate ? new Date(appliedDate) : new Date();
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        if (employeeAppliedDate > today) {
            await session.abortTransaction();
            return res.status(400).json({ 
                error: 'Employee applied date cannot be in the future.',
                errors: ['Employee applied date cannot be in the future.']
            });
        }
        
        // Prepare leave request data (store normalized type for Comp-Off -> Compensatory)
        const leaveRequestData = {
            employee,
            requestType: requestTypeNorm,
            leaveType,
            leaveDates: leaveDatesArray,
            alternateDate: alternateDate ? parseISTDate(alternateDate) : null,
            reason,
            status: status || 'Pending',
            createdAt: employeeAppliedDate, // Set the employee applied date
            adminOverride: !!adminOverrideReason,
            overrideReason: adminOverrideReason || `Admin-applied leave by user ID: ${req.user.userId}`,
            overriddenBy: req.user.userId,
            overriddenAt: new Date()
        };
        
        // Add medical certificate for sick leave
        if (requestType === 'Sick' && medicalCertificate) {
            leaveRequestData.medicalCertificate = medicalCertificate;
        }
        
        const newRequest = await LeaveRequest.create([leaveRequestData], { session });
        const savedRequest = newRequest[0];
        
        // CRITICAL FIX: If status is Approved, update leave balance immediately
        if (savedRequest.status === 'Approved') {
            // Use working-day count only (exclude any auto-clubbed Saturdays/Sundays)
            const workingDayCount = countWorkingDaysInLeaveDates(savedRequest.leaveDates);
            const leaveDuration = workingDayCount * (savedRequest.leaveType === 'Full Day' ? 1 : 0.5);
            const leaveField = LeavePolicyService.getBalanceField(savedRequest.requestType);

            if (leaveField === 'backdated') {
                const resolved = LeavePolicyService.resolveBalanceForBackdatedLeave(employeeDoc, leaveDuration);
                if (resolved.deduct === false) {
                    // No deduction (Intern/Probation)
                } else if (resolved.allowed === false) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: resolved.reason });
                } else if (resolved.allowed === true && resolved.deductions && resolved.deductions.length > 0) {
                    const conditions = { _id: employeeDoc._id };
                    resolved.deductions.forEach(({ field, amount }) => {
                        conditions[`leaveBalances.${field}`] = { $gte: amount };
                    });
                    const update = { $inc: {} };
                    resolved.deductions.forEach(({ field, amount }) => {
                        update.$inc[`leaveBalances.${field}`] = -amount;
                    });
                    const updated = await User.findOneAndUpdate(conditions, update, { session, new: true });
                    if (!updated) {
                        await session.abortTransaction();
                        return res.status(400).json({ error: 'Insufficient leave balance for backdated leave.' });
                    }
                    const sickD = resolved.deductions.find(d => d.field === 'sick');
                    const casualD = resolved.deductions.find(d => d.field === 'casual');
                    const backdatedSick = sickD ? sickD.amount : 0;
                    const backdatedCasual = casualD ? casualD.amount : 0;
                    await LeaveRequest.findByIdAndUpdate(savedRequest._id, {
                        backdatedSickDeducted: backdatedSick,
                        backdatedCasualDeducted: backdatedCasual
                    }, { session });
                    savedRequest.backdatedSickDeducted = backdatedSick;
                    savedRequest.backdatedCasualDeducted = backdatedCasual;
                }
            } else if (leaveField) {
                // CRITICAL FIX: Use atomic findOneAndUpdate instead of save() to prevent race conditions
                // This matches the PATCH endpoint pattern for consistency and reliability
                const updatePath = `leaveBalances.${leaveField}`;
                
                // Get current balance from database (not just in-memory doc) to ensure accuracy
                const currentBalanceDoc = await User.findById(employeeDoc._id).select(`leaveBalances.${leaveField}`).session(session).lean();
                const currentBalance = currentBalanceDoc?.leaveBalances?.[leaveField];
                
                // Handle undefined/null balance fields - MongoDB $gte doesn't match these
                // If field doesn't exist or is null, treat as 0
                const effectiveBalance = (currentBalance === undefined || currentBalance === null) ? 0 : currentBalance;
                
                // Check if balance is sufficient BEFORE attempting atomic update
                if (effectiveBalance < leaveDuration) {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: `Insufficient leave balance at approval time. Required ${leaveDuration} day(s), available ${effectiveBalance}.` 
                    });
                }
                
                // If field doesn't exist or is null, initialize it first
                if (currentBalance === undefined || currentBalance === null) {
                    await User.findByIdAndUpdate(
                        employeeDoc._id,
                        { $set: { [updatePath]: 0 } },
                        { session }
                    );
                }
                
                // Now perform atomic update with condition check
                // MongoDB $gte will now match since field exists
                const updated = await User.findOneAndUpdate(
                    { 
                        _id: employeeDoc._id,
                        [updatePath]: { $gte: leaveDuration }
                    },
                    { $inc: { [updatePath]: -leaveDuration } },
                    { session, new: true }
                );
                
                if (!updated) {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: `Insufficient leave balance at approval time (or concurrent update). Required ${leaveDuration} day(s), available ${effectiveBalance}.` 
                    });
                }
                
                const newBalance = updated.leaveBalances?.[leaveField] ?? 0;
                if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_BALANCE] Admin POST: Deducted ${leaveDuration} ${leaveField} days. Old balance: ${effectiveBalance}, New balance: ${newBalance}`);
                
                // Update employeeDoc reference for potential use later in transaction
                if (!employeeDoc.leaveBalances) {
                    employeeDoc.leaveBalances = {};
                }
                employeeDoc.leaveBalances[leaveField] = newBalance;
            }

            // Sync attendance
            const { syncAttendanceOnLeaveApproval } = require('../services/leaveAttendanceSyncService');
            await syncAttendanceOnLeaveApproval(savedRequest, session);
        }
        
        await session.commitTransaction();

        // Invalidate dashboard and pending-leaves cache; invalidate leave analytics so Leave Count tabs see fresh data
        const cacheService = require('../services/cacheService');
        const todayIST = getTodayISTKey();
        cacheService.invalidatePendingLeaves(todayIST);
        cacheService.invalidateDashboard(todayIST);
        cacheService.invalidateLeaveAnalytics();
        
        // Send notifications
        const NewNotificationService = require('../services/NewNotificationService');
        if (savedRequest.status === 'Approved') {
            NewNotificationService.notifyLeaveResponse(employee, employeeDoc.fullName, 'Approved', requestType, null)
                .catch(err => console.error('Error sending leave approval notification:', err));
        }
        
        res.status(201).json({ 
            message: 'Leave request created successfully.', 
            request: savedRequest 
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error creating leave request by admin:', error);
        res.status(500).json({ error: error.message || 'Failed to create leave request.' });
    } finally {
        session.endSession();
    }
});

// PUT /leaves/:id
router.put('/leaves/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Get the original leave request to compare changes
        const originalRequest = await LeaveRequest.findById(req.params.id).session(session);
        if (!originalRequest) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Request not found.' });
        }

        // Helper: normalize dates to YYYY-MM-DD in IST (single source of truth for date comparison)
        const normalizeDate = (date) => {
            const dateObj = date instanceof Date ? date : (typeof date === 'string' ? parseISTDate(date) : new Date(date));
            return getISTDateString(dateObj);
        };

        // Check if leave dates or status changed
        const datesChanged = req.body.leaveDates &&
            JSON.stringify((req.body.leaveDates || []).map(normalizeDate).sort()) !==
            JSON.stringify((originalRequest.leaveDates || []).map(normalizeDate).sort());

        const statusChanged = req.body.status && req.body.status !== originalRequest.status;
        const requestTypeChanged = req.body.requestType && req.body.requestType !== originalRequest.requestType;
        const leaveTypeChanged = req.body.leaveType && req.body.leaveType !== originalRequest.leaveType;
        const wasApproved = originalRequest.status === 'Approved';
        const willBeApproved = req.body.status === 'Approved' || (!req.body.status && wasApproved);
        const allocationsInBody = req.body.dayTypeAllocations !== undefined;

        const employee = await User.findById(originalRequest.employee).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Normalize leaveDates at API boundary (YYYY-MM-DD only)
        // Only allow specific fields to be updated
        const allowedUpdateFields = ['employee', 'requestType', 'leaveType', 'leaveDates', 'alternateDate', 'reason', 'status', 'createdAt', 'dayTypeAllocations'];
        let bodyToApply = {};
        
        // Copy only allowed fields from req.body
        allowedUpdateFields.forEach(field => {
            if (req.body[field] !== undefined) {
                bodyToApply[field] = req.body[field];
            }
        });
        
        // Normalize leaveDates
        if (bodyToApply.leaveDates && Array.isArray(bodyToApply.leaveDates)) {
            const dateNorm = normalizeLeaveDatesForApi(bodyToApply.leaveDates);
            if (!dateNorm.valid) {
                await session.abortTransaction();
                return res.status(400).json({ error: dateNorm.error });
            }
            bodyToApply.leaveDates = dateNorm.dateStrings.map(d => parseISTDate(d));
        }
        
        // Normalize alternateDate if provided (can be null)
        if (bodyToApply.alternateDate !== undefined && bodyToApply.alternateDate !== null) {
            bodyToApply.alternateDate = parseISTDate(bodyToApply.alternateDate);
        } else if (bodyToApply.alternateDate === null) {
            bodyToApply.alternateDate = null;
        }
        
        if (allocationsInBody) {
            const effectiveType = bodyToApply.requestType ?? originalRequest.requestType;
            if (effectiveType !== 'Loss of Pay') {
                await session.abortTransaction();
                return res.status(400).json({ error: 'Day allocations apply only to Loss of Pay requests.' });
            }
            const tempForValidation = {
                ...originalRequest.toObject(),
                leaveDates: bodyToApply.leaveDates ?? originalRequest.leaveDates,
                requestType: 'Loss of Pay',
            };
            const allocValidation = validateDayAllocations(tempForValidation, req.body.dayTypeAllocations);
            if (!allocValidation.valid) {
                await session.abortTransaction();
                return res.status(400).json({ error: allocValidation.error });
            }
            bodyToApply.dayTypeAllocations = allocValidation.allocations;
            bodyToApply.dayAllocationsUpdatedBy = req.user.userId;
            bodyToApply.dayAllocationsUpdatedAt = new Date();
        }

        // Handle createdAt (applied date) update - only allow admin to update this field
        let createdAtToUpdate = null;
        if (bodyToApply.createdAt) {
            // Parse the ISO string to Date object
            const appliedDate = new Date(bodyToApply.createdAt);
            if (isNaN(appliedDate.getTime())) {
                await session.abortTransaction();
                return res.status(400).json({ error: 'Invalid applied date format.' });
            }
            createdAtToUpdate = appliedDate;
            // Remove createdAt from bodyToApply as we'll update it separately
            delete bodyToApply.createdAt;
        }

        // Re-run policy when result would be Approved and dates/type/status changed (allow admin override)
        if (willBeApproved && (datesChanged || requestTypeChanged || leaveTypeChanged || statusChanged)) {
            const adminPayload = {
                leaveDates: bodyToApply.leaveDates ?? originalRequest.leaveDates,
                requestType: bodyToApply.requestType ?? originalRequest.requestType,
                leaveType: bodyToApply.leaveType ?? originalRequest.leaveType,
                status: bodyToApply.status ?? originalRequest.status,
                alternateDate: bodyToApply.alternateDate ?? originalRequest.alternateDate,
                // Include createdAt if it was updated (for advance notice calculation)
                createdAt: createdAtToUpdate || originalRequest.createdAt
            };
            const policyResult = await LeavePolicyService.validateAdminUpdate(
                originalRequest,
                adminPayload,
                employee,
                { 
                    adminOverrideReason: bodyToApply.overrideReason || bodyToApply.adminOverrideReason || 'Admin update',
                    isAdminUpdate: true // Flag to bypass advance notice checks
                }
            );
            if (!policyResult.allowed) {
                await session.abortTransaction();
                return res.status(400).json({ error: policyResult.reason });
            }
        }

        // Update the leave request
        const updatedRequest = await LeaveRequest.findByIdAndUpdate(
            req.params.id,
            bodyToApply,
            { new: true, session }
        );

        if (!updatedRequest) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Request not found.' });
        }

        // Update createdAt separately if provided (Mongoose timestamps don't allow direct update)
        if (createdAtToUpdate) {
            await LeaveRequest.findByIdAndUpdate(
                req.params.id,
                { $set: { createdAt: createdAtToUpdate } },
                { session }
            );
            // Update the local object to reflect the change
            updatedRequest.createdAt = createdAtToUpdate;
        }

        // CRITICAL FIX: Handle balance updates when requestType, leaveType, or duration changes
        // Use working-day count only (exclude any auto-clubbed Saturdays/Sundays)
        const oldWorkingDayCount = countWorkingDaysInLeaveDates(originalRequest.leaveDates);
        const newWorkingDayCount = countWorkingDaysInLeaveDates(updatedRequest.leaveDates);
        const oldLeaveDuration = oldWorkingDayCount * (originalRequest.leaveType === 'Full Day' ? 1 : 0.5);
        const newLeaveDuration = newWorkingDayCount * (updatedRequest.leaveType === 'Full Day' ? 1 : 0.5);
        const durationChanged = newLeaveDuration !== oldLeaveDuration;

        const oldReqTypeNorm = LeavePolicyService.normalizeRequestType(originalRequest.requestType);
        const newReqTypeNorm = LeavePolicyService.normalizeRequestType(updatedRequest.requestType);
        const oldLeaveField = LeavePolicyService.getBalanceField(oldReqTypeNorm);
        const newLeaveField = LeavePolicyService.getBalanceField(newReqTypeNorm);

        const allocationsChanged = allocationsInBody && JSON.stringify(
            (originalRequest.dayTypeAllocations || []).map((a) => ({
                d: getISTDateString(a.date),
                t: a.requestType,
            }))
        ) !== JSON.stringify(
            (bodyToApply.dayTypeAllocations || []).map((a) => ({
                d: getISTDateString(a.date),
                t: a.requestType,
            }))
        );

        // Status transition balance (e.g. Approved → Rejected: restore balances)
        if (statusChanged && wasApproved !== willBeApproved) {
            const balanceResult = await applyBalanceOnStatusChange(
                originalRequest,
                employee,
                originalRequest.status,
                updatedRequest.status,
                session
            );
            if (!balanceResult.ok) {
                await session.abortTransaction();
                return res.status(400).json({ error: balanceResult.error });
            }
        } else if (wasApproved && willBeApproved && allocationsChanged && updatedRequest.requestType === 'Loss of Pay') {
            const balanceResult = await reconcileApprovedDayAllocations(
                employee._id,
                updatedRequest,
                originalRequest.dayTypeAllocations,
                bodyToApply.dayTypeAllocations,
                session
            );
            if (!balanceResult.ok) {
                await session.abortTransaction();
                return res.status(400).json({ error: balanceResult.error });
            }
        } else if (employee.leaveBalances && wasApproved && willBeApproved) {
            if (typeof employee.leaveBalances.sick === 'undefined') employee.leaveBalances.sick = 0;
            if (typeof employee.leaveBalances.casual === 'undefined') employee.leaveBalances.casual = 0;
            if (typeof employee.leaveBalances.paid === 'undefined') employee.leaveBalances.paid = 0;

            if (requestTypeChanged) {
                // Restore balance from old requestType
                if (oldLeaveField === 'backdated') {
                    const s = originalRequest.backdatedSickDeducted ?? 0;
                    const c = originalRequest.backdatedCasualDeducted ?? 0;
                    if (s > 0) employee.leaveBalances.sick += s;
                    if (c > 0) employee.leaveBalances.casual += c;
                } else if (oldLeaveField) {
                    employee.leaveBalances[oldLeaveField] += oldLeaveDuration;
                }

                // Deduct balance for new requestType
                if (newLeaveField === 'backdated') {
                    const resolved = LeavePolicyService.resolveBalanceForBackdatedLeave(employee, newLeaveDuration);
                    if (resolved.allowed === true && resolved.deductions && resolved.deductions.length > 0) {
                        resolved.deductions.forEach(({ field, amount }) => {
                            employee.leaveBalances[field] = Math.max(0, (employee.leaveBalances[field] ?? 0) - amount);
                        });
                        const sickD = resolved.deductions.find(d => d.field === 'sick');
                        const casualD = resolved.deductions.find(d => d.field === 'casual');
                        updatedRequest.backdatedSickDeducted = sickD ? sickD.amount : 0;
                        updatedRequest.backdatedCasualDeducted = casualD ? casualD.amount : 0;
                        await LeaveRequest.findByIdAndUpdate(updatedRequest._id, {
                            backdatedSickDeducted: updatedRequest.backdatedSickDeducted,
                            backdatedCasualDeducted: updatedRequest.backdatedCasualDeducted
                        }, { session });
                    }
                } else if (newLeaveField) {
                    employee.leaveBalances[newLeaveField] = Math.max(0, (employee.leaveBalances[newLeaveField] ?? 0) - newLeaveDuration);
                }
            }
            // Scenario 2: Duration or leaveType changed (same requestType)
            else if ((durationChanged || leaveTypeChanged) && !requestTypeChanged) {
                const leaveField = newLeaveField;

                if (leaveField === 'backdated') {
                    // Restore old backdated amounts
                    const s = originalRequest.backdatedSickDeducted ?? 0;
                    const c = originalRequest.backdatedCasualDeducted ?? 0;
                    if (s > 0) employee.leaveBalances.sick += s;
                    if (c > 0) employee.leaveBalances.casual += c;
                    // Deduct new backdated amounts
                    const resolved = LeavePolicyService.resolveBalanceForBackdatedLeave(employee, newLeaveDuration);
                    if (resolved.allowed === true && resolved.deductions && resolved.deductions.length > 0) {
                        resolved.deductions.forEach(({ field, amount }) => {
                            employee.leaveBalances[field] = Math.max(0, (employee.leaveBalances[field] ?? 0) - amount);
                        });
                        const sickD = resolved.deductions.find(d => d.field === 'sick');
                        const casualD = resolved.deductions.find(d => d.field === 'casual');
                        updatedRequest.backdatedSickDeducted = sickD ? sickD.amount : 0;
                        updatedRequest.backdatedCasualDeducted = casualD ? casualD.amount : 0;
                        await LeaveRequest.findByIdAndUpdate(updatedRequest._id, {
                            backdatedSickDeducted: updatedRequest.backdatedSickDeducted,
                            backdatedCasualDeducted: updatedRequest.backdatedCasualDeducted
                        }, { session });
                    }
                } else if (leaveField) {
                    employee.leaveBalances[leaveField] += oldLeaveDuration;
                    employee.leaveBalances[leaveField] = Math.max(0, employee.leaveBalances[leaveField] - newLeaveDuration);
                }
            }

            // Save employee if balance was updated
            if (requestTypeChanged || durationChanged || leaveTypeChanged) {
                await employee.save({ session });
            }
        }

        // If leave was approved and dates changed, or status changed to Approved, sync attendance
        if (wasApproved && datesChanged) {
            // Dates changed for an approved leave - need to sync attendance
            try {
                // Calculate which dates were removed and which were added using normalized dates
                const oldDates = (originalRequest.leaveDates || []).map(normalizeDate).sort();
                const newDates = (updatedRequest.leaveDates || []).map(normalizeDate).sort();
                const removedDates = oldDates.filter(d => !newDates.includes(d));
                const addedDates = newDates.filter(d => !oldDates.includes(d));

                if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_UPDATE] Dates changed - Removed: ${removedDates.join(', ')}, Added: ${addedDates.join(', ')}`);
                if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_UPDATE] Original dates: ${oldDates.join(', ')}, New dates: ${newDates.join(', ')}`);

                // Revert attendance for removed dates
                if (removedDates.length > 0) {
                    // Create a temporary leave request with only removed dates for reverting
                    // Convert normalized YYYY-MM-DD (IST) back to Date objects via parseISTDate
                    const tempLeaveForRevert = {
                        ...originalRequest.toObject(),
                        leaveDates: removedDates.map(d => parseISTDate(d))
                    };
                    if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_UPDATE] Reverting attendance for dates: ${removedDates.join(', ')}`);
                    await syncAttendanceOnLeaveRejection(tempLeaveForRevert, session);
                }

                // Sync attendance for new dates (if still approved)
                if (willBeApproved && addedDates.length > 0) {
                    // Create a temporary leave request with only new dates for syncing
                    // Convert normalized YYYY-MM-DD (IST) back to Date objects via parseISTDate
                    const tempLeaveForSync = {
                        ...updatedRequest.toObject(),
                        leaveDates: addedDates.map(d => parseISTDate(d))
                    };
                    if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_UPDATE] Syncing attendance for dates: ${addedDates.join(', ')}`);
                    await syncAttendanceOnLeaveApproval(tempLeaveForSync, session);
                }
            } catch (syncError) {
                await session.abortTransaction();
                console.error('Error syncing attendance after leave date change:', syncError);
                throw new Error(`Failed to sync attendance records: ${syncError.message}`);
            }
        } else if (statusChanged) {
            // Status changed - sync attendance based on new status
            try {
                if (willBeApproved && !wasApproved) {
                    // Newly approved
                    await syncAttendanceOnLeaveApproval(updatedRequest, session);
                } else if (!willBeApproved && wasApproved) {
                    // Rejected/cancelled after approval
                    await syncAttendanceOnLeaveRejection(updatedRequest, session);
                }
            } catch (syncError) {
                await session.abortTransaction();
                console.error('Error syncing attendance after leave status change:', syncError);
                throw new Error(`Failed to sync attendance records: ${syncError.message}`);
            }
        } else if (willBeApproved && datesChanged) {
            // Leave is being approved with new dates
            try {
                await syncAttendanceOnLeaveApproval(updatedRequest, session);
            } catch (syncError) {
                await session.abortTransaction();
                console.error('Error syncing attendance for newly approved leave:', syncError);
                throw new Error(`Failed to sync attendance records: ${syncError.message}`);
            }
        }

        await session.commitTransaction();

        // Emit Socket.IO event to notify all clients about the leave update
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: updatedRequest._id,
                    employeeId: updatedRequest.employee,
                    leaveDates: updatedRequest.leaveDates,
                    status: updatedRequest.status,
                    requestType: updatedRequest.requestType,
                    datesChanged: datesChanged,
                    statusChanged: statusChanged,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Leave request updated${datesChanged ? ' (dates changed)' : ''}${statusChanged ? ` (status: ${updatedRequest.status})` : ''}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted leave_request_updated event for leave ${updatedRequest._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // Invalidate dashboard and pending-leaves cache so dashboard shows fresh data
        const cacheServicePut = require('../services/cacheService');
        const todayIST = getTodayISTKey();
        cacheServicePut.invalidatePendingLeaves(todayIST);
        cacheServicePut.invalidateDashboard(todayIST);
        cacheServicePut.invalidateLeaveAnalytics();

        const employeeDoc = await User.findById(updatedRequest.employee).lean();
        if (employeeDoc) {
            if (statusChanged && wasApproved && !willBeApproved) {
                const action = updatedRequest.status === 'Rejected' ? 'rejected' : 'revoked';
                NewNotificationService.notifyLeaveReverted(
                    updatedRequest.employee,
                    employeeDoc.fullName,
                    updatedRequest.requestType,
                    action,
                    null,
                    updatedRequest._id.toString()
                ).catch((err) => console.error('Error sending leave revert notification:', err));
            } else if (wasApproved && willBeApproved && (datesChanged || requestTypeChanged || allocationsChanged)) {
                NewNotificationService.notifyLeaveReverted(
                    updatedRequest.employee,
                    employeeDoc.fullName,
                    updatedRequest.requestType,
                    'updated',
                    datesChanged ? 'Some leave dates or types were changed.' : 'Your leave details were updated.',
                    updatedRequest._id.toString()
                ).catch((err) => console.error('Error sending leave update notification:', err));
            } else if (statusChanged && !wasApproved && willBeApproved) {
                NewNotificationService.notifyLeaveResponse(
                    updatedRequest.employee,
                    employeeDoc.fullName,
                    'Approved',
                    updatedRequest.requestType,
                    null
                ).catch((err) => console.error('Error sending leave approval notification:', err));
            }
        }

        res.json({
            message: 'Request updated successfully.',
            request: updatedRequest,
            attendanceSynced: (wasApproved && datesChanged) || statusChanged || (willBeApproved && datesChanged)
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error updating leave request by admin:', error);
        res.status(500).json({ error: error.message || 'Failed to update request.' });
    } finally {
        session.endSession();
    }
});

// DELETE /leaves/:id
router.delete('/leaves/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const deletedRequest = await LeaveRequest.findById(req.params.id).session(session);
        if (!deletedRequest) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Request not found.' });
        }
        
        if (deletedRequest.status === 'Approved') {
            const employee = await User.findById(deletedRequest.employee).session(session);
            if (employee) {
                const balanceResult = await applyBalanceOnStatusChange(
                    deletedRequest,
                    employee,
                    'Approved',
                    'Rejected',
                    session
                );
                if (!balanceResult.ok) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: balanceResult.error });
                }
                await syncAttendanceOnLeaveRejection(deletedRequest, session);
            }
        }
        
        // Delete the leave request
        await LeaveRequest.findByIdAndDelete(req.params.id).session(session);
        
        await session.commitTransaction();

        // Invalidate dashboard and pending-leaves cache so dashboard shows fresh data
        const cacheServiceDel = require('../services/cacheService');
        const todayISTDel = getTodayISTKey();
        cacheServiceDel.invalidatePendingLeaves(todayISTDel);
        cacheServiceDel.invalidateDashboard(todayISTDel);
        cacheServiceDel.invalidateLeaveAnalytics();

        // Emit Socket.IO event so admin attendance summary (and other clients) refetch and stop showing deleted leave
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: deletedRequest._id,
                    employeeId: deletedRequest.employee,
                    leaveDates: deletedRequest.leaveDates,
                    status: 'Deleted',
                    requestType: deletedRequest.requestType,
                    deleted: true,
                    timestamp: new Date().toISOString(),
                    message: 'Leave request deleted by Admin.'
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted leave_request_updated (deleted) for leave ${deletedRequest._id}, employee ${deletedRequest.employee}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event on leave delete:', socketError);
        }

        if (deletedRequest.status === 'Approved') {
            const employee = await User.findById(deletedRequest.employee);
            if (employee) {
                NewNotificationService.notifyLeaveReverted(
                    deletedRequest.employee,
                    employee.fullName,
                    deletedRequest.requestType,
                    'deleted',
                    'Your leave has been removed from the system.',
                    deletedRequest._id.toString()
                ).catch((err) => console.error('Error sending leave deletion notification:', err));
            }
        }
        
        res.status(204).send();
    } catch (error) {
        await session.abortTransaction();
        console.error('Error deleting leave request by admin:', error);
        res.status(500).json({ error: error.message || 'Failed to delete request.' });
    } finally {
        session.endSession();
    }
});

// GET /leaves/pending
router.get('/leaves/pending', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        // Exclude YEAR_END requests from normal pending requests
        const pendingRequests = await LeaveRequest.find({
            status: 'Pending',
            requestType: { $ne: 'YEAR_END' }
        })
            .populate('employee', 'fullName employeeCode')
            .sort({ createdAt: 1 })
            .lean();
        res.json(pendingRequests);
    } catch (error) {
        console.error('Error fetching pending leave requests:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests.' });
    }
});


// GET /leaves/employee/:id - Get leave requests for specific employee
router.get('/leaves/employee/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { id } = req.params;
        const { year } = req.query;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid employee ID.' });
        }

        // Build query
        const query = { employee: id };

        // Add year filter if provided
        if (year) {
            const startDate = new Date(year, 0, 1); // January 1st
            const endDate = new Date(year, 11, 31); // December 31st
            query.createdAt = { $gte: startDate, $lte: endDate };
        }

        const leaveRequests = await LeaveRequest.find(query)
            .populate('employee', 'fullName employeeCode')
            .sort({ createdAt: -1 })
            .lean();

        res.json(leaveRequests);
    } catch (error) {
        console.error('Error fetching employee leave requests:', error);
        res.status(500).json({ error: 'Failed to fetch employee leave requests.' });
    }
});

// PATCH /leaves/:id/status
router.patch('/leaves/:id/status', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { status: newStatus, rejectionNotes, overrideReason } = req.body;

    if (!['Approved', 'Rejected'].includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status provided.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const request = await LeaveRequest.findById(id).session(session);
        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Request not found.' });
        }

        // Block YEAR_END requests from being processed through normal leave status endpoint
        if (request.requestType === 'YEAR_END') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Year-End requests must be processed through the Year-End specific endpoint.' });
        }

        const oldStatus = request.status;
        const employee = await User.findById(request.employee).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const newStatus = req.body.status;

        // CRITICAL: Validate Comp-Off attendance for past worked dates during approval
        if (newStatus === 'Approved' && request.requestType === 'Compensatory' && request.alternateDate) {
            const { startOfISTDay } = require('../utils/istTime');
            const AttendanceLog = require('../models/AttendanceLog');
            
            const workedDate = new Date(request.alternateDate);
            const today = startOfISTDay();
            
            // Only validate attendance if the worked date has passed
            if (workedDate <= today) {
                const year = workedDate.getFullYear();
                const month = String(workedDate.getMonth() + 1).padStart(2, '0');
                const day = String(workedDate.getDate()).padStart(2, '0');
                const workedDateString = `${year}-${month}-${day}`;
                
                const attendanceRecord = await AttendanceLog.findOne({
                    user: request.employee,
                    attendanceDate: workedDateString
                }).session(session);
                
                if (!attendanceRecord) {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: 'Cannot approve Comp-Off: No attendance record found for the worked date. Employee must have clocked in on that day.',
                        rule: 'COMPOFF_NO_ATTENDANCE_RECORD'
                    });
                }
                
                if (!attendanceRecord.clockInTime) {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: 'Cannot approve Comp-Off: No clock-in time found for the worked date. Employee must have actually worked on that day.',
                        rule: 'COMPOFF_NO_CLOCK_IN'
                    });
                }
                
                if (attendanceRecord.attendanceStatus === 'Absent') {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: 'Cannot approve Comp-Off: Employee was marked absent on the worked date. Employee must have been present to claim Comp-Off.',
                        rule: 'COMPOFF_MARKED_ABSENT'
                    });
                }
                
                if (process.env.NODE_ENV !== 'production') console.log(`[Comp-Off Approval] Attendance validated for worked date ${workedDateString}`);
            } else {
                if (process.env.NODE_ENV !== 'production') console.log(`[Comp-Off Approval] Worked date ${workedDate.toISOString()} is in the future, skipping attendance validation`);
            }
        }

        // Idempotent: already approved — do not double-approve or deduct balance again
        if (newStatus === 'Approved' && oldStatus === 'Approved') {
            await session.abortTransaction();
            return res.json({ message: 'Request already approved.', request });
        }

        // Use working-day count only (exclude any auto-clubbed Saturdays/Sundays)
        const workingDayCount = countWorkingDaysInLeaveDates(request.leaveDates);
        const leaveDuration = workingDayCount * (request.leaveType === 'Full Day' ? 1 : 0.5);
        const requestTypeNormalized = LeavePolicyService.normalizeRequestType(request.requestType);
        const leaveField = LeavePolicyService.getBalanceField(requestTypeNormalized);

        if (oldStatus === 'Returned') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'This request was returned to the employee for correction. Approve after they resubmit.' });
        }

        if (newStatus === 'Approved') {
            // ── Allocation gate ─────────────────────────────────────────────────────
            // If the TimeOffType for this request requires an Allocation
            // (requiresAllocation === true), a Confirmed Allocation record covering
            // the leave date must exist before we allow the approval to proceed.
            //
            // This check is skipped when:
            //   a) overrideReason is provided (admin explicitly overrides)
            //   b) No matching active TimeOffType is found (legacy types without a
            //      TimeOffType record fall back to the existing leaveBalances flow)
            //   c) The TimeOffType has requiresAllocation === false (e.g. LOP, Comp-Off)
            //
            // The check runs OUTSIDE the existing balance-validation path so it can
            // return a distinct, user-friendly error message.
            if (!overrideReason) {
                try {
                    const TimeOffType = require('../models/TimeOffType');
                    const Allocation  = require('../models/Allocation');

                    const timeOffType = await TimeOffType.findOne({
                        legacyRequestTypeMapping: request.requestType,
                        isActive: true,
                    }).lean();

                    if (timeOffType && timeOffType.requiresAllocation) {
                        // Use the first leave date as the coverage anchor point
                        const leaveDate = request.leaveDates?.[0] || new Date();

                        const confirmedAllocation = await Allocation.findOne({
                            employee:    request.employee,
                            timeOffType: timeOffType._id,
                            status:      'Confirmed',
                            $or: [
                                { validFrom: null,                  validTo: null },
                                { validFrom: { $lte: leaveDate },   validTo: null },
                                { validFrom: null,                  validTo: { $gte: leaveDate } },
                                { validFrom: { $lte: leaveDate },   validTo: { $gte: leaveDate } },
                            ],
                        }).lean();

                        if (!confirmedAllocation) {
                            await session.abortTransaction();
                            return res.status(400).json({
                                error: `Cannot approve: no confirmed "${timeOffType.name}" allocation found for this employee. ` +
                                       `Create and confirm an Allocation record first, or provide an override reason to bypass.`,
                                code:  'NO_CONFIRMED_ALLOCATION',
                            });
                        }

                        // Also check that the allocation has sufficient remaining balance
                        const workingDayCount = countWorkingDaysInLeaveDates(request.leaveDates);
                        const consumed = workingDayCount * (request.leaveType === 'Full Day' ? 1 : 0.5);
                        const remaining = Math.max(0, confirmedAllocation.allocatedAmount - (confirmedAllocation.takenAmount || 0));

                        if (remaining < consumed) {
                            await session.abortTransaction();
                            return res.status(400).json({
                                error: `Cannot approve: the confirmed "${timeOffType.name}" allocation only has ` +
                                       `${remaining} day(s) remaining but this request requires ${consumed} day(s). ` +
                                       `Increase the allocation or provide an override reason to bypass.`,
                                code:  'ALLOCATION_INSUFFICIENT',
                            });
                        }
                    }
                    // If timeOffType not found or requiresAllocation === false: fall through
                    // to the existing leaveBalances enforcement below (no change to current behaviour).
                } catch (allocationCheckErr) {
                    // Non-fatal check failure: log a warning and continue with the existing flow.
                    // This prevents a DB error in the allocation lookup from blocking a legitimate
                    // approval.  The admin is notified via the log; the bridge hook below will
                    // also emit a warning if takenAmount cannot be updated.
                    console.error(
                        '[Allocation Gate] Error during pre-approval allocation check for request',
                        id, ':', allocationCheckErr.message
                    );
                }
            }
            // ── End allocation gate ─────────────────────────────────────────────────

            // CRITICAL FIX: If admin provides overrideReason, skip policy validations
            // Admin can approve at any time regardless of advance notice, weekday restrictions, etc.
            if (overrideReason) {
                // Only check balance sufficiency (cannot override insufficient balance without explicit handling)
                const approvalCheck = validateApprovalBalances(request, employee);
                if (!approvalCheck.allowed) {
                    // Allow admin to override balance check as well with explicit override
                    console.warn(`[Admin Override] Balance check failed but overridden: ${approvalCheck.reason}`);
                }
                
                // Set admin override flags
                request.adminOverride = true;
                request.overrideReason = overrideReason;
                request.overriddenBy = req.user.userId;
                request.overriddenAt = new Date();
            } else {
                // No override - run full validation
                // Re-validate approval: balance must be sufficient at approval time
                const approvalCheck = validateApprovalBalances(request, employee);
                if (!approvalCheck.allowed) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: approvalCheck.reason });
                }
                const adminOverrideReason = `Admin approval by user ID: ${req.user.userId}`;
                const policyCheck = await LeavePolicyService.validateRequest(
                    request.employee,
                    request.leaveDates,
                    requestTypeNormalized,
                    request.leaveType,
                    adminOverrideReason,
                    request.alternateDate,
                    { excludeRequestId: request._id }
                );
                if (!policyCheck.allowed) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: policyCheck.reason });
                }
                request.adminOverride = true;
                request.overrideReason = adminOverrideReason;
                request.overriddenBy = req.user.userId;
                request.overriddenAt = new Date();
            }
        }

        request.status = newStatus;
        request.approvedBy = req.user.userId;
        request.approvedAt = new Date();
        if (newStatus === 'Rejected' && rejectionNotes) {
            request.rejectionNotes = rejectionNotes;
        } else if (newStatus === 'Approved') {
            request.rejectionNotes = undefined;
            if (request.validationBlocked && overrideReason) {
                const { logAction } = require('../services/auditLogger');
                await logAction({
                    action: 'LEAVE_OVERRIDE_ANTI_EXPLOITATION',
                    userId: req.user.userId.toString(),
                    details: {
                        leaveRequestId: id,
                        employeeId: request.employee.toString(),
                        blockedRules: request.blockedRules || [],
                        overrideReason: overrideReason,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }

        if (newStatus !== oldStatus) {
            const balanceResult = await applyBalanceOnStatusChange(request, employee, oldStatus, newStatus, session);
            if (!balanceResult.ok) {
                await session.abortTransaction();
                return res.status(400).json({ error: balanceResult.error });
            }
        }

        await request.save({ session });

        // PHASE 2: Sync attendance records with leave status change
        // This ensures Attendance is the single source of truth
        try {
            if (newStatus === 'Approved' && oldStatus !== 'Approved') {
                // Leave approved - create/update attendance records
                await syncAttendanceOnLeaveApproval(request, session);
            } else if (newStatus !== 'Approved' && oldStatus === 'Approved') {
                // Leave rejected/cancelled after approval - revert attendance records
                await syncAttendanceOnLeaveRejection(request, session);
            }
        } catch (syncError) {
            // If attendance sync fails, rollback entire transaction
            await session.abortTransaction();
            console.error('Error syncing attendance with leave status:', syncError);
            throw new Error(`Failed to sync attendance records: ${syncError.message}`);
        }

        await session.commitTransaction();

        // ── Allocation bridge (now enforcing, not just advisory) ──────────────
        // After a successful approval, increment takenAmount on the matching
        // Confirmed Allocation to keep it in sync with the approval.
        // The allocation gate above (pre-transaction) already confirmed a Confirmed
        // Allocation exists (when requiresAllocation === true and no overrideReason).
        // This bridge persists the consumption against that record.
        // Runs OUTSIDE the transaction: a failure here must never roll back an
        // already-committed approval — we log a warning instead.
        if (newStatus === 'Approved' && oldStatus !== 'Approved') {
            try {
                const TimeOffType = require('../models/TimeOffType');
                const Allocation = require('../models/Allocation');

                // 1. Resolve which TimeOffType maps to this requestType
                const timeOffType = await TimeOffType.findOne({
                    legacyRequestTypeMapping: request.requestType,
                    isActive: true,
                }).lean();

                if (!timeOffType) {
                    console.warn(
                        `[Allocation Bridge] No active TimeOffType found for requestType="${request.requestType}" ` +
                        `(leaveRequest ${request._id}). Skipping takenAmount update.`
                    );
                } else if (timeOffType.requiresAllocation) {
                    // 2. Find the best Confirmed Allocation covering the leave dates
                    const leaveDate = request.leaveDates?.[0] || new Date();
                    const allocationQuery = {
                        employee: request.employee,
                        timeOffType: timeOffType._id,
                        status: 'Confirmed',
                        $or: [
                            { validFrom: null, validTo: null },
                            { validFrom: { $lte: leaveDate }, validTo: null },
                            { validFrom: null, validTo: { $gte: leaveDate } },
                            { validFrom: { $lte: leaveDate }, validTo: { $gte: leaveDate } },
                        ],
                    };

                    const allocation = await Allocation.findOne(allocationQuery).sort({ validFrom: -1 });

                    const workingDayCount = countWorkingDaysInLeaveDates(request.leaveDates);
                    const consumed = workingDayCount * (request.leaveType === 'Full Day' ? 1 : 0.5);

                    if (!allocation) {
                        console.warn(
                            `[Allocation Bridge] No Confirmed Allocation found for employee=${request.employee}, ` +
                            `timeOffType="${timeOffType.name}", leaveRequest=${request._id}. ` +
                            `Leave approved via leaveBalances (existing flow). ` +
                            `Create an Allocation record in the Allocations UI to track this employee's entitlement.`
                        );
                        // _allocationNote is picked up below when response is built
                        request._allocationNote =
                            'No matching Allocation found for this Time Off Type. ' +
                            'Leave was approved via the legacy balance system. ' +
                            'Consider creating an Allocation record for this employee.';
                    } else if (allocation.remainingAmount !== undefined && allocation.remainingAmount < consumed) {
                        console.warn(
                            `[Allocation Bridge] Allocation ${allocation._id} has insufficient remainingAmount ` +
                            `(${allocation.remainingAmount}) for consumed=${consumed}. ` +
                            `Incrementing takenAmount anyway (legacy balance already deducted). ` +
                            `Allocation may show a negative remaining — reconcile manually.`
                        );
                        allocation.takenAmount = (allocation.takenAmount || 0) + consumed;
                        await allocation.save();
                    } else {
                        allocation.takenAmount = (allocation.takenAmount || 0) + consumed;
                        await allocation.save();
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(
                                `[Allocation Bridge] Updated Allocation ${allocation._id}: ` +
                                `takenAmount += ${consumed} → ${allocation.takenAmount}`
                            );
                        }
                    }
                }
                // requiresAllocation === false (e.g. LOP, Compensatory): nothing to track
            } catch (bridgeErr) {
                // Non-fatal: approval is already committed. Log and continue.
                console.error(
                    `[Allocation Bridge] Error updating Allocation for leaveRequest ${request._id}:`,
                    bridgeErr
                );
            }
        }
        // ── End allocation bridge ───────────────────────────────────────────────

        if (oldStatus === 'Approved' && newStatus !== 'Approved') {
            NewNotificationService.notifyLeaveReverted(
                request.employee,
                employee.fullName,
                request.requestType,
                newStatus === 'Rejected' ? 'rejected' : 'revoked',
                request.rejectionNotes || null,
                request._id.toString()
            ).catch((err) => console.error('Error sending leave revert notification:', err));
        } else {
            NewNotificationService.notifyLeaveResponse(request.employee, employee.fullName, newStatus, request.requestType, request.rejectionNotes)
                .catch((err) => console.error('Error sending leave response notification:', err));
        }

        // Emit Socket.IO event to notify all clients about the leave status change
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: request._id,
                    employeeId: request.employee,
                    leaveDates: request.leaveDates,
                    status: request.status,
                    requestType: request.requestType,
                    statusChanged: true,
                    oldStatus: oldStatus,
                    newStatus: newStatus,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Leave request ${newStatus.toLowerCase()}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted leave_request_updated event for leave ${request._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // Invalidate dashboard and pending-leaves cache so dashboard returns fresh data
        const cacheService = require('../services/cacheService');
        const todayStr = getTodayISTKey();
        cacheService.invalidatePendingLeaves(todayStr);
        cacheService.invalidateDashboard(todayStr);
        cacheService.invalidateLeaveAnalytics();

        // Response (clockInConflicts not tracked by sync service; avoid undefined reference)
        const clockInConflicts = [];
        const response = {
            message: `Request has been ${newStatus.toLowerCase()}.`,
            request
        };
        if (clockInConflicts.length > 0) {
            response.warning = `Leave approved, but employee already clocked in on ${clockInConflicts.length} day(s): ${clockInConflicts.join(', ')}. Attendance records updated to Leave status.`;
        }
        // Surface any allocation note set by the bridge hook above
        if (request._allocationNote) {
            response.allocationNote = request._allocationNote;
        }

        res.json(response);
    } catch (error) {
        await session.abortTransaction();
        console.error(`Error updating request status for ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to update request status.' });
    } finally {
        session.endSession();
    }
});

// PATCH /leaves/:id/return-for-correction — send back to employee with HR note (editable resubmit)
router.patch('/leaves/:id/return-for-correction', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';

    if (!trimmedNotes) {
        return res.status(400).json({ error: 'A correction note for the employee is required.' });
    }

    try {
        const request = await LeaveRequest.findById(id);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        if (request.requestType === 'YEAR_END') {
            return res.status(400).json({ error: 'Year-End requests cannot be returned through this action.' });
        }
        if (request.status !== 'Pending') {
            return res.status(400).json({ error: 'Only pending requests can be returned for correction.' });
        }

        const employee = await User.findById(request.employee);
        if (!employee) return res.status(404).json({ error: 'Employee not found.' });

        request.status = 'Returned';
        request.hrCorrectionNotes = trimmedNotes;
        request.returnedBy = req.user.userId;
        request.returnedAt = new Date();
        request.rejectionNotes = undefined;
        await request.save();

        NewNotificationService.notifyLeaveReturnedForCorrection(
            request.employee,
            employee.fullName,
            request.requestType,
            trimmedNotes,
            request._id.toString()
        ).catch((err) => console.error('Error sending return-for-correction notification:', err));

        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: request._id,
                    employeeId: request.employee,
                    status: request.status,
                    requestType: request.requestType,
                    hrCorrectionNotes: trimmedNotes,
                    timestamp: new Date().toISOString(),
                    message: 'Leave returned for correction',
                });
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
        }

        const cacheService = require('../services/cacheService');
        const todayStr = getTodayISTKey();
        cacheService.invalidatePendingLeaves(todayStr);
        cacheService.invalidateDashboard(todayStr);
        cacheService.invalidateLeaveAnalytics();

        res.json({ message: 'Leave request returned to employee for correction.', request });
    } catch (error) {
        console.error(`Error returning leave ${id} for correction:`, error);
        res.status(500).json({ error: 'Failed to return leave for correction.' });
    }
});

// PATCH /leaves/:id/day-allocations — split LOP days into Planned / Casual / LOP
router.patch('/leaves/:id/day-allocations', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { allocations } = req.body;

    try {
        const request = await LeaveRequest.findById(id);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        if (request.requestType !== 'Loss of Pay') {
            return res.status(400).json({ error: 'Day allocations apply only to Loss of Pay requests.' });
        }
        if (!['Pending', 'Approved'].includes(request.status)) {
            return res.status(400).json({ error: 'Allocations can only be set on pending or approved requests.' });
        }
        const validation = validateDayAllocations(request, allocations);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const employee = await User.findById(request.employee).session(session);
            if (!employee) {
                await session.abortTransaction();
                return res.status(404).json({ error: 'Employee not found.' });
            }

            if (request.status === 'Approved') {
                const balanceResult = await reconcileApprovedDayAllocations(
                    employee._id,
                    request,
                    request.dayTypeAllocations,
                    validation.allocations,
                    session
                );
                if (!balanceResult.ok) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: balanceResult.error });
                }
            }

            request.dayTypeAllocations = validation.allocations;
            request.dayAllocationsUpdatedBy = req.user.userId;
            request.dayAllocationsUpdatedAt = new Date();
            await request.save({ session });
            await session.commitTransaction();
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }

        const cacheService = require('../services/cacheService');
        cacheService.invalidateLeaveAnalytics();

        const { breakdown } = computeEffectiveDeductions(request);
        if (request.status === 'Approved') {
            const employee = await User.findById(request.employee);
            if (employee) {
                NewNotificationService.notifyLeaveReverted(
                    request.employee,
                    employee.fullName,
                    request.requestType,
                    'updated',
                    'HR adjusted how your LOP days apply to Planned/Casual balance.',
                    request._id.toString()
                ).catch((err) => console.error('Error sending allocation update notification:', err));
            }
        }
        res.json({
            message: 'Day allocations saved.',
            request,
            effectiveBreakdown: breakdown,
        });
    } catch (error) {
        console.error(`Error saving day allocations for leave ${id}:`, error);
        res.status(500).json({ error: 'Failed to save day allocations.' });
    }
});

// @route   POST /api/admin/leaves/allocate
// @desc    Allocate leave balances to an employee for a year
// @access  Private (Admin/HR)
router.post('/leaves/allocate', [authenticateToken, isAdminOrHr], async (req, res) => {
    const {
        employeeId,
        year,
        sickLeaveEntitlement,
        casualLeaveEntitlement,
        paidLeaveEntitlement,
    } = req.body;

    if (!employeeId) {
        return res.status(400).json({ error: 'Employee ID is required.' });
    }

    try {
        const user = await User.findById(employeeId);
        if (!user) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // --- START OF FIX: Set balances and entitlements separately and correctly ---
        const sick = sickLeaveEntitlement || 0;
        const casual = casualLeaveEntitlement || 0;
        const paid = paidLeaveEntitlement || 0;

        // Entitlements represent the total for the year
        user.leaveEntitlements = {
            sick: sick,
            casual: casual,
            paid: paid,
        };

        // Balances represent the currently available leaves
        user.leaveBalances = {
            sick: sick,
            casual: casual,
            paid: paid,
        };
        // --- END OF FIX ---

        await user.save();

        res.status(200).json({
            message: 'Leave balances and entitlements allocated successfully.',
            user: {
                _id: user._id,
                fullName: user.fullName,
                leaveBalances: user.leaveBalances,
                leaveEntitlements: user.leaveEntitlements,
            }
        });
    } catch (error) {
        console.error('Error allocating leaves:', error);
        res.status(500).json({ error: 'Failed to allocate leaves.' });
    }
});

// @route   POST /api/admin/leaves/bulk-allocate
// @desc    Bulk allocate leave balances to multiple employees for a year
// @access  Private (Admin/HR)
router.post('/leaves/bulk-allocate', [authenticateToken, isAdminOrHr], async (req, res) => {
    const {
        employeeIds,
        year,
        sickLeaveEntitlement,
        casualLeaveEntitlement,
        paidLeaveEntitlement,
    } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({ error: 'Employee IDs array is required and must not be empty.' });
    }

    const results = {
        successful: [],
        failed: []
    };

    try {
        const sick = sickLeaveEntitlement || 0;
        const casual = casualLeaveEntitlement || 0;
        const paid = paidLeaveEntitlement || 0;

        // PERFORMANCE FIX: Replaced N+1 loop (findById + save per employee) with a single
        // bulkWrite. For 50 employees this reduces ~100 DB round-trips to 2 (find + bulkWrite).
        const validIds = employeeIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        const invalidIds = employeeIds.filter(id => !mongoose.Types.ObjectId.isValid(id));

        // Track invalid IDs as failed
        invalidIds.forEach(id => {
            results.failed.push({ employeeId: id, error: 'Invalid employee ID format.' });
        });

        if (validIds.length > 0) {
            // Fetch all users in one query to verify they exist
            const users = await User.find({ _id: { $in: validIds } }).select('_id fullName employeeCode').lean();
            const foundIds = new Set(users.map(u => u._id.toString()));

            // Track users not found
            validIds.forEach(id => {
                if (!foundIds.has(id.toString())) {
                    results.failed.push({ employeeId: id, error: 'Employee not found.' });
                }
            });

            // Build bulkWrite operations for found users
            const bulkOps = users.map(u => ({
                updateOne: {
                    filter: { _id: u._id },
                    update: {
                        $set: {
                            leaveEntitlements: { sick, casual, paid },
                            leaveBalances: { sick, casual, paid }
                        }
                    }
                }
            }));

            if (bulkOps.length > 0) {
                await User.bulkWrite(bulkOps, { ordered: false });
                users.forEach(u => {
                    results.successful.push({
                        employeeId: u._id,
                        fullName: u.fullName,
                        employeeCode: u.employeeCode
                    });
                });
            }
        }

        res.status(200).json({
            message: `Bulk allocation completed: ${results.successful.length} successful, ${results.failed.length} failed.`,
            results
        });
    } catch (error) {
        console.error('Error in bulk allocating leaves:', error);
        res.status(500).json({ error: 'Failed to bulk allocate leaves.' });
    }
});


// --- EXTRA BREAK & HOLIDAY ROUTES ---

router.patch('/breaks/extra/:requestId/status', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { requestId } = req.params;
    const { status } = req.body;
    const adminUserId = req.user.userId;

    if (!['Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status provided.' });
    }
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }

    try {
        const request = await ExtraBreakRequest.findById(requestId);
        if (!request) return res.status(404).json({ error: 'Extra break request not found.' });
        if (request.status !== 'Pending') return res.status(400).json({ error: 'This request has already been actioned.' });

        request.status = status;
        request.reviewedBy = adminUserId;
        request.reviewedAt = new Date();
        await request.save();

        // Invalidate dashboard cache to update recent activity
        const cacheService = require('../services/cacheService');
        const today = getTodayISTKey();
        cacheService.invalidateDashboard(today);

        const user = await User.findById(request.user);
        if (user) {
            const message = status === 'Approved'
                ? 'Your request for an extra break has been approved. You can now start it from the break menu.'
                : `Your request for an extra break for reason "${request.reason}" has been rejected.`;

            const actionData = status === 'Approved' ? {
                actionType: 'start_break',
                requiresAction: true,
                actionParams: { breakType: 'extra', reason: request.reason }
            } : {
                actionType: 'none',
                requiresAction: false
            };

            NewNotificationService.createAndEmitNotification({
                message: message,
                type: status === 'Approved' ? 'extra_break_approval' : 'extra_break_rejection',
                userId: request.user,
                userName: user.fullName,
                recipientType: 'user',
                category: 'break',
                priority: 'high',
                actionData,
                navigationData: { page: 'attendance' }
            }).catch(err => console.error('Error sending extra break response notification:', err));
        }

        res.json({ message: `Break request has been ${status.toLowerCase()}.` });

    } catch (error) {
        console.error('Error actioning extra break request:', error);
        res.status(500).json({ error: 'Failed to update request.' });
    }
});

// --- EARLY CHECKOUT REQUESTS (Admin approval workflow) ---

// GET /api/admin/early-checkout-requests/:id - Lightweight ECR details only (for approval modal; no full attendance/employee)
router.get('/early-checkout-requests/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }
    try {
        const doc = await EarlyCheckoutRequest.findById(id)
            .populate('employee', 'fullName _id')
            .populate('attendanceLog', 'attendanceDate clockInTime')
            .lean();
        if (!doc) return res.status(404).json({ error: 'Request not found.' });
        const employee = doc.employee;
        const log = doc.attendanceLog;
        
        // Calculate completed time: time worked from clock-in to request time (in seconds for precision)
        let completedTimeSeconds = null;
        if (log?.clockInTime && doc.requestedAt) {
            const clockInTime = new Date(log.clockInTime);
            const requestTime = new Date(doc.requestedAt);
            const elapsedMs = requestTime - clockInTime;
            completedTimeSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
        }
        
        res.json({
            reference_id: doc._id.toString(),
            employee_id: employee?._id?.toString(),
            employee_name: employee?.fullName ?? '—',
            date: log?.attendanceDate ?? null,
            request_time: doc.requestedAt,
            required_logout_time: doc.requiredLogoutTime,
            remaining_time: doc.remainingTimeMinutes,
            completed_time_seconds: completedTimeSeconds,
            reason: doc.reason ?? '',
            status: doc.status,
        });
    } catch (err) {
        console.error('Error fetching ECR details:', err);
        res.status(500).json({ error: 'Failed to fetch request details.' });
    }
});

// GET /api/admin/early-checkout-requests - List pending (and optionally recent) early checkout requests
router.get('/early-checkout-requests', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const status = req.query.status || 'Pending';
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const query = status === 'all' ? {} : { status };
        const requests = await EarlyCheckoutRequest.find(query)
            .populate('employee', 'fullName employeeCode email')
            .populate('attendanceLog', 'attendanceDate clockInTime')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        res.json({ requests });
    } catch (err) {
        console.error('Error fetching early checkout requests:', err);
        res.status(500).json({ error: 'Failed to fetch early checkout requests.' });
    }
});

// POST /api/admin/early-checkout-requests/:id/approve - Approve and perform checkout
router.post('/early-checkout-requests/:id/approve', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const adminUserId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }
    try {
        const result = await earlyCheckoutService.performApprovedClockOut(id, adminUserId);
        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Approval failed.' });
        }
        const cacheService = require('../services/cacheService');
        cacheService.invalidateDashboard(getTodayISTKey());
        res.json({ message: result.message || 'Early checkout approved. Checkout has been recorded.' });
    } catch (err) {
        console.error('Error approving early checkout:', err);
        res.status(500).json({ error: err.message || 'Failed to approve request.' });
    }
});

// POST /api/admin/early-checkout-requests/:id/reject - Reject request (employee stays clocked in)
router.post('/early-checkout-requests/:id/reject', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { rejectionNote } = req.body || {};
    const adminUserId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }
    try {
        const request = await EarlyCheckoutRequest.findById(id);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        if (request.status !== 'Pending') return res.status(400).json({ error: 'Request is no longer pending.' });
        request.status = 'Rejected';
        request.reviewedBy = adminUserId;
        request.reviewedAt = new Date();
        await request.save();
        const user = await User.findById(request.employee).select('fullName').lean();
        NewNotificationService.notifyEarlyCheckoutRejected(
            request.employee,
            user?.fullName || 'Employee',
            typeof rejectionNote === 'string' ? rejectionNote.trim() : null
        ).catch(() => {});
        const cacheService = require('../services/cacheService');
        cacheService.invalidateDashboard(getTodayISTKey());
        const cache = require('../utils/cache');
        const log = await AttendanceLog.findById(request.attendanceLog).select('attendanceDate').lean();
        if (log) cache.delete(`employee_dashboard:${request.employee}:${log.attendanceDate}`);
        res.json({ message: 'Early checkout request rejected.' });
    } catch (err) {
        console.error('Error rejecting early checkout:', err);
        res.status(500).json({ error: 'Failed to reject request.' });
    }
});

router.get('/holidays', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const holidays = await Holiday.find().lean();
        // Sort: valid dates first (ASC), then tentative holidays at bottom (alphabetically)
        const sortedHolidays = holidays.sort((a, b) => {
            const aIsTentative = !a.date || a.isTentative;
            const bIsTentative = !b.date || b.isTentative;

            if (aIsTentative && bIsTentative) {
                return a.name.localeCompare(b.name);
            }
            if (aIsTentative) return 1;
            if (bIsTentative) return -1;
            return new Date(a.date) - new Date(b.date);
        });
        res.json(sortedHolidays);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch holidays.' });
    }
});
router.post('/holidays', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { name, date } = req.body;
    if (!name || !date) {
        return res.status(400).json({ error: 'Holiday name and date are required.' });
    }
    try {
        const newHoliday = new Holiday({ name, date });
        await newHoliday.save();
        res.status(201).json(newHoliday);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'A holiday on this date already exists.' });
        }
        res.status(500).json({ error: 'Failed to add holiday.' });
    }
});
router.delete('/holidays/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const holiday = await Holiday.findByIdAndDelete(req.params.id);
        if (!holiday) {
            return res.status(404).json({ error: 'Holiday not found.' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete holiday.' });
    }
});

// POST /api/admin/holidays/bulk-upload
// Bulk upload holidays from Excel file
router.post('/holidays/bulk-upload', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { holidays } = req.body;

    if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
        return res.status(400).json({ error: 'Holidays array is required and must not be empty.' });
    }

    const session = await require('mongoose').startSession();
    session.startTransaction();

    try {
        const results = {
            successCount: 0,
            failureCount: 0,
            errors: []
        };

        // Helper function to parse flexible date (same logic as frontend)
        const parseFlexibleDate = (dateStr, currentYear = new Date().getFullYear()) => {
            if (!dateStr) return null;

            const normalized = String(dateStr).trim();

            // Check for "Not Yet decided" (case-insensitive)
            if (/not\s+yet\s+decided/i.test(normalized)) {
                return { date: null, isTentative: true };
            }

            // Try Excel serial date first
            if (!isNaN(normalized) && parseFloat(normalized) > 25569) {
                const excelEpoch = new Date(1900, 0, 1);
                const days = parseFloat(normalized) - 2;
                const parsedDate = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
                if (!isNaN(parsedDate.getTime())) {
                    return { date: parsedDate, isTentative: false };
                }
            }

            // Try parsing as full date
            let parsedDate = new Date(normalized);
            if (!isNaN(parsedDate.getTime())) {
                return { date: parsedDate, isTentative: false };
            }

            // Try parsing as "DD-MMM" format (e.g., "26-Jan", "3-Mar")
            const dayMonthMatch = normalized.match(/^(\d{1,2})[-/](\w{3,})$/i);
            if (dayMonthMatch) {
                const day = parseInt(dayMonthMatch[1]);
                const monthStr = dayMonthMatch[2].toLowerCase();
                const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                const monthIndex = monthNames.findIndex(m => monthStr.startsWith(m));

                if (monthIndex !== -1 && day >= 1 && day <= 31) {
                    const date = new Date(currentYear, monthIndex, day);
                    if (date.getDate() === day && date.getMonth() === monthIndex) {
                        return { date: date, isTentative: false };
                    }
                }
            }

            return null; // Invalid format
        };

        // Get existing holidays to check for duplicates
        const existingHolidays = await Holiday.find({}, 'date name isTentative').session(session);
        const existingDates = new Set(
            existingHolidays
                .filter(h => h.date && !h.isTentative)
                .map(h => {
                    const d = new Date(h.date);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                })
        );
        const existingTentativeHolidays = new Set(
            existingHolidays
                .filter(h => h.isTentative)
                .map(h => h.name.toLowerCase().trim())
        );

        // Validate and process each holiday
        const holidaysToInsert = [];
        const seenDatesInBatch = new Set();
        const seenTentativeInBatch = new Set();
        const currentYear = new Date().getFullYear();

        for (let i = 0; i < holidays.length; i++) {
            const holiday = holidays[i];
            const rowNum = i + 1;
            const errors = [];

            // Validate holiday name
            const holidayName = String(holiday.name || '').trim();
            if (holidayName.length === 0) {
                errors.push('Holiday name is required');
            } else if (holidayName.length > 100) {
                errors.push('Holiday name exceeds 100 characters');
            }

            // Parse date (can be null for tentative)
            const isTentative = holiday.isTentative || false;
            let dateResult = null;
            let formattedDate = null;
            let parsedDate = null;

            if (holiday.date) {
                dateResult = parseFlexibleDate(holiday.date, currentYear);
                if (!dateResult) {
                    errors.push('Invalid date format');
                } else if (dateResult.isTentative) {
                    // "Not Yet decided" - date is null
                    formattedDate = null;
                    parsedDate = null;
                } else {
                    parsedDate = dateResult.date;
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    formattedDate = `${year}-${month}-${day}`;
                }
            } else if (!isTentative) {
                errors.push('Date is required for non-tentative holidays');
            }

            if (errors.length > 0) {
                results.failureCount++;
                results.errors.push({
                    row: rowNum,
                    errors: errors
                });
                continue;
            }

            // Handle tentative holidays
            if (isTentative || !formattedDate) {
                const nameKey = holidayName.toLowerCase();

                // Check for duplicate tentative in batch
                if (seenTentativeInBatch.has(nameKey)) {
                    results.failureCount++;
                    results.errors.push({
                        row: rowNum,
                        errors: [`Duplicate tentative holiday in upload: ${holidayName}`]
                    });
                    continue;
                }

                // Check for duplicate tentative in database
                if (existingTentativeHolidays.has(nameKey)) {
                    results.failureCount++;
                    results.errors.push({
                        row: rowNum,
                        errors: [`Tentative holiday already exists: ${holidayName}`]
                    });
                    continue;
                }

                seenTentativeInBatch.add(nameKey);
                holidaysToInsert.push({
                    name: holidayName,
                    date: null,
                    isTentative: true,
                    day: holiday.day ? String(holiday.day).trim() : null
                });
                continue;
            }

            // Handle regular holidays with dates
            // Check for duplicates in batch
            if (seenDatesInBatch.has(formattedDate)) {
                results.failureCount++;
                results.errors.push({
                    row: rowNum,
                    errors: [`Duplicate date in upload: ${formattedDate}`]
                });
                continue;
            }

            // Check for duplicates in database
            if (existingDates.has(formattedDate)) {
                results.failureCount++;
                results.errors.push({
                    row: rowNum,
                    errors: [`Holiday already exists for date: ${formattedDate}`]
                });
                continue;
            }

            // Day validation (optional, allow multiple days)
            // Don't strictly validate day for flexibility

            // Add to insert batch
            seenDatesInBatch.add(formattedDate);
            holidaysToInsert.push({
                name: holidayName,
                date: parsedDate,
                isTentative: false,
                day: holiday.day ? String(holiday.day).trim() : null
            });
        }

        // If there are any errors, reject the entire batch
        if (results.errors.length > 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                error: 'Validation failed. Please fix all errors before uploading.',
                successCount: 0,
                failureCount: results.failureCount,
                errors: results.errors
            });
        }

        // Insert all holidays in a transaction
        if (holidaysToInsert.length > 0) {
            try {
                await Holiday.insertMany(holidaysToInsert, { session });
                results.successCount = holidaysToInsert.length;
            } catch (insertError) {
                // Handle unique constraint violations
                if (insertError.code === 11000) {
                    const duplicateField = Object.keys(insertError.keyPattern || {})[0];
                    throw new Error(`Duplicate holiday detected: ${duplicateField}`);
                }
                throw insertError;
            }
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: `Successfully uploaded ${results.successCount} holiday(s).`,
            successCount: results.successCount,
            failureCount: results.failureCount,
            errors: results.errors
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error('Error in bulk upload holidays:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                error: 'One or more holidays already exist in the database.',
                successCount: 0,
                failureCount: holidays.length,
                errors: []
            });
        }

        res.status(500).json({
            error: 'Failed to upload holidays.',
            successCount: 0,
            failureCount: holidays.length,
            errors: []
        });
    }
});

// --- ATTENDANCE MANAGEMENT ROUTES ---

// PATCH /api/admin/attendance/toggle-status
// Toggle attendance status (late/half-day) for an employee on a specific date
router.patch('/attendance/toggle-status', [authenticateToken, isAdminOrHr, invalidateCacheForDate], async (req, res) => {
    try {
        const { employeeId, attendanceDate, statusType, newStatus } = req.body;

        if (process.env.NODE_ENV !== 'production') console.log('Toggle attendance status request:', { employeeId, attendanceDate, statusType, newStatus });

        // Validate required fields
        if (!employeeId || !attendanceDate || !statusType || !newStatus) {
            return res.status(400).json({ error: 'Employee ID, attendance date, status type, and new status are required.' });
        }

        // Validate status type
        if (!['late', 'halfday'].includes(statusType)) {
            return res.status(400).json({ error: 'Status type must be either "late" or "halfday".' });
        }

        // Validate new status
        if (!['On-time', 'Late', 'Half-day'].includes(newStatus)) {
            return res.status(400).json({ error: 'New status must be "On-time", "Late", or "Half-day".' });
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ error: 'Invalid employee ID format.' });
        }

        // Check if employee exists
        const employee = await User.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Find or create attendance log for the date
        let attendanceLog = await AttendanceLog.findOne({
            user: employeeId,
            attendanceDate: attendanceDate
        });

        if (!attendanceLog) {
            // If no attendance log exists, create one
            const defaultClockInTime = new Date(`${attendanceDate}T09:00:00`);
            attendanceLog = new AttendanceLog({
                user: employeeId,
                attendanceDate: attendanceDate,
                clockInTime: defaultClockInTime,
                shiftDurationMinutes: 480, // Default 8 hours
                penaltyMinutes: 0,
                paidBreakMinutesTaken: 0,
                unpaidBreakMinutesTaken: 0,
                isLate: newStatus === 'Late',
                isHalfDay: newStatus === 'Half-day',
                lateMinutes: newStatus === 'Late' ? 15 : (newStatus === 'Half-day' ? 60 : 0), // Default late minutes
                lateCount: 0,
                attendanceStatus: newStatus
            });
            await attendanceLog.save();
        } else {
            // Update existing attendance log based on new status
            attendanceLog.attendanceStatus = newStatus;

            if (statusType === 'late') {
                // Toggle late status
                attendanceLog.isLate = newStatus === 'Late';
                attendanceLog.isHalfDay = false; // Remove half-day if marking as late
                attendanceLog.lateMinutes = newStatus === 'Late' ? Math.max(attendanceLog.lateMinutes || 0, 15) : 0;
            } else if (statusType === 'halfday') {
                // Toggle half-day status
                attendanceLog.isHalfDay = newStatus === 'Half-day';
                attendanceLog.isLate = false; // Remove late if marking as half-day
                attendanceLog.lateMinutes = newStatus === 'Half-day' ? Math.max(attendanceLog.lateMinutes || 0, 60) : 0;
            }

            await attendanceLog.save();
        }

        // Log the admin action
        try {
            const auditLogger = require('../services/auditLogger');
            await auditLogger.logAction({
                userId: req.user.userId,
                action: 'toggle_attendance_status',
                details: {
                    targetEmployeeId: employeeId,
                    targetEmployeeName: employee.fullName,
                    attendanceDate: attendanceDate,
                    statusType: statusType,
                    newStatus: newStatus,
                    previousStatus: attendanceLog.attendanceStatus
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
        } catch (auditError) {
            console.error('Failed to log audit action:', auditError);
            // Don't fail the request if audit logging fails
        }

        // Emit Socket.IO event to notify all clients about the attendance log update
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                // Emit to all connected clients
                io.emit('attendance_log_updated', {
                    logId: attendanceLog._id,
                    userId: attendanceLog.user,
                    attendanceDate: attendanceLog.attendanceDate,
                    attendanceStatus: attendanceLog.attendanceStatus,
                    isHalfDay: attendanceLog.isHalfDay,
                    isLate: attendanceLog.isLate,
                    lateMinutes: attendanceLog.lateMinutes,
                    clockInTime: attendanceLog.clockInTime,
                    clockOutTime: attendanceLog.clockOutTime,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Attendance status updated to "${newStatus}" for ${employee.fullName} on ${attendanceDate}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for log ${attendanceLog._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        res.json({
            message: `Attendance status updated to "${newStatus}" successfully.`,
            attendanceLog: {
                id: attendanceLog._id,
                attendanceDate: attendanceLog.attendanceDate,
                isLate: attendanceLog.isLate,
                isHalfDay: attendanceLog.isHalfDay,
                attendanceStatus: attendanceLog.attendanceStatus,
                lateMinutes: attendanceLog.lateMinutes,
                employeeName: employee.fullName
            }
        });

    } catch (error) {
        console.error('Error toggling attendance status:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            error: 'Failed to toggle attendance status.',
            details: error.message
        });
    }
});

// GET /api/admin/attendance/employee/:employeeId
// Get attendance data for a specific employee for attendance resolution
router.get('/attendance/employee/:employeeId', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { startDate, endDate } = req.query;

        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID is required.' });
        }

        // Check if employee exists
        const employee = await User.findById(employeeId).select('fullName employeeCode');
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Build query
        const query = { user: employeeId };

        if (process.env.NODE_ENV !== 'production') console.log('Querying attendance logs for employee:', employeeId);

        if (startDate && endDate) {
            query.attendanceDate = {
                $gte: startDate,
                $lte: endDate
            };
            if (process.env.NODE_ENV !== 'production') console.log('Date range filter applied:', { startDate, endDate });
        }

        if (process.env.NODE_ENV !== 'production') console.log('Final query:', query);

        // Get attendance logs with recent dates first
        const attendanceLogs = await AttendanceLog.find(query)
            .select('attendanceDate clockInTime clockOutTime isLate isHalfDay attendanceStatus lateMinutes')
            .sort({ attendanceDate: -1 })
            .limit(50) // Limit to recent 50 records for performance
            .lean();

        if (process.env.NODE_ENV !== 'production') console.log(`Found ${attendanceLogs.length} attendance logs for employee ${employeeId}`);

        const GRACE_PERIOD_MINUTES = await getGracePeriodMinutes();
        if (process.env.NODE_ENV !== 'production') console.log(`Using grace period: ${GRACE_PERIOD_MINUTES} minutes`);

        // Calculate correct status for each log based on grace period
        const logsWithCalculatedStatus = attendanceLogs.map(log => {
            const lateMinutes = log.lateMinutes || 0;
            let calculatedStatus = 'On-time';
            let calculatedIsLate = false;
            let calculatedIsHalfDay = false;

            // Check if there's a manual override (stored status differs from calculated)
            // Updated logic to account for new priority system
            const { MINIMUM_WORKING_HOURS } = require('../config/shiftPolicy');
            const hasSufficientHours = !log.totalWorkingHours || log.totalWorkingHours >= MINIMUM_WORKING_HOURS;
            const withinGracePeriod = lateMinutes <= GRACE_PERIOD_MINUTES;
            
            let expectedStatus = 'On-time';
            if (!hasSufficientHours) {
                expectedStatus = 'Half-day'; // Insufficient hours
            } else if (!withinGracePeriod) {
                expectedStatus = 'Half-day'; // Late arrival
            }
            
            const hasManualOverride = log.attendanceStatus && log.attendanceStatus !== expectedStatus;

            if (hasManualOverride) {
                // Use the manually set status
                calculatedStatus = log.attendanceStatus;
                calculatedIsLate = log.attendanceStatus === 'Late';
                calculatedIsHalfDay = log.attendanceStatus === 'Half-day';
            } else {
                // Apply new priority logic: insufficient hours takes precedence over grace period
                const { MINIMUM_WORKING_HOURS } = require('../config/shiftPolicy');
            const hasSufficientHours = !log.totalWorkingHours || log.totalWorkingHours >= MINIMUM_WORKING_HOURS;
                const withinGracePeriod = lateMinutes <= GRACE_PERIOD_MINUTES;
                
                if (!hasSufficientHours) {
                    // PRIORITY 1: Insufficient working hours (regardless of grace period)
                    calculatedStatus = 'Half-day';
                    calculatedIsHalfDay = true;
                    calculatedIsLate = false; // Not marked as late if within grace period
                } else if (!withinGracePeriod) {
                    // PRIORITY 2: Exceeds grace period (only if working hours are sufficient)
                    calculatedStatus = 'Half-day';
                    calculatedIsHalfDay = true;
                    calculatedIsLate = true; // Set isLate=true for tracking and notifications
                } else {
                    // PRIORITY 3: Within grace period and sufficient hours → On-time
                    calculatedStatus = 'On-time';
                    calculatedIsLate = false;
                    calculatedIsHalfDay = false;
                }
            }

            return {
                ...log,
                // Override with calculated values
                calculatedStatus,
                calculatedIsLate,
                calculatedIsHalfDay,
                gracePeriodMinutes: GRACE_PERIOD_MINUTES,
                hasManualOverride
            };
        });

        if (attendanceLogs.length > 0) {
            if (process.env.NODE_ENV !== 'production') console.log('Sample attendance log with calculated status:', logsWithCalculatedStatus[0]);
        }

        res.json({
            employee: employee,
            attendanceLogs: logsWithCalculatedStatus,
            gracePeriodMinutes: GRACE_PERIOD_MINUTES
        });

    } catch (error) {
        console.error('Error fetching employee attendance:', error);
        res.status(500).json({ error: 'Failed to fetch employee attendance data.' });
    }
});


// --- DASHBOARD & LOGS ROUTES ---

// Lightweight endpoint for delta updates: pending leaves only (used by socket-driven refresh).
// Optional cache: TTL 45s; invalidated on leave create/approve/reject/delete.
router.get('/dashboard-pending-leaves', [authenticateToken, isAdminOrHr], async (req, res) => {
    const today = getTodayISTKey();
    try {
        const cacheService = require('../services/cacheService');
        const cached = cacheService.getPendingLeaves(today);
        if (cached && Array.isArray(cached)) {
            return res.json({ pendingLeaveRequests: cached });
        }
        const pendingLeaveRequests = await LeaveRequest.find({
            status: 'Pending',
            requestType: { $ne: 'YEAR_END' }
        })
            .populate('employee', 'fullName employeeCode')
            .sort({ createdAt: 1 })
            .lean();
        const list = Array.isArray(pendingLeaveRequests) ? pendingLeaveRequests : [];
        try {
            cacheService.setPendingLeaves(today, list, 45);
        } catch (e) {
            // Cache set failure must not break response
        }
        return res.json({ pendingLeaveRequests: list });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[dashboard-pending-leaves] Error:', error?.message);
        }
        res.status(500).json({ error: 'Failed to fetch pending leave requests.' });
    }
});

// STEP 1 BASELINE: Optimized sections marked below; all response fields preserved (some values null/deferred).
// OPTIMIZED: Cache is effective because base summary is cached without pending leaves;
// when includePendingLeaves=true we return cached base + fetch only pending leaves (no full recompute).
// Policy: Required Log Out minimum 7:00 PM IST for dashboard Who's In (applied to cached and fresh data)
function normalizeWhosInListLogoutTo7PM(whosInList, today) {
    if (!Array.isArray(whosInList) || !today) return whosInList || [];
    const dayStart = startOfISTDay(today);
    const dayEnd = endOfISTDay(today);
    const sevenPM = getShiftDateTimeIST(parseISTDate(today), '19:00');
    return whosInList.map(emp => {
        const logout = emp?.calculatedLogoutTime;
        if (!logout) return emp;
        const t = new Date(logout);
        if (isNaN(t.getTime())) return emp;
        if (t >= dayStart && t <= dayEnd && t < sevenPM) {
            return { ...emp, calculatedLogoutTime: sevenPM.toISOString() };
        }
        return emp;
    });
}

router.get('/dashboard-summary', [authenticateToken, isAdminOrHr], async (req, res) => {
    const startMs = Date.now();
    const today = getTodayISTKey();
    const { includePendingLeaves } = req.query;
    const shouldIncludePendingLeaves = includePendingLeaves === 'true' || includePendingLeaves === true;
    try {
        const cacheService = require('../services/cacheService');
        let cachedSummary = null;
        const t0 = Date.now();
        try {
            cachedSummary = cacheService.getDashboardSummary(today) ?? null;
        } catch (cacheErr) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[dashboard-summary] Cache get failed, falling back to full computation:', cacheErr?.message);
            }
        }
        perfLog(`[ADMIN_DASHBOARD_TIMING] cache_lookup took ${Date.now() - t0}ms`);
        if (cachedSummary && !shouldIncludePendingLeaves) {
            verboseLog('[dashboard-summary] cache=hit includePendingLeaves=false ms=', Date.now() - startMs);
            let absentTodayList = cachedSummary.absentTodayList;
            if (!Array.isArray(absentTodayList)) {
                absentTodayList = await fetchAbsentTodayEmployees(today);
            }
            const normalized = {
                ...cachedSummary,
                absentCount: absentTodayList.length,
                absentTodayList,
                whosInList: normalizeWhosInListLogoutTo7PM(cachedSummary.whosInList, today)
            };
            return res.json(normalized);
        }

        // CACHE HIT + pending leaves requested: attach pending leaves to cached base (no full recompute)
        if (cachedSummary && shouldIncludePendingLeaves) {
            const t1 = Date.now();
            try {
                const pendingLeaveRequests = await LeaveRequest.find({
                    status: 'Pending',
                    requestType: { $ne: 'YEAR_END' }
                })
                    .populate('employee', 'fullName employeeCode')
                    .sort({ createdAt: 1 })
                    .lean();
                perfLog(`[ADMIN_DASHBOARD_TIMING] pending_leaves_query took ${Date.now() - t1}ms`);
                verboseLog('[dashboard-summary] cache=hit includePendingLeaves=true ms=', Date.now() - startMs);
                let absentTodayList = cachedSummary.absentTodayList;
                if (!Array.isArray(absentTodayList)) {
                    absentTodayList = await fetchAbsentTodayEmployees(today);
                }
                const normalizedSummary = {
                    ...cachedSummary,
                    absentCount: absentTodayList.length,
                    absentTodayList,
                    whosInList: normalizeWhosInListLogoutTo7PM(cachedSummary.whosInList, today)
                };
                return res.json({
                    summary: normalizedSummary,
                    pendingLeaveRequests: Array.isArray(pendingLeaveRequests) ? pendingLeaveRequests : []
                });
            } catch (leaveError) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('[dashboard-summary] Pending leaves fetch failed, returning cached summary only:', leaveError?.message);
                }
                let absentTodayList = cachedSummary.absentTodayList;
                if (!Array.isArray(absentTodayList)) {
                    absentTodayList = await fetchAbsentTodayEmployees(today);
                }
                const normalizedSummary = {
                    ...cachedSummary,
                    absentCount: absentTodayList.length,
                    absentTodayList,
                    whosInList: normalizeWhosInListLogoutTo7PM(cachedSummary.whosInList, today)
                };
                return res.json({
                    summary: normalizedSummary,
                    pendingLeaveRequests: []
                });
            }
        }

        // CACHE MISS: Compute base dashboard summary (no N+1 in Who's In)
        verboseLog('[dashboard-summary] cache=miss computing full summary');
        perfLog(`[ADMIN_DASHBOARD_TIMING] cache=miss, starting full computation`);
        // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in counts)
        const t2 = Date.now();
        const totalEmployeesPromise = User.countDocuments({ role: { $ne: 'Admin' }, isActive: true }).lean();
        const todayLogsPromise = AttendanceLog.find({ attendanceDate: today })
            .select('user isLate isHalfDay clockInTime attendanceDate')
            .lean();

        const whosInListPromise = AttendanceSession.aggregate([
            { $match: { endTime: null } },
            {
                $lookup: {
                    from: 'attendancelogs',
                    localField: 'attendanceLog',
                    foreignField: '_id',
                    as: 'attendanceLogInfo',
                    pipeline: [
                        { $match: { attendanceDate: today } },
                        { $project: { user: 1, attendanceDate: 1 } }
                    ]
                }
            },
            { $unwind: '$attendanceLogInfo' },
            { $sort: { startTime: 1 } },
            {
                $group: {
                    _id: '$attendanceLogInfo.user',
                    startTime: { $first: '$startTime' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                    pipeline: [
                        { $project: { fullName: 1, designation: 1, profileImageUrl: 1 } }
                    ]
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: '$user._id',
                    fullName: '$user.fullName',
                    designation: '$user.designation',
                    startTime: '$startTime',
                    profileImageUrl: '$user.profileImageUrl'
                }
            },
            { $sort: { startTime: 1 } }
        ]);

        const recentNotesPromise = AttendanceLog.find({
            attendanceDate: today,
            notes: { $ne: null, $ne: '' }
        })
            .populate('user', 'fullName employeeCode')
            .select('notes updatedAt user')
            .sort({ updatedAt: -1 })
            .limit(5)
            .lean();

        const pendingBreaksPromise = ExtraBreakRequest.find({
            status: 'Pending'
        })
            .populate('user', 'fullName employeeCode')
            .select('reason createdAt user')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const backdatedLeavesPromise = LeaveRequest.find({
            isBackdated: true,
            status: 'Pending'
        })
            .populate('employee', 'fullName employeeCode')
            .select('reason createdAt employee')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const pendingEarlyCheckoutPromise = EarlyCheckoutRequest.find({ status: 'Pending' })
            .populate('employee', 'fullName employeeCode')
            .select('reason remainingTimeMinutes requestedAt createdAt employee attendanceLog')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const [totalEmployees, todayLogs, whosInListRaw, recentNotes, pendingBreaks, backdatedLeaves, pendingEarlyCheckouts] = await Promise.all([
            totalEmployeesPromise,
            todayLogsPromise,
            whosInListPromise,
            recentNotesPromise,
            pendingBreaksPromise,
            backdatedLeavesPromise,
            pendingEarlyCheckoutPromise
        ]);
        perfLog(`[ADMIN_DASHBOARD_TIMING] parallel_queries took ${Date.now() - t2}ms`);

        // PERFORMANCE FIX: Batch-load all data for Who's In list to eliminate N+1 queries
        const t3 = Date.now();
        const rawList = Array.isArray(whosInListRaw) ? whosInListRaw : [];
        perfLog(`[ADMIN_DASHBOARD_TIMING] whosInList_count=${rawList.length}`);
        
        // Check cache first for all employees
        const uncachedEmployees = [];
        const whosInList = [];
        
        for (const employee of rawList) {
            const cached = cacheService.getDailyStatus(employee?._id, today);
            if (cached && (cached.calculatedLogoutTime !== undefined || cached.activeBreak !== undefined)) {
                whosInList.push({
                    _id: employee?._id,
                    fullName: employee?.fullName ?? '',
                    designation: employee?.designation ?? '',
                    startTime: employee?.startTime ?? null,
                    profileImageUrl: employee?.profileImageUrl ?? null,
                    calculatedLogoutTime: cached.calculatedLogoutTime ?? null,
                    logoutBreakdown: cached.logoutBreakdown,
                    activeBreak: cached.activeBreak ?? null
                });
            } else {
                uncachedEmployees.push(employee);
            }
        }
        
        perfLog(`[ADMIN_DASHBOARD_TIMING] cache_hits=${rawList.length - uncachedEmployees.length} cache_misses=${uncachedEmployees.length}`);
        
        // For uncached employees, batch-load all required data in 3 parallel queries
        if (uncachedEmployees.length > 0) {
            const t3a = Date.now();
            const userIds = uncachedEmployees.map(e => e._id);
            
            // Batch query 1: All attendance logs for these users today
            const attendanceLogsMap = new Map();
            const attendanceLogs = await AttendanceLog.find({
                user: { $in: userIds },
                attendanceDate: today
            }).lean();
            attendanceLogs.forEach(log => {
                attendanceLogsMap.set(log.user.toString(), log);
            });
            
            const logIds = attendanceLogs.map(log => log._id);
            // Batch queries 2–5: active breaks, users with shift, all sessions, all breaks (for logout calculation)
            const batchPromises = [
                User.find({ _id: { $in: userIds } }).populate('shiftGroup').lean(),
                logIds.length > 0 ? BreakLog.find({ attendanceLog: { $in: logIds }, endTime: null }).lean() : Promise.resolve([]),
                logIds.length > 0 ? AttendanceSession.find({ attendanceLog: { $in: logIds } }).sort({ startTime: 1 }).lean() : Promise.resolve([]),
                logIds.length > 0 ? BreakLog.find({ attendanceLog: { $in: logIds } }).sort({ startTime: 1 }).lean() : Promise.resolve([]),
            ];
            const [usersList, activeBreaksList, sessionsList, allBreaksList] = await Promise.all(batchPromises);
            
            const activeBreaksMap = new Map();
            (activeBreaksList || []).forEach(brk => {
                activeBreaksMap.set(brk.attendanceLog.toString(), brk);
            });
            const sessionsByLogId = new Map();
            (sessionsList || []).forEach(s => {
                const key = s.attendanceLog.toString();
                if (!sessionsByLogId.has(key)) sessionsByLogId.set(key, []);
                sessionsByLogId.get(key).push(s);
            });
            const breaksByLogId = new Map();
            (allBreaksList || []).forEach(b => {
                const key = b.attendanceLog.toString();
                if (!breaksByLogId.has(key)) breaksByLogId.set(key, []);
                breaksByLogId.get(key).push(b);
            });
            const usersMap = new Map();
            (usersList || []).forEach(user => {
                usersMap.set(user._id.toString(), user);
            });
            
            perfLog(`[ADMIN_DASHBOARD_TIMING] batch_queries took ${Date.now() - t3a}ms`);
            
            // Now process each uncached employee with pre-loaded data (no DB calls)
            const t3b = Date.now();
            for (const employee of uncachedEmployees) {
                const userId = employee._id.toString();
                const attendanceLog = attendanceLogsMap.get(userId);
                const user = usersMap.get(userId);
                
                let calculatedLogoutTime = null;
                let logoutBreakdown = undefined;
                let activeBreak = null;
                
                if (attendanceLog && user?.shiftGroup) {
                    const activeBreakDoc = activeBreaksMap.get(attendanceLog._id.toString());
                    if (activeBreakDoc) {
                        activeBreak = {
                            startTime: activeBreakDoc.startTime,
                            breakType: activeBreakDoc.breakType
                        };
                    }
                    const sessions = sessionsByLogId.get(attendanceLog._id.toString()) || [];
                    const breaks = breaksByLogId.get(attendanceLog._id.toString()) || [];
                    const logoutResult = computeCalculatedLogoutTime(sessions, breaks, attendanceLog, user.shiftGroup, activeBreak);
                    if (logoutResult) {
                        calculatedLogoutTime = logoutResult.requiredLogoutTime;
                        logoutBreakdown = logoutResult.breakdown;
                    }
                }
                
                const enriched = {
                    _id: employee._id,
                    fullName: employee.fullName ?? '',
                    designation: employee.designation ?? '',
                    startTime: employee.startTime ?? null,
                    profileImageUrl: employee.profileImageUrl ?? null,
                    calculatedLogoutTime,
                    logoutBreakdown,
                    activeBreak
                };
                
                whosInList.push(enriched);
                
                // Cache the result
                cacheService.setDailyStatus(employee._id, today, {
                    calculatedLogoutTime,
                    logoutBreakdown,
                    activeBreak
                });
            }
            perfLog(`[ADMIN_DASHBOARD_TIMING] uncached_processing took ${Date.now() - t3b}ms`);
        }
        
        perfLog(`[ADMIN_DASHBOARD_TIMING] whosInList_enrichment took ${Date.now() - t3}ms`);

        const t4 = Date.now();
        let presentCount = 0;
        let lateCount = 0;
        perfLog(`[ADMIN_DASHBOARD_TIMING] count_calculation_start took ${Date.now() - t4}ms`);
        perfLog(`[ADMIN_DASHBOARD_DEBUG] todayLogs.length=${(todayLogs || []).length}`);

        // Count ALL employees who clocked in as present (both on-time and late)
        // Late employees are a subset of present employees
        (todayLogs || []).forEach(log => {
            if (log?.clockInTime) {
                presentCount++; // Count all clocked-in employees
                if (log.isLate) {
                    lateCount++; // Also count late employees separately
                }
            }
        });
        
        perfLog(`[ADMIN_DASHBOARD_DEBUG] After forEach: presentCount=${presentCount}, lateCount=${lateCount}`);

        if ((todayLogs || []).length === 0) {
            const logIds = await AttendanceLog.find({ attendanceDate: today }).select('_id').lean();
            const activeSessionsCount = await AttendanceSession.countDocuments({
                endTime: null,
                attendanceLog: { $in: (logIds || []).map((l) => l._id) }
            });
            presentCount = activeSessionsCount;
        }

        if (presentCount === 0 && lateCount === 0) {
            const allClockedInCount = await AttendanceLog.countDocuments({
                attendanceDate: today,
                clockInTime: { $exists: true, $ne: null }
            });
            presentCount = allClockedInCount ?? 0;
        }

        const t5 = Date.now();
        const todayDate = new Date(today);
        const startOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
        const endOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1);

        const onLeaveCount = await LeaveRequest.countDocuments({
            status: 'Approved',
            leaveDates: {
                $elemMatch: {
                    $gte: startOfDay,
                    $lt: endOfDay
                }
            }
        });
        perfLog(`[ADMIN_DASHBOARD_TIMING] onLeaveCount_query took ${Date.now() - t5}ms`);

        const statusCounts = {
            'Present': presentCount,
            'Late': lateCount,
            'On Leave': onLeaveCount ?? 0
        };

        const mappedNotes = (recentNotes || []).map(n => ({
            _id: n._id,
            type: 'Note',
            user: n.user,
            content: n.notes,
            timestamp: n.updatedAt
        }));
        const mappedBreakRequests = (pendingBreaks || []).map(b => ({
            _id: b._id,
            type: 'ExtraBreakRequest',
            user: b.user,
            content: b.reason,
            timestamp: b.createdAt
        }));
        const mappedLeaveRequests = (backdatedLeaves || []).map(l => ({
            _id: l._id,
            type: 'BackdatedLeaveRequest',
            user: l.employee,
            content: l.reason,
            timestamp: l.createdAt
        }));
        const mappedEarlyCheckouts = (pendingEarlyCheckouts || []).map(ec => ({
            _id: ec._id,
            type: 'EarlyCheckoutRequest',
            user: ec.employee,
            content: (ec.reason && ec.reason.length > 60 ? ec.reason.slice(0, 60) + '…' : ec.reason) || '',
            timestamp: ec.createdAt,
            remainingTimeMinutes: ec.remainingTimeMinutes,
            requestedAt: ec.requestedAt
        }));

        const t6 = Date.now();
        const recentActivity = [...mappedNotes, ...mappedBreakRequests, ...mappedLeaveRequests, ...mappedEarlyCheckouts]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const absentTodayList = await fetchAbsentTodayEmployees(today);
        perfLog(`[ADMIN_DASHBOARD_TIMING] absentTodayList_count=${absentTodayList.length} took ${Date.now() - t6}ms`);

        const summary = {
            totalEmployees: totalEmployees ?? 0,
            presentCount: statusCounts['Present'],
            lateCount: statusCounts['Late'],
            onLeaveCount: statusCounts['On Leave'],
            absentCount: absentTodayList.length,
            absentTodayList,
            whosInList: normalizeWhosInListLogoutTo7PM(whosInList || [], today),
            recentActivity: recentActivity || []
        };

        try {
            cacheService.setDashboardSummary(today, summary);
        } catch (setCacheErr) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[dashboard-summary] Cache set failed:', setCacheErr?.message);
            }
        }
        perfLog(`[ADMIN_DASHBOARD_TIMING] summary_assembly_and_cache_set took ${Date.now() - t6}ms`);

        if (shouldIncludePendingLeaves) {
            try {
                const pendingLeaveRequests = await LeaveRequest.find({
                    status: 'Pending',
                    requestType: { $ne: 'YEAR_END' }
                })
                    .populate('employee', 'fullName employeeCode')
                    .sort({ createdAt: 1 })
                    .lean();
                verboseLog('[dashboard-summary] cache=miss includePendingLeaves=true ms=', Date.now() - startMs);
                return res.json({
                    summary,
                    pendingLeaveRequests: Array.isArray(pendingLeaveRequests) ? pendingLeaveRequests : []
                });
            } catch (leaveError) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('[dashboard-summary] Pending leaves fetch failed:', leaveError?.message);
                }
                return res.json({
                    summary,
                    pendingLeaveRequests: []
                });
            }
        }

        verboseLog('[dashboard-summary] cache=miss ms=', Date.now() - startMs);
        perfLog(`[ADMIN_DASHBOARD_TIMING] TOTAL_TIME=${Date.now() - startMs}ms`);
        res.json(summary);
    } catch (error) {
        perfLog(`[ADMIN_DASHBOARD_TIMING] ERROR after ${Date.now() - startMs}ms:`, error.message);
        if (process.env.NODE_ENV !== 'production') {
            console.error('[dashboard-summary] Error:', error);
        }
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// New endpoint to get detailed employee lists for dashboard cards (supports pagination)
router.get('/dashboard-employees/:type', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { type } = req.params;
    const today = getTodayISTKey();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    try {
        let employees = [];
        let total = 0;

        switch (type) {
            case 'present':
                // Find ALL employees who are present (clocked in, including late employees)
                // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in lists)
                const presentLogs = await AttendanceLog.find({
                    attendanceDate: today,
                    clockInTime: { $exists: true, $ne: null }
                }).populate({
                    path: 'user',
                    match: { role: { $ne: 'Admin' }, isActive: true },
                    select: 'fullName employeeCode designation department profileImageUrl'
                }).lean();

                // If no present logs found, try to find employees with active attendance sessions
                if (presentLogs.length === 0) {
                    const AttendanceSession = require('../models/AttendanceSession');

                    const activeSessions = await AttendanceSession.aggregate([
                        { $match: { endTime: null } },
                        {
                            $lookup: {
                                from: 'attendancelogs',
                                localField: 'attendanceLog',
                                foreignField: '_id',
                                as: 'attendanceLogInfo',
                                pipeline: [
                                    { $match: { attendanceDate: today } },
                                    { $project: { user: 1, attendanceDate: 1 } }
                                ]
                            }
                        },
                        { $unwind: '$attendanceLogInfo' },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'attendanceLogInfo.user',
                                foreignField: '_id',
                                as: 'user',
                                pipeline: [
                                    // Filter: Exclude Admin role and inactive users
                                    { $match: { role: { $ne: 'Admin' }, isActive: true } },
                                    { $project: { fullName: 1, employeeCode: 1, designation: 1, department: 1, profileImageUrl: 1 } }
                                ]
                            }
                        },
                        { $unwind: '$user' },
                        {
                            $project: {
                                _id: '$user._id',
                                fullName: '$user.fullName',
                                employeeCode: '$user.employeeCode',
                                designation: '$user.designation',
                                department: '$user.department',
                                profileImageUrl: '$user.profileImageUrl',
                                clockInTime: '$startTime',
                                status: 'Present'
                            }
                        }
                    ]);


                    employees = activeSessions;
                } else {
                    // Filter out null users (from populate match filter) and inactive/Admin users
                    employees = presentLogs
                        .filter(log => log.user && log.user._id) // Remove null users from populate match
                        .map(log => ({
                            _id: log.user._id,
                            fullName: log.user.fullName,
                            employeeCode: log.user.employeeCode,
                            designation: log.user.designation,
                            department: log.user.department,
                            profileImageUrl: log.user.profileImageUrl,
                            clockInTime: log.clockInTime,
                            status: 'Present',
                            notes: log.notes
                        }));
                }
                break;

            case 'late':
                // Find employees who are late
                // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in lists)
                const lateLogs = await AttendanceLog.find({
                    attendanceDate: today,
                    clockInTime: { $exists: true, $ne: null },
                    isLate: true
                }).populate({
                    path: 'user',
                    match: { role: { $ne: 'Admin' }, isActive: true },
                    select: 'fullName employeeCode designation department profileImageUrl'
                }).lean();


                // Filter out null users (from populate match filter)
                employees = lateLogs
                    .filter(log => log.user && log.user._id)
                    .map(log => ({
                        _id: log.user._id,
                        fullName: log.user.fullName,
                        employeeCode: log.user.employeeCode,
                        designation: log.user.designation,
                        department: log.user.department,
                        profileImageUrl: log.user.profileImageUrl,
                        clockInTime: log.clockInTime,
                        status: 'Late',
                        notes: log.notes
                    }));
                break;

            case 'on-leave':
                // Find employees who are on approved leave for today
                // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in lists)
                const todayDate = new Date(today);
                const startOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
                const endOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1);

                const approvedLeaves = await LeaveRequest.find({
                    status: 'Approved',
                    leaveDates: {
                        $elemMatch: {
                            $gte: startOfDay,
                            $lt: endOfDay
                        }
                    }
                }).populate({
                    path: 'employee',
                    match: { role: { $ne: 'Admin' }, isActive: true },
                    select: 'fullName employeeCode designation department profileImageUrl'
                }).lean();


                // Filter out null employees (from populate match filter)
                employees = approvedLeaves
                    .filter(leave => leave.employee && leave.employee._id)
                    .map(leave => ({
                        _id: leave.employee._id,
                        fullName: leave.employee.fullName,
                        employeeCode: leave.employee.employeeCode,
                        designation: leave.employee.designation,
                        department: leave.employee.department,
                        profileImageUrl: leave.employee.profileImageUrl,
                        status: 'On Leave',
                        leaveType: leave.requestType,
                        leaveReason: leave.reason
                    }));
                break;

            case 'total':
                // Filter: Exclude Admin role and inactive users; paginate at DB level
                total = await User.countDocuments({ role: { $ne: 'Admin' }, isActive: true });
                const allEmployees = await User.find({ role: { $ne: 'Admin' }, isActive: true })
                    .select('fullName employeeCode designation department profileImageUrl role employmentStatus joiningDate')
                    .sort({ fullName: 1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();

                employees = allEmployees.map(emp => ({
                    _id: emp._id,
                    fullName: emp.fullName,
                    employeeCode: emp.employeeCode,
                    designation: emp.designation,
                    department: emp.department,
                    profileImageUrl: emp.profileImageUrl,
                    role: emp.role,
                    employmentStatus: emp.employmentStatus,
                    joiningDate: emp.joiningDate
                }));
                break;

            case 'absent':
                employees = await fetchAbsentTodayEmployees(today);
                break;

            default:
                return res.status(400).json({ error: 'Invalid employee type' });
        }

        // For present/late/on-leave, total = full list length; for total, already set from countDocuments
        if (type !== 'total') {
            total = employees.length;
        }
        const items = type === 'total' ? employees : employees.slice(skip, skip + limit);
        const hasMore = skip + items.length < total;
        return res.json({ items, page, limit, total, hasMore });
    } catch (error) {
        console.error(`Error fetching ${type} employees:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.get('/attendance/user/:userId', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { userId } = req.params;
        const { startDate, endDate } = req.query;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid employee ID format.' });
        }
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date query parameters are required.' });
        }

        const logs = await AttendanceLog.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId), attendanceDate: { $gte: startDate, $lte: endDate } } },
            { $lookup: { from: 'attendancesessions', localField: '_id', foreignField: 'attendanceLog', as: 'sessions' } },
            { $lookup: { from: 'breaklogs', localField: '_id', foreignField: 'attendanceLog', as: 'breaks' } },
            { $project: { _id: 1, attendanceDate: 1, status: 1, clockInTime: 1, clockOutTime: 1, notes: 1, logoutType: 1, autoLogoutReason: 1, earlyCheckoutNote: 1, sessions: { $map: { input: "$sessions", as: "s", in: { startTime: "$$s.startTime", endTime: "$$s.endTime", logoutType: "$$s.logoutType", autoLogoutReason: "$$s.autoLogoutReason" } } }, breaks: { $map: { input: "$breaks", as: "b", in: { startTime: "$$b.startTime", endTime: "$$b.endTime", durationMinutes: "$$b.durationMinutes", breakType: "$$b.breakType" } } } } },
            { $sort: { attendanceDate: 1 } }
        ]);

        res.json(logs);

    } catch (error) {
        console.error('Error fetching user attendance summary:', error);
        res.status(500).json({ error: 'Server error while fetching attendance summary.' });
    }
});

/**
 * PUT /api/admin/attendance/log/:logId
 * Update an attendance log with new sessions and breaks
 * 
 * Expected payload structure:
 * {
 *   sessions: Array<{ 
 *     startTime: string (ISO 8601 date string, required),
 *     endTime: string (ISO 8601 date string, optional, must be after startTime if provided)
 *   }>,
 *   breaks: Array<{
 *     startTime: string (ISO 8601 date string, required),
 *     endTime: string (ISO 8601 date string, required, must be after startTime),
 *     breakType: 'Paid' | 'Unpaid' | 'Extra' (required)
 *   }>,
 *   notes: string (optional, defaults to empty string)
 * }
 * 
 * Validation rules:
 * - All time values must be valid ISO 8601 date strings
 * - endTime must be after startTime for both sessions and breaks
 * - Session duration cannot exceed 24 hours (increased from 16 hours for admin flexibility)
 * - Break duration cannot exceed 24 hours (increased from 16 hours for admin flexibility)
 * - breakType must be one of: 'Paid', 'Unpaid', 'Extra'
 * - Admins can edit auto-logged-out attendance logs (restriction removed)
 */
router.put('/attendance/log/:logId', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    const { logId } = req.params;
    let { sessions, breaks, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(logId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid log ID.',
            error: 'Invalid log ID.'
        });
    }

    // Log received data for debugging (remove in production if needed)
    if (process.env.NODE_ENV !== 'production') console.log('PUT /admin/attendance/log/:logId - Received data:', {
        logId,
        sessionsType: typeof sessions,
        sessionsIsArray: Array.isArray(sessions),
        sessionsLength: Array.isArray(sessions) ? sessions.length : 'N/A',
        breaksType: typeof breaks,
        breaksIsArray: Array.isArray(breaks),
        breaksLength: Array.isArray(breaks) ? breaks.length : 'N/A',
        hasNotes: notes !== undefined
    });

    // First, check if the attendance log exists and if it was auto-logged out
    const log = await AttendanceLog.findById(logId);
    if (!log) {
        return res.status(404).json({
            success: false,
            message: 'Attendance log not found.',
            error: 'Attendance log not found.'
        });
    }

    // PHASE 6: Warn if this date has an approved leave
    let leaveWarning = null;
    if (log.leaveRequest) {
        const leaveRequest = await LeaveRequest.findById(log.leaveRequest);
        if (leaveRequest && leaveRequest.status === 'Approved') {
            leaveWarning = `Warning: This date has an approved leave (${leaveRequest.requestType}). Editing attendance may conflict with leave status.`;
        }
    }

    // CRITICAL FIX: Allow admins to edit auto-logged-out sessions
    // Admins should be able to override auto-logout restrictions for corrections
    // Only show warning, but allow the edit to proceed
    if (log.logoutType === 'AUTO' && log.autoLogoutReason) {
        // Log warning but allow admin to proceed with edit
        console.warn('[Admin Edit] Editing auto-logged-out attendance log:', {
            logId: log._id,
            userId: log.user,
            autoLogoutReason: log.autoLogoutReason,
            adminUserId: req.user.userId,
            adminRole: req.user.role
        });

        // Clear auto-logout status when admin edits (mark as manually corrected)
        if (sessions !== undefined || breaks !== undefined) {
            log.logoutType = 'MANUAL';
            log.autoLogoutReason = null;
            if (process.env.NODE_ENV !== 'production') console.log('[Admin Edit] Auto-logout status cleared by admin edit');
        }
        // Continue with normal edit flow below
    }

    // Validate and default required fields
    if (sessions === undefined || sessions === null) {
        sessions = [];
    }
    if (!Array.isArray(sessions)) {
        console.error('Validation error: sessions is not an array:', sessions);
        return res.status(400).json({
            success: false,
            message: 'Sessions must be an array.',
            error: 'Sessions must be an array.'
        });
    }

    if (breaks === undefined || breaks === null) {
        breaks = [];
    }
    if (!Array.isArray(breaks)) {
        console.error('Validation error: breaks is not an array:', breaks);
        return res.status(400).json({
            success: false,
            message: 'Breaks must be an array.',
            error: 'Breaks must be an array.'
        });
    }

    // Validate sessions with time ordering checks
    for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        if (!s || typeof s !== 'object') {
            return res.status(400).json({
                success: false,
                message: `Session #${i + 1} is invalid. Expected an object.`,
                error: `Session #${i + 1} is invalid. Expected an object.`
            });
        }
        if (!s.startTime) {
            return res.status(400).json({
                success: false,
                message: `Session #${i + 1} is missing startTime.`,
                error: `Session #${i + 1} is missing startTime.`
            });
        }
        const startTime = new Date(s.startTime);
        if (isNaN(startTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: `Session #${i + 1} has an invalid startTime: ${s.startTime}`,
                error: `Session #${i + 1} has an invalid startTime: ${s.startTime}`
            });
        }
        if (s.endTime) {
            const endTime = new Date(s.endTime);
            if (isNaN(endTime.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: `Session #${i + 1} has an invalid endTime: ${s.endTime}`,
                    error: `Session #${i + 1} has an invalid endTime: ${s.endTime}`
                });
            }
            // Validate time ordering: endTime must be after startTime
            if (endTime <= startTime) {
                return res.status(400).json({
                    success: false,
                    message: `Session #${i + 1} end time must be after start time.`,
                    error: `Session #${i + 1} end time must be after start time.`
                });
            }
            // Validate reasonable duration (max 24 hours for admin edits - increased from 16 hours)
            // This allows for legitimate cases like night shifts, corrections, etc.
            const durationHours = (endTime - startTime) / (1000 * 60 * 60);
            if (durationHours > 24) {
                return res.status(400).json({
                    success: false,
                    message: `Session #${i + 1} duration cannot exceed 24 hours.`,
                    error: `Session #${i + 1} duration cannot exceed 24 hours.`
                });
            }
        }
    }

    // Validate breaks with time ordering and breakType checks
    for (let i = 0; i < breaks.length; i++) {
        const b = breaks[i];
        if (!b || typeof b !== 'object') {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} is invalid. Expected an object.`,
                error: `Break #${i + 1} is invalid. Expected an object.`
            });
        }
        if (!b.startTime) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} is missing startTime.`,
                error: `Break #${i + 1} is missing startTime.`
            });
        }
        if (!b.endTime) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} is missing endTime.`,
                error: `Break #${i + 1} is missing endTime.`
            });
        }
        const startTime = new Date(b.startTime);
        const endTime = new Date(b.endTime);
        if (isNaN(startTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} has an invalid startTime: ${b.startTime}`,
                error: `Break #${i + 1} has an invalid startTime: ${b.startTime}`
            });
        }
        if (isNaN(endTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} has an invalid endTime: ${b.endTime}`,
                error: `Break #${i + 1} has an invalid endTime: ${b.endTime}`
            });
        }
        // Validate time ordering: endTime must be after startTime
        if (endTime <= startTime) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} end time must be after start time.`,
                error: `Break #${i + 1} end time must be after start time.`
            });
        }
        // Validate reasonable duration (max 24 hours for admin edits - increased from 16 hours)
        // This allows for legitimate cases like corrections, extended breaks, etc.
        const durationHours = (endTime - startTime) / (1000 * 60 * 60);
        if (durationHours > 24) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} duration cannot exceed 24 hours.`,
                error: `Break #${i + 1} duration cannot exceed 24 hours.`
            });
        }
        // Handle both breakType and type for backward compatibility
        const breakType = (b.breakType || b.type || '').toString().trim();
        if (!breakType) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} is missing breakType.`,
                error: `Break #${i + 1} is missing breakType.`
            });
        }
        if (!['Paid', 'Unpaid', 'Extra'].includes(breakType)) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} has an invalid breakType: ${breakType}. Must be 'Paid', 'Unpaid', or 'Extra'.`,
                error: `Break #${i + 1} has an invalid breakType: ${breakType}. Must be 'Paid', 'Unpaid', or 'Extra'.`
            });
        }
    }

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
        // Reload log within transaction to ensure consistency
        const logInTransaction = await AttendanceLog.findById(logId).session(dbSession);
        if (!logInTransaction) {
            await dbSession.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Attendance log not found.',
                error: 'Attendance log not found.'
            });
        }

        // Ensure logoutType check still applies (double-check within transaction)
        if (logInTransaction.logoutType === 'AUTO' && logInTransaction.autoLogoutReason) {
            // CRITICAL FIX: Allow admins to edit auto-logged-out sessions
            // Clear auto-logout status when admin edits (mark as manually corrected)
            console.warn('[Admin Edit] Editing auto-logged-out attendance log in transaction:', {
                logId: logInTransaction._id,
                userId: logInTransaction.user,
                autoLogoutReason: logInTransaction.autoLogoutReason,
                adminUserId: req.user.userId,
                adminRole: req.user.role
            });

            // Clear auto-logout status
            logInTransaction.logoutType = 'MANUAL';
            logInTransaction.autoLogoutReason = null;
            if (process.env.NODE_ENV !== 'production') console.log('[Admin Edit] Auto-logout status cleared by admin edit in transaction');
        }

        const log = logInTransaction;

        await AttendanceSession.deleteMany({ attendanceLog: log._id }).session(dbSession);
        await BreakLog.deleteMany({ attendanceLog: log._id }).session(dbSession);

        const newSessions = sessions.map(s => ({
            startTime: new Date(s.startTime),
            endTime: s.endTime ? new Date(s.endTime) : null,
            attendanceLog: log._id,
        }));
        if (newSessions.length > 0) {
            await AttendanceSession.insertMany(newSessions, { session: dbSession });
        }

        let totalPaidBreak = 0;
        let totalUnpaidBreak = 0;

        const newBreaks = breaks.map(b => {
            const startTime = new Date(b.startTime);
            const endTime = new Date(b.endTime);
            const durationMinutes = (endTime - startTime) / 60000;

            // Handle both breakType and type for backward compatibility
            const breakType = b.breakType || b.type || 'Unpaid';

            if (breakType === 'Paid') {
                totalPaidBreak += durationMinutes;
            } else {
                totalUnpaidBreak += durationMinutes;
            }

            return {
                type: breakType,
                breakType: breakType,
                startTime,
                endTime,
                durationMinutes,
                attendanceLog: log._id,
                userId: log.user
            };
        });

        if (newBreaks.length > 0) {
            await BreakLog.insertMany(newBreaks, { session: dbSession });
        }

        // Preserve existing clockInTime and clockOutTime if not updating from sessions
        // This ensures required fields remain valid during partial updates
        // CRITICAL: clockInTime is required in schema, so we must preserve it if not updating
        const sortedSessions = [...newSessions].sort((a, b) => a.startTime - b.startTime);

        // Track if clockInTime changed so we can recalculate derived fields
        const previousClockInTime = log.clockInTime ? new Date(log.clockInTime).getTime() : null;
        let clockInTimeChanged = false;

        // Only update clockInTime if we have valid sessions (preserve existing if not)
        // This prevents Mongoose validation errors: "Path `clockInTime` is required"
        if (sortedSessions.length > 0 && sortedSessions[0].startTime) {
            const newClockInTime = sortedSessions[0].startTime;
            const newClockInTimeMs = new Date(newClockInTime).getTime();
            // Check if clockInTime actually changed
            if (previousClockInTime !== newClockInTimeMs) {
                clockInTimeChanged = true;
                log.clockInTime = newClockInTime;
            }
        }
        // If no sessions or empty sessions array, preserve existing clockInTime
        // (no assignment needed - log.clockInTime already has the existing value)

        // Update clockOutTime if we have valid sessions (clockOutTime is optional, so null is OK)
        const lastSession = sortedSessions[sortedSessions.length - 1];
        if (sortedSessions.length > 0) {
            // We have sessions - update clockOutTime based on last session
            log.clockOutTime = lastSession?.endTime || null;
            // If admin is editing and setting clockOutTime, preserve logoutType appropriately
            // Only set to MANUAL if clockOutTime is being set and logoutType was not AUTO
            if (lastSession?.endTime && log.logoutType !== 'AUTO') {
                log.logoutType = 'MANUAL'; // Admin edits are considered manual
                log.autoLogoutReason = null; // Clear auto-logout reason if admin edits
            }
        }
        // If no sessions, preserve existing clockOutTime and logoutType (no assignment needed)

        log.paidBreakMinutesTaken = totalPaidBreak;
        log.unpaidBreakMinutesTaken = totalUnpaidBreak;
        if (notes !== undefined) {
            log.notes = notes;
            // Keep early checkout reason in sync with notes for calendar ECN and log detail
            log.earlyCheckoutNote = notes;
        }
        log.penaltyMinutes = 0;

        // CRITICAL: If clockInTime changed, recalculate derived fields (isLate, isHalfDay, etc.)
        // This ensures admin edits immediately update the status
        // NOTE: log.clockInTime is already set to first session's startTime above (line 2217)
        if (clockInTimeChanged && log.clockInTime) {
            try {
                const user = await User.findById(log.user).populate('shiftGroup').lean();
                if (user && user.shiftGroup && user.shiftGroup.startTime) {
                    // CRITICAL: log.clockInTime is already the first session's startTime (set above)
                    // But to be extra safe, verify by getting first session again
                    const AttendanceSession = require('../models/AttendanceSession');
                    const verifyFirstSession = await AttendanceSession.findOne({ 
                        attendanceLog: log._id 
                    }).sort({ startTime: 1 }).select('startTime').lean();
                    
                    const clockInTimeForRecalc = (verifyFirstSession && verifyFirstSession.startTime) 
                        ? new Date(verifyFirstSession.startTime)
                        : new Date(log.clockInTime);
                    
                    const recalculatedStatus = await recalculateLateStatus(
                        clockInTimeForRecalc,
                        user.shiftGroup,
                        null, // gracePeriodMinutes (will be fetched from settings)
                        log.totalWorkingHours // Pass working hours for priority logic
                    );
                    // Update derived fields with recalculated values
                    log.isLate = recalculatedStatus.isLate;
                    log.isHalfDay = recalculatedStatus.isHalfDay;
                    log.lateMinutes = recalculatedStatus.lateMinutes;
                    log.attendanceStatus = recalculatedStatus.attendanceStatus;
                    if (process.env.NODE_ENV !== 'production') console.log(`✅ Recalculated attendance status after clockInTime update: ${recalculatedStatus.attendanceStatus} (lateMinutes: ${recalculatedStatus.lateMinutes})`);
                }
            } catch (recalcError) {
                console.error('Error recalculating late status after clockInTime update:', recalcError);
                // Don't fail the request, but log the error
            }
        }

        // Recalculate total working hours based on updated sessions and breaks
        if (log.clockInTime && log.clockOutTime) {
            const workingMinutes = (new Date(log.clockOutTime) - new Date(log.clockInTime)) / (1000 * 60);
            const totalBreakMinutes = totalPaidBreak + totalUnpaidBreak;
            const netWorkingMinutes = Math.max(0, workingMinutes - totalBreakMinutes);
            log.totalWorkingHours = netWorkingMinutes / 60;
        } else {
            log.totalWorkingHours = 0;
        }

        // Save the log with validation - catch any Mongoose validation errors
        try {
            await log.save({ session: dbSession });
        } catch (saveError) {
            await dbSession.abortTransaction();

            // Handle Mongoose validation errors specifically
            if (saveError.name === 'ValidationError') {
                const validationMessages = Object.values(saveError.errors).map(err => err.message);
                console.error('Mongoose validation error:', validationMessages);
                return res.status(400).json({
                    success: false,
                    message: `Validation failed: ${validationMessages.join(', ')}`,
                    error: `Validation failed: ${validationMessages.join(', ')}`
                });
            }

            // Re-throw other errors to be handled by outer catch block
            throw saveError;
        }

        await dbSession.commitTransaction();

        // Emit Socket.IO event to notify all clients about the attendance log update
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                // Emit to all connected clients
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    isLate: log.isLate,
                    totalWorkingHours: log.totalWorkingHours,
                    clockInTime: log.clockInTime,
                    clockOutTime: log.clockOutTime,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Attendance log updated by admin - Working hours: ${log.totalWorkingHours.toFixed(2)}h`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for log ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // PHASE 4 OPTIMIZATION: Cache invalidation on mutation
        // Invalidate status cache for this user and date
        const cache = require('../utils/cache');
        const cacheKey = `status:${log.user}:${log.attendanceDate}`;
        cache.delete(cacheKey);
        // Also invalidate dashboard summary cache
        cache.deletePattern(`dashboard-summary:*`);
        // Also invalidate existing cacheService
        const cacheService = require('../services/cacheService');
        cacheService.invalidateAttendance(log.user, log.attendanceDate);
        cacheService.invalidateDashboard(log.attendanceDate);

        const response = {
            success: true,
            message: 'Log updated successfully.'
        };

        // PHASE 6: Include warning if leave exists
        if (leaveWarning) {
            response.warning = leaveWarning;
        }

        res.json(response);

    } catch (error) {
        await dbSession.abortTransaction();

        // Handle different error types with structured responses
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: `Validation failed: ${messages.join(', ')}`,
                error: `Validation failed: ${messages.join(', ')}`
            });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: `Invalid data format for field: ${error.path}. Please check your inputs.`,
                error: `Invalid data format for field: ${error.path}. Please check your inputs.`
            });
        }

        // Log error for debugging but don't expose internal details to client
        console.error('Error updating attendance log:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while updating log. Please try again.',
            error: 'Server error while updating log.'
        });
    } finally {
        dbSession.endSession();
    }
});

// DELETE /api/admin/attendance/log/:logId
// Delete an attendance log and all associated sessions and breaks
router.delete('/attendance/log/:logId', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { logId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(logId)) {
        return res.status(400).json({ error: 'Invalid log ID.' });
    }

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
        // Find the log and populate user info for audit logging
        const log = await AttendanceLog.findById(logId)
            .populate('user', 'fullName employeeCode')
            .session(dbSession);

        if (!log) {
            await dbSession.abortTransaction();
            return res.status(404).json({ error: 'Attendance log not found.' });
        }

        // Store log data for audit logging before deletion
        const logData = {
            logId: log._id,
            userId: log.user._id,
            userName: log.user.fullName,
            employeeCode: log.user.employeeCode,
            attendanceDate: log.attendanceDate,
            clockInTime: log.clockInTime,
            clockOutTime: log.clockOutTime,
            attendanceStatus: log.attendanceStatus,
            totalWorkingHours: log.totalWorkingHours
        };

        // Delete all associated sessions
        await AttendanceSession.deleteMany({ attendanceLog: log._id }).session(dbSession);

        // Delete all associated breaks
        await BreakLog.deleteMany({ attendanceLog: log._id }).session(dbSession);

        // Delete the attendance log
        await AttendanceLog.findByIdAndDelete(logId).session(dbSession);

        await dbSession.commitTransaction();

        // Log the admin action
        try {
            const auditLogger = require('../services/auditLogger');
            await auditLogger.logAction({
                userId: req.user.userId,
                action: 'delete_attendance_log',
                details: {
                    deletedLogId: logData.logId,
                    targetEmployeeId: logData.userId,
                    targetEmployeeName: logData.userName,
                    targetEmployeeCode: logData.employeeCode,
                    attendanceDate: logData.attendanceDate,
                    deletedClockInTime: logData.clockInTime,
                    deletedClockOutTime: logData.clockOutTime,
                    deletedAttendanceStatus: logData.attendanceStatus,
                    deletedTotalWorkingHours: logData.totalWorkingHours
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
        } catch (auditError) {
            console.error('Failed to log audit action:', auditError);
            // Don't fail the request if audit logging fails
        }

        // Emit Socket.IO event to notify all clients about the attendance log deletion
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_deleted', {
                    logId: logData.logId,
                    userId: logData.userId,
                    attendanceDate: logData.attendanceDate,
                    deletedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Attendance log deleted by admin for ${logData.userName} on ${logData.attendanceDate}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_deleted event for log ${logData.logId}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        res.json({
            message: 'Attendance log deleted successfully.',
            deletedLog: {
                logId: logData.logId,
                attendanceDate: logData.attendanceDate,
                employeeName: logData.userName
            }
        });

    } catch (error) {
        await dbSession.abortTransaction();
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({ error: `Invalid data format: ${error.message}` });
        }
        console.error('Error deleting attendance log:', error);
        res.status(500).json({ error: 'Server error while deleting log.' });
    } finally {
        dbSession.endSession();
    }
});

// --- YEAR-END LEAVE MANAGEMENT ROUTES ---

// GET /api/admin/leaves/year-end-requests
// Get all Year-End leave requests
router.get('/leaves/year-end-requests', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { requestType: 'YEAR_END' };

        // Filter by status if provided
        if (req.query.status) {
            query.status = req.query.status;
        }

        // Filter by year if provided
        if (req.query.year) {
            query.yearEndYear = parseInt(req.query.year);
        }

        const totalCount = await LeaveRequest.countDocuments(query);
        const requests = await LeaveRequest.find(query)
            .populate('employee', 'fullName employeeCode department designation')
            .populate('approvedBy', 'fullName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            requests,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit)
        });
    } catch (error) {
        console.error('Error fetching Year-End leave requests:', error);
        res.status(500).json({ error: 'Failed to fetch Year-End requests.' });
    }
});

// PATCH /api/admin/leaves/year-end/:id/status
// Approve or reject Year-End leave request
router.patch('/leaves/year-end/:id/status', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { status: newStatus, rejectionNotes } = req.body;

    if (!['Approved', 'Rejected'].includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status provided.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const request = await LeaveRequest.findById(id).session(session);
        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Year-End request not found.' });
        }

        if (request.requestType !== 'YEAR_END') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'This is not a Year-End leave request.' });
        }

        if (request.status !== 'Pending') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'This request has already been processed.' });
        }

        // CRITICAL: Prevent double processing
        if (request.isProcessed === true) {
            await session.abortTransaction();
            return res.status(409).json({ error: 'This request has already been processed and cannot be modified.' });
        }

        const employee = await User.findById(request.employee).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const oldStatus = request.status;
        const leaveType = request.yearEndLeaveType;
        const days = request.yearEndDays;
        const subType = request.yearEndSubType;

        // Map leaveType to balance field
        const balanceField = leaveType === 'Sick' ? 'sick' : leaveType === 'Casual' ? 'casual' : 'paid';

        if (newStatus === 'Approved') {
            // Only process if not already processed
            if (!request.isProcessed) {
                // CRITICAL YEAR-END ROLLOVER LOGIC:
                // Year-End request is for the CLOSING year (e.g., 2025)
                // The result MUST be applied to the NEXT year (e.g., 2026)
                const closingYear = request.yearEndYear; // e.g., 2025
                const targetYear = closingYear + 1; // e.g., 2026
                const currentDate = new Date();
                const currentYear = currentDate.getFullYear();
                const currentMonth = currentDate.getMonth(); // 0-11 (0 = January, 11 = December)

                // Determine if we're in the target year or later
                // If we're in December of closing year or January+ of target year, apply to target year
                const isInTargetYearOrLater = currentYear >= targetYear;
                const isInDecemberOfClosingYear = currentYear === closingYear && currentMonth === 11;

                if (subType === 'CARRY_FORWARD') {
                    // CARRY FORWARD: Add remaining days to NEXT year's opening balance
                    // Opening balance for target year = default entitlement for target year + carried forward days
                    const defaultEntitlementForTargetYear = employee.leaveEntitlements[balanceField] || 0;
                    const carriedForwardDays = days;

                    // Calculate the target year's opening balance
                    // This is what the employee will have from January 1st of target year
                    const targetYearOpeningBalance = defaultEntitlementForTargetYear + carriedForwardDays;

                    // Apply the carry forward to the balance
                    // If we're in the target year or later, set the balance to the target year opening balance
                    // If we're in December of closing year, prepare the balance for next year
                    if (isInTargetYearOrLater || isInDecemberOfClosingYear) {
                        // Set balance to target year opening balance (entitlement + carry forward)
                        employee.leaveBalances[balanceField] = targetYearOpeningBalance;
                    } else {
                        // If we're still earlier in the closing year, add carry forward to current balance
                        // This will be the balance when the new year starts
                        employee.leaveBalances[balanceField] = (employee.leaveBalances[balanceField] || 0) + carriedForwardDays;
                    }
                } else if (subType === 'ENCASH') {
                    // ENCASH: No balance change - leaves are encashed (paid out)
                    // The balance was already reduced when leaves were used during the closing year
                    // Encashment means the remaining balance is paid out, not carried forward
                    // The employee gets the monetary value, but no leave days are added to next year
                    // No balance update needed - the days are already deducted from closing year balance
                    // The encashment is tracked in the request record for audit purposes
                }
                // Mark as processed to prevent double credit
                request.isProcessed = true;
            }
        }
        // If rejected, no balance changes and no processing flag

        request.status = newStatus;
        request.approvedBy = req.user.userId;
        request.approvedAt = new Date();

        if (newStatus === 'Rejected' && rejectionNotes) {
            request.rejectionNotes = rejectionNotes;
        } else if (newStatus === 'Approved') {
            request.rejectionNotes = undefined;
        }

        await employee.save({ session });
        await request.save({ session });

        // PHASE 2: Year-End requests don't have specific leave dates, so no attendance sync needed
        // Year-End is about balance management, not daily attendance
        // However, if in the future Year-End requests include dates, sync logic would go here

        await session.commitTransaction();

        // Invalidate dashboard, pending-leaves, and leave analytics so Admin Leaves and dashboard show fresh data
        const cacheServiceYedPatch = require('../services/cacheService');
        const todayISTYedPatch = getTodayISTKey();
        cacheServiceYedPatch.invalidatePendingLeaves(todayISTYedPatch);
        cacheServiceYedPatch.invalidateDashboard(todayISTYedPatch);
        cacheServiceYedPatch.invalidateLeaveAnalytics();

        // Send notification to employee
        const NewNotificationService = require('../services/NewNotificationService');
        await NewNotificationService.notifyYearEndLeaveResponse(
            request.employee,
            employee.fullName,
            newStatus,
            leaveType,
            days,
            subType
        ).catch(err => console.error('Error sending Year-End response notification:', err));

        // Include year-to-year mapping information in response
        const closingYear = request.yearEndYear;
        const targetYear = closingYear + 1;

        res.json({
            message: `Year-End request has been ${newStatus.toLowerCase()}.`,
            request,
            yearMapping: {
                closingYear: closingYear,
                targetYear: targetYear,
                action: subType === 'CARRY_FORWARD'
                    ? `${days} ${leaveType} leaves carried forward from ${closingYear} → ${targetYear}`
                    : `${days} ${leaveType} leaves encashed for ${closingYear}`,
                affectedYear: targetYear
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error(`Error updating Year-End request status for ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to update Year-End request status.' });
    } finally {
        session.endSession();
    }
});

// DELETE /api/admin/leaves/year-end/:id
// Delete Year-End request (Pending or Approved with rollback)
router.delete('/leaves/year-end/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const request = await LeaveRequest.findById(id).session(session);
        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Year-End request not found.' });
        }

        if (request.requestType !== 'YEAR_END') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'This is not a Year-End leave request.' });
        }

        // Block deletion of Rejected requests (they don't affect balances anyway)
        if (request.status === 'Rejected') {
            await session.abortTransaction();
            return res.status(403).json({
                error: 'Cannot delete a Rejected Year-End request.'
            });
        }

        const employee = await User.findById(request.employee).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Handle APPROVED requests with rollback
        if (request.status === 'Approved') {
            const leaveType = request.yearEndLeaveType;
            const days = request.yearEndDays;
            const subType = request.yearEndSubType;

            if (!leaveType || !days || !subType) {
                await session.abortTransaction();
                return res.status(400).json({
                    error: 'Invalid Year-End request data. Cannot perform rollback.'
                });
            }

            // Map leaveType to balance field
            const balanceField = leaveType === 'Sick' ? 'sick' : leaveType === 'Casual' ? 'casual' : 'paid';

            // Perform rollback based on action type
            // CRITICAL: Rollback must reverse the year-end action correctly
            // For CARRY_FORWARD: Balance was set to (defaultEntitlement + days)
            // Rollback: Set back to defaultEntitlement (remove carried forward days)
            // For ENCASH: No balance change was made (leaves were already used)
            // Rollback: No change needed (encashment doesn't affect balance)
            const defaultEntitlement = employee.leaveEntitlements[balanceField] || 0;

            if (subType === 'CARRY_FORWARD') {
                // Rollback: Remove the carried-forward days
                // The balance was set to: defaultEntitlement + days
                // Rollback to: defaultEntitlement (remove the carry forward)
                employee.leaveBalances[balanceField] = defaultEntitlement;
            } else if (subType === 'ENCASH') {
                // Rollback: No balance change needed for encashment
                // Encashment doesn't add to balance - it just pays out the remaining days
                // The balance was already reduced when leaves were used during the closing year
                // No rollback needed
            }

            await employee.save({ session });
        }
        // For PENDING requests, no balance changes needed

        // Store request data for notification before deletion
        const requestData = {
            employeeId: request.employee,
            employeeName: employee.fullName,
            leaveType: request.yearEndLeaveType,
            year: request.yearEndYear || new Date().getFullYear(),
            status: request.status
        };

        // Delete the request
        await LeaveRequest.findByIdAndDelete(id).session(session);

        await session.commitTransaction();

        // Invalidate dashboard and pending-leaves cache so dashboard shows fresh data
        const cacheServiceYed = require('../services/cacheService');
        const todayISTYed = getTodayISTKey();
        cacheServiceYed.invalidatePendingLeaves(todayISTYed);
        cacheServiceYed.invalidateDashboard(todayISTYed);
        cacheServiceYed.invalidateLeaveAnalytics();

        // Send notification to employee (only for APPROVED requests that were rolled back)
        if (requestData.status === 'Approved') {
            const NewNotificationService = require('../services/NewNotificationService');
            await NewNotificationService.createAndEmitNotification({
                message: `Your Year-End leave request for ${requestData.leaveType} (${requestData.year}) has been deleted by Admin. Leave balance changes have been reverted.`,
                userId: requestData.employeeId,
                userName: requestData.employeeName,
                type: 'leave_rejection',
                recipientType: 'user',
                category: 'leave',
                priority: 'high',
                navigationData: { page: '/leaves' },
                metadata: {
                    type: 'YEAR_END_LEAVE_DELETED',
                    leaveType: requestData.leaveType,
                    year: requestData.year
                }
            });
        }

        res.json({
            message: requestData.status === 'Approved'
                ? 'Year-End request deleted successfully. Leave balance changes have been reverted.'
                : 'Year-End request deleted successfully.',
            deletedRequest: {
                _id: id,
                employee: requestData.employeeId,
                yearEndLeaveType: requestData.leaveType,
                yearEndYear: requestData.year,
                status: requestData.status,
                rolledBack: requestData.status === 'Approved'
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error(`Error deleting Year-End request for ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to delete Year-End request.' });
    } finally {
        session.endSession();
    }
});

// POST /api/admin/attendance/override-half-day - Override half-day marking for an attendance log
// NEW: Accepts overrideReason in request body
router.post('/attendance/override-half-day', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { attendanceLogId } = req.body;

        // Validate required fields
        if (!attendanceLogId) {
            return res.status(400).json({
                success: false,
                error: 'attendanceLogId is required.'
            });
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(attendanceLogId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid attendanceLogId format.'
            });
        }

        // Find the attendance log with user and shiftGroup populated
        const log = await AttendanceLog.findById(attendanceLogId)
            .populate({
                path: 'user',
                select: 'fullName employeeCode shiftGroup',
                populate: {
                    path: 'shiftGroup',
                    select: 'startTime endTime durationHours shiftType name'
                }
            });
        if (!log) {
            return res.status(404).json({
                success: false,
                error: 'Attendance log not found.'
            });
        }

        // Block overrides on future dates
        const { getISTDateString } = require('../utils/istTime');
        const todayIST = getISTDateString();
        if (log.attendanceDate > todayIST) {
            return res.status(400).json({
                success: false,
                error: 'Cannot override a future date. Overrides can only be applied to past or today\'s attendance.'
            });
        }

        // Get override reason from request body (required for audit trail)
        const { overrideReason, newStatus } = req.body;

        // Validate override reason if provided (should be mandatory for proper audit trail)
        if (!overrideReason || typeof overrideReason !== 'string' || overrideReason.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'overrideReason is required when overriding half-day status.'
            });
        }

        // Store original values for audit logging
        const originalStatus = log.attendanceStatus;
        const originalIsHalfDay = log.isHalfDay;
        const originalAdminOverride = log.adminOverride;
        const originalHalfDayReason = log.halfDayReasonText;

        // Override half-day: Set adminOverride flag and recompute status
        log.adminOverride = 'Override Half Day';
        log.isHalfDay = false;

        // Clear half-day reason fields (overriding removes half-day status)
        log.halfDayReasonCode = null;
        log.halfDayReasonText = '';
        log.halfDaySource = null;

        // Set override tracking fields
        log.overriddenByAdmin = true;
        log.overriddenAt = new Date();
        log.overriddenBy = req.user.userId;
        log.overrideReason = overrideReason.trim();

        // CRITICAL: Recompute late/half-day status from FIRST check-in time
        // This ensures derived state is always correct after override
        // CRITICAL FIX: Use FIRST session's startTime, not stored clockInTime
        if (log.clockInTime && log.user && log.user.shiftGroup && log.user.shiftGroup.startTime) {
            const AttendanceSession = require('../models/AttendanceSession');
            const firstSession = await AttendanceSession.findOne({ 
                attendanceLog: log._id 
            }).sort({ startTime: 1 }).select('startTime').lean();
            
            const clockInTimeForRecalc = (firstSession && firstSession.startTime) 
                ? new Date(firstSession.startTime)
                : new Date(log.clockInTime);
            
            const recalculatedStatus = await recalculateLateStatus(
                clockInTimeForRecalc,
                log.user.shiftGroup,
                null, // gracePeriodMinutes (will be fetched from settings)
                log.totalWorkingHours // Pass working hours for priority logic
            );

            // Since we're overriding half-day, we need to determine the correct status
            // If the employee was actually late (beyond grace period), mark as Late
            // Otherwise, mark as On-time
            if (recalculatedStatus.lateMinutes > 0) {
                const GRACE_PERIOD_MINUTES = await getGracePeriodMinutes();
                if (recalculatedStatus.lateMinutes <= GRACE_PERIOD_MINUTES) {
                    // Within grace period - On-time
                    log.attendanceStatus = 'On-time';
                    log.isLate = false;
                    log.lateMinutes = recalculatedStatus.lateMinutes;
                } else {
                    // Beyond grace period - Late (but not half-day due to override)
                    log.attendanceStatus = 'Late';
                    log.isLate = true;
                    log.lateMinutes = recalculatedStatus.lateMinutes;
                }
            } else {
                // Not late - On-time
                log.attendanceStatus = 'On-time';
                log.isLate = false;
                log.lateMinutes = 0;
            }
        } else {
            // No clock-in time or shift info - default to On-time
            log.attendanceStatus = 'On-time';
            log.isLate = false;
            log.lateMinutes = 0;
        }

        // Save the updated log (DO NOT DELETE - just update status)
        await log.save();

        // Emit Socket.IO event to notify all clients about the attendance log update
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user._id || log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    isLate: log.isLate,
                    totalWorkingHours: log.totalWorkingHours,
                    clockInTime: log.clockInTime,
                    clockOutTime: log.clockOutTime,
                    adminOverride: log.adminOverride,
                    previousStatus: originalStatus,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Half-day override applied: ${originalStatus} → ${log.attendanceStatus}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for override on log ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // Log the admin action for audit trail
        try {
            const logAction = require('../services/logAction');
            await logAction(
                req.user.userId,
                'OVERRIDE_HALF_DAY',
                {
                    attendanceLogId: log._id,
                    attendanceDate: log.attendanceDate,
                    employeeId: log.user._id || log.user,
                    employeeName: log.user.fullName || 'Unknown',
                    previousStatus: originalStatus,
                    previousIsHalfDay: originalIsHalfDay,
                    newStatus: log.attendanceStatus,
                    newIsHalfDay: log.isHalfDay,
                    adminOverride: log.adminOverride,
                    details: `Admin override: Half-day marking removed for ${log.attendanceDate}. Status changed from "${originalStatus}" to "${log.attendanceStatus}". Override reason: "${overrideReason}". Previous half-day reason: "${originalHalfDayReason || 'None'}"`
                }
            );
        } catch (logError) {
            console.error('Failed to log override action:', logError);
            // Don't fail the main request if logging fails
        }

        res.status(200).json({
            success: true,
            message: 'Half day overridden successfully.',
            log: {
                _id: log._id,
                attendanceDate: log.attendanceDate,
                attendanceStatus: log.attendanceStatus,
                isHalfDay: log.isHalfDay,
                isLate: log.isLate,
                lateMinutes: log.lateMinutes,
                adminOverride: log.adminOverride,
                overrideReason: log.overrideReason,
                overriddenByAdmin: log.overriddenByAdmin,
                overriddenAt: log.overriddenAt,
                previousStatus: originalStatus,
                previousHalfDayReason: originalHalfDayReason
            }
        });

    } catch (error) {
        console.error('Error overriding half-day status:', error);
        console.error('Error stack:', error.stack);
        console.error('Request details:', {
            attendanceLogId: req.body.attendanceLogId,
            userId: req.user?.userId
        });
        res.status(500).json({
            success: false,
            error: 'Server error while overriding half-day status.',
            details: error.message
        });
    }
});

// PATCH /api/admin/attendance/override/:logId - Update override note
// Only applies to logs that are already overridden. Updates existing record; no delete.
router.patch('/attendance/override/:logId', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const logId = req.params.logId;
        const { overrideReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(logId)) {
            return res.status(400).json({ success: false, error: 'Invalid log ID.' });
        }
        if (!overrideReason || typeof overrideReason !== 'string' || overrideReason.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'overrideReason is required and must be a non-empty string.' });
        }

        const log = await AttendanceLog.findById(logId)
            .populate({ path: 'user', select: 'fullName employeeCode', populate: { path: 'shiftGroup', select: 'startTime endTime' } });
        if (!log) {
            return res.status(404).json({ success: false, error: 'Attendance log not found.' });
        }
        if (log.overriddenByAdmin !== true) {
            return res.status(400).json({ success: false, error: 'Log is not overridden. Use apply-override first.' });
        }

        const previousNote = log.overrideReason || '';
        log.overrideReason = overrideReason.trim();
        log.overriddenAt = new Date();
        log.overriddenBy = req.user.userId;
        await log.save();

        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user._id || log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    overrideReason: log.overrideReason,
                    overriddenByAdmin: log.overriddenByAdmin,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: 'Override updated.'
                });
            }
        } catch (e) { /* ignore */ }

        try {
            const logAction = require('../services/logAction');
            await logAction(req.user.userId, 'UPDATE_OVERRIDE', {
                attendanceLogId: log._id,
                attendanceDate: log.attendanceDate,
                previousNote,
                newNote: log.overrideReason,
                details: `Override note updated for ${log.attendanceDate}.`
            });
        } catch (e) { /* ignore */ }

        return res.status(200).json({
            success: true,
            message: 'Override updated successfully.',
            log: {
                _id: log._id,
                attendanceDate: log.attendanceDate,
                overrideReason: log.overrideReason,
                overriddenByAdmin: log.overriddenByAdmin,
                overriddenAt: log.overriddenAt
            }
        });
    } catch (err) {
        console.error('Error updating override:', err);
        return res.status(500).json({ success: false, error: 'Server error while updating override.', details: err.message });
    }
});

// POST /api/admin/attendance/remove-override - Clear override and restore system-calculated status
// Does NOT delete the attendance record. Clears override fields and recalculates status.
router.post('/attendance/remove-override', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { attendanceLogId } = req.body;
        if (!attendanceLogId || !mongoose.Types.ObjectId.isValid(attendanceLogId)) {
            return res.status(400).json({ success: false, error: 'Valid attendanceLogId is required.' });
        }

        const log = await AttendanceLog.findById(attendanceLogId)
            .populate({ path: 'user', select: 'fullName employeeCode shiftGroup', populate: { path: 'shiftGroup', select: 'startTime endTime' } });
        if (!log) {
            return res.status(404).json({ success: false, error: 'Attendance log not found.' });
        }

        const previousOverride = !!log.overriddenByAdmin;
        const previousStatus = log.attendanceStatus;
        const previousNote = log.overrideReason || '';

        // Clear override-specific fields (do NOT delete the log)
        log.overriddenByAdmin = false;
        log.overrideReason = '';
        log.overrideType = null;
        log.adminOverride = 'None';
        log.overriddenAt = null;
        log.overriddenBy = null;

        // Restore system-calculated status from first check-in and working hours
        if (log.clockInTime && log.user?.shiftGroup?.startTime) {
            const AttendanceSessionModel = require('../models/AttendanceSession');
            const first = await AttendanceSessionModel.findOne({ attendanceLog: log._id }).sort({ startTime: 1 }).select('startTime').lean();
            const clockIn = (first?.startTime) ? new Date(first.startTime) : new Date(log.clockInTime);
            const recalc = await recalculateLateStatus(
                clockIn,
                log.user.shiftGroup,
                null,
                log.totalWorkingHours
            );
            log.isLate = recalc.isLate;
            log.isHalfDay = recalc.isHalfDay;
            log.lateMinutes = recalc.lateMinutes;
            log.attendanceStatus = recalc.attendanceStatus;
            log.halfDayReasonCode = recalc.halfDayReasonCode || null;
            log.halfDayReasonText = recalc.halfDayReasonText || '';
            log.halfDaySource = recalc.isHalfDay ? 'AUTO' : null;
        } else {
            log.isLate = false;
            log.isHalfDay = false;
            log.lateMinutes = 0;
            log.attendanceStatus = log.clockInTime ? 'On-time' : 'Absent';
            log.halfDayReasonCode = null;
            log.halfDayReasonText = '';
            log.halfDaySource = null;
        }

        await log.save();

        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user._id || log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    overrideReason: null,
                    overriddenByAdmin: false,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Override removed. Status restored to ${log.attendanceStatus}.`
                });
            }
        } catch (e) { /* ignore */ }

        try {
            const logAction = require('../services/logAction');
            await logAction(req.user.userId, 'REMOVE_OVERRIDE', {
                attendanceLogId: log._id,
                attendanceDate: log.attendanceDate,
                previousStatus: previousStatus,
                previousNote,
                newStatus: log.attendanceStatus,
                details: `Override removed for ${log.attendanceDate}. Status restored from "${previousStatus}" to "${log.attendanceStatus}".`
            });
        } catch (e) { /* ignore */ }

        return res.status(200).json({
            success: true,
            message: 'Override removed. System attendance status restored.',
            log: {
                _id: log._id,
                attendanceDate: log.attendanceDate,
                attendanceStatus: log.attendanceStatus,
                isHalfDay: log.isHalfDay,
                overriddenByAdmin: false,
                overrideReason: null
            }
        });
    } catch (err) {
        console.error('Error removing override:', err);
        return res.status(500).json({ success: false, error: 'Server error while removing override.', details: err.message });
    }
});

const { generateDateRange } = require('../utils/attendanceStatusResolver');

// POST /api/admin/attendance/bulk-override - Global form-based override: apply to all or selected employees, date/range
router.post('/attendance/bulk-override', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { employeeScope, startDate, endDate, overrideType, overrideNote } = req.body;

        if (!overrideType || !['fullday', 'halfday', 'holiday', 'leave'].includes(overrideType)) {
            return res.status(400).json({ success: false, error: 'overrideType is required and must be one of: fullday, halfday, holiday, leave.' });
        }
        if (!overrideNote || typeof overrideNote !== 'string' || overrideNote.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'overrideNote is required and must be a non-empty string.' });
        }
        if (!startDate || typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
            return res.status(400).json({ success: false, error: 'startDate is required in YYYY-MM-DD format.' });
        }

        const start = startDate.trim();
        const end = (endDate && typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim()))
            ? endDate.trim()
            : start;
        if (start > end) {
            return res.status(400).json({ success: false, error: 'startDate must be before or equal to endDate.' });
        }

        const { getISTDateString } = require('../utils/istTime');
        const todayIST = getISTDateString();
        if (start > todayIST) {
            return res.status(400).json({
                success: false,
                error: 'Cannot override future dates. startDate must be today or earlier.'
            });
        }
        // Clamp end date to today if end > today (partial range is allowed)
        const effectiveEnd = end > todayIST ? todayIST : end;

        const MAX_OVERRIDE_DAYS = 31;
        const { generateDateRange: countDates } = require('../utils/attendanceStatusResolver');
        const dateCount = countDates(start, effectiveEnd).length;
        if (dateCount > MAX_OVERRIDE_DAYS) {
            return res.status(400).json({
                success: false,
                error: `Date range too large (${dateCount} days). Maximum allowed is ${MAX_OVERRIDE_DAYS} days per bulk override operation.`
            });
        }

        const defaultShiftMinutes = 480;
        let employeeIds = [];
        let shiftMinutesMap = new Map();
        
        if (employeeScope === 'all') {
            const users = await User.find({ role: { $ne: 'Admin' }, isActive: true }).select('_id shiftGroup').populate('shiftGroup', 'durationHours').lean();
            employeeIds = users.map((u) => u._id);
            // Build shiftMinutes lookup from the already-fetched data
            users.forEach(u => {
                const minutes = (u.shiftGroup?.durationHours != null)
                    ? Math.round(Number(u.shiftGroup.durationHours) * 60)
                    : defaultShiftMinutes;
                shiftMinutesMap.set(u._id.toString(), minutes);
            });
        } else if (Array.isArray(employeeScope) && employeeScope.length > 0) {
            const valid = employeeScope.filter((id) => mongoose.Types.ObjectId.isValid(id));
            const users = await User.find({ _id: { $in: valid }, role: { $ne: 'Admin' }, isActive: true }).select('_id shiftGroup').populate('shiftGroup', 'durationHours').lean();
            employeeIds = users.map((u) => u._id);
            users.forEach(u => {
                const minutes = (u.shiftGroup?.durationHours != null)
                    ? Math.round(Number(u.shiftGroup.durationHours) * 60)
                    : defaultShiftMinutes;
                shiftMinutesMap.set(u._id.toString(), minutes);
            });
        }
        if (employeeIds.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one employee must be selected. Use employeeScope: "all" or an array of employee IDs.' });
        }

        const dates = generateDateRange(start, effectiveEnd);
        const getIO = require('../socketManager').getIO;
        const io = getIO && getIO();
        const logAction = require('../services/logAction');
        const note = overrideNote.trim();
        const adminUserId = req.user.userId;
        let appliedCount = 0;

        const adminOverrideLabel = overrideType === 'fullday' ? 'Override Full Day' : overrideType === 'holiday' ? 'Override Holiday' : overrideType === 'leave' ? 'Override Leave' : 'Override Half Day';
        const isHalfDay = overrideType === 'halfday';
        const status = overrideType === 'leave' ? 'Leave' : (isHalfDay ? 'Half-day' : 'On-time');

        // PERFORMANCE FIX: Pre-load ALL existing logs for all employees × all dates in ONE query.
        // Previously: nested for-loops with findOne per (employee, date) = up to 1,400 DB queries.
        // Now: 1 find + 1 bulkWrite regardless of how many employees/days are selected.
        const existingLogs = await AttendanceLog.find({
            user: { $in: employeeIds },
            attendanceDate: { $in: dates }
        }).lean();

        // Build a lookup map: "userId_dateStr" → log
        const logMap = new Map();
        existingLogs.forEach(log => {
            logMap.set(`${log.user.toString()}_${log.attendanceDate}`, log);
        });

        // Collect leave conflicts to resolve (logs that reference an approved leave and we're not applying 'leave' override)
        const leaveConflicts = [];
        if (overrideType !== 'leave') {
            existingLogs.forEach(log => {
                if (log.leaveRequest) {
                    leaveConflicts.push(log);
                }
            });
        }

        // Resolve leave conflicts: fetch all referenced leave requests in one batch query
        if (leaveConflicts.length > 0) {
            const leaveIds = leaveConflicts.map(l => l.leaveRequest).filter(Boolean);
            const leaveRequests = await LeaveRequest.find({ _id: { $in: leaveIds }, status: 'Approved' }).lean();
            const leaveMap = new Map(leaveRequests.map(lr => [lr._id.toString(), lr]));

            const leaveUpdateOps = [];
            const userLeaveBalanceUpdates = new Map(); // userId → { field, delta }

            for (const log of leaveConflicts) {
                const leaveReq = leaveMap.get(log.leaveRequest?.toString());
                if (!leaveReq) continue;

                const typeToField = {
                    'Planned': 'paid', 'Sick': 'sick', 'Casual': 'casual',
                    'Loss of Pay': 'lop', 'Compensatory': 'compensatory',
                    'Backdated Leave': 'paid', 'Comp-Off': 'compensatory',
                };
                const leaveField = typeToField[leaveReq.requestType];
                const leaveDuration = leaveReq.leaveType === 'Full Day' ? 1 : 0.5;

                if (leaveField) {
                    const key = `${leaveReq.employee.toString()}_${leaveField}`;
                    userLeaveBalanceUpdates.set(key, (userLeaveBalanceUpdates.get(key) || 0) + leaveDuration);
                }

                leaveUpdateOps.push({
                    updateOne: {
                        filter: { _id: leaveReq._id },
                        update: {
                            $set: {
                                status: 'Rejected',
                                rejectionNotes: `Admin bulk override changed attendance to '${overrideType}'. Leave auto-cancelled. Override reason: ${note}`
                            }
                        }
                    }
                });
            }

            // Apply all leave rejections in one bulkWrite
            if (leaveUpdateOps.length > 0) {
                await LeaveRequest.bulkWrite(leaveUpdateOps, { ordered: false });
            }

            // Apply leave balance restorations (group by userId and field)
            const balanceUpdateOps = [];
            for (const [key, delta] of userLeaveBalanceUpdates) {
                const [uid, field] = key.split('_');
                balanceUpdateOps.push({
                    updateOne: {
                        filter: { _id: uid },
                        update: { $inc: { [`leaveBalances.${field}`]: delta } }
                    }
                });
            }
            if (balanceUpdateOps.length > 0) {
                await User.bulkWrite(balanceUpdateOps, { ordered: false });
            }
        }

        // Build bulkWrite operations for attendance log upserts
        const overrideTimestamp = new Date();
        const attendanceBulkOps = [];

        for (const eid of employeeIds) {
            const shiftMinutes = shiftMinutesMap.get(eid.toString()) ?? defaultShiftMinutes;

            for (const dateStr of dates) {
                const existingLog = logMap.get(`${eid.toString()}_${dateStr}`);
                appliedCount++;

                const updateFields = {
                    overriddenByAdmin: true,
                    overrideType,
                    overrideReason: note,
                    adminOverride: adminOverrideLabel,
                    overriddenAt: overrideTimestamp,
                    overriddenBy: adminUserId,
                    attendanceStatus: status,
                    isHalfDay,
                    isLate: false,
                    lateMinutes: 0,
                    halfDayReasonCode: isHalfDay ? 'MANUAL_ADMIN' : null,
                    halfDayReasonText: isHalfDay ? note : '',
                    halfDaySource: isHalfDay ? 'MANUAL' : null,
                    // Detach any leave reference when conflict was resolved above
                    ...(existingLog?.leaveRequest && overrideType !== 'leave' ? { leaveRequest: null } : {})
                };

                if (!existingLog) {
                    // No existing log: insert a new one
                    attendanceBulkOps.push({
                        insertOne: {
                            document: {
                                user: eid,
                                attendanceDate: dateStr,
                                shiftDurationMinutes: shiftMinutes,
                                penaltyMinutes: 0,
                                paidBreakMinutesTaken: 0,
                                unpaidBreakMinutesTaken: 0,
                                totalWorkingHours: isHalfDay ? 0 : (shiftMinutes / 60),
                                ...updateFields
                            }
                        }
                    });
                } else {
                    // Existing log: update it
                    attendanceBulkOps.push({
                        updateOne: {
                            filter: { _id: existingLog._id },
                            update: { $set: updateFields }
                        }
                    });
                }

                // Emit socket event for real-time dashboard update
                try {
                    if (io) {
                        io.emit('attendance_log_updated', {
                            logId: existingLog?._id,
                            userId: eid,
                            attendanceDate: dateStr,
                            attendanceStatus: status,
                            isHalfDay,
                            overrideReason: note,
                            overriddenByAdmin: true,
                            overrideType,
                            updatedBy: adminUserId,
                            timestamp: overrideTimestamp.toISOString(),
                            message: 'Bulk override applied.',
                        });
                    }
                } catch (e) { /* ignore socket errors */ }
            }
        }

        // Execute all attendance updates in one bulkWrite
        if (attendanceBulkOps.length > 0) {
            await AttendanceLog.bulkWrite(attendanceBulkOps, { ordered: false });
        }

        try {
            await logAction(adminUserId, 'BULK_OVERRIDE', {
                employeeScope: employeeScope === 'all' ? 'all' : employeeIds.length,
                startDate: start,
                endDate: effectiveEnd,
                overrideType,
                overrideNote: note,
                appliedCount,
                details: `Bulk override: ${overrideType} for ${appliedCount} record(s) from ${start} to ${end}.`,
            });
        } catch (e) { /* ignore */ }

        return res.status(200).json({
            success: true,
            message: `Override applied to ${appliedCount} attendance record(s).`,
            appliedCount,
        });
    } catch (err) {
        console.error('Error in bulk-override:', err);
        return res.status(500).json({ success: false, error: 'Server error while applying bulk override.', details: err.message });
    }
});

// POST /api/admin/attendance/absent-to-leave
// Convert absent days to leave for permanent employees (employmentStatus = 'Permanent').
// Deducts leave balance per employee. Only processes days where the employee was absent.
router.post('/attendance/absent-to-leave', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { employeeScope, startDate, endDate, leaveType, maxDaysPerEmployee, overrideNote } = req.body;

        const validLeaveTypes = ['Sick', 'Casual', 'Planned'];
        if (!leaveType || !validLeaveTypes.includes(leaveType)) {
            return res.status(400).json({ success: false, error: `leaveType must be one of: ${validLeaveTypes.join(', ')}` });
        }
        if (!overrideNote || typeof overrideNote !== 'string' || overrideNote.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'overrideNote is required.' });
        }
        if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
            return res.status(400).json({ success: false, error: 'startDate is required in YYYY-MM-DD format.' });
        }

        const maxDays = (typeof maxDaysPerEmployee === 'number' && maxDaysPerEmployee >= 1 && maxDaysPerEmployee <= 3)
            ? maxDaysPerEmployee : 3;

        const start = startDate.trim();
        const { getISTDateString } = require('../utils/istTime');
        const todayIST = getISTDateString();
        const end = (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) ? endDate.trim() : start;
        const effectiveEnd = end > todayIST ? todayIST : end;

        if (start > todayIST) {
            return res.status(400).json({ success: false, error: 'Cannot convert future dates.' });
        }
        if (start > effectiveEnd) {
            return res.status(400).json({ success: false, error: 'startDate must be before or equal to endDate.' });
        }

        const { generateDateRange } = require('../utils/attendanceStatusResolver');
        const dates = generateDateRange(start, effectiveEnd);
        if (dates.length > 31) {
            return res.status(400).json({ success: false, error: 'Maximum 31 days allowed per operation.' });
        }

        // Map leaveType → leaveBalances field
        const leaveTypeToField = { 'Sick': 'sick', 'Casual': 'casual', 'Planned': 'paid' };
        const balanceField = leaveTypeToField[leaveType];
        const adminUserId = req.user.userId;
        const note = overrideNote.trim();

        // ── KEY FIX: filter by employmentStatus: 'Permanent' (not probationStatus) ──
        const permanentFilter = { employmentStatus: 'Permanent', role: { $ne: 'Admin' }, isActive: true };

        let employeeIds = [];
        if (employeeScope === 'all') {
            const users = await User.find(permanentFilter).select('_id').lean();
            employeeIds = users.map(u => u._id);
        } else if (Array.isArray(employeeScope) && employeeScope.length > 0) {
            const valid = employeeScope.filter(id => mongoose.Types.ObjectId.isValid(id));
            const users = await User.find({ _id: { $in: valid }, ...permanentFilter }).select('_id fullName').lean();
            employeeIds = users.map(u => u._id);

            // If caller selected specific employees but none are Permanent, give a clear message
            if (employeeIds.length === 0) {
                const anyUsers = await User.find({ _id: { $in: valid } }).select('fullName employmentStatus').lean();
                const detail = anyUsers.map(u => `${u.fullName} (${u.employmentStatus || 'unknown status'})`).join(', ');
                return res.status(400).json({
                    success: false,
                    error: `None of the selected employees have Permanent employment status. Selected: ${detail}. Only employees with employmentStatus = "Permanent" can have absences converted to leave.`
                });
            }
        }

        if (employeeIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No permanent employees found in the selected scope.' });
        }

        // Load all attendance logs for selected employees × dates
        const existingLogs = await AttendanceLog.find({
            user: { $in: employeeIds },
            attendanceDate: { $in: dates },
        }).lean();

        const userLogsMap = new Map();
        for (const log of existingLogs) {
            const uid = log.user.toString();
            if (!userLogsMap.has(uid)) userLogsMap.set(uid, []);
            userLogsMap.get(uid).push(log);
        }

        const attendanceBulkOps = [];
        const balanceBulkOps = [];
        const leaveRequestDocs = [];
        const overrideTs = new Date();
        let convertedCount = 0;
        let skippedCount = 0;

        // Fetch current leave balances for all matched employees
        const usersWithBalance = await User.find({ _id: { $in: employeeIds } }).select('_id leaveBalances').lean();
        const balanceMap = new Map(usersWithBalance.map(u => [u._id.toString(), { ...u.leaveBalances }]));

        for (const eid of employeeIds) {
            const uid = eid.toString();
            const logsByDate = new Map((userLogsMap.get(uid) || []).map(l => [l.attendanceDate, l]));
            let daysConverted = 0;
            let deducted = 0;

            for (const dateStr of dates) {
                if (daysConverted >= maxDays) break;

                const log = logsByDate.get(dateStr);
                // Only convert truly absent days (no clock-in, not already overridden, not leave/holiday)
                const isAbsent = !log
                    || log.attendanceStatus === 'Absent'
                    || (!log.clockInTime && !log.overriddenByAdmin && log.attendanceStatus !== 'Leave' && log.attendanceStatus !== 'Holiday');

                if (!isAbsent) continue;

                const balance = balanceMap.get(uid);
                if (!balance || (balance[balanceField] || 0) < 1) {
                    skippedCount++;
                    continue;
                }

                balance[balanceField] = (balance[balanceField] || 0) - 1;
                deducted++;
                daysConverted++;
                convertedCount++;

                leaveRequestDocs.push({
                    employee: eid,
                    requestType: leaveType,
                    leaveType: 'Full Day',
                    leaveDates: [new Date(dateStr)],
                    reason: `Admin bulk convert: ${note}`,
                    status: 'Approved',
                    approvedBy: adminUserId,
                    approvedAt: overrideTs,
                    isBackdated: true,
                });

                if (log) {
                    attendanceBulkOps.push({
                        updateOne: {
                            filter: { _id: log._id },
                            update: { $set: {
                                attendanceStatus: 'Leave',
                                overriddenByAdmin: true,
                                overrideType: 'leave',
                                overrideReason: note,
                                adminOverride: `Convert Absent to ${leaveType} Leave`,
                                overriddenAt: overrideTs,
                                overriddenBy: adminUserId,
                                isHalfDay: false, isLate: false, lateMinutes: 0,
                            }}
                        }
                    });
                } else {
                    attendanceBulkOps.push({
                        insertOne: {
                            document: {
                                user: eid, attendanceDate: dateStr,
                                attendanceStatus: 'Leave',
                                overriddenByAdmin: true, overrideType: 'leave',
                                overrideReason: note,
                                adminOverride: `Convert Absent to ${leaveType} Leave`,
                                overriddenAt: overrideTs, overriddenBy: adminUserId,
                                isHalfDay: false, isLate: false, lateMinutes: 0,
                                penaltyMinutes: 0, paidBreakMinutesTaken: 0,
                                unpaidBreakMinutesTaken: 0, totalWorkingHours: 0, shiftDurationMinutes: 480,
                            }
                        }
                    });
                }
            }

            if (deducted > 0) {
                balanceBulkOps.push({
                    updateOne: {
                        filter: { _id: eid },
                        update: { $inc: { [`leaveBalances.${balanceField}`]: -deducted } }
                    }
                });
            }
        }

        if (leaveRequestDocs.length > 0) await LeaveRequest.insertMany(leaveRequestDocs, { ordered: false });
        if (attendanceBulkOps.length > 0) await AttendanceLog.bulkWrite(attendanceBulkOps, { ordered: false });
        if (balanceBulkOps.length > 0) await User.bulkWrite(balanceBulkOps, { ordered: false });

        try {
            const logAction = require('../services/logAction');
            await logAction(adminUserId, 'ABSENT_TO_LEAVE_BULK', {
                employeeScope: employeeScope === 'all' ? 'all' : employeeIds.length,
                startDate: start, endDate: effectiveEnd,
                leaveType, maxDaysPerEmployee: maxDays,
                convertedCount, skippedCount, overrideNote: note,
            });
        } catch (e) { /* ignore */ }

        return res.status(200).json({
            success: true,
            message: `Converted ${convertedCount} absent day(s) to ${leaveType} leave.`,
            convertedCount,
            skippedCount,
            employeesProcessed: employeeIds.length,
        });

    } catch (err) {
        console.error('Error in absent-to-leave:', err);
        return res.status(500).json({ success: false, error: 'Server error during absent-to-leave conversion.', details: err.message });
    }
});

// PUT /api/admin/attendance/half-day/:logId - Toggle half-day status for an attendance log
router.put('/attendance/half-day/:logId', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { logId } = req.params;
        const { isHalfDay } = req.body;

        if (!mongoose.Types.ObjectId.isValid(logId)) {
            return res.status(400).json({ error: 'Invalid log ID.' });
        }

        if (typeof isHalfDay !== 'boolean') {
            return res.status(400).json({ error: 'isHalfDay must be a boolean value.' });
        }

        const log = await AttendanceLog.findById(logId);
        if (!log) {
            return res.status(404).json({ error: 'Attendance log not found.' });
        }

        // Store the original status for logging
        const originalStatus = log.attendanceStatus;
        const wasHalfDay = log.isHalfDay;

        // Update the half-day status
        log.isHalfDay = isHalfDay;

        // Enhanced status transition logic
        if (isHalfDay && !wasHalfDay) {
            // Marking as half-day - set status to Half-day regardless of current status
            log.attendanceStatus = 'Half-day';
        } else if (!isHalfDay && wasHalfDay) {
            // Unmarking half-day - recalculate status based on existing data
            if (!log.clockInTime) {
                // No clock-in time = Absent
                log.attendanceStatus = 'Absent';
            } else if (log.isLate) {
                // Has clock-in but was late = Late
                log.attendanceStatus = 'Late';
            } else {
                // Has clock-in and wasn't late = On-time
                log.attendanceStatus = 'On-time';
            }
        } else if (isHalfDay && wasHalfDay && log.attendanceStatus !== 'Half-day') {
            // Already marked as half-day but status got changed elsewhere - restore to Half-day
            log.attendanceStatus = 'Half-day';
        }

        await log.save();

        // Emit Socket.IO event to notify all clients about the attendance log update
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                // Emit to all connected clients
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    isLate: log.isLate,
                    totalWorkingHours: log.totalWorkingHours,
                    clockInTime: log.clockInTime,
                    clockOutTime: log.clockOutTime,
                    previousStatus: originalStatus,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Attendance log updated: ${originalStatus} → ${log.attendanceStatus} - Working hours: ${log.totalWorkingHours.toFixed(2)}h`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for log ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // Log the action with status transition details (with error handling)
        try {
            const logAction = require('../services/logAction');
            await logAction(
                req.user.userId,
                isHalfDay ? 'MARK_HALF_DAY' : 'UNMARK_HALF_DAY',
                {
                    attendanceLogId: log._id,
                    attendanceDate: log.attendanceDate,
                    previousStatus: originalStatus,
                    newStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    details: `${isHalfDay ? 'Marked' : 'Unmarked'} half-day for attendance log on ${log.attendanceDate}. Status changed from "${originalStatus}" to "${log.attendanceStatus}"`
                }
            );
        } catch (logError) {
            console.error('Failed to log half-day action:', logError);
            // Don't fail the main request if logging fails
        }

        res.json({
            message: `Half-day status ${isHalfDay ? 'enabled' : 'disabled'} successfully. Status changed from "${originalStatus}" to "${log.attendanceStatus}".`,
            log: {
                _id: log._id,
                attendanceDate: log.attendanceDate,
                isHalfDay: log.isHalfDay,
                attendanceStatus: log.attendanceStatus,
                previousStatus: originalStatus
            }
        });

    } catch (error) {
        console.error('Error updating half-day status:', error);
        console.error('Error stack:', error.stack);
        console.error('Request details:', {
            logId: req.params.logId,
            isHalfDay: req.body.isHalfDay,
            userId: req.user?.userId
        });
        res.status(500).json({
            error: 'Server error while updating half-day status.',
            details: error.message
        });
    }
});

/**
 * POST /api/admin/attendance/recalculate
 * Recalculate attendance records for a date range to sync with leave requests.
 * Admin-only endpoint for fixing historical data.
 */
router.post('/attendance/recalculate', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { startDate, endDate, userId } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Start date and end date are required (format: YYYY-MM-DD).'
            });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD.'
            });
        }

        const { recalculateAttendanceForDateRange, cleanupOrphanedLeaveReferences } = require('../services/attendanceRecalculationService');

        // Recalculate attendance for date range
        const recalculationResults = await recalculateAttendanceForDateRange(
            userId || null,
            startDate,
            endDate
        );

        // Clean up orphaned leave references
        const cleanupResults = await cleanupOrphanedLeaveReferences(
            userId || null,
            startDate,
            endDate
        );

        res.json({
            success: true,
            message: 'Recalculation completed.',
            recalculation: recalculationResults,
            cleanup: cleanupResults
        });
    } catch (error) {
        console.error('Error recalculating attendance:', error);
        res.status(500).json({
            error: 'Failed to recalculate attendance.',
            details: error.message
        });
    }
});

// =================================================================
// HALF-DAY LEAVE AUTO-CONVERSION ENDPOINTS
// =================================================================

/**
 * POST /api/admin/leaves/run-halfday-validation
 * Manually trigger half-day leave auto-conversion for a specific date.
 * Used for testing, staging validation, and HR revalidation.
 * 
 * SAFETY: Requires Admin role and explicit date parameter
 */
router.post('/leaves/run-halfday-validation', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { date } = req.body;
        
        if (!date) {
            return res.status(400).json({
                error: 'Date is required (format: YYYY-MM-DD).'
            });
        }
        
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD.'
            });
        }
        
        // Validate date is in the past
        const { parseISTDate, startOfISTDay } = require('../utils/istTime');
        const targetDate = parseISTDate(date);
        const today = startOfISTDay(new Date());
        
        if (targetDate >= today) {
            return res.status(400).json({
                error: 'Target date must be in the past. Cannot convert leaves for current or future dates.'
            });
        }
        
        const { autoConvertHalfDayLeaves } = require('../services/halfDayAutoConversionService');
        
        if (process.env.NODE_ENV !== 'production') console.log(`[Admin] Manual half-day conversion triggered by ${req.user.userId} for date: ${date}`);
        
        const result = await autoConvertHalfDayLeaves(date);
        
        // Invalidate cache after conversion
        const cacheService = require('../services/cacheService');
        cacheService.invalidatePendingLeaves(date);
        cacheService.invalidateDashboard(date);
        cacheService.invalidateLeaveAnalytics();
        
        res.json({
            success: true,
            message: 'Half-day leave validation completed.',
            summary: {
                targetDate: result.targetDate,
                processed: result.processed,
                converted: result.converted,
                skipped: result.skipped,
                errors: result.errors
            },
            details: result.details
        });
        
    } catch (error) {
        console.error('[Admin] Error in manual half-day validation:', error);
        res.status(500).json({
            error: 'Failed to run half-day validation.',
            details: error.message
        });
    }
});

/**
 * POST /api/admin/leaves/run-auto-revert-check
 * Manually trigger auto-revert check for incorrectly converted leaves.
 * Detects leaves that were converted to LOP but now have attendance data.
 * 
 * SAFETY: Requires Admin/HR role and explicit date parameter
 */
router.post('/leaves/run-auto-revert-check', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { date } = req.body;
        
        if (!date) {
            return res.status(400).json({
                error: 'Date is required (format: YYYY-MM-DD).'
            });
        }
        
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD.'
            });
        }
        
        const { autoRevertIncorrectConversions } = require('../services/halfDayAutoConversionService');
        
        if (process.env.NODE_ENV !== 'production') console.log(`[Admin] Manual auto-revert check triggered by ${req.user.userId} for date: ${date}`);
        
        const result = await autoRevertIncorrectConversions(date);
        
        // Invalidate cache after revert
        const cacheService = require('../services/cacheService');
        cacheService.invalidatePendingLeaves(date);
        cacheService.invalidateDashboard(date);
        cacheService.invalidateLeaveAnalytics();
        
        res.json({
            success: true,
            message: 'Auto-revert check completed.',
            summary: {
                targetDate: result.targetDate,
                checked: result.checked,
                reverted: result.reverted,
                errors: result.errors
            },
            details: result.details
        });
        
    } catch (error) {
        console.error('[Admin] Error in auto-revert check:', error);
        res.status(500).json({
            error: 'Failed to run auto-revert check.',
            details: error.message
        });
    }
});

/**
 * POST /api/admin/leaves/revert-auto-conversion/:leaveId
 * Revert an auto-converted leave back to its original state.
 * Restores original leaveType/requestType, removes auto flags, resyncs attendance, logs revert event.
 * SAFETY: Requires Admin role, validates leave was auto-converted
 */
router.post('/leaves/revert-auto-conversion/:leaveId', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { leaveId } = req.params;

        if (!leaveId) {
            return res.status(400).json({ error: 'Leave ID is required.' });
        }
        if (!mongoose.Types.ObjectId.isValid(leaveId)) {
            return res.status(400).json({ error: 'Invalid leave ID format.' });
        }

        const { revertAutoConversion } = require('../services/halfDayAutoConversionService');
        const adminUserId = req.user.userId;

        const result = await revertAutoConversion(leaveId, adminUserId);

        res.json({
            success: result.success,
            message: result.message,
            leave: {
                _id: result.leave._id,
                leaveType: result.leave.leaveType,
                requestType: result.leave.requestType,
                autoConvertedToLOP: result.leave.autoConvertedToLOP,
            },
        });
    } catch (error) {
        if (error.message === 'Leave request not found') {
            return res.status(404).json({ error: 'Leave request not found.' });
        }
        if (error.message === 'Leave was not auto-converted') {
            return res.status(400).json({ error: 'Leave was not auto-converted. Cannot revert.' });
        }
        console.error('[Admin] Error reverting auto-conversion:', error);
        res.status(500).json({
            error: 'Failed to revert auto-conversion.',
            details: error.message,
        });
    }
});

/**
 * GET /api/admin/leaves/auto-conversion-log
 * Get history of auto-converted leaves for audit purposes.
 * 
 * Query params:
 * - startDate: YYYY-MM-DD (optional)
 * - endDate: YYYY-MM-DD (optional)
 * - page: number (default: 1)
 * - limit: number (default: 50)
 */
router.get('/leaves/auto-conversion-log', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        const { startDate, endDate } = req.query;
        
        // Build query
        const query = { autoConvertedToLOP: true };
        
        if (startDate || endDate) {
            query.autoConversionDate = {};
            if (startDate) {
                const { parseISTDate, startOfISTDay } = require('../utils/istTime');
                query.autoConversionDate.$gte = startOfISTDay(parseISTDate(startDate));
            }
            if (endDate) {
                const { parseISTDate, endOfISTDay } = require('../utils/istTime');
                query.autoConversionDate.$lte = endOfISTDay(parseISTDate(endDate));
            }
        }
        
        // Fetch converted leaves with employee details
        const [conversions, totalCount] = await Promise.all([
            LeaveRequest.find(query)
                .populate('employee', 'fullName employeeCode email')
                .select('employee leaveType requestType leaveDates autoConversionDate autoConversionReason originalLeaveType originalRequestType reason')
                .sort({ autoConversionDate: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            LeaveRequest.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            conversions,
            pagination: {
                totalCount,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                limit
            }
        });
        
    } catch (error) {
        console.error('[Admin] Error fetching auto-conversion log:', error);
        res.status(500).json({
            error: 'Failed to fetch auto-conversion log.',
            details: error.message
        });
    }
});

// GET /leaves/:id - Get a single leave request by ID
// NOTE: This MUST be placed after all specific /leaves/<named-path> routes to avoid
// Express matching named paths (e.g. "year-end-requests", "employee", "all") as the :id param.
router.get('/leaves/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid leave request ID.' });
        }
        const leaveRequest = await LeaveRequest.findById(id)
            .populate('employee', 'fullName employeeCode department leaveBalances leaveEntitlements employmentStatus probationStatus')
            .lean();
        if (!leaveRequest) {
            return res.status(404).json({ error: 'Leave request not found.' });
        }
        res.json(leaveRequest);
    } catch (error) {
        console.error('Error fetching leave request by ID:', error);
        res.status(500).json({ error: 'Failed to fetch leave request.' });
    }
});

// --- Bulk attendance actions (admin summary assistant) ---
const requireBulkAttendanceActionsAccess = require('../middleware/requireBulkAttendanceActionsAccess');
const {
    getBulkActionPreview,
    executeBulkAction,
    VALID_ACTIONS,
    getTeaBreakOverruns,
} = require('../services/bulkAttendanceActionsService');

router.get('/bulk-attendance-actions/preview', [authenticateToken, requireBulkAttendanceActionsAccess], async (req, res) => {
    try {
        const preview = await getBulkActionPreview();
        res.json({ success: true, actions: preview });
    } catch (error) {
        console.error('[bulk-attendance-actions] preview error:', error);
        res.status(500).json({ success: false, error: 'Failed to load bulk action preview.' });
    }
});

router.get('/bulk-attendance-actions/tea-break-overruns', [authenticateToken, requireBulkAttendanceActionsAccess], async (req, res) => {
    try {
        const overruns = await getTeaBreakOverruns();
        res.json({ success: true, overruns });
    } catch (error) {
        console.error('[bulk-attendance-actions] tea-break-overruns error:', error);
        res.status(500).json({ success: false, error: 'Failed to load tea break overrun data.' });
    }
});

router.post('/bulk-attendance-actions/execute', [authenticateToken, requireBulkAttendanceActionsAccess], async (req, res) => {
    try {
        const { action, confirm } = req.body;

        if (confirm !== true) {
            return res.status(400).json({
                success: false,
                error: 'Confirmation required. Set confirm: true to execute this action.',
            });
        }

        if (!action || !VALID_ACTIONS.has(action)) {
            return res.status(400).json({
                success: false,
                error: `Invalid action. Must be one of: ${Array.from(VALID_ACTIONS).join(', ')}`,
            });
        }

        const result = await executeBulkAction(action, req.user.userId);
        res.json(result);
    } catch (error) {
        console.error('[bulk-attendance-actions] execute error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Failed to execute bulk action.',
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attendance/employee-status-list
// Returns all active non-Admin employees with their most-recent check-in,
// check-out, and current status. Uses bulk queries (no N+1).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/attendance/employee-status-list', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        // 1. Fetch all active, non-Admin employees
        const allEmployees = await User.find({ role: { $ne: 'Admin' }, isActive: true })
            .select('fullName designation profileImageUrl')
            .lean();

        if (!allEmployees.length) {
            return res.json({ employees: [] });
        }

        const employeeIds = allEmployees.map(e => e._id);

        // 2. Bulk-fetch the most-recent AttendanceLog per employee using aggregation
        //    ($sort → $group picks up the latest doc per user in one pass)
        const latestLogs = await AttendanceLog.aggregate([
            { $match: { user: { $in: employeeIds } } },
            { $sort: { attendanceDate: -1 } },
            {
                $group: {
                    _id: '$user',
                    logId: { $first: '$_id' },
                    attendanceDate: { $first: '$attendanceDate' },
                },
            },
        ]);

        // Build a map: employeeId → { logId, attendanceDate }
        const latestLogMap = new Map();
        for (const entry of latestLogs) {
            latestLogMap.set(entry._id.toString(), entry);
        }

        // 3. Bulk-fetch all AttendanceSessions for those log IDs
        const logIds = latestLogs.map(e => e.logId);
        const allSessions = logIds.length
            ? await AttendanceSession.find({ attendanceLog: { $in: logIds } })
                .select('attendanceLog startTime endTime')
                .lean()
            : [];

        // Build a map: logId → [sessions]
        const sessionsByLog = new Map();
        for (const session of allSessions) {
            const key = session.attendanceLog.toString();
            if (!sessionsByLog.has(key)) sessionsByLog.set(key, []);
            sessionsByLog.get(key).push(session);
        }

        // 4. Assemble the response, sorted by fullName
        const result = allEmployees
            .map(emp => {
                const empIdStr = emp._id.toString();
                const logEntry = latestLogMap.get(empIdStr);

                if (!logEntry) {
                    return {
                        employeeId: emp._id,
                        fullName: emp.fullName,
                        designation: emp.designation || '',
                        profileImageUrl: emp.profileImageUrl || null,
                        attendanceDate: null,
                        checkInTime: null,
                        checkOutTime: null,
                        status: 'No Record',
                    };
                }

                const sessions = sessionsByLog.get(logEntry.logId.toString()) || [];

                let checkInTime = null;
                let checkOutTime = null;
                let status = 'No Record';

                if (sessions.length > 0) {
                    // Earliest startTime = first check-in
                    checkInTime = sessions.reduce((earliest, s) =>
                        !earliest || s.startTime < earliest ? s.startTime : earliest,
                        null
                    );

                    // Latest session determines check-out / open state
                    const latestSession = sessions.reduce((latest, s) =>
                        !latest || s.startTime > latest.startTime ? s : latest,
                        null
                    );

                    if (latestSession && latestSession.endTime == null) {
                        // Session still open — employee is checked in
                        checkOutTime = null;
                        status = 'Checked In';
                    } else {
                        // All sessions closed — use the latest endTime as check-out
                        checkOutTime = sessions.reduce((latest, s) =>
                            !latest || (s.endTime && s.endTime > latest) ? s.endTime : latest,
                            null
                        );
                        status = 'Checked Out';
                    }
                }

                return {
                    employeeId: emp._id,
                    fullName: emp.fullName,
                    designation: emp.designation || '',
                    profileImageUrl: emp.profileImageUrl || null,
                    attendanceDate: logEntry.attendanceDate,
                    checkInTime,
                    checkOutTime,
                    status,
                };
            })
            .sort((a, b) => a.fullName.localeCompare(b.fullName));

        return res.json({ employees: result });
    } catch (error) {
        console.error('[attendance/employee-status-list] Error:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;