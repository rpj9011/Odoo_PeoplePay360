// backend/cron/employeeDocumentCron.js
// Daily check: when probationEndDate is reached, auto-create pending document records.
const mongoose = require('mongoose');
const { runProbationEndChecks } = require('../controllers/employeeDocumentController');

async function runEmployeeDocumentProbationChecks() {
    if (mongoose.connection.readyState !== 1) {
        console.log('[CRON] Employee document probation check skipped — DB not connected.');
        return;
    }

    try {
        const result = await runProbationEndChecks();
        if (result.processed > 0) {
            console.log(`[CRON] Employee document probation checks: ${result.processed} record(s) created.`);
        }
    } catch (err) {
        console.error('[CRON] Employee document probation check error:', err);
    }
}

module.exports = { runEmployeeDocumentProbationChecks };
