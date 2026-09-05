// backend/services/datasetService.js
// Service for managing internal holiday dataset

const InternalHolidayDataset = require('../models/InternalHolidayDataset');
const { isValidHolidayCode, generateDatasetVersion, getYear } = require('../utils/holidayEngine');

class DatasetService {
    /**
     * Upload and validate dataset
     * @param {Array} data - Parsed dataset rows
     * @param {ObjectId} userId - User uploading
     * @returns {Object} - Upload results
     */
    async uploadDataset(data, userId) {
        try {
            // Validate dataset
            const validation = this.validateDataset(data);
            
            if (validation.invalid.length > 0 && validation.valid.length === 0) {
                throw new Error('No valid entries found in dataset');
            }
            
            // Generate dataset version
            const datasetVersion = generateDatasetVersion();
            
            // Prepare entries for insertion
            const entries = validation.valid.map(row => ({
                holidayCode: row.holidayCode.toUpperCase(),
                holidayName: row.holidayName,
                year: row.year,
                date: new Date(row.date),
                datasetVersion,
                uploadedBy: userId,
                uploadedAt: new Date()
            }));
            
            // Insert or update entries
            let insertedCount = 0;
            let updatedCount = 0;
            
            for (const entry of entries) {
                const existing = await InternalHolidayDataset.findOne({
                    holidayCode: entry.holidayCode,
                    year: entry.year
                });
                
                if (existing) {
                    // Update existing entry
                    await InternalHolidayDataset.findByIdAndUpdate(existing._id, entry);
                    updatedCount++;
                } else {
                    // Insert new entry
                    await InternalHolidayDataset.create(entry);
                    insertedCount++;
                }
            }
            
            return {
                success: true,
                datasetVersion,
                inserted: insertedCount,
                updated: updatedCount,
                total: entries.length,
                duplicates: validation.duplicates.length,
                invalid: validation.invalid.length,
                invalidDetails: validation.invalid
            };
            
        } catch (error) {
            console.error('Error uploading dataset:', error);
            throw error;
        }
    }
    
    /**
     * Validate dataset
     * @param {Array} data - Dataset rows
     * @returns {Object} - Validation results
     */
    validateDataset(data) {
        const results = {
            valid: [],
            invalid: [],
            duplicates: []
        };
        
        const seenKeys = new Set();
        
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const errors = [];
            
            // Extract fields (handle different column name variations)
            const holidayCode = row['Holiday Code'] || row['HolidayCode'] || row['Code'] || '';
            const holidayName = row['Holiday Name'] || row['HolidayName'] || row['Name'] || '';
            const year = row['Year'] || row['year'] || '';
            const date = row['Date'] || row['date'] || '';
            
            // Validate holiday code
            if (!holidayCode || holidayCode.trim() === '') {
                errors.push('Holiday code is required');
            } else if (!isValidHolidayCode(holidayCode.toUpperCase())) {
                errors.push('Invalid holiday code format (use uppercase letters and underscores)');
            }
            
            // Validate holiday name
            if (!holidayName || holidayName.trim() === '') {
                errors.push('Holiday name is required');
            }
            
            // Validate year
            const yearNum = parseInt(year);
            if (!year || isNaN(yearNum)) {
                errors.push('Year is required and must be a number');
            } else if (yearNum < 2020 || yearNum > 2100) {
                errors.push('Year must be between 2020 and 2100');
            }
            
            // Validate date
            if (!date) {
                errors.push('Date is required');
            } else {
                const dateObj = new Date(date);
                if (isNaN(dateObj.getTime())) {
                    errors.push('Invalid date format (use YYYY-MM-DD)');
                } else {
                    // Check if date year matches year field
                    const dateYear = getYear(dateObj);
                    if (dateYear !== yearNum) {
                        errors.push(`Date year (${dateYear}) does not match Year field (${yearNum})`);
                    }
                }
            }
            
            // Check for duplicates within file
            const key = `${holidayCode.toUpperCase()}_${yearNum}`;
            if (seenKeys.has(key)) {
                errors.push('Duplicate entry in file');
                results.duplicates.push({
                    holidayCode: holidayCode.toUpperCase(),
                    year: yearNum,
                    rowNumber: i + 2 // Excel row number (1-indexed + header)
                });
            } else {
                seenKeys.add(key);
            }
            
            // Categorize row
            if (errors.length > 0) {
                results.invalid.push({
                    rowNumber: i + 2,
                    holidayCode: holidayCode || '-',
                    holidayName: holidayName || '-',
                    year: year || '-',
                    date: date || '-',
                    errors
                });
            } else {
                results.valid.push({
                    holidayCode: holidayCode.toUpperCase(),
                    holidayName: holidayName.trim(),
                    year: yearNum,
                    date: date
                });
            }
        }
        
