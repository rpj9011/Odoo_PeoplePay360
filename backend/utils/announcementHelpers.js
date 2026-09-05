const AnnouncementMessage = require("../models/AnnouncementMessage");
const PollVote = require("../models/PollVote");
const AnnouncementView = require("../models/AnnouncementView");
const User = require("../models/User");

const MAX_POLL_OPTIONS = 6;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_QUESTIONS = 50;
const MAX_TEXT_ANSWER_LENGTH = 2000;

function isAdminOrHr(role) {
  return ["Admin", "HR"].includes(role);
}

/** Normalize legacy single-question polls and new multi-question polls into a uniform list. */
function getPollQuestions(poll) {
  if (!poll) return [];
  if (Array.isArray(poll.questions) && poll.questions.length > 0) {
    return poll.questions;
  }
  if (poll.question) {
    return [
      {
        text: poll.question,
        type: "multiple_choice",
        options: poll.options || [],
        allowMultiple: Boolean(poll.allowMultiple),
      },
    ];
  }
  return [];
}

function isMultiQuestionPoll(poll) {
  return Array.isArray(poll?.questions) && poll.questions.length > 0;
}

function transformSender(msgObj) {
  if (msgObj.sender && msgObj.sender.fullName) {
    const nameParts = msgObj.sender.fullName.split(" ");
    msgObj.sender.firstName = nameParts[0] || "";
    msgObj.sender.lastName = nameParts.slice(1).join(" ") || "";
  }
  return msgObj;
}

function transformMessages(messages) {
  return messages.map((msg) => {
    const msgObj = typeof msg.toObject === "function" ? msg.toObject() : { ...msg };
    return transformSender(msgObj);
  });
}

async function enrichMessagesForUser(messages, userId) {
  const pollIds = messages
    .filter((m) => m.contentType === "poll")
    .map((m) => m._id);

  if (!pollIds.length) return messages;

  const votes = await PollVote.find({
    announcementId: { $in: pollIds },
    userId,
  }).lean();

  const voteMap = new Map(
    votes.map((v) => [v.announcementId.toString(), v])
  );

  return messages.map((m) => {
    if (m.contentType !== "poll") return m;

    const vote = voteMap.get(m._id.toString());
    if (!vote) {
      return { ...m, userVote: null, userAnswers: null };
    }

    if (vote.answers?.length) {
      return { ...m, userAnswers: vote.answers, userVote: null };
    }

    return {
      ...m,
      userVote: vote.optionIndices || null,
      userAnswers: null,
    };
  });
}

function validatePollPayload(poll) {
  if (!poll || typeof poll !== "object") {
    return "Poll data is required";
  }

  if (poll.closesAt && Number.isNaN(new Date(poll.closesAt).getTime())) {
    return "Invalid poll close date";
  }

  const title = (poll.title || "").trim();
  if (title && title.length > 200) {
    return "Poll title must be at most 200 characters";
  }

  // New multi-question format
  if (Array.isArray(poll.questions) && poll.questions.length > 0) {
    if (poll.questions.length > MAX_POLL_QUESTIONS) {
      return `Poll cannot have more than ${MAX_POLL_QUESTIONS} questions`;
    }
    for (let i = 0; i < poll.questions.length; i++) {
      const q = poll.questions[i];
      const text = (q?.text || "").trim();
      if (!text || text.length > 500) {
        return `Question ${i + 1} text is required (max 500 characters)`;
      }
      const qType = q?.type === "text" ? "text" : "multiple_choice";
      if (qType === "multiple_choice") {
        if (!Array.isArray(q.options) || q.options.length < MIN_POLL_OPTIONS) {
          return `Question ${i + 1} must have at least ${MIN_POLL_OPTIONS} options`;
        }
        if (q.options.length > MAX_POLL_OPTIONS) {
          return `Question ${i + 1} cannot have more than ${MAX_POLL_OPTIONS} options`;
        }
        for (const opt of q.options) {
          const optText = (opt?.text || opt || "").toString().trim();
          if (!optText || optText.length > 200) {
            return `Question ${i + 1}: each option must be 1–200 characters`;
          }
        }
      }
    }
    return null;
  }

  // Legacy single-question format
  const question = (poll.question || "").trim();
  if (!question || question.length > 500) {
    return "Poll question is required (max 500 characters)";
  }
  if (!Array.isArray(poll.options) || poll.options.length < MIN_POLL_OPTIONS) {
    return `Poll must have at least ${MIN_POLL_OPTIONS} options`;
  }
  if (poll.options.length > MAX_POLL_OPTIONS) {
    return `Poll cannot have more than ${MAX_POLL_OPTIONS} options`;
  }
  for (const opt of poll.options) {
    const text = (opt?.text || opt || "").toString().trim();
    if (!text || text.length > 200) {
      return "Each poll option must be 1–200 characters";
    }
  }
  return null;
}

