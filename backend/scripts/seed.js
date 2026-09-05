/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SEED SCRIPT — Odoo Attendance System
 * ─────────────────────────────────────────────────────────────────────────────
 * Populates the database with realistic dummy data for all roles so the app
 * is immediately explorable after a fresh install.
 *
 * WHAT GETS CREATED
 * ─────────────────
 *  • 2 Shifts        — General Shift 1 (10 AM) & General Shift 2 (11 AM)
 *  • 1 LeaveYear     — current calendar year (active)
 *  • 12 Holidays     — mix of national / company holidays for the year
 *  • 4 SalaryRules   — Basic, HRA, Gross, PF Deduction
 *  • 1 SalaryStructure
 *  • 8 TimeOffTypes  — Planned, Sick, Casual, Loss of Pay, Compensatory,
 *                      Backdated Leave, Comp-Off, Year End
 *  • 1 OfficeLocation
 *  • 10 Users (one per role + extras):
 *      Admin × 1 | HRManager × 1 | HRPayrollUser × 1 |
 *      HRPayrollManager × 1 | Employee × 4 | Intern × 2
 *  • 10 Contracts    — one Running contract per employee
 *  • 90 AttendanceLogs  — last 30 working days per employee (3 employees)
 *  • 12 LeaveRequests  — mix of Planned / Sick / Casual, approved & pending
 *  • LeaveLedger entries for each approved leave deduction
 *
 * SAFE TO RE-RUN
 * ──────────────
 * Uses upsert / findOrCreate patterns throughout.  Running twice will NOT
 * duplicate data — existing records are detected and skipped.
 *
 * USAGE
 * ─────
 *   node backend/scripts/seed.js
 *
 * The script reads MONGODB_URI from backend/.env automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const path = require('path');
// Load .env from backend/.env (script lives in backend/scripts/)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

// ── Models ────────────────────────────────────────────────────────────────────
const User             = require('../models/User');
const Shift            = require('../models/Shift');
const LeaveYear        = require('../models/LeaveYear');
const Holiday          = require('../models/Holiday');
const SalaryRule       = require('../models/SalaryRule');
const SalaryStructure  = require('../models/SalaryStructure');
const TimeOffType      = require('../models/TimeOffType');
const Contract         = require('../models/Contract');
const AttendanceLog    = require('../models/AttendanceLog');
const LeaveRequest     = require('../models/LeaveRequest');
const LeaveLedger      = require('../models/LeaveLedger');
const OfficeLocation   = require('../models/OfficeLocation');
const Setting          = require('../models/Setting');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** bcrypt hash with cost-10 (fast enough for dev seeding) */
async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

/**
 * Return a Date for `date` at the given hour/minute in local time.
 * @param {Date|string} date
 * @param {number} hour
 * @param {number} [minute=0]
 */
function atTime(date, hour, minute = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** YYYY-MM-DD string for a Date */
function toDateStr(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Collect the last `count` working days (Mon–Fri) going back from today,
 * skipping the current day if it's a weekend.
 */
function lastWorkingDays(count) {
  const days = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < count) {
    cursor.setDate(cursor.getDate() - 1);
    const dow = cursor.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      days.push(new Date(cursor));
    }
  }
  return days.reverse(); // chronological
}

/** Upsert a single document by a filter; returns the document */
async function upsert(Model, filter, data) {
  const existing = await Model.findOne(filter);
  if (existing) return existing;
  return Model.create(data);
}

