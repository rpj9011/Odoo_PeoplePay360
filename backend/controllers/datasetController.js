// backend/controllers/datasetController.js
// Controller for internal holiday dataset management

const datasetService = require('../services/datasetService');
const InternalHolidayDataset = require('../models/InternalHolidayDataset');

// Upload dataset
exports.uploadDataset = async (req, res) => {
    try {
        const { data } = req.body;
        const userId = req.user.userId;
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            return res.status(400).json({
                error: 'Dataset is required and must be a non-empty array'
            });
        }
        
        const result = await datasetService.uploadDataset(data, userId);
        
        res.json({
            success: true,
            message: `Dataset uploaded successfully: ${result.inserted} inserted, ${result.updated} updated`,
            ...result
        });
        
    } catch (error) {
        console.error('Error uploading dataset:', error);
        res.status(500).json({
            error: 'Failed to upload dataset',
            message: error.message
        });
    }
};

// Get dataset for a year
exports.getDataset = async (req, res) => {
    try {
        const { year } = req.query;
        
        if (!year) {
            return res.status(400).json({
                error: 'Year parameter is required'
            });
        }
        
        const yearNum = parseInt(year);
        if (isNaN(yearNum)) {
            return res.status(400).json({
                error: 'Year must be a valid number'
            });
        }
        
        const dataset = await datasetService.getDatasetForYear(yearNum);
        
        res.json(dataset);
        
    } catch (error) {
        console.error('Error getting dataset:', error);
        res.status(500).json({
            error: 'Failed to get dataset',
            message: error.message
        });
    }
};

// Get dataset status for a year
exports.getDatasetStatus = async (req, res) => {
    try {
        const { year, requiredCodes } = req.query;
        
        if (!year) {
            return res.status(400).json({
                error: 'Year parameter is required'
            });
        }
        
        const yearNum = parseInt(year);
        if (isNaN(yearNum)) {
            return res.status(400).json({
                error: 'Year must be a valid number'
            });
        }
        
        const codes = requiredCodes ? requiredCodes.split(',') : [];
        const status = await datasetService.getDatasetStatus(yearNum, codes);
        
        res.json(status);
        
    } catch (error) {
        console.error('Error getting dataset status:', error);
        res.status(500).json({
            error: 'Failed to get dataset status',
            message: error.message
        });
    }
};

// Delete dataset entry
exports.deleteDatasetEntry = async (req, res) => {
    try {
        const { id } = req.params;
        
        const success = await datasetService.deleteDatasetEntry(id);
        
        if (!success) {
            return res.status(404).json({
                error: 'Dataset entry not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Dataset entry deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting dataset entry:', error);
        res.status(500).json({
            error: 'Failed to delete dataset entry',
            message: error.message
        });
    }
};

// Get available years
exports.getAvailableYears = async (req, res) => {
    try {
        const years = await datasetService.getAvailableYears();
        res.json(years);
    } catch (error) {
        console.error('Error getting available years:', error);
        res.status(500).json({
            error: 'Failed to get available years',
            message: error.message
        });
    }
};

// Get common holiday codes
exports.getCommonHolidayCodes = async (req, res) => {
    try {
        const codes = datasetService.getCommonHolidayCodes();
        res.json(codes);
    } catch (error) {
        console.error('Error getting common holiday codes:', error);
        res.status(500).json({
            error: 'Failed to get common holiday codes',
            message: error.message
        });
    }
};

// Validate dataset (without saving)
exports.validateDataset = async (req, res) => {
    try {
        const { data } = req.body;
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            return res.status(400).json({
                error: 'Dataset is required and must be a non-empty array'
            });
        }
        
        const validation = datasetService.validateDataset(data);
        
        res.json({
            valid: validation.valid.length,
            invalid: validation.invalid.length,
            duplicates: validation.duplicates.length,
            details: validation
        });
        
    } catch (error) {
        console.error('Error validating dataset:', error);
        res.status(500).json({
            error: 'Failed to validate dataset',
            message: error.message
        });
    }
};
