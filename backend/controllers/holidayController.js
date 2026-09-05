const Holiday = require('../models/Holiday');
const LeaveYear = require('../models/LeaveYear');
const mongoose = require('mongoose');

// Get all holidays (with optional year filtering)
exports.getAllHolidays = async (req, res) => {
    try {
        const { yearId } = req.query;
        
        let query = {};
        
        // Filter by year if provided
        if (yearId) {
            if (!mongoose.Types.ObjectId.isValid(yearId)) {
                return res.status(400).json({ 
                    error: 'Invalid year ID' 
                });
            }
            query.leaveYearId = yearId;
        }
        
        const holidays = await Holiday.find(query).lean();
        
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
        console.error('Error fetching holidays:', error);
        res.status(500).json({ 
            error: 'Failed to fetch holidays',
            message: error.message 
        });
    }
};

// Get holidays for employees (active year only)
exports.getEmployeeHolidays = async (req, res) => {
    try {
        // Get active year
        const activeYear = await LeaveYear.findOne({ isActive: true });
        
        if (!activeYear) {
            return res.status(404).json({ 
                error: 'No active leave year found',
                message: 'Please contact administrator to configure an active leave year'
            });
        }
        
        // Get holidays for active year only
        const holidays = await Holiday.find({ 
            leaveYearId: activeYear._id,
            isTentative: { $ne: true }
        })
        .select('name date day type appliesTo')
        .sort({ date: 1 })
        .lean();
        
        res.json({
            year: activeYear.year,
            holidays
        });
    } catch (error) {
        console.error('Error fetching employee holidays:', error);
        res.status(500).json({ 
            error: 'Failed to fetch holidays',
            message: error.message 
        });
    }
};

// Create new holiday
exports.createHoliday = async (req, res) => {
    try {
        const { name, date, day, type, appliesTo, isTentative, leaveYearId } = req.body;
        
        // Validation
        if (!name) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: [{ field: 'name', message: 'Holiday name is required' }]
            });
        }
        
        if (!isTentative && !date) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: [{ field: 'date', message: 'Date is required for non-tentative holidays' }]
            });
        }
        
        if (!leaveYearId) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: [{ field: 'leaveYearId', message: 'Leave year is required' }]
            });
        }
        
        // Check if leave year exists
        const leaveYear = await LeaveYear.findById(leaveYearId);
        if (!leaveYear) {
            return res.status(404).json({ 
                error: 'Leave year not found',
                resourceId: leaveYearId
            });
        }
        
        // Check if year is locked
        if (leaveYear.isLocked) {
            return res.status(422).json({ 
                error: 'Business rule violation',
                message: 'Cannot add holidays to a locked leave year',
                rule: 'locked_year_modification_prevention'
            });
        }
        
        // Create holiday
        const newHoliday = await Holiday.create({
            name,
            date: date ? new Date(date) : null,
            day,
            type: type || 'Company',
            appliesTo: appliesTo || 'All',
            isTentative: isTentative || false,
            leaveYearId
        });
        
        res.status(201).json(newHoliday);
    } catch (error) {
        console.error('Error creating holiday:', error);
        
        if (error.code === 11000) {
            return res.status(409).json({ 
                error: 'Duplicate value',
                message: 'A holiday on this date already exists for this year'
            });
        }
        
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
            error: 'Failed to create holiday',
            message: error.message 
        });
    }
};

// Update holiday
exports.updateHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, date, day, type, appliesTo, isTentative } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                error: 'Invalid holiday ID' 
            });
        }
        
        const holiday = await Holiday.findById(id);
        
        if (!holiday) {
            return res.status(404).json({ 
                error: 'Holiday not found',
                resourceId: id
            });
        }
        
        // Check if associated year is locked
        const leaveYear = await LeaveYear.findById(holiday.leaveYearId);
        if (leaveYear && leaveYear.isLocked) {
            return res.status(422).json({ 
                error: 'Business rule violation',
                message: 'Cannot modify holidays in a locked leave year',
                rule: 'locked_year_modification_prevention'
            });
        }
        
        // Update fields
        if (name !== undefined) holiday.name = name;
        if (date !== undefined) holiday.date = date ? new Date(date) : null;
        if (day !== undefined) holiday.day = day;
        if (type !== undefined) holiday.type = type;
        if (appliesTo !== undefined) holiday.appliesTo = appliesTo;
        if (isTentative !== undefined) holiday.isTentative = isTentative;
        
        await holiday.save();
        
        res.json(holiday);
    } catch (error) {
        console.error('Error updating holiday:', error);
        
        if (error.code === 11000) {
            return res.status(409).json({ 
                error: 'Duplicate value',
                message: 'A holiday on this date already exists for this year'
            });
        }
        
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
            error: 'Failed to update holiday',
            message: error.message 
        });
    }
};

