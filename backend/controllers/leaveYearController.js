const LeaveYear = require('../models/LeaveYear');
const Holiday = require('../models/Holiday');
const mongoose = require('mongoose');

// Get all leave years
exports.getAllLeaveYears = async (req, res) => {
    try {
        const years = await LeaveYear.find()
            .select('year isActive startDate endDate isLocked createdAt')
            .sort({ year: -1 })
            .lean();
        
        res.json(years);
    } catch (error) {
        console.error('Error fetching leave years:', error);
        res.status(500).json({ 
            error: 'Failed to fetch leave years',
            message: error.message 
        });
    }
};

// Get active leave year
exports.getActiveLeaveYear = async (req, res) => {
    try {
        const activeYear = await LeaveYear.findOne({ isActive: true })
            .select('year isActive startDate endDate isLocked createdAt')
            .lean();
        
        if (!activeYear) {
            return res.status(404).json({ 
                error: 'No active leave year found',
                message: 'Please configure an active leave year in the system'
            });
        }
        
        res.json(activeYear);
    } catch (error) {
        console.error('Error fetching active leave year:', error);
        res.status(500).json({ 
            error: 'Failed to fetch active leave year',
            message: error.message 
        });
    }
};

// Get specific leave year by ID
exports.getLeaveYearById = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                error: 'Invalid leave year ID' 
            });
        }
        
        const year = await LeaveYear.findById(id).lean();
        
        if (!year) {
            return res.status(404).json({ 
                error: 'Leave year not found',
                resourceId: id
            });
        }
        
        // Get holiday count for this year
        const holidayCount = await Holiday.countDocuments({ leaveYearId: id });
        
        res.json({
            ...year,
            holidayCount
        });
    } catch (error) {
        console.error('Error fetching leave year:', error);
        res.status(500).json({ 
            error: 'Failed to fetch leave year',
            message: error.message 
        });
    }
};

// Create new leave year
exports.createLeaveYear = async (req, res) => {
    try {
        const { year, startDate, endDate, cloneFromYearId } = req.body;
        
        // Validation
        if (!year || !startDate || !endDate) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: [
                    { field: 'year', message: 'Year is required' },
                    { field: 'startDate', message: 'Start date is required' },
                    { field: 'endDate', message: 'End date is required' }
                ].filter(d => !req.body[d.field.replace('Date', 'Date')])
            });
        }
        
        // Check if year already exists
        const existingYear = await LeaveYear.findOne({ year });
        if (existingYear) {
            return res.status(409).json({ 
                error: 'Duplicate value',
                field: 'year',
                message: `Leave year ${year} already exists`
            });
        }
        
        // Create new leave year
        const newYear = await LeaveYear.create({
            year,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            isActive: false,
            isLocked: false
        });
        
        // Clone holidays if requested
        if (cloneFromYearId) {
            try {
                await cloneHolidays(cloneFromYearId, newYear._id, year);
            } catch (cloneError) {
                console.error('Error cloning holidays:', cloneError);
                // Don't fail the year creation if cloning fails
            }
        }
        
        res.status(201).json(newYear);
    } catch (error) {
        console.error('Error creating leave year:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: Object.values(error.errors).map(e => ({
                    field: e.path,
                    message: e.message
                }))
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to create leave year',
            message: error.message 
        });
    }
};

// Update leave year
exports.updateLeaveYear = async (req, res) => {
    try {
        const { id } = req.params;
        const { year, startDate, endDate } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                error: 'Invalid leave year ID' 
            });
        }
        
        const leaveYear = await LeaveYear.findById(id);
        
        if (!leaveYear) {
            return res.status(404).json({ 
                error: 'Leave year not found',
                resourceId: id
            });
        }
        
        // Update fields
        if (year !== undefined) leaveYear.year = year;
        if (startDate !== undefined) leaveYear.startDate = new Date(startDate);
        if (endDate !== undefined) leaveYear.endDate = new Date(endDate);
        
        await leaveYear.save();
        
        res.json(leaveYear);
    } catch (error) {
        console.error('Error updating leave year:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: Object.values(error.errors).map(e => ({
                    field: e.path,
                    message: e.message
                }))
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to update leave year',
            message: error.message 
        });
    }
};

// Delete leave year
exports.deleteLeaveYear = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                error: 'Invalid leave year ID' 
            });
        }
        
        const leaveYear = await LeaveYear.findById(id);
        
        if (!leaveYear) {
            return res.status(404).json({ 
                error: 'Leave year not found',
                resourceId: id
            });
        }
        
        // Prevent deletion of active year
        if (leaveYear.isActive) {
            return res.status(422).json({ 
                error: 'Business rule violation',
                message: 'Cannot delete active leave year',
                rule: 'active_year_deletion_prevention'
            });
        }
        
        // Delete associated holidays
        await Holiday.deleteMany({ leaveYearId: id });
        
        // Delete the year
        await LeaveYear.findByIdAndDelete(id);
        
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting leave year:', error);
        res.status(500).json({ 
            error: 'Failed to delete leave year',
            message: error.message 
        });
    }
};

