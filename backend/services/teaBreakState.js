// In-memory tracking for tea break sessions (per announcement).
// Resets on server restart; clients re-sync via GET /api/tea-break/active.

const endedByAnnouncement = new Map();

function getEndedSet(announcementId) {
  const key = String(announcementId);
  if (!endedByAnnouncement.has(key)) {
    endedByAnnouncement.set(key, new Set());
  }
  return endedByAnnouncement.get(key);
}

function markTeaBreakEnded(announcementId, employeeId) {
  getEndedSet(announcementId).add(String(employeeId));
}

function hasTeaBreakEnded(announcementId, employeeId) {
  return getEndedSet(announcementId).has(String(employeeId));
}

function clearTeaBreakState(announcementId) {
  endedByAnnouncement.delete(String(announcementId));
}

module.exports = {
  markTeaBreakEnded,
  hasTeaBreakEnded,
  clearTeaBreakState,
};