function buildPollFromPayload(poll) {
  const closesAt = poll.closesAt ? new Date(poll.closesAt) : null;
  const title = (poll.title || "").trim();

  if (Array.isArray(poll.questions) && poll.questions.length > 0) {
    const questions = poll.questions.map((q) => {
      const qType = q.type === "text" ? "text" : "multiple_choice";
      const entry = {
        text: q.text.trim(),
        type: qType,
        allowMultiple: Boolean(q.allowMultiple),
      };
      if (qType === "multiple_choice") {
        entry.options = q.options.map((opt) => ({
          text: (opt?.text || opt || "").toString().trim(),
          voteCount: 0,
        }));
      } else {
        entry.options = [];
      }
      return entry;
    });

    return {
      title: title || null,
      questions,
      isClosed: false,
      closesAt,
      totalVotes: 0,
    };
  }

  // Legacy format
  const question = poll.question.trim();
  const options = poll.options.map((opt) => ({
    text: (opt?.text || opt || "").toString().trim(),
    voteCount: 0,
  }));
  return {
    question,
    options,
    allowMultiple: Boolean(poll.allowMultiple),
    isClosed: false,
    closesAt,
    totalVotes: 0,
  };
}

function validatePollAnswers(announcement, answers) {
  const questions = getPollQuestions(announcement.poll);
  if (!questions.length) return "Poll has no questions";

  if (!Array.isArray(answers) || answers.length === 0) {
    return "Answers array is required";
  }

  const answeredIndices = new Set();

  for (const ans of answers) {
    const qIdx = Number(ans.questionIndex);
    if (!Number.isInteger(qIdx) || qIdx < 0 || qIdx >= questions.length) {
      return "Invalid question index";
    }
    if (answeredIndices.has(qIdx)) {
      return "Duplicate answer for the same question";
    }
    answeredIndices.add(qIdx);

    const q = questions[qIdx];
    if (q.type === "text") {
      const text = (ans.text || "").trim();
      if (!text) return `Question ${qIdx + 1} requires a text answer`;
      if (text.length > MAX_TEXT_ANSWER_LENGTH) {
        return `Question ${qIdx + 1} answer is too long (max ${MAX_TEXT_ANSWER_LENGTH} characters)`;
      }
    } else {
      const indices = ans.optionIndices;
      if (!Array.isArray(indices) || indices.length === 0) {
        return `Question ${qIdx + 1} requires at least one option`;
      }
      const maxIndex = (q.options || []).length - 1;
      const unique = [...new Set(indices.map((i) => Number(i)))];
      if (unique.some((i) => !Number.isInteger(i) || i < 0 || i > maxIndex)) {
        return `Invalid option selection for question ${qIdx + 1}`;
      }
      if (!q.allowMultiple && unique.length > 1) {
        return `Question ${qIdx + 1} allows only one selection`;
      }
    }
  }

  if (answeredIndices.size !== questions.length) {
    return "All questions must be answered before submitting";
  }

  return null;
}

