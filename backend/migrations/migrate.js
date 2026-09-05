/**
 * Migration Runner Script
 * 
 * Runs database migrations in order
 * Usage: node migrations/migrate.js [up|down]
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

// Migration files in order
const MIGRATIONS = [
    '001_create_default_leave_year',
    '002_associate_holidays_with_leave_year'
];

async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✓ Connected to MongoDB');
    } catch (error) {
        console.error('✗ Failed to connect to MongoDB:', error.message);
        process.exit(1);
    }
}

async function runMigrations(direction = 'up') {
    console.log(`\n========================================`);
    console.log(`Running migrations: ${direction.toUpperCase()}`);
    console.log(`========================================\n`);

    const migrations = direction === 'up' ? MIGRATIONS : [...MIGRATIONS].reverse();

    for (const migrationName of migrations) {
        const migrationPath = path.join(__dirname, `${migrationName}.js`);

        if (!fs.existsSync(migrationPath)) {
            console.error(`✗ Migration file not found: ${migrationPath}`);
            continue;
        }

        try {
            const migration = require(migrationPath);

            if (typeof migration[direction] !== 'function') {
                console.error(`✗ Migration ${migrationName} does not have a ${direction} function`);
                continue;
            }

            console.log(`\n--- Running: ${migrationName} (${direction}) ---`);
            await migration[direction]();
            console.log(`✓ Completed: ${migrationName}\n`);
        } catch (error) {
            console.error(`✗ Error in migration ${migrationName}:`, error.message);
            console.error(error.stack);

            // Ask if we should continue or abort
            console.log('\nMigration failed. Aborting remaining migrations.');
            process.exit(1);
        }
    }

    console.log(`\n========================================`);
    console.log(`All migrations completed successfully!`);
    console.log(`========================================\n`);
}

async function main() {
    const direction = process.argv[2] || 'up';

    if (!['up', 'down'].includes(direction)) {
        console.error('Usage: node migrate.js [up|down]');
        process.exit(1);
    }

    try {
        await connectDatabase();
        await runMigrations(direction);
    } catch (error) {
        console.error('Migration process failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('✓ Database connection closed');
        process.exit(0);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { runMigrations };
