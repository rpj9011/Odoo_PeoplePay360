import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../styles/AnnouncementModal.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const CLOSE_MS = 340;

function trapFocus(container, e) {
  if (e.key !== "Tab") return;
  const nodes = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
  );
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const AnnouncementModal = ({ open, onClose, children, ariaLabel = "Dialog" }) => {
  const titleId = useId();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const finishClose = useCallback(() => {
    setMounted(false);
    setIsClosing(false);
    document.body.style.overflow = "";
    previouslyFocused.current?.focus?.();
    previouslyFocused.current = null;
  }, []);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement;
      document.body.style.overflow = "hidden";
      setMounted(true);
      setIsClosing(false);
      const raf = requestAnimationFrame(() => setIsOpen(true));
      return () => cancelAnimationFrame(raf);
    }

    if (mounted) {
      setIsOpen(false);
      setIsClosing(true);
      const timer = setTimeout(finishClose, CLOSE_MS);
      return () => clearTimeout(timer);
    }
  }, [open, mounted, finishClose]);

  useEffect(() => {
    if (!mounted || !isOpen) return;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector(FOCUSABLE)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [mounted, isOpen]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (panelRef.current) trapFocus(panelRef.current, e);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, onClose]);

  if (!mounted) return null;

  const rootClass = [
    "apple-modal-root",
    isOpen && !isClosing ? "is-open" : "",
    isClosing ? "is-closing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className={rootClass} role="presentation">
      <button
        type="button"
        className="apple-modal-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        className="apple-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <span id={titleId} className="sr-only">
          {ariaLabel}
        </span>
        <div className="apple-modal-card-inner">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default AnnouncementModal;