function applyPollAnswers(announcement, answers) {
  const questions = getPollQuestions(announcement.poll);

  for (const ans of answers) {
    const qIdx = Number(ans.questionIndex);
    const q = questions[qIdx];

    if (q.type === "text") continue;

    const unique = [...new Set((ans.optionIndices || []).map((i) => Number(i)))];
    if (isMultiQuestionPoll(announcement.poll)) {
      for (const idx of unique) {
        announcement.poll.questions[qIdx].options[idx].voteCount += 1;
      }
    } else {
      for (const idx of unique) {
        announcement.poll.options[idx].voteCount += 1;
      }
    }
  }

  announcement.poll.totalVotes += 1;
  announcement.markModified("poll");
}

function isPollOpen(announcement) {
  if (!announcement.poll || announcement.poll.isClosed) return false;
  if (announcement.poll.closesAt && new Date() > new Date(announcement.poll.closesAt)) {
    return false;
  }
  return true;
}

async function recordViewsForUser(userId, upToDate = new Date()) {
  const announcements = await AnnouncementMessage.find({
    createdAt: { $lte: upToDate },
  })
    .select("_id")
    .lean();

  if (!announcements.length) return;

  const ops = announcements.map((a) => ({
    updateOne: {
      filter: { announcementId: a._id, userId },
      update: { $set: { viewedAt: upToDate } },
      upsert: true,
    },
  }));

  await AnnouncementView.bulkWrite(ops, { ordered: false });
}

async function getReadReceipts(announcementId) {
  const announcement = await AnnouncementMessage.findById(announcementId).lean();
  if (!announcement) return null;

  const eligibleUsers = await User.find({ isActive: true })
    .select("fullName role profileImageUrl department")
    .sort({ fullName: 1 })
    .lean();

  const views = await AnnouncementView.find({ announcementId })
    .select("userId viewedAt")
    .lean();

  const viewMap = new Map(
    views.map((v) => [v.userId.toString(), v.viewedAt])
  );

  const seen = [];
  const unseen = [];

  for (const u of eligibleUsers) {
    const id = u._id.toString();
    const viewedAt = viewMap.get(id);
    const entry = {
      userId: u._id,
      fullName: u.fullName,
      role: u.role,
      profileImageUrl: u.profileImageUrl,
      department: u.department,
      viewedAt: viewedAt || null,
    };
    if (viewedAt) {
      seen.push(entry);
    } else {
      unseen.push(entry);
    }
  }

  const result = {
    announcementId,
    contentType: announcement.contentType,
    message: announcement.message,
    createdAt: announcement.createdAt,
    isTEABreak: Boolean(announcement.isTEABreak),
    teaBreakType: announcement.teaBreakType || null,
    totalEligible: eligibleUsers.length,
    seenCount: seen.length,
    unseenCount: unseen.length,
    seen,
    unseen,
  };

  if (announcement.isTEABreak) {
    const TeaBreakReturn = require("../models/TeaBreakReturn");
    const { classifyTeaBreakOpenUsers } = require("../services/teaBreakService");
    const returns = await TeaBreakReturn.find({ announcementId })
      .populate("userId", "fullName role profileImageUrl department")
      .sort({ endedAt: -1 })
      .lean();

    const returnedIds = new Set();
    const breakClosed = [];

    for (const r of returns) {
      const u = r.userId;
      if (!u) continue;
      const id = u._id.toString();
      returnedIds.add(id);
      breakClosed.push({
        userId: u._id,
        fullName: u.fullName,
        role: u.role,
        profileImageUrl: u.profileImageUrl,
        department: u.department,
        endedAt: r.endedAt,
        overrunMinutes: r.overrunMinutes || 0,
        teaBreakStatus: "break_closed",
        teaBreakStatusLabel: "Break closed",
      });
    }

    const { pending, onBreak, notApplicable } = await classifyTeaBreakOpenUsers(
      eligibleUsers,
      returnedIds,
      announcement.teaBreakStartedAt
    );

    result.breakClosedCount = breakClosed.length;
    result.onBreakCount = onBreak.length;
    result.notApplicableCount = notApplicable.length;
    result.pendingCount = pending.length;
    // Backwards-compatible aliases
    result.returnedCount = breakClosed.length;
    result.stillOutCount = pending.length;
    result.breakClosed = breakClosed;
    result.pending = pending;
    result.onBreak = onBreak;
    result.notApplicable = notApplicable;
    result.returned = breakClosed;
    result.stillOut = pending;
  }

  if (announcement.contentType === "poll") {
    const votes = await PollVote.find({ announcementId })
      .populate("userId", "fullName role profileImageUrl department")
      .lean();

    const submittedIds = new Set();
    const submitted = [];
    const notSubmitted = [];

    const voteEntries = votes.map((v) => {
      const u = v.userId;
      if (u) submittedIds.add(u._id.toString());
      return {
        userId: u?._id,
        fullName: u?.fullName,
        role: u?.role,
        profileImageUrl: u?.profileImageUrl,
        department: u?.department,
        optionIndices: v.optionIndices,
        answers: v.answers,
        votedAt: v.createdAt,
      };
    });

    for (const u of eligibleUsers) {
      const id = u._id.toString();
      if (submittedIds.has(id)) {
        const vote = voteEntries.find((ve) => ve.userId?.toString() === id);
        submitted.push({
          userId: u._id,
          fullName: u.fullName,
          role: u.role,
          profileImageUrl: u.profileImageUrl,
          department: u.department,
          votedAt: vote?.votedAt || null,
          answers: vote?.answers,
          optionIndices: vote?.optionIndices,
        });
      } else {
        notSubmitted.push({
          userId: u._id,
          fullName: u.fullName,
          role: u.role,
          profileImageUrl: u.profileImageUrl,
          department: u.department,
        });
      }
    }

    result.submittedCount = submitted.length;
    result.notSubmittedCount = notSubmitted.length;
    result.submitted = submitted;
    result.notSubmitted = notSubmitted;
    result.votes = voteEntries;
    result.pollQuestions = getPollQuestions(announcement.poll);
  }

  return result;
}

