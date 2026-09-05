// CIF Status Constants
export const CIF_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' }
];

// Status labels mapping
export const STATUS_LABELS = {
  draft: 'Draft',
  open: 'Open',
  under_review: 'Under Review',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
  archived: 'Archived'
};

// Status color mapping
export const STATUS_COLORS = {
  draft: '#9CA3AF',
  open: '#DC2626',
  under_review: '#F59E0B',
  escalated: '#EF4444',
  resolved: '#10B981',
  closed: '#6B7280',
  archived: '#9CA3AF'
};

// Status transitions - defines which statuses can transition to which
export const STATUS_TRANSITIONS = {
  draft: ['open'],
  open: ['under_review', 'escalated', 'resolved', 'closed'],
  under_review: ['open', 'escalated', 'resolved', 'closed'],
  escalated: ['under_review', 'resolved', 'closed'],
  resolved: ['under_review', 'closed'],
  closed: ['under_review'],
  archived: []
};

// CIF Categories
export const CIF_CATEGORIES = [
  { value: 'compliance_violation', label: 'Compliance Violation' },
  { value: 'behavioral_warning', label: 'Behavioral Warning' },
  { value: 'attendance_escalation', label: 'Attendance Escalation' },
  { value: 'performance_concern', label: 'Performance Concern' },
  { value: 'legal_notice', label: 'Legal Notice' },
  { value: 'investigation', label: 'Investigation' },
  { value: 'documentation_note', label: 'Documentation Note' },
  { value: 'termination_related', label: 'Termination Related' }
];

// CIF Severities
export const CIF_SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' }
];

// Confidential Levels
export const CONFIDENTIAL_LEVELS = [
  { value: 'internal', label: 'Internal' },
  { value: 'legal_hold', label: 'Legal Hold' }
];

// Utility function to get status color
export const getStatusColor = (status) => {
  return STATUS_COLORS[status] || '#9CA3AF';
};
