/**
 * Migration: Associate Existing Holidays with Leave Year
 * 
 * This migration updates all existing holidays to reference the active leave year.
 * It must be run after migration 001 (create default leave year).
 */

const mongoose = require('mongoose');
const Holiday = require('../models/Holiday');
const LeaveYear = require('../models/LeaveYear');

async function up() {
    console.log('[Migration 002] Associating existing holidays with leave year...');
    
    try {
        // Get the active leave year (created in migration 001)
        const activeYear = await LeaveYear.findOne({ isActive: true });
        
        if (!activeYear) {
            throw new Error('No active leave year found. Please run migration 001 first.');
        }
        
        console.log(`[Migration 002] Found active year: ${activeYear.year} (ID: ${activeYear._id})`);
        
        // Count holidays without leaveYearId
        const holidaysWithoutYear = await Holiday.countDocuments({ 
            leaveYearId: { $exists: false } 
        });
        
        console.log(`[Migration 002] Found ${holidaysWithoutYear} holidays without leave year association`);
        
        if (holidaysWithoutYear === 0) {
            console.log('[Migration 002] All holidays already have leave year association. Skipping.');
            return;
        }
        
        // Update all existing holidays to reference the active year
        const result = await Holiday.updateMany(
            { leaveYearId: { $exists: false } },
            { $set: { leaveYearId: activeYear._id } }
        );
        
        console.log(`[Migration 002] ✓ Updated ${result.modifiedCount} holidays`);
        
        // Verify all holidays now have leaveYearId
        const remainingWithoutYear = await Holiday.countDocuments({ 
            leaveYearId: { $exists: false } 
        });
        
        if (remainingWithoutYear > 0) {
            console.warn(`[Migration 002] ⚠ Warning: ${remainingWithoutYear} holidays still without leave year`);
        } else {
            console.log('[Migration 002] ✓ All holidays now have leave year association');
        }
        
        // Create indexes
        console.log('[Migration 002] Creating indexes...');
        
        try {
            await Holiday.collection.createIndex(
                { leaveYearId: 1, date: 1 },
                { name: 'leaveYearId_1_date_1' }
            );
            console.log('[Migration 002] ✓ Created index: leaveYearId_1_date_1');
        } catch (error) {
            if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
                console.log('[Migration 002] Index leaveYearId_1_date_1 already exists');
            } else {
                throw error;
            }
        }
        
        try {
            await Holiday.collection.createIndex(
                { leaveYearId: 1, type: 1 },
                { name: 'leaveYearId_1_type_1' }
            );
            console.log('[Migration 002] ✓ Created index: leaveYearId_1_type_1');
        } catch (error) {
            if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
                console.log('[Migration 002] Index leaveYearId_1_type_1 already exists');
            } else {
                throw error;
            }
        }
        
        console.log('[Migration 002] ✓ Migration completed successfully');
        
        return {
            activeYearId: activeYear._id,
            activeYear: activeYear.year,
            holidaysUpdated: result.modifiedCount
        };
    } catch (error) {
        console.error('[Migration 002] ✗ Error during migration:', error.message);
        throw error;
    }
}

async function down() {
    console.log('[Migration 002] Rolling back: Removing leaveYearId from holidays...');
    
    try {
        const result = await Holiday.updateMany(
            {},
            { $unset: { leaveYearId: '' } }
        );
        
        console.log(`[Migration 002] ✓ Removed leaveYearId from ${result.modifiedCount} holidays`);
        
        // Drop indexes
        try {
            await Holiday.collection.dropIndex('leaveYearId_1_date_1');
            console.log('[Migration 002] ✓ Dropped index: leaveYearId_1_date_1');
        } catch (error) {
            if (error.code === 27 || error.codeName === 'IndexNotFound') {
                console.log('[Migration 002] Index leaveYearId_1_date_1 not found');
            } else {
                throw error;
            }
        }
        
        try {
            await Holiday.collection.dropIndex('leaveYearId_1_type_1');
            console.log('[Migration 002] ✓ Dropped index: leaveYearId_1_type_1');
        } catch (error) {
            if (error.code === 27 || error.codeName === 'IndexNotFound') {
                console.log('[Migration 002] Index leaveYearId_1_type_1 not found');
            } else {
                throw error;
            }
        }
        
        console.log('[Migration 002] ✓ Rollback completed');
    } catch (error) {
        console.error('[Migration 002] ✗ Error during rollback:', error.message);
        throw error;
    }
}

module.exports = { up, down };
