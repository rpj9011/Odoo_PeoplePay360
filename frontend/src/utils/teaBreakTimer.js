export const TEA_BREAK_DURATION_SEC = 10 * 60;

/**
 * Offset (ms) to add to client Date.now() so it matches server time.
 */
export function computeServerClockOffsetMs(serverNow) {
  if (!serverNow) return 0;
  const serverMs = new Date(serverNow).getTime();
  if (Number.isNaN(serverMs)) return 0;
  return serverMs - Date.now();
}

/**
 * Remaining tea-break seconds using server-synchronized clock.
 */
export function computeTeaBreakRemainingSeconds(teaBreakData, clientNowMs = Date.now()) {
  if (!teaBreakData) return 0;

  const offset = teaBreakData.clockOffsetMs ?? 0;
  const serverNowMs = clientNowMs + offset;

  if (teaBreakData.endsAt) {
    const endsAtMs = new Date(teaBreakData.endsAt).getTime();
    if (!Number.isNaN(endsAtMs)) {
      return Math.max(0, Math.floor((endsAtMs - serverNowMs) / 1000));
    }
  }

  if (teaBreakData.startedAt) {
    const startedMs = new Date(teaBreakData.startedAt).getTime();
    if (!Number.isNaN(startedMs)) {
      const elapsed = Math.max(0, Math.floor((serverNowMs - startedMs) / 1000));
      return Math.max(0, TEA_BREAK_DURATION_SEC - elapsed);
    }
  }

  return teaBreakData.remainingSeconds ?? TEA_BREAK_DURATION_SEC;
}

export function buildTeaBreakStateFromPayload(data) {
  if (!data?.teaBreakStartedAt && !data?.startedAt) return null;

  const announcementId = data.announcementId;
  const startedAt = data.teaBreakStartedAt || data.startedAt;
  const endsAt = data.endsAt || null;
  const serverNow = data.serverNow || null;

  return {
    announcementId,
    startedAt,
    endsAt,
    serverNow,
    clockOffsetMs: computeServerClockOffsetMs(serverNow),
    remainingSeconds: data.remainingSeconds ?? TEA_BREAK_DURATION_SEC,
    durationMinutes: data.durationMinutes ?? 10,
    type: data.teaBreakType || data.type,
    initiatedByUserId: data.initiatedByUserId ?? null,
  };
}