/**
 * Lightweight batch summaries for the Insights list (counts only, one round-trip).
 */
async function getReadReceiptsSummaries(announcementIds) {
  const mongoose = require("mongoose");
  const TeaBreakReturn = require("../models/TeaBreakReturn");
  const {
    buildTeaBreakAttendanceContext,
    countTeaBreakOpenUsers,
  } = require("../services/teaBreakService");

  const rawIds = [...new Set((announcementIds || []).map(String).filter(Boolean))];
  if (!rawIds.length) return {};

  const objectIds = rawIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!objectIds.length) return {};

  const announcements = await AnnouncementMessage.find({ _id: { $in: objectIds } })
    .select("_id contentType isTEABreak teaBreakType teaBreakStartedAt createdAt")
    .lean();

  if (!announcements.length) return {};

  const annObjectIds = announcements.map((a) => a._id);
  const totalEligible = await User.countDocuments({ isActive: true });

  const [viewCounts, voteCounts, returnGroups] = await Promise.all([
    AnnouncementView.aggregate([
      { $match: { announcementId: { $in: annObjectIds } } },
      { $group: { _id: "$announcementId", seenCount: { $sum: 1 } } },
    ]),
    PollVote.aggregate([
      { $match: { announcementId: { $in: annObjectIds } } },
      { $group: { _id: "$announcementId", submittedCount: { $sum: 1 } } },
    ]),
    TeaBreakReturn.aggregate([
      { $match: { announcementId: { $in: annObjectIds } } },
      {
        $group: {
          _id: "$announcementId",
          breakClosedCount: { $sum: 1 },
          returnedUserIds: { $addToSet: "$userId" },
        },
      },
    ]),
  ]);

  const seenMap = new Map(viewCounts.map((row) => [String(row._id), row.seenCount]));
  const voteMap = new Map(
    voteCounts.map((row) => [String(row._id), row.submittedCount])
  );
  const returnMap = new Map(
    returnGroups.map((row) => [
      String(row._id),
      {
        breakClosedCount: row.breakClosedCount,
        returnedUserIds: row.returnedUserIds || [],
      },
    ])
  );

  const hasTeaBreak = announcements.some((a) => a.isTEABreak);
  let attendanceContext = null;
  let eligibleUserIds = null;

  if (hasTeaBreak) {
    const eligibleUsers = await User.find({ isActive: true }).select("_id").lean();
    eligibleUserIds = eligibleUsers.map((u) => u._id);
    attendanceContext = await buildTeaBreakAttendanceContext(eligibleUserIds);
  }

  const summaries = {};

  for (const ann of announcements) {
    const id = String(ann._id);
    const seenCount = seenMap.get(id) || 0;

    const summary = {
      announcementId: ann._id,
      contentType: ann.contentType,
      isTEABreak: Boolean(ann.isTEABreak),
      teaBreakType: ann.teaBreakType || null,
      totalEligible,
      seenCount,
      unseenCount: Math.max(0, totalEligible - seenCount),
    };

    if (ann.contentType === "poll") {
      const submittedCount = voteMap.get(id) || 0;
      summary.submittedCount = submittedCount;
      summary.notSubmittedCount = Math.max(0, totalEligible - submittedCount);
    }

    if (ann.isTEABreak && attendanceContext && eligibleUserIds && ann.teaBreakStartedAt) {
      const returns = returnMap.get(id);
      const breakClosedCount = returns?.breakClosedCount || 0;
      const returnedIds = new Set(
        (returns?.returnedUserIds || []).map((uid) => String(uid))
      );
      const { pendingCount, onBreakCount, notApplicableCount } = countTeaBreakOpenUsers(
        eligibleUserIds,
        returnedIds,
        ann.teaBreakStartedAt,
        attendanceContext
      );

      summary.breakClosedCount = breakClosedCount;
      summary.returnedCount = breakClosedCount;
      summary.onBreakCount = onBreakCount;
      summary.notApplicableCount = notApplicableCount;
      summary.pendingCount = pendingCount;
      summary.stillOutCount = pendingCount;
    }

    summaries[id] = summary;
  }

  return summaries;
}

