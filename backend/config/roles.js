// backend/config/roles.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for role constants used by middleware, routes, and
// controllers.  Import this file instead of hard-coding role strings.
//
// MIGRATION NOTE (2026):
//   The original 'HR' role has been replaced by three graduated roles.
//   Any existing MongoDB documents with role:'HR' must be updated via:
//     node backend/scripts/migrate-hr-role.js
//   until that migration runs, authenticateToken will fall back to treating
//   unknown roles as Employee-level (no elevated access granted).
// ─────────────────────────────────────────────────────────────────────────────

/** All valid role values (mirrors the User model enum). */
const ALL_ROLES = ['Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager', 'Employee', 'Intern'];

/**
 * HR_FAMILY – every role that has full parity with the old 'HR' role for all
 * existing Employees / Attendance / Leave / Document / Scheduling features.
 * Use this wherever the old code checked ['Admin', 'HR'].
 */
const HR_FAMILY = ['Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'];

/**
 * HR_STAFF – the three HR roles without Admin.
 * Use when you need "any HR role but not Admin", e.g. notification routing.
 */
const HR_STAFF = ['HRManager', 'HRPayrollUser', 'HRPayrollManager'];

/**
 * PAYROLL_READ – roles allowed to read Payruns / Payslips.
 */
const PAYROLL_READ = ['Admin', 'HRPayrollUser', 'HRPayrollManager'];

/**
 * PAYROLL_WRITE – roles allowed to create / edit Payruns & Payslips.
 * HRPayrollUser has Create/Read/Update on Payruns & Payslips.
 */
const PAYROLL_WRITE = ['Admin', 'HRPayrollUser', 'HRPayrollManager'];

/**
 * SALARY_CONFIG_WRITE – roles allowed to create / edit SalaryStructures & SalaryRules.
 * HRPayrollUser is READ-ONLY on salary config; only HRPayrollManager can write it.
 */
const SALARY_CONFIG_WRITE = ['Admin', 'HRPayrollManager'];

/**
 * Helper: returns true when `role` is in the HR family (old 'Admin'|'HR' parity).
 * @param {string} role
 */
function isHRFamily(role) {
    return HR_FAMILY.includes(role);
}

module.exports = {
    ALL_ROLES,
    HR_FAMILY,
    HR_STAFF,
    PAYROLL_READ,
    PAYROLL_WRITE,
    SALARY_CONFIG_WRITE,
    isHRFamily,
};