// ── Logging helpers ───────────────────────────────────────────────────────────
const OK   = (msg) => console.log(`  ✅  ${msg}`);
const SKIP = (msg) => console.log(`  ⏭️   ${msg} (already exists)`);
const INFO = (msg) => console.log(`\n📦  ${msg}`);
const WARN = (msg) => console.warn(`  ⚠️   ${msg}`);

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — SHIFTS
// ═════════════════════════════════════════════════════════════════════════════
async function seedShifts() {
  INFO('Seeding Shifts…');

  const shiftsData = [
    {
      shiftName: 'General Shift 1',
      shiftType: 'Fixed',
      startTime: '10:00',
      endTime: '19:00',
      durationHours: 9,
      paidBreakMinutes: 30,
    },
    {
      shiftName: 'General Shift 2',
      shiftType: 'Fixed',
      startTime: '11:00',
      endTime: '20:00',
      durationHours: 9,
      paidBreakMinutes: 30,
    },
    {
      shiftName: 'Flexible Shift',
      shiftType: 'Flexible',
      durationHours: 9,
      paidBreakMinutes: 30,
    },
  ];

  const results = {};
  for (const s of shiftsData) {
    const existing = await Shift.findOne({ shiftName: s.shiftName });
    if (existing) {
      SKIP(`Shift: ${s.shiftName}`);
      results[s.shiftName] = existing;
    } else {
      const created = await Shift.create(s);
      OK(`Shift: ${created.shiftName}`);
      results[s.shiftName] = created;
    }
  }
  return results;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — LEAVE YEAR
// ═════════════════════════════════════════════════════════════════════════════
async function seedLeaveYear() {
  INFO('Seeding LeaveYear…');
  const year = new Date().getFullYear();

  let leaveYear = await LeaveYear.findOne({ year });
  if (leaveYear) {
    SKIP(`LeaveYear ${year}`);
    // Ensure it's marked active
    if (!leaveYear.isActive) {
      await LeaveYear.updateMany({}, { isActive: false });
      leaveYear.isActive = true;
      await leaveYear.save();
      OK(`LeaveYear ${year} — set to active`);
    }
    return leaveYear;
  }

  // Deactivate any stale active years first
  await LeaveYear.updateMany({ isActive: true }, { isActive: false });

  leaveYear = await LeaveYear.create({
    year,
    startDate: new Date(year, 0, 1),
    endDate:   new Date(year, 11, 31, 23, 59, 59, 999),
    isActive:  true,
    isLocked:  false,
  });
  OK(`LeaveYear ${year}`);
  return leaveYear;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — HOLIDAYS
// ═════════════════════════════════════════════════════════════════════════════
async function seedHolidays(leaveYear, adminUser) {
  INFO('Seeding Holidays…');
  const y = leaveYear.year;

  const holidays = [
    { name: 'New Year\'s Day',         date: new Date(y,  0,  1), type: 'National' },
    { name: 'Republic Day',            date: new Date(y,  0, 26), type: 'National' },
    { name: 'Holi',                    date: new Date(y,  2, 14), type: 'National' },
    { name: 'Good Friday',             date: new Date(y,  3, 18), type: 'National' },
    { name: 'Labour Day',              date: new Date(y,  4,  1), type: 'National' },
    { name: 'Independence Day',        date: new Date(y,  7, 15), type: 'National' },
    { name: 'Gandhi Jayanti',          date: new Date(y,  9,  2), type: 'National' },
    { name: 'Dussehra',                date: new Date(y,  9,  2), type: 'Regional' },
    { name: 'Diwali',                  date: new Date(y, 10, 12), type: 'National' },
    { name: 'Christmas Day',           date: new Date(y, 11, 25), type: 'National' },
    { name: 'Company Foundation Day',  date: new Date(y,  5, 15), type: 'Company'  },
    { name: 'Year-End Closure',        date: new Date(y, 11, 31), type: 'Company'  },
  ];

  for (const h of holidays) {
    const existing = await Holiday.findOne({ name: h.name, leaveYearId: leaveYear._id });
    if (existing) {
      SKIP(`Holiday: ${h.name}`);
      continue;
    }
    await Holiday.create({
      name:           h.name,
      date:           h.date,
      type:           h.type,
      isTentative:    false,
      appliesTo:      'All',
      leaveYearId:    leaveYear._id,
      calculationType:'MANUAL',
      createdBy:      adminUser ? adminUser._id : undefined,
    });
    OK(`Holiday: ${h.name} (${h.type})`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4 — SALARY RULES & STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════
async function seedSalaryRulesAndStructure() {
  INFO('Seeding SalaryRules & SalaryStructure…');

  const rulesData = [
    {
      name: 'Basic Salary',
      code: 'BASIC',
      category: 'Basic',
      sequence: 10,
      computationMethod: 'PercentageOfWage',
      percentage: 50,
      appliesTo: 'Earning',
    },
    {
      name: 'House Rent Allowance',
      code: 'HRA',
      category: 'Allowance',
      sequence: 20,
      computationMethod: 'PercentageOfCategory',
      percentage: 40,
      percentageBaseCategory: 'Basic',
      appliesTo: 'Earning',
    },
    {
      name: 'Gross Salary',
      code: 'GROSS',
      category: 'Gross',
      sequence: 50,
      computationMethod: 'PercentageOfWage',
      percentage: 100,
      appliesTo: 'Earning',
    },
    {
      name: 'Provident Fund',
      code: 'PF',
      category: 'Deduction',
      sequence: 60,
      computationMethod: 'PercentageOfCategory',
      percentage: 12,
      percentageBaseCategory: 'Basic',
      appliesTo: 'Deduction',
    },
    {
      name: 'Net Salary',
      code: 'NET',
      category: 'Net',
      sequence: 100,
      computationMethod: 'Formula',
      formula: 'GROSS - PF',
      appliesTo: 'Earning',
    },
  ];

  const ruleIds = [];
  for (const r of rulesData) {
    let rule = await SalaryRule.findOne({ code: r.code });
    if (rule) {
      SKIP(`SalaryRule: ${r.code}`);
    } else {
      rule = await SalaryRule.create(r);
      OK(`SalaryRule: ${r.code} — ${r.name}`);
    }
    ruleIds.push({ rule: rule._id, sequence: r.sequence });
  }

  let structure = await SalaryStructure.findOne({ code: 'STD_MONTHLY' });
  if (structure) {
    SKIP('SalaryStructure: STD_MONTHLY');
  } else {
    structure = await SalaryStructure.create({
      name:        'Standard Monthly',
      code:        'STD_MONTHLY',
      description: 'Default monthly salary structure with Basic, HRA, PF deduction.',
      salaryRules: ruleIds,
      isActive:    true,
    });
    OK('SalaryStructure: Standard Monthly');
  }
  return structure;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5 — TIME-OFF TYPES
// ═════════════════════════════════════════════════════════════════════════════
async function seedTimeOffTypes() {
  INFO('Seeding TimeOffTypes…');

  const types = [
    {
      name: 'Planned',
      legacyRequestTypeMapping: 'Planned',
      requiresAllocation: true,
      approvalRequired: true,
      includeInPayroll: true,
      description: 'Pre-planned paid leave (max 10 days/year for permanent employees).',
    },
    {
      name: 'Sick',
      legacyRequestTypeMapping: 'Sick',
      requiresAllocation: true,
      approvalRequired: false,
      includeInPayroll: true,
      description: 'Sick leave with optional medical certificate.',
    },
    {
      name: 'Casual',
      legacyRequestTypeMapping: 'Casual',
      requiresAllocation: true,
      approvalRequired: true,
      includeInPayroll: true,
      description: 'Casual leave for personal or emergency needs.',
    },
    {
      name: 'Loss of Pay',
      legacyRequestTypeMapping: 'Loss of Pay',
      requiresAllocation: false,
      approvalRequired: true,
      includeInPayroll: true,
      description: 'Unpaid leave when all leave balances are exhausted.',
    },
    {
      name: 'Compensatory',
      legacyRequestTypeMapping: 'Compensatory',
      requiresAllocation: false,
      approvalRequired: true,
      includeInPayroll: false,
      description: 'Comp-off for working on a holiday or weekend.',
    },
    {
      name: 'Backdated Leave',
      legacyRequestTypeMapping: 'Backdated Leave',
      requiresAllocation: true,
      approvalRequired: true,
      includeInPayroll: true,
      description: 'Leave applied retroactively after the leave date.',
    },
    {
      name: 'Comp-Off',
      legacyRequestTypeMapping: 'Comp-Off',
      requiresAllocation: false,
      approvalRequired: true,
      includeInPayroll: false,
      description: 'Compensatory off granted for extra work hours.',
    },
    {
      name: 'Year End',
      legacyRequestTypeMapping: 'YEAR_END',
      requiresAllocation: false,
      approvalRequired: true,
      includeInPayroll: false,
      description: 'Year-end carry-forward or encashment of unused leave.',
    },
  ];

  for (const t of types) {
    const existing = await TimeOffType.findOne({ name: t.name });
    if (existing) {
      SKIP(`TimeOffType: ${t.name}`);
    } else {
      await TimeOffType.create(t);
      OK(`TimeOffType: ${t.name}`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6 — OFFICE LOCATION
// ═════════════════════════════════════════════════════════════════════════════
async function seedOfficeLocation() {
  INFO('Seeding OfficeLocation…');
  const existing = await OfficeLocation.findOne({ name: 'Head Office' });
  if (existing) {
    SKIP('OfficeLocation: Head Office');
    return existing;
  }
  const loc = await OfficeLocation.create({
    name:        'Head Office',
    address:     '101 Tech Park, Baner, Pune, Maharashtra 411045',
    latitude:    18.5626,
    longitude:   73.7750,
    radius:      200,
    isActive:    true,
    description: 'Main corporate office — Pune',
  });
  OK('OfficeLocation: Head Office');
  return loc;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7 — SETTINGS
// ═════════════════════════════════════════════════════════════════════════════
async function seedSettings() {
  INFO('Seeding Settings…');
  const existing = await Setting.findOne({ key: 'hrNotificationEmails' });
  if (existing) {
    SKIP('Setting: hrNotificationEmails');
  } else {
    await Setting.create({
      key:   'hrNotificationEmails',
      value: ['hr@example.com', 'admin@example.com'],
    });
    OK('Setting: hrNotificationEmails');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8 — USERS (all roles)
// ═════════════════════════════════════════════════════════════════════════════
async function seedUsers(shifts) {
  INFO('Seeding Users (all roles)…');

  const shift1 = shifts['General Shift 1'];
  const shift2 = shifts['General Shift 2'];

  const DEFAULT_PASSWORD = 'Password@123';
  const hash = await hashPassword(DEFAULT_PASSWORD);

  /**
   * All seeds use the same password: Password@123
   * Employee codes follow EMP-XXXX pattern, interns use INT-XXXX.
   */
  const usersData = [
    // ── ADMIN ─────────────────────────────────────────────────────────────
    {
      employeeCode:     'EMP-0001',
      fullName:         'Super Admin',
      email:            'admin@example.com',
      passwordHash:     hash,
      role:             'Admin',
      designation:      'System Administrator',
      department:       'IT',
      joiningDate:      new Date('2022-01-15'),
      employmentStatus: 'Permanent',
      employeeType:     'On-Role',
      probationStatus:  'Permanent',
      shiftGroup:       shift1._id,
      leaveBalances:    { sick: 6, casual: 6, paid: 10 },
      leaveEntitlements:{ sick: 6, casual: 6, paid: 10 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, extraFeatures: true,
        canViewAnalytics: true, canViewLiveAttendance: true,
        canManageResourceRequests: true, canManageHRQueries: true,
        canManageBulkAttendanceActions: true,
        privilegeLevel: 'advanced',
      },
    },
    // ── HR MANAGER ────────────────────────────────────────────────────────
    {
      employeeCode:     'EMP-0002',
      fullName:         'Priya Sharma',
      email:            'hrmanager@example.com',
      passwordHash:     hash,
      role:             'HRManager',
      designation:      'HR Manager',
      department:       'Human Resources',
      joiningDate:      new Date('2022-03-01'),
      employmentStatus: 'Permanent',
      employeeType:     'On-Role',
      probationStatus:  'Permanent',
      shiftGroup:       shift1._id,
      leaveBalances:    { sick: 6, casual: 5, paid: 8 },
      leaveEntitlements:{ sick: 6, casual: 6, paid: 10 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, extraFeatures: true,
        canViewAnalytics: true, canViewLiveAttendance: true,
        canManageResourceRequests: true, canManageHRQueries: true,
        canManageBulkAttendanceActions: true,
        privilegeLevel: 'advanced',
      },
    },
    // ── HR PAYROLL USER ───────────────────────────────────────────────────
    {
      employeeCode:     'EMP-0003',
      fullName:         'Rahul Verma',
      email:            'hrpayroll@example.com',
      passwordHash:     hash,
      role:             'HRPayrollUser',
      designation:      'Payroll Executive',
      department:       'Human Resources',
      joiningDate:      new Date('2023-01-10'),
      employmentStatus: 'Permanent',
      employeeType:     'On-Role',
      probationStatus:  'Permanent',
      shiftGroup:       shift1._id,
      leaveBalances:    { sick: 6, casual: 6, paid: 9 },
      leaveEntitlements:{ sick: 6, casual: 6, paid: 10 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, extraFeatures: false,
        canViewAnalytics: true, privilegeLevel: 'normal',
      },
    },
    // ── HR PAYROLL MANAGER ────────────────────────────────────────────────
    {
      employeeCode:     'EMP-0004',
      fullName:         'Anita Desai',
      email:            'hrpayrollmgr@example.com',
      passwordHash:     hash,
      role:             'HRPayrollManager',
      designation:      'Payroll Manager',
      department:       'Human Resources',
      joiningDate:      new Date('2021-06-01'),
      employmentStatus: 'Permanent',
      employeeType:     'On-Role',
      probationStatus:  'Permanent',
      shiftGroup:       shift2._id,
      leaveBalances:    { sick: 6, casual: 4, paid: 7 },
      leaveEntitlements:{ sick: 6, casual: 6, paid: 10 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, extraFeatures: true,
        canViewAnalytics: true, canManageResourceRequests: true,
        privilegeLevel: 'advanced',
      },
    },
    // ── EMPLOYEES ─────────────────────────────────────────────────────────
    {
      employeeCode:     'EMP-0005',
      fullName:         'Arjun Nair',
      email:            'arjun.nair@example.com',
      passwordHash:     hash,
      role:             'Employee',
      designation:      'Software Engineer',
      department:       'Engineering',
      joiningDate:      new Date('2023-04-03'),
      employmentStatus: 'Permanent',
      employeeType:     'On-Role',
      probationStatus:  'Permanent',
      shiftGroup:       shift1._id,
      leaveBalances:    { sick: 5, casual: 6, paid: 10 },
      leaveEntitlements:{ sick: 6, casual: 6, paid: 10 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, privilegeLevel: 'normal',
      },
    },
    {
      employeeCode:     'EMP-0006',
      fullName:         'Kavitha Reddy',
      email:            'kavitha.reddy@example.com',
      passwordHash:     hash,
      role:             'Employee',
      designation:      'UI/UX Designer',
      department:       'Design',
      joiningDate:      new Date('2023-07-17'),
      employmentStatus: 'Permanent',
      employeeType:     'On-Role',
      probationStatus:  'Permanent',
      shiftGroup:       shift2._id,
      leaveBalances:    { sick: 6, casual: 5, paid: 8 },
      leaveEntitlements:{ sick: 6, casual: 6, paid: 10 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, privilegeLevel: 'normal',
      },
    },
    {
      employeeCode:     'EMP-0007',
      fullName:         'Mohammed Ali',
      email:            'mohammed.ali@example.com',
      passwordHash:     hash,
      role:             'Employee',
      designation:      'DevOps Engineer',
      department:       'Engineering',
      joiningDate:      new Date('2022-09-05'),
      employmentStatus: 'Permanent',
      employeeType:     'On-Role',
      probationStatus:  'Permanent',
      shiftGroup:       shift1._id,
      leaveBalances:    { sick: 4, casual: 3, paid: 6 },
      leaveEntitlements:{ sick: 6, casual: 6, paid: 10 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, privilegeLevel: 'normal',
      },
    },
    {
      employeeCode:     'EMP-0008',
      fullName:         'Sneha Patil',
      email:            'sneha.patil@example.com',
      passwordHash:     hash,
      role:             'Employee',
      designation:      'QA Engineer',
      department:       'Engineering',
      joiningDate:      new Date('2024-01-08'),
      employmentStatus: 'Probation',
      employeeType:     'On-Role',
      probationStatus:  'On Probation',
      probationStartDate: new Date('2024-01-08'),
      probationEndDate:   new Date('2024-07-07'),
      probationDurationMonths: 6,
      shiftGroup:       shift2._id,
      leaveBalances:    { sick: 3, casual: 3, paid: 0 },
      leaveEntitlements:{ sick: 6, casual: 6, paid: 0 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, privilegeLevel: 'normal',
      },
    },
    // ── INTERNS ───────────────────────────────────────────────────────────
    {
      employeeCode:     'INT-0001',
      fullName:         'Rohan Joshi',
      email:            'rohan.joshi@example.com',
      passwordHash:     hash,
      role:             'Intern',
      designation:      'Software Intern',
      department:       'Engineering',
      joiningDate:      new Date('2026-06-01'),
      employmentStatus: 'Intern',
      employeeType:     'Intern',
      probationStatus:  'None',
      shiftGroup:       shift1._id,
      internshipDurationMonths: 6,
      leaveBalances:    { sick: 2, casual: 2, paid: 0 },
      leaveEntitlements:{ sick: 2, casual: 2, paid: 0 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, privilegeLevel: 'restricted',
      },
    },
    {
      employeeCode:     'INT-0002',
      fullName:         'Simran Kaur',
      email:            'simran.kaur@example.com',
      passwordHash:     hash,
      role:             'Intern',
      designation:      'HR Intern',
      department:       'Human Resources',
      joiningDate:      new Date('2026-07-01'),
      employmentStatus: 'Intern',
      employeeType:     'Intern',
      probationStatus:  'None',
      shiftGroup:       shift2._id,
      internshipDurationMonths: 3,
      leaveBalances:    { sick: 2, casual: 2, paid: 0 },
      leaveEntitlements:{ sick: 2, casual: 2, paid: 0 },
      workingDays:      ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      isActive:         true,
      featurePermissions: {
        leaves: true, breaks: true, privilegeLevel: 'restricted',
      },
    },
  ];

  const createdUsers = {};
  for (const u of usersData) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      SKIP(`User: ${u.fullName} (${u.role})`);
      createdUsers[u.employeeCode] = existing;
    } else {
      const created = await User.create(u);
      OK(`User: ${created.fullName} — ${created.role} [${created.employeeCode}]`);
      createdUsers[u.employeeCode] = created;
    }
  }
  return createdUsers;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 9 — CONTRACTS
// ═════════════════════════════════════════════════════════════════════════════
async function seedContracts(users, shifts, salaryStructure) {
  INFO('Seeding Contracts…');

  const contractDefs = [
    { code: 'EMP-0001', wage: 120000, dept: 'IT',              pos: 'System Administrator' },
    { code: 'EMP-0002', wage:  90000, dept: 'Human Resources', pos: 'HR Manager'           },
    { code: 'EMP-0003', wage:  75000, dept: 'Human Resources', pos: 'Payroll Executive'    },
    { code: 'EMP-0004', wage:  95000, dept: 'Human Resources', pos: 'Payroll Manager'      },
    { code: 'EMP-0005', wage:  80000, dept: 'Engineering',     pos: 'Software Engineer'    },
    { code: 'EMP-0006', wage:  70000, dept: 'Design',          pos: 'UI/UX Designer'       },
    { code: 'EMP-0007', wage:  85000, dept: 'Engineering',     pos: 'DevOps Engineer'      },
    { code: 'EMP-0008', wage:  55000, dept: 'Engineering',     pos: 'QA Engineer'          },
    { code: 'INT-0001', wage:  20000, dept: 'Engineering',     pos: 'Software Intern'      },
    { code: 'INT-0002', wage:  15000, dept: 'Human Resources', pos: 'HR Intern'            },
  ];

  const shift1 = shifts['General Shift 1'];

  for (const def of contractDefs) {
    const user = users[def.code];
    if (!user) { WARN(`User ${def.code} not found — skipping contract`); continue; }

    const existing = await Contract.findOne({ employee: user._id, status: 'Running' });
    if (existing) {
      SKIP(`Contract for ${def.code}`);
      continue;
    }

    try {
      await Contract.create({
        employee:         user._id,
        startDate:        user.joiningDate,
        endDate:          null, // open-ended
        status:           'Running',
        department:       def.dept,
        jobPosition:      def.pos,
        wagePerMonth:     def.wage,
        workingSchedule:  shift1._id,
        salaryStructure:  salaryStructure._id,
        notes:            'Seeded by seed.js',
      });
      OK(`Contract: ${def.code} — ₹${def.wage.toLocaleString('en-IN')}/month`);
    } catch (err) {
      WARN(`Contract for ${def.code} failed: ${err.message}`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 10 — ATTENDANCE LOGS (last 30 working days for employees)
// ═════════════════════════════════════════════════════════════════════════════
async function seedAttendanceLogs(users) {
  INFO('Seeding AttendanceLogs (last 30 working days for 3 employees)…');

  // Seed for 3 employees to keep the data set manageable but realistic
  const targetCodes = ['EMP-0005', 'EMP-0006', 'EMP-0007'];
  const workingDays = lastWorkingDays(30);

  for (const code of targetCodes) {
    const user = users[code];
    if (!user) continue;

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < workingDays.length; i++) {
      const day = workingDays[i];
      const dateStr = toDateStr(day);

      const existing = await AttendanceLog.findOne({ user: user._id, attendanceDate: dateStr });
      if (existing) { skipped++; continue; }

      // Vary attendance patterns to make the data look realistic
      const roll = i % 7; // deterministic "random" based on position

      let clockIn, clockOut, isLate, isHalfDay, lateMinutes, totalWorkingHours, attendanceStatus, totalHours;

      if (roll === 5) {
        // Absent day — no clockIn
        await AttendanceLog.create({
          user:                 user._id,
          attendanceDate:       dateStr,
          shiftDurationMinutes: 540,
          attendanceStatus:     'Absent',
          totalWorkingHours:    0,
        });
        created++;
        continue;
      }

      if (roll === 3) {
        // Late arrival
        clockIn         = atTime(day, 10, 35); // 35 min late for 10 AM shift
        clockOut        = atTime(day, 20, 5);
        isLate          = true;
        lateMinutes     = 35;
        totalHours      = 9.5;
        attendanceStatus= 'Late';
        isHalfDay       = false;
      } else if (roll === 6) {
        // Half-day
        clockIn         = atTime(day, 10, 5);
        clockOut        = atTime(day, 14, 30);
        isHalfDay       = true;
        isLate          = false;
        lateMinutes     = 0;
        totalHours      = 4.4;
        attendanceStatus= 'Half-day';
      } else {
        // Normal on-time
        const checkInMinute = [0, 2, 5, 8, 12][i % 5]; // slight variation
        clockIn         = atTime(day, 10, checkInMinute);
        clockOut        = atTime(day, 19, 10 + (i % 30));
        isLate          = false;
        lateMinutes     = 0;
        totalHours      = 9 + checkInMinute / 60;
        attendanceStatus= 'On-time';
        isHalfDay       = false;
      }

      await AttendanceLog.create({
        user:                   user._id,
        attendanceDate:         dateStr,
        clockInTime:            clockIn,
        clockOutTime:           clockOut || null,
        shiftDurationMinutes:   540,
        penaltyMinutes:         0,
        paidBreakMinutesTaken:  roll === 6 ? 0 : 30,
        unpaidBreakMinutesTaken:0,
        isLate,
        isHalfDay:              isHalfDay || false,
        lateMinutes:            lateMinutes || 0,
        attendanceStatus,
        totalWorkingHours:      totalHours || 9,
        logoutType:             'MANUAL',
      });
      created++;
    }

    OK(`AttendanceLogs for ${user.fullName}: ${created} created, ${skipped} skipped`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 11 — LEAVE REQUESTS + LEAVE LEDGER ENTRIES
// ═════════════════════════════════════════════════════════════════════════════
async function seedLeaveRequests(users) {
  INFO('Seeding LeaveRequests & LeaveLedger entries…');

  const admin = users['EMP-0001'];
  const now   = new Date();
  const yr    = now.getFullYear();

  /**
   * Approved past leaves.  We deduct from leaveBalances and write a ledger entry.
   * Pending future leaves are added without deduction.
   */
  const leaveSpecs = [
    // Arjun — 1 Sick approved (past), 1 Casual pending (future)
    {
      emp:  'EMP-0005',
      type: 'Sick',
      dates: [new Date(yr, now.getMonth() - 1, 5)],
      reason: 'High fever and body ache.',
      status: 'Approved',
      leaveBalanceType: 'sick',
    },
    {
      emp:  'EMP-0005',
      type: 'Casual',
      dates: [new Date(yr, now.getMonth() + 1, 10)],
      reason: 'Personal work.',
      status: 'Pending',
      leaveBalanceType: 'casual',
    },
    // Kavitha — 2-day Planned approved (past), 1 Casual approved
    {
      emp:  'EMP-0006',
      type: 'Planned',
      dates: [new Date(yr, now.getMonth() - 2, 14), new Date(yr, now.getMonth() - 2, 15)],
      reason: 'Family vacation.',
      status: 'Approved',
      leaveBalanceType: 'paid',
    },
    {
      emp:  'EMP-0006',
      type: 'Casual',
      dates: [new Date(yr, now.getMonth() - 1, 22)],
      reason: 'Personal errand.',
      status: 'Approved',
      leaveBalanceType: 'casual',
    },
    {
      emp:  'EMP-0006',
      type: 'Sick',
      dates: [new Date(yr, now.getMonth() + 1, 3), new Date(yr, now.getMonth() + 1, 4)],
      reason: 'Doctor appointment scheduled.',
      status: 'Pending',
      leaveBalanceType: 'sick',
    },
    // Mohammed — 1 Sick (rejected), 1 Planned approved, 1 LOP approved
    {
      emp:  'EMP-0007',
      type: 'Sick',
      dates: [new Date(yr, now.getMonth() - 3, 8)],
      reason: 'Stomach infection.',
      status: 'Rejected',
      leaveBalanceType: 'sick',
    },
    {
      emp:  'EMP-0007',
      type: 'Planned',
      dates: [
        new Date(yr, now.getMonth() - 1, 1),
        new Date(yr, now.getMonth() - 1, 2),
        new Date(yr, now.getMonth() - 1, 3),
      ],
      reason: 'Annual trip.',
      status: 'Approved',
      leaveBalanceType: 'paid',
    },
    {
      emp:  'EMP-0007',
      type: 'Loss of Pay',
      dates: [new Date(yr, now.getMonth() - 1, 20)],
      reason: 'Leave balance exhausted.',
      status: 'Approved',
      leaveBalanceType: null, // LOP doesn't deduct from balance
    },
    // Sneha (probation) — 1 Sick pending
    {
      emp:  'EMP-0008',
      type: 'Sick',
      dates: [new Date(yr, now.getMonth(), 12)],
      reason: 'Cold and flu.',
      status: 'Pending',
      leaveBalanceType: 'sick',
    },
    // Interns — 1 Casual each
    {
      emp:  'INT-0001',
      type: 'Casual',
      dates: [new Date(yr, now.getMonth(), 18)],
      reason: 'University event.',
      status: 'Pending',
      leaveBalanceType: 'casual',
    },
    {
      emp:  'INT-0002',
      type: 'Sick',
      dates: [new Date(yr, now.getMonth() - 1, 28)],
      reason: 'Not feeling well.',
      status: 'Approved',
      leaveBalanceType: 'sick',
    },
    // HR Manager — 1 Planned approved
    {
      emp:  'EMP-0002',
      type: 'Planned',
      dates: [new Date(yr, now.getMonth() - 1, 10), new Date(yr, now.getMonth() - 1, 11)],
      reason: 'Family function.',
      status: 'Approved',
      leaveBalanceType: 'paid',
    },
  ];

  // Map requestType name to LeaveRequest enum value
  const TYPE_MAP = {
    'Sick':          'Sick',
    'Casual':        'Casual',
    'Planned':       'Planned',
    'Loss of Pay':   'Loss of Pay',
    'Compensatory':  'Compensatory',
    'Backdated Leave':'Backdated Leave',
    'Comp-Off':      'Comp-Off',
    'Year End':      'YEAR_END',
  };

  for (const spec of leaveSpecs) {
    const emp = users[spec.emp];
    if (!emp) { WARN(`User ${spec.emp} not found — skipping leave`); continue; }

    const existing = await LeaveRequest.findOne({
      employee:    emp._id,
      requestType: TYPE_MAP[spec.type],
      leaveDates:  { $in: spec.dates.map(d => new Date(d)) },
    });
    if (existing) {
      SKIP(`LeaveRequest: ${emp.fullName} — ${spec.type} (${toDateStr(spec.dates[0])})`);
      continue;
    }

    const leaveDoc = await LeaveRequest.create({
      employee:    emp._id,
      requestType: TYPE_MAP[spec.type],
      leaveDates:  spec.dates,
      reason:      spec.reason,
      status:      spec.status,
      approvedBy:  spec.status === 'Approved' ? admin._id : undefined,
      approvedAt:  spec.status === 'Approved' ? new Date() : undefined,
      rejectionNotes: spec.status === 'Rejected' ? 'Leave not applicable per policy.' : undefined,
      isBackdated: false,
    });
    OK(`LeaveRequest: ${emp.fullName} — ${spec.type} [${spec.status}] (${spec.dates.length} day(s))`);

    // ── Ledger + balance update for APPROVED leaves ───────────────────────
    if (spec.status === 'Approved' && spec.leaveBalanceType) {
      const days = spec.dates.length;
      const before = emp.leaveBalances[spec.leaveBalanceType];
      const after  = Math.max(0, before - days);

      // Update balance on the User document
      await User.findByIdAndUpdate(emp._id, {
        [`leaveBalances.${spec.leaveBalanceType}`]: after,
      });

      await LeaveLedger.create({
        employeeId:      emp._id,
        leaveType:       spec.leaveBalanceType,
        transactionType: 'DEDUCTION',
        amount:          -days,
        balanceBefore:   before,
        balanceAfter:    after,
        month:           spec.dates[0].getMonth() + 1,
        year:            spec.dates[0].getFullYear(),
        source:          'LEAVE_APPROVAL',
        referenceId:     leaveDoc._id,
        referenceModel:  'LeaveRequest',
        description:     `${spec.type} leave deduction — ${days} day(s)`,
        performedBy:     admin._id,
      });
      OK(`  └─ LeaveLedger: ${spec.leaveBalanceType} −${days} (${before} → ${after})`);

      // Refresh in-memory copy for subsequent specs of the same employee
      emp.leaveBalances[spec.leaveBalanceType] = after;
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  🌱  ODOO ATTENDANCE SYSTEM — SEED SCRIPT');
  console.log('══════════════════════════════════════════════════════\n');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/attendance_db';
  console.log(`🔗  Connecting to: ${uri}\n`);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30_000,
    connectTimeoutMS:         20_000,
    socketTimeoutMS:          60_000,
  });
  console.log(`✅  Connected — database: ${mongoose.connection.name}\n`);

  try {
    // 1. Shifts (no dependencies)
    const shifts = await seedShifts();

    // 2. LeaveYear (no dependencies)
    const leaveYear = await seedLeaveYear();

    // 3. Salary infra (no dependencies)
    const salaryStructure = await seedSalaryRulesAndStructure();

    // 4. TimeOffTypes (no dependencies)
    await seedTimeOffTypes();

    // 5. Office Location (no dependencies)
    await seedOfficeLocation();

    // 6. Settings (no dependencies)
    await seedSettings();

    // 7. Users — depends on shifts
    const users = await seedUsers(shifts);

    // 8. Holidays — depends on leaveYear and admin user
    await seedHolidays(leaveYear, users['EMP-0001']);

    // 9. Contracts — depends on users, shifts, salaryStructure
    await seedContracts(users, shifts, salaryStructure);

    // 10. Attendance Logs — depends on users
    await seedAttendanceLogs(users);

    // 11. Leave Requests + Ledger — depends on users
    await seedLeaveRequests(users);

    // ── Summary ──────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  ✅  SEED COMPLETE');
    console.log('══════════════════════════════════════════════════════');
    console.log('\n📋  LOGIN CREDENTIALS (all use: Password@123)\n');
    console.log('  Role                │ Email');
    console.log('  ─────────────────── │ ──────────────────────────────');
    console.log('  Admin               │ admin@example.com');
    console.log('  HRManager           │ hrmanager@example.com');
    console.log('  HRPayrollUser       │ hrpayroll@example.com');
    console.log('  HRPayrollManager    │ hrpayrollmgr@example.com');
    console.log('  Employee (Arjun)    │ arjun.nair@example.com');
    console.log('  Employee (Kavitha)  │ kavitha.reddy@example.com');
    console.log('  Employee (Mohammed) │ mohammed.ali@example.com');
    console.log('  Employee (Sneha)    │ sneha.patil@example.com');
    console.log('  Intern  (Rohan)     │ rohan.joshi@example.com');
    console.log('  Intern  (Simran)    │ simran.kaur@example.com');
    console.log('\n  Password for all accounts: Password@123');
    console.log('══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌  Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌  Disconnected from MongoDB.\n');
  }
}

main();
