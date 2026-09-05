export const OPEN_ANNOUNCEMENT_HUB_EVENT = 'ams:open-announcement-hub';

/**
 * Open the announcements modal (optionally on Insights tab with a selected announcement).
 * @param {{ tab?: 'feed' | 'poll' | 'insights', announcementId?: string }} detail
 */
export function openAnnouncementHub(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OPEN_ANNOUNCEMENT_HUB_EVENT, { detail })
  );
}

export function resolveAnnouncementHubNavigation(navigationData) {
  if (!navigationData) return null;
  if (navigationData.page === 'announcements') {
    return {
      tab: navigationData.params?.tab || 'insights',
      announcementId: navigationData.params?.announcementId || null,
    };
  }
  return null;
}
