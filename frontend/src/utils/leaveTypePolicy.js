export const normalizeEmploymentType = (employmentStatus) => {
    const raw = String(employmentStatus || '').trim();
    if (!raw) return 'UNKNOWN';

    const upper = raw.toUpperCase();

    // Backend appears to sometimes send title case (e.g. "Permanent")
    if (upper === 'PERMANENT') return 'PERMANENT';
    if (upper === 'PROBATION') return 'PROBATION';
    if (upper === 'INTERN') return 'INTERN';

    // Accept common variations
    if (upper === 'PERMANENT EMPLOYEE') return 'PERMANENT';

    return upper;
};

export const getAllowedLeaveTypes = (employmentType) => {
    const type = normalizeEmploymentType(employmentType);

    // `requestType` values in LeaveRequestForm
    if (type === 'PERMANENT') {
        return ['Casual', 'Planned', 'Sick', 'Loss of Pay', 'Compensatory', 'Backdated Leave'];
    }

    if (type === 'PROBATION') {
        return ['Loss of Pay', 'Compensatory'];
    }

    if (type === 'INTERN') {
        return ['Loss of Pay', 'Compensatory'];
    }

    // Safe fallback: do not block access to the page/form
    return ['Loss of Pay'];
};
