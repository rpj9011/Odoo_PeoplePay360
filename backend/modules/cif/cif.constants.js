// CIF Status Constants
const CIF_STATUSES = ['draft', 'open', 'under_review', 'escalated', 'resolved', 'closed', 'archived'];

// CIF Categories
const CIF_CATEGORIES = [
  'compliance_violation',
  'behavioral_warning',
  'attendance_escalation',
  'performance_concern',
  'legal_notice',
  'investigation',
  'documentation_note',
  'termination_related'
];

// CIF Severities
const CIF_SEVERITIES = ['low', 'medium', 'high', 'critical'];

// Confidential Levels
const CONFIDENTIAL_LEVELS = ['internal', 'legal_hold'];

module.exports = {
  CIF_STATUSES,
  CIF_CATEGORIES,
  CIF_SEVERITIES,
  CONFIDENTIAL_LEVELS
};