function emitAnnouncementEvent(event, payload, excludeUserId = null) {
  try {
    const { getIO } = require("../socketManager");
    const io = getIO();
    if (!io) return;
    if (excludeUserId) {
      io.to("announcements").except(`user_${excludeUserId}`).emit(event, payload);
    } else {
      io.to("announcements").emit(event, payload);
    }
  } catch (err) {
    console.error(`[Announcements] ${event} emit failed:`, err.message);
  }
}

/**
 * Broadcast tea break start to all connected users except the admin who started it.
 * The initiator already knows they posted the break — skip their desktop notification.
 */
async function emitTeaBreakStarted(teaPayload, initiatedByUserId = null) {
  try {
    const { getIO } = require("../socketManager");
    const io = getIO();
    if (!io) {
      console.error("[Announcements] tea_break_started: Socket.IO not available");
      return;
    }

    const {
      getClockedInEmployeeIds,
      computeTeaBreakTiming,
      buildTeaBreakActivePayload,
    } = require("../services/teaBreakService");
    const NewNotificationService = require("../services/NewNotificationService");
    const AnnouncementMessage = require("../models/AnnouncementMessage");

    const initiatorId = initiatedByUserId?.toString?.() ?? null;
    const announcementId =
      teaPayload.announcementId?.toString?.() ?? String(teaPayload.announcementId ?? "");

    const announcement = await AnnouncementMessage.findById(announcementId)
      .select("teaBreakStartedAt teaBreakType sender")
      .populate("sender", "_id")
      .lean();

    if (!announcement?.teaBreakStartedAt) {
      console.error("[Announcements] tea_break_started: announcement not found", announcementId);
      return;
    }

    const timing = computeTeaBreakTiming(announcement.teaBreakStartedAt);
    const normalizedPayload = buildTeaBreakActivePayload(
      announcement,
      timing,
      initiatorId
    );

    // Admin announcement channel banner (all users — no timer/toast)
    io.to("announcements").emit("tea_break_started", normalizedPayload);

    const clockedInIds = await getClockedInEmployeeIds();
    const payloadForEmployees = { ...normalizedPayload, clockedInEligible: true };

    for (const userId of clockedInIds) {
      io.to(`user_${userId}`).emit("tea_break_started", payloadForEmployees);
    }

    // Persist in-app notifications (drawer) after emitting — deliberately not awaited
    // before this function returns so the socket broadcast is never held up by DB writes.
    const notifyTargets = clockedInIds.filter(
      (userId) => !initiatorId || userId !== initiatorId
    );
    Promise.allSettled(
      notifyTargets.map((userId) =>
        NewNotificationService.notifyTeaBreakStarted(
          userId,
          normalizedPayload.teaBreakType,
          announcementId,
          initiatorId
        )
      )
    ).then((notifyResults) => {
      const notified = notifyResults.filter((r) => r.status === "fulfilled").length;
      notifyResults
        .filter((r) => r.status === "rejected")
        .forEach((r) =>
          console.error("[Announcements] tea break notification failed:", r.reason?.message || r.reason)
        );
      io.fetchSockets().then((sockets) => {
        console.log(
          `[Announcements] tea_break_started (${sockets.length} socket(s), ${clockedInIds.length} clocked-in, ${notified} notified, initiator excluded: ${initiatorId || "none"}) announcement ${announcementId}, remainingSeconds=${timing.remainingSeconds}`
        );
      }).catch(() => {
        console.log(
          `[Announcements] tea_break_started (${clockedInIds.length} clocked-in, ${notified} notified) announcement ${announcementId}`
        );
      });
    }).catch((err) => {
      console.error("[Announcements] tea break notification batch failed:", err.message);
    });
  } catch (err) {
    console.error("[Announcements] tea_break_started emit failed:", err.message);
  }
}