// Delete holiday
exports.deleteHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                error: 'Invalid holiday ID' 
            });
        }
        
        const holiday = await Holiday.findById(id);
        
        if (!holiday) {
            return res.status(404).json({ 
                error: 'Holiday not found',
                resourceId: id
            });
        }
        
        // Check if associated year is locked
        const leaveYear = await LeaveYear.findById(holiday.leaveYearId);
        if (leaveYear && leaveYear.isLocked) {
            return res.status(422).json({ 
                error: 'Business rule violation',
                message: 'Cannot delete holidays from a locked leave year',
                rule: 'locked_year_modification_prevention'
            });
        }
        
        await Holiday.findByIdAndDelete(id);
        
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting holiday:', error);
        res.status(500).json({ 
            error: 'Failed to delete holiday',
            message: error.message 
        });
    }
};

// Move holiday to another year
exports.moveHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { targetYearId } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(targetYearId)) {
            return res.status(400).json({ 
                error: 'Invalid ID' 
            });
        }
        
        const holiday = await Holiday.findById(id);
        
        if (!holiday) {
            return res.status(404).json({ 
                error: 'Holiday not found',
                resourceId: id
            });
        }
        
        // Check if source year is locked
        const sourceYear = await LeaveYear.findById(holiday.leaveYearId);
        if (sourceYear && sourceYear.isLocked) {
            return res.status(422).json({ 
                error: 'Business rule violation',
                message: 'Cannot move holidays from a locked leave year',
                rule: 'locked_year_modification_prevention'
            });
        }
        
        // Check if target year exists
        const targetYear = await LeaveYear.findById(targetYearId);
        if (!targetYear) {
            return res.status(404).json({ 
                error: 'Target leave year not found',
                resourceId: targetYearId
            });
        }
        
        // Check if target year is locked
        if (targetYear.isLocked) {
            return res.status(422).json({ 
                error: 'Business rule violation',
                message: 'Cannot move holidays to a locked leave year',
                rule: 'locked_year_modification_prevention'
            });
        }
        
        // Prevent moving to same year
        if (holiday.leaveYearId.toString() === targetYearId) {
            return res.status(400).json({ 
                error: 'Invalid operation',
                message: 'Holiday is already in the target year'
            });
        }
        
        // Update leaveYearId only
        holiday.leaveYearId = targetYearId;
        await holiday.save();
        
        res.json({
            message: 'Holiday moved successfully',
            holiday
        });
    } catch (error) {
        console.error('Error moving holiday:', error);
        res.status(500).json({ 
            error: 'Failed to move holiday',
            message: error.message 
        });
    }
};

module.exports = exports;


// Bulk upload holidays
exports.bulkUploadHolidays = async (req, res) => {
    try {
        const { yearId, holidays } = req.body;
        
        // Validate year ID
        if (!yearId || !mongoose.Types.ObjectId.isValid(yearId)) {
            return res.status(400).json({ 
                error: 'Invalid year ID' 
            });
        }
        
        // Validate holidays array
        if (!Array.isArray(holidays) || holidays.length === 0) {
            return res.status(400).json({ 
                error: 'Holidays array is required and must not be empty' 
            });
        }
        
        // Check if year exists
        const year = await LeaveYear.findById(yearId);
        if (!year) {
            return res.status(404).json({ 
                error: 'Leave year not found' 
            });
        }
        
        // Check if year is locked
        if (year.isLocked) {
            return res.status(403).json({ 
                error: 'Cannot add holidays to a locked year' 
            });
        }
        
        // Check for duplicate dates in the same year
        const existingHolidays = await Holiday.find({ leaveYearId: yearId }).lean();
        const existingDates = new Set(existingHolidays.map(h => h.date?.toISOString().split('T')[0]));
        
        const duplicates = [];
        const validHolidays = [];
        
        for (const holiday of holidays) {
            const dateStr = new Date(holiday.date).toISOString().split('T')[0];
            
            if (existingDates.has(dateStr)) {
                duplicates.push({ name: holiday.name, date: dateStr });
            } else {
                // Calculate day of week
                const date = new Date(holiday.date);
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const day = days[date.getDay()];
                
                validHolidays.push({
                    name: holiday.name,
                    date: holiday.date,
                    day: day,
                    type: holiday.type || 'Company',
                    appliesTo: holiday.appliesTo || 'All',
                    leaveYearId: yearId
                });
                
                existingDates.add(dateStr);
            }
        }
        
        // Insert valid holidays
        let insertedCount = 0;
        if (validHolidays.length > 0) {
            const result = await Holiday.insertMany(validHolidays);
            insertedCount = result.length;
        }
        
        res.json({
            success: true,
            message: `Successfully uploaded ${insertedCount} holidays`,
            inserted: insertedCount,
            duplicates: duplicates.length,
            duplicateDetails: duplicates
        });
        
    } catch (error) {
        console.error('Error bulk uploading holidays:', error);
        res.status(500).json({ 
            error: 'Failed to upload holidays',
            message: error.message 
        });
    }
};


