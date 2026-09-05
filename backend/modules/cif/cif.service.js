const CIF = require('./cif.model');
const CIFAudit = require('./cifAudit.model');
const Counter = require('../../models/Counter');

// Generate next CIF ID
const generateCIFId = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'cif' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  
  const paddedNumber = String(counter.value).padStart(2, '0');
  return {
    cifNumber: counter.value,
    cifId: `BYL_CIF_${paddedNumber}`
  };
};

// Status workflow transitions
const STATUS_TRANSITIONS = {
  draft: ['open'],
  open: ['under_review', 'escalated', 'resolved', 'closed'], // Allow direct closure
  under_review: ['open', 'escalated', 'resolved', 'closed'], // Allow going back or forward
  escalated: ['under_review', 'resolved', 'closed'], // Allow going back or forward
  resolved: ['under_review', 'closed'], // Allow reopening or closing
  closed: ['under_review'], // Allow reopening (Admin/HR only)
  archived: []
};

// Validate status transition
const validateStatusTransition = (currentStatus, newStatus) => {
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
  return allowedTransitions.includes(newStatus);
};

// Create audit log
const createAuditLog = async (cifId, actionType, performedBy, oldValue = null, newValue = null, reason = null) => {
  try {
    await CIFAudit.create({
      cifId,
      actionType,
      performedBy,
      oldValue,
      newValue,
      reason
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw - audit log failure shouldn't block operations
  }
};

// Check if CIF can be edited
const canEditCIF = (cif, userRole) => {
  // Cannot edit closed cases (except super_admin)
  if (cif.status === 'closed' && userRole !== 'super_admin') {
    return { allowed: false, reason: 'Cannot edit closed cases' };
  }

  // Cannot edit archived cases
  if (cif.status === 'archived') {
    return { allowed: false, reason: 'Cannot edit archived cases' };
  }

  // Cannot edit legal hold cases
  if (cif.confidentialLevel === 'legal_hold') {
    return { allowed: false, reason: 'Cannot edit cases under legal hold' };
  }

  return { allowed: true };
};

// Check if CIF can be deleted
const canDeleteCIF = (cif, userRole) => {
  // Cannot delete legal hold cases
  if (cif.confidentialLevel === 'legal_hold') {
    return { allowed: false, reason: 'Cannot delete cases under legal hold' };
  }

  // Only super_admin can archive
  if (userRole !== 'super_admin' && userRole !== 'Admin') {
    return { allowed: false, reason: 'Insufficient permissions' };
  }

  return { allowed: true };
};

// Calculate risk level for employee
const calculateRiskLevel = async (employeeId) => {
  const cases = await CIF.find({
    employeeId,
    isArchived: false
  }).select('severity status').lean();

  if (cases.length === 0) {
    return 'low';
  }

  const hasCritical = cases.some(c => c.severity === 'critical');
  if (hasCritical) return 'critical';

  const highCount = cases.filter(c => c.severity === 'high').length;
  if (highCount >= 1) return 'high';

  const mediumCount = cases.filter(c => c.severity === 'medium').length;
  if (mediumCount >= 2) return 'medium';

  return 'low';
};

module.exports = {
  generateCIFId,
  validateStatusTransition,
  createAuditLog,
  canEditCIF,
  canDeleteCIF,
  calculateRiskLevel,
  STATUS_TRANSITIONS
};
