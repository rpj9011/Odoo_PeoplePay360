/**
 * Migration: Create Default Leave Year
 * 
 * This migration creates a default leave year for the current calendar year
 * and sets it as the active year.
 */

const mongoose = require('mongoose');
const LeaveYear = require('../models/LeaveYear');

async function up() {
    console.log('[Migration 001] Creating default leave year...');
    
    try {
        const currentYear = new Date().getFullYear();
        
        // Check if a leave year already exists
        const existingYear = await LeaveYear.findOne({ year: currentYear });
        
        if (existingYear) {
            console.log(`[Migration 001] Leave year ${currentYear} already exists. Skipping creation.`);
            
            // Ensure it's active if no other active year exists
            const activeYear = await LeaveYear.findOne({ isActive: true });
            if (!activeYear) {
                existingYear.isActive = true;
                await existingYear.save();
                console.log(`[Migration 001] Set year ${currentYear} as active.`);
            }
            
            return existingYear;
        }
        
        // Create default leave year
        const defaultYear = await LeaveYear.create({
            year: currentYear,
            startDate: new Date(currentYear, 0, 1), // January 1
            endDate: new Date(currentYear, 11, 31, 23, 59, 59, 999), // December 31
            isActive: true,
            isLocked: false
        });
        
        console.log(`[Migration 001] ✓ Created default leave year: ${currentYear}`);
        console.log(`[Migration 001] ✓ Year ID: ${defaultYear._id}`);
        console.log(`[Migration 001] ✓ Active: ${defaultYear.isActive}`);
        
        return defaultYear;
    } catch (error) {
        console.error('[Migration 001] ✗ Error creating default leave year:', error.message);
        throw error;
    }
}

async function down() {
    console.log('[Migration 001] Rolling back: Removing default leave year...');
    
    try {
        const currentYear = new Date().getFullYear();
        const result = await LeaveYear.deleteOne({ year: currentYear });
        
        if (result.deletedCount > 0) {
            console.log(`[Migration 001] ✓ Removed leave year ${currentYear}`);
        } else {
            console.log(`[Migration 001] No leave year found for ${currentYear}`);
        }
    } catch (error) {
        console.error('[Migration 001] ✗ Error during rollback:', error.message);
        throw error;
    }
}

module.exports = { up, down };
