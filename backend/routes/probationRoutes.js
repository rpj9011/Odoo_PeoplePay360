// backend/routes/probationRoutes.js
// NOTE: These routes now use /api/analytics/probation-tracker endpoint for probation calculations.
// Company policy: Probation is 6 calendar months from joining date, extended by approved leaves AND absences.
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const ProbationTrackingService = require('../services/probationTrackingService'); // Only for promoteEmployeeToPermanent
const axios = require('axios'); // For internal API calls

// Middleware to check if user is admin or HR
const isAdminOrHr = (req, res, next) => {
    if (req.user.role === 'Admin' || req.user.role === 'HR') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Admin or HR role required.' });
    }
};

// GET /api/probation/check-completions
// REMOVED: Legacy probation completion check
// Use /api/analytics/probation-tracker endpoint for accurate probation data
router.get('/check-completions', [authenticateToken, isAdminOrHr], async (req, res) => {
    res.status(410).json({ 
        error: 'Legacy probation completion check has been removed.',
        message: 'Use /api/analytics/probation-tracker endpoint for accurate probation calculations.'
    });
});

// GET /api/probation/employee/:id/progress
// Get probation progress for a specific employee (uses authoritative endpoint)
router.get('/employee/:id/progress', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { id } = req.params;
        const User = require('../models/User');
        
        const employee = await User.findById(id);
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }
        
        if (employee.employmentStatus !== 'Probation') {
            return res.status(400).json({ error: 'Employee is not on probation.' });
        }
        
        // Use authoritative probation tracker endpoint
        // Get all probation employees and find the one we need
        const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
        const response = await axios.get(`${baseUrl}/api/analytics/probation-tracker`, {
            headers: {
                'Authorization': req.headers.authorization
            }
        });
        
        const employeeData = response.data.employees.find(emp => emp.employeeId === id);
        if (!employeeData) {
            return res.status(404).json({ error: 'Probation data not found for this employee.' });
        }
        
        res.json({
            employee: {
                id: employee._id,
                name: employee.fullName,
                employeeCode: employee.employeeCode,
                joiningDate: employee.joiningDate,
                employmentStatus: employee.employmentStatus
            },
            progress: {
                probationStartDate: employeeData.probationStartDate,
                baseProbationEndDate: employeeData.baseProbationEndDate,
                finalProbationEndDate: employeeData.finalProbationEndDate,
                daysLeft: employeeData.daysLeft,
                fullDayLeaves: employeeData.fullDayLeaves,
                halfDayLeaves: employeeData.halfDayLeaves,
                leaveExtensionDays: employeeData.leaveExtensionDays,
                fullDayAbsents: employeeData.fullDayAbsents,
                halfDayAbsents: employeeData.halfDayAbsents,
                absentExtensionDays: employeeData.absentExtensionDays
            }
        });
    } catch (error) {
        console.error('Error getting probation progress:', error);
        res.status(500).json({ error: 'Failed to get probation progress.' });
    }
});

// POST /api/probation/promote/:id
// Promote employee to permanent status
router.post('/promote/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.user;
        
        const result = await ProbationTrackingService.promoteEmployeeToPermanent(id, userId);
        res.json(result);
    } catch (error) {
        console.error('Error promoting employee:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to promote employee to permanent status.' 
        });
    }
});

// GET /api/probation/employees
// Get all employees on probation with their progress (uses authoritative endpoint)
router.get('/employees', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        // Use authoritative probation tracker endpoint
        const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
        const response = await axios.get(`${baseUrl}/api/analytics/probation-tracker`, {
            headers: {
                'Authorization': req.headers.authorization
            }
        });
        
        // Map to expected format
        const employeesWithProgress = response.data.employees.map(emp => ({
            employee: {
                id: emp.employeeId,
                name: emp.employeeName,
                employeeCode: emp.employeeCode,
                joiningDate: emp.joiningDate,
                email: '', // Not included in probation tracker response
                department: '', // Not included in probation tracker response
                designation: '', // Not included in probation tracker response
                employmentStatus: 'Probation'
            },
            progress: {
                probationStartDate: emp.probationStartDate,
                baseProbationEndDate: emp.baseProbationEndDate,
                finalProbationEndDate: emp.finalProbationEndDate,
                daysLeft: emp.daysLeft,
                fullDayLeaves: emp.fullDayLeaves,
                halfDayLeaves: emp.halfDayLeaves,
                leaveExtensionDays: emp.leaveExtensionDays,
                fullDayAbsents: emp.fullDayAbsents,
                halfDayAbsents: emp.halfDayAbsents,
                absentExtensionDays: emp.absentExtensionDays
            }
        }));
        
        res.json({ employees: employeesWithProgress });
    } catch (error) {
        console.error('Error getting probation employees:', error);
        res.status(500).json({ error: 'Failed to get probation employees.' });
    }
});

module.exports = router;