/**
 * Broadcast tea break return to admins and refresh insights in real time.
 */
async function emitTeaBreakEnded({
  announcementId,
  employeeId,
  employeeName,
  overrunMinutes = 0,
}) {
  try {
    const { getIO } = require("../socketManager");
    const io = getIO();
    const id = announcementId?.toString?.() ?? String(announcementId ?? "");

    const payload = {
      announcementId: id,
      employeeId: employeeId?.toString?.() ?? String(employeeId ?? ""),
      employeeName,
      overrunMinutes,
      endedAt: new Date().toISOString(),
    };

    if (io) {
      io.to("announcements").emit("tea_break_ended", payload);
      io.to("admin_room").emit("tea_break_ended", payload);
    }

    const NewNotificationService = require("../services/NewNotificationService");
    await NewNotificationService.notifyTeaBreakEnded(
      employeeId,
      employeeName,
      id,
      overrunMinutes
    );
  } catch (err) {
    console.error("[Announcements] tea_break_ended emit failed:", err.message);
  }
}

module.exports = {
  isAdminOrHr,
  transformSender,
  transformMessages,
  enrichMessagesForUser,
  validatePollPayload,
  buildPollFromPayload,
  validatePollAnswers,
  applyPollAnswers,
  getPollQuestions,
  isMultiQuestionPoll,
  isPollOpen,
  recordViewsForUser,
  getReadReceipts,
  getReadReceiptsSummaries,
  emitAnnouncementEvent,
  emitTeaBreakStarted,
  emitTeaBreakEnded,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  MAX_POLL_QUESTIONS,
  MAX_TEXT_ANSWER_LENGTH,
};