// === MANUAL OVERRIDE SYSTEM ===

// Apply manual override
exports.applyManualOverride = async (req, res) => {
    try {
        const { id } = req.params;
        const changes = req.body;
        const userId = req.user.userId;
        
        // Fetch holiday
        const holiday = await Holiday.findById(id);
        
        if (!holiday) {
            return res.status(404).json({
                error: 'Holiday not found'
            });
        }
        
        // Check if holiday is locked
        if (holiday.isLocked) {
            return res.status(403).json({
                error: 'Cannot edit locked holiday',
                message: 'This holiday is locked and cannot be modified'
            });
        }
        
        // Record changes in edit history
        const editHistory = [];
        
        for (const [field, newValue] of Object.entries(changes)) {
            if (field === 'editHistory' || field === '_id' || field === '__v') continue;
            
            const oldValue = holiday[field];
            
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                editHistory.push({
                    field,
                    oldValue,
                    newValue,
                    editedBy: userId,
                    editedAt: new Date(),
                    reason: changes.reason || 'Manual override'
                });
                
                holiday[field] = newValue;
            }
        }
        
        // Mark as manually edited
        holiday.isManuallyEdited = true;
        holiday.updatedBy = userId;
        
        // Append to edit history
        if (editHistory.length > 0) {
            holiday.editHistory = [...(holiday.editHistory || []), ...editHistory];
        }
        
        // Recalculate day if date changed
        if (changes.date) {
            const { calculateWeekday } = require('../utils/holidayEngine');
            holiday.day = calculateWeekday(changes.date);
        }
        
        await holiday.save();
        
        res.json({
            success: true,
            message: 'Holiday updated successfully',
            holiday,
            changesApplied: editHistory.length
        });
        
    } catch (error) {
        console.error('Error applying manual override:', error);
        res.status(500).json({
            error: 'Failed to apply manual override',
            message: error.message
        });
    }
};

// Get edit history
exports.getEditHistory = async (req, res) => {
    try {
        const { id } = req.params;
        
        const holiday = await Holiday.findById(id)
            .populate('editHistory.editedBy', 'fullName email')
            .populate('createdBy', 'fullName email')
            .populate('updatedBy', 'fullName email')
            .lean();
        
        if (!holiday) {
            return res.status(404).json({
                error: 'Holiday not found'
            });
        }
        
        res.json({
            holidayName: holiday.name,
            createdBy: holiday.createdBy,
            createdAt: holiday.createdAt,
            updatedBy: holiday.updatedBy,
            updatedAt: holiday.updatedAt,
            isManuallyEdited: holiday.isManuallyEdited,
            isLocked: holiday.isLocked,
            editHistory: holiday.editHistory || []
        });
        
    } catch (error) {
        console.error('Error getting edit history:', error);
        res.status(500).json({
            error: 'Failed to get edit history',
            message: error.message
        });
    }
};

// Toggle lock on holiday
exports.toggleLockHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        
        const holiday = await Holiday.findById(id);
        
        if (!holiday) {
            return res.status(404).json({
                error: 'Holiday not found'
            });
        }
        
        // Toggle lock
        holiday.isLocked = !holiday.isLocked;
        holiday.updatedBy = userId;
        
        // Add to edit history
        holiday.editHistory = holiday.editHistory || [];
        holiday.editHistory.push({
            field: 'isLocked',
            oldValue: !holiday.isLocked,
            newValue: holiday.isLocked,
            editedBy: userId,
            editedAt: new Date(),
            reason: holiday.isLocked ? 'Holiday locked' : 'Holiday unlocked'
        });
        
        await holiday.save();
        
        res.json({
            success: true,
            message: `Holiday ${holiday.isLocked ? 'locked' : 'unlocked'} successfully`,
            isLocked: holiday.isLocked
        });
        
    } catch (error) {
        console.error('Error toggling lock:', error);
        res.status(500).json({
            error: 'Failed to toggle lock',
            message: error.message
        });
    }
};
