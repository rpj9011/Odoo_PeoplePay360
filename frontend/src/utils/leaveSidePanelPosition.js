const PANEL_WIDTH = 368;
const PANEL_GAP = 20;
const VIEWPORT_PAD = 16;

export function getLeaveSidePanelPosition(modalSelector, side = 'left', panelWidth = PANEL_WIDTH) {
    const modal = document.querySelector(modalSelector);
    if (!modal) {
        return { left: VIEWPORT_PAD, top: VIEWPORT_PAD };
    }

    const rect = modal.getBoundingClientRect();
    const estimatedHeight = Math.min(520, window.innerHeight - VIEWPORT_PAD * 2);
    let top = rect.top + (rect.height - estimatedHeight) / 2;

    let left;
    if (side === 'right') {
        left = rect.right + PANEL_GAP;
        if (left + panelWidth > window.innerWidth - VIEWPORT_PAD) {
            left = Math.max(VIEWPORT_PAD, window.innerWidth - panelWidth - VIEWPORT_PAD);
        }
    } else {
        left = rect.left - panelWidth - PANEL_GAP;
        if (left < VIEWPORT_PAD) {
            left = VIEWPORT_PAD;
        }
    }

    top = Math.max(
        VIEWPORT_PAD,
        Math.min(top, window.innerHeight - estimatedHeight - VIEWPORT_PAD)
    );

    return { left, top };
}

export const LEAVE_MODAL_SELECTOR = '.leave-request-modal-card';