// Helper function to clone holidays
async function cloneHolidays(sourceYearId, targetYearId, targetYear) {
    const sourceHolidays = await Holiday.find({ leaveYearId: sourceYearId }).lean();
    
    if (sourceHolidays.length === 0) {
        return;
    }
    
    const clonedHolidays = sourceHolidays.map(holiday => {
        const newDate = holiday.date ? new Date(holiday.date) : null;
        if (newDate) {
            newDate.setFullYear(targetYear);
        }
        
        return {
            name: holiday.name,
            date: newDate,
            day: holiday.day,
            type: holiday.type,
            appliesTo: holiday.appliesTo,
            isTentative: holiday.isTentative,
            leaveYearId: targetYearId
        };
    });
    
    await Holiday.insertMany(clonedHolidays);
}

module.exports = exports;

// Activate leave year
exports.activateLeaveYear = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { id } = req.params;
        const { confirmDeactivateCurrent } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                error: 'Invalid leave year ID' 
            });
        }
        
        // Require confirmation
        if (!confirmDeactivateCurrent) {
            await session.abortTransaction();
            return res.status(400).json({ 
                error: 'Confirmation required',
                message: 'Please confirm deactivation of current active year'
            });
        }
        
        // Get current active year
        const currentActiveYear = await LeaveYear.findOne({ isActive: true }).session(session);
        
        // Get year to activate
        const yearToActivate = await LeaveYear.findById(id).session(session);
        
        if (!yearToActivate) {
            await session.abortTransaction();
            return res.status(404).json({ 
                error: 'Leave year not found',
                resourceId: id
            });
        }
        
        // Deactivate all years
        await LeaveYear.updateMany(
            { isActive: true },
            { isActive: false },
            { session }
        );
        
        // Activate the specified year and unlock it
        yearToActivate.isActive = true;
        yearToActivate.isLocked = false;
        await yearToActivate.save({ session });
        
        await session.commitTransaction();
        
        // Emit event for synchronization (will be implemented in event system task)
        const yearEventEmitter = require('../services/yearEventEmitter');
        if (yearEventEmitter) {
            yearEventEmitter.emitActiveYearChanged(
                currentActiveYear ? currentActiveYear.year : null,
                yearToActivate.year
            );
        }
        
        res.json({
            message: 'Leave year activated successfully',
            previousActiveYear: currentActiveYear ? currentActiveYear.year : null,
            newActiveYear: yearToActivate.year,
            affectedSystems: ['attendance', 'leaves']
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error activating leave year:', error);
        res.status(500).json({ 
            error: 'Failed to activate leave year',
            message: error.message 
        });
    } finally {
        session.endSession();
    }
};

// Archive leave year
exports.archiveLeaveYear = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                error: 'Invalid leave year ID' 
            });
        }
        
        const leaveYear = await LeaveYear.findById(id);
        
        if (!leaveYear) {
            return res.status(404).json({ 
                error: 'Leave year not found',
                resourceId: id
            });
        }
        
        // Check if this is the only year
        const totalYears = await LeaveYear.countDocuments();
        if (totalYears === 1) {
            return res.status(422).json({ 
                error: 'Business rule violation',
                message: 'Cannot archive the only leave year in the system',
                rule: 'archive_prevention_without_replacement'
            });
        }
        
        // If archiving active year, check if another year exists
        if (leaveYear.isActive) {
            const otherYears = await LeaveYear.countDocuments({ _id: { $ne: id } });
            if (otherYears === 0) {
                return res.status(422).json({ 
                    error: 'Business rule violation',
                    message: 'Cannot archive active year without another year to activate',
                    rule: 'archive_prevention_without_replacement'
                });
            }
        }
        
        // Archive the year
        leaveYear.isActive = false;
        leaveYear.isLocked = true;
        await leaveYear.save();
        
        // Log the archiving action
        const SystemAuditLog = require('../models/SystemAuditLog');
        await SystemAuditLog.create({
            action: 'ARCHIVE_YEAR',
            userId: req.user._id,
            userName: req.user.name,
            timestamp: new Date(),
            details: {
                yearId: leaveYear._id,
                year: leaveYear.year
            },
            ipAddress: req.ip
        });
        
        res.json({
            message: 'Leave year archived successfully',
            year: leaveYear.year
        });
    } catch (error) {
        console.error('Error archiving leave year:', error);
        res.status(500).json({ 
            error: 'Failed to archive leave year',
            message: error.message 
        });
    }
};

// Lock/Unlock leave year
exports.toggleLockLeaveYear = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                error: 'Invalid leave year ID' 
            });
        }
        
        const leaveYear = await LeaveYear.findById(id);
        
        if (!leaveYear) {
            return res.status(404).json({ 
                error: 'Leave year not found',
                resourceId: id
            });
        }
        
        // Cannot lock active year
        if (leaveYear.isActive) {
            return res.status(422).json({ 
                error: 'Business rule violation',
                message: 'Cannot lock the active leave year',
                rule: 'active_year_lock_prevention'
            });
        }
        
        // Toggle lock status
        leaveYear.isLocked = !leaveYear.isLocked;
        await leaveYear.save();
        
        res.json({
            message: `Leave year ${leaveYear.isLocked ? 'locked' : 'unlocked'} successfully`,
            year: leaveYear.year,
            isLocked: leaveYear.isLocked
        });
    } catch (error) {
        console.error('Error toggling lock on leave year:', error);
        res.status(500).json({ 
            error: 'Failed to toggle lock on leave year',
            message: error.message 
        });
    }
};