        return results;
    }
    
    /**
     * Get dataset status for a year
     * @param {Number} year - Year to check
     * @param {Array} requiredCodes - Required holiday codes (optional)
     * @returns {Object} - Dataset status
     */
    async getDatasetStatus(year, requiredCodes = []) {
        try {
            const dataset = await InternalHolidayDataset.find({ year }).lean();
            const latestVersion = await InternalHolidayDataset.getLatestVersion(year);
            
            let isComplete = true;
            let missingCodes = [];
            
            if (requiredCodes.length > 0) {
                const existingCodes = new Set(dataset.map(d => d.holidayCode));
                missingCodes = requiredCodes.filter(code => !existingCodes.has(code));
                isComplete = missingCodes.length === 0;
            }
            
            return {
                year,
                exists: dataset.length > 0,
                count: dataset.length,
                isComplete,
                missingCodes,
                version: latestVersion?.datasetVersion || null,
                lastUpdated: latestVersion?.uploadedAt || null,
                holidays: dataset.map(d => ({
                    code: d.holidayCode,
                    name: d.holidayName,
                    date: d.date
                }))
            };
        } catch (error) {
            console.error('Error getting dataset status:', error);
            throw error;
        }
    }
    
    /**
     * Get dataset for a specific year
     * @param {Number} year - Year
     * @returns {Array} - Dataset entries
     */
    async getDatasetForYear(year) {
        try {
            return await InternalHolidayDataset.find({ year })
                .populate('uploadedBy', 'fullName email')
                .sort({ holidayCode: 1 })
                .lean();
        } catch (error) {
            console.error('Error getting dataset for year:', error);
            throw error;
        }
    }
    
    /**
     * Delete dataset entry
     * @param {ObjectId} entryId - Entry ID
     * @returns {Boolean} - Success
     */
    async deleteDatasetEntry(entryId) {
        try {
            const result = await InternalHolidayDataset.findByIdAndDelete(entryId);
            return !!result;
        } catch (error) {
            console.error('Error deleting dataset entry:', error);
            throw error;
        }
    }
    
    /**
     * Get all years with datasets
     * @returns {Array} - Years with dataset counts
     */
    async getAvailableYears() {
        try {
            const results = await InternalHolidayDataset.aggregate([
                {
                    $group: {
                        _id: '$year',
                        count: { $sum: 1 },
                        latestVersion: { $max: '$datasetVersion' },
                        lastUpdated: { $max: '$uploadedAt' }
                    }
                },
                {
                    $sort: { _id: 1 }
                }
            ]);
            
            return results.map(r => ({
                year: r._id,
                count: r.count,
                version: r.latestVersion,
                lastUpdated: r.lastUpdated
            }));
        } catch (error) {
            console.error('Error getting available years:', error);
            throw error;
        }
    }
    
    /**
     * Get common Indian holiday codes
     * @returns {Array} - Holiday codes with descriptions
     */
    getCommonHolidayCodes() {
        return [
            { code: 'HOLI', name: 'Holi', description: 'Festival of Colors' },
            { code: 'DIWALI', name: 'Diwali', description: 'Festival of Lights' },
            { code: 'GANESH', name: 'Ganesh Chaturthi', description: 'Ganesh Festival' },
            { code: 'DUSSEHRA', name: 'Dussehra', description: 'Victory of Good over Evil' },
            { code: 'JANMASHTAMI', name: 'Janmashtami', description: 'Krishna Birthday' },
            { code: 'RAM_NAVAMI', name: 'Ram Navami', description: 'Ram Birthday' },
            { code: 'MAHASHIVRATRI', name: 'Maha Shivaratri', description: 'Shiva Festival' },
            { code: 'RAKSHA_BANDHAN', name: 'Raksha Bandhan', description: 'Brother-Sister Festival' },
            { code: 'EID_UL_FITR', name: 'Eid ul-Fitr', description: 'End of Ramadan' },
            { code: 'EID_UL_ADHA', name: 'Eid ul-Adha', description: 'Festival of Sacrifice' },
            { code: 'MUHARRAM', name: 'Muharram', description: 'Islamic New Year' },
            { code: 'GURU_NANAK', name: 'Guru Nanak Jayanti', description: 'Guru Nanak Birthday' }
        ];
    }
}

module.exports = new DatasetService();
