const AnnouncementMessage = require('../models/AnnouncementMessage');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const { getISTDateString, getISTNow } = require('../utils/istTime');
const { markTeaBreakEnded } = require('./teaBreakState');
const { stopEnforcement } = require('../jobs/teaBreakEnforcer');

const SAFETY_CUTOFF_MS = 60 * 60 * 1000; // Use longer cutoff to handle lunch breaks

// Uses exactly 2 queries regardless of employee count (batched, no N+1).
async function getClockedInEmployeeIds() {
  const today = getISTDateString();

  // Query 1: all today's logs that are clocked in but not clocked out
  const logs = await AttendanceLog.find({
    attendanceDate: today,
    clockInTime: { $ne: null },
    clockOutTime: null,
  })
    .select('_id user')
    .lean();

  if (logs.length === 0) return [];

  const logIds = logs.map((l) => l._id);

  // Query 2: find which of those logs have an open session (single batched query)
  const activeSessions = await AttendanceSession.find({
    attendanceLog: { $in: logIds },
    endTime: null,
  })
    .select('attendanceLog')
    .lean();

  const activeLogIdSet = new Set(activeSessions.map((s) => String(s.attendanceLog)));

  return logs
    .filter((l) => activeLogIdSet.has(String(l._id)))
    .map((l) => String(l.user));
}

/**
 * Stop a tea break announcement for all employees (Admin/HR).
 * Does not apply further overrun penalties after stop.
 */
async function stopTeaBreakAnnouncement(announcementId) {
  const announcement = await AnnouncementMessage.findById(announcementId);
  if (!announcement?.isTEABreak || !announcement.teaBreakStartedAt) {
    return { success: false, message: 'Tea break announcement not found' };
  }
  if (announcement.teaBreakStoppedAt) {
    return { success: true, alreadyStopped: true, announcementId };
  }

  announcement.teaBreakStoppedAt = getISTNow();
  await announcement.save();

  stopEnforcement(announcementId);

  const employeeIds = await getClockedInEmployeeIds();
  for (const employeeId of employeeIds) {
    markTeaBreakEnded(announcementId, employeeId);
  }

  try {
    const { getIO } = require('../socketManager');
    const io = getIO();
    const stopPayload = {
      announcementId: String(announcementId),
      stoppedAt: announcement.teaBreakStoppedAt,
      universalStop: true,
    };
    io.to('announcements').emit('tea_break_stopped', stopPayload);
    for (const employeeId of employeeIds) {
      io.to(`user_${employeeId}`).emit('tea_break_stopped', stopPayload);
    }
  } catch (err) {
    console.error('[TeaBreak] tea_break_stopped emit failed:', err.message);
  }

  return {
    success: true,
    announcementId: String(announcementId),
    employeesNotified: employeeIds.length,
  };
}

/**
 * Stop all active (non-stopped) tea breaks within the safety window.
 */
async function stopAllActiveTeaBreaks() {
  const now = getISTNow();
  const cutoff = new Date(now.getTime() - SAFETY_CUTOFF_MS);

  const activeAnnouncements = await AnnouncementMessage.find({
    isTEABreak: true,
    teaBreakStartedAt: { $gte: cutoff },
    teaBreakStoppedAt: null,
  }).lean();

  const results = [];
  for (const ann of activeAnnouncements) {
    const result = await stopTeaBreakAnnouncement(ann._id);
    results.push(result);
  }

  return {
    success: true,
    stoppedCount: results.filter((r) => r.success).length,
    results,
  };
}

module.exports = {
  stopTeaBreakAnnouncement,
  stopAllActiveTeaBreaks,
};