// Clone holidays from one year to another
exports.cloneHolidays = async (req, res) => {
    try {
        const { id } = req.params; // Target year ID
        const { sourceYearId } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(sourceYearId)) {
            return res.status(400).json({ 
                error: 'Invalid year ID' 
            });
        }
        
        const targetYear = await LeaveYear.findById(id);
        const sourceYear = await LeaveYear.findById(sourceYearId);
        
        if (!targetYear) {
            return res.status(404).json({ 
                error: 'Target leave year not found',
                resourceId: id
            });
        }
        
        if (!sourceYear) {
            return res.status(404).json({ 
                error: 'Source leave year not found',
                resourceId: sourceYearId
            });
        }
        
        const startTime = Date.now();
        
        // Get holidays from source year
        const sourceHolidays = await Holiday.find({ leaveYearId: sourceYearId }).lean();
        
        if (sourceHolidays.length === 0) {
            return res.json({
                message: 'No holidays to clone',
                clonedCount: 0
            });
        }
        
        // Clone holidays with adjusted dates
        const clonedHolidays = sourceHolidays.map(holiday => {
            const newDate = holiday.date ? new Date(holiday.date) : null;
            if (newDate) {
                newDate.setFullYear(targetYear.year);
            }
            
            return {
                name: holiday.name,
                date: newDate,
                day: holiday.day,
                type: holiday.type,
                appliesTo: holiday.appliesTo,
                isTentative: holiday.isTentative,
                leaveYearId: targetYear._id
            };
        });
        
        // Insert cloned holidays
        await Holiday.insertMany(clonedHolidays);
        
        const duration = Date.now() - startTime;
        
        res.json({
            message: 'Holidays cloned successfully',
            sourceYear: sourceYear.year,
            targetYear: targetYear.year,
            clonedCount: clonedHolidays.length,
            duration: `${duration}ms`
        });
    } catch (error) {
        console.error('Error cloning holidays:', error);
        res.status(500).json({ 
            error: 'Failed to clone holidays',
            message: error.message 
        });
    }
};


// === INTELLIGENT HOLIDAY CLONING ===

const holidayCloneService = require('../services/holidayCloneService');
const HolidayCloneLog = require('../models/HolidayCloneLog');

// Generate clone preview
exports.generateClonePreview = async (req, res) => {
    try {
        const { id } = req.params; // Target year ID
        const { sourceYearId } = req.body;
        const userId = req.user.userId;
        
        if (!sourceYearId) {
            return res.status(400).json({
                error: 'Source year ID is required'
            });
        }
        
        const preview = await holidayCloneService.generateClonePreview(
            sourceYearId,
            id,
            userId
        );
        
        res.json(preview);
        
    } catch (error) {
        console.error('Error generating clone preview:', error);
        res.status(500).json({
            error: 'Failed to generate clone preview',
            message: error.message
        });
    }
};

// Confirm clone
exports.confirmClone = async (req, res) => {
    try {
        const { cloneLogId, previewEdits } = req.body;
        const userId = req.user.userId;
        
        if (!cloneLogId) {
            return res.status(400).json({
                error: 'Clone log ID is required'
            });
        }
        
        const result = await holidayCloneService.confirmClone(
            cloneLogId,
            previewEdits || [],
            userId
        );
        
        res.json(result);
        
    } catch (error) {
        console.error('Error confirming clone:', error);
        res.status(500).json({
            error: 'Failed to confirm clone',
            message: error.message
        });
    }
};

// Cancel clone
exports.cancelClone = async (req, res) => {
    try {
        const { cloneLogId } = req.body;
        
        if (!cloneLogId) {
            return res.status(400).json({
                error: 'Clone log ID is required'
            });
        }
        
        const success = await holidayCloneService.cancelClone(cloneLogId);
        
        if (!success) {
            return res.status(404).json({
                error: 'Clone log not found or already processed'
            });
        }
        
        res.json({
            success: true,
            message: 'Clone cancelled successfully'
        });
        
    } catch (error) {
        console.error('Error cancelling clone:', error);
        res.status(500).json({
            error: 'Failed to cancel clone',
            message: error.message
        });
    }
};

// Get clone history for a year
exports.getCloneHistory = async (req, res) => {
    try {
        const { id } = req.params; // Year ID
        
        const history = await HolidayCloneLog.getHistoryForYear(id);
        
        res.json(history);
        
    } catch (error) {
        console.error('Error getting clone history:', error);
        res.status(500).json({
            error: 'Failed to get clone history',
            message: error.message
        });
    }
};
