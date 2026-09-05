import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { useGenieAnimation } from "./useGenieAnimation";
import GenieCanvasWarp from "./GenieCanvasWarp";
import "./genie.css";

export interface GenieModalProps {
  open: boolean;
  sourceRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function trapFocus(container: HTMLElement, e: KeyboardEvent) {
  if (e.key !== "Tab") return;
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
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

async function captureNode(node: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(node, {
    scale: Math.min(2, window.devicePixelRatio || 1),
    logging: false,
    useCORS: true,
    backgroundColor: "#f8fafc",
    allowTaint: true,
  });
}

export default function GenieModal({
  open,
  sourceRef,
  onClose,
  children,
  ariaLabel = "Dialog",
}: GenieModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const closeStartedRef = useRef(false);

  const [animOpen, setAnimOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<HTMLCanvasElement | null>(null);
  const [showLive, setShowLive] = useState(false);

  const handleCloseComplete = useCallback(() => {
    document.body.style.overflow = "";
    setSnapshot(null);
    setShowLive(false);
    setAnimOpen(false);
    closeStartedRef.current = false;
    previouslyFocused.current?.focus?.();
    previouslyFocused.current = null;
  }, []);

  const {
    mounted,
    phase,
    frame,
    requestClose,
    prefersReducedMotion,
    isAnimating,
    destRect,
  } = useGenieAnimation({
    open: animOpen,
    sourceRef,
    onCloseComplete: handleCloseComplete,
  });

  const beginClose = useCallback(async () => {
    if (closeStartedRef.current || phase === "closing") return;
    closeStartedRef.current = true;
    onClose();

    if (prefersReducedMotion) {
      setAnimOpen(false);
      requestClose();
      return;
    }

    if (panelRef.current && showLive) {
      try {
        const snap = await captureNode(panelRef.current);
        setSnapshot(snap);
      } catch {
        /* fall through to clip-only close */
      }
    }
    setShowLive(false);
    if (!animOpen) setAnimOpen(true);
    requestClose();
  }, [animOpen, onClose, phase, prefersReducedMotion, requestClose, showLive]);

  // OPEN: capture hidden measure layer → genie expand → live panel
  useEffect(() => {
    if (!open) return;

    closeStartedRef.current = false;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    setShowLive(false);
    setSnapshot(null);
    setAnimOpen(false);

    let cancelled = false;

    (async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled) return;

      if (prefersReducedMotion) {
        setShowLive(true);
        setAnimOpen(true);
        return;
      }

      if (!measureRef.current) {
        setShowLive(true);
        setAnimOpen(true);
        return;
      }

      try {
        const snap = await captureNode(measureRef.current);
        if (cancelled) return;
        setSnapshot(snap);
        setAnimOpen(true);
      } catch {
        if (!cancelled) {
          setShowLive(true);
          setAnimOpen(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, prefersReducedMotion]);

  // Parent set open=false → suck back into megaphone
  useEffect(() => {
    if (!open && showLive && phase === "open") {
      beginClose();
    }
  }, [open, showLive, phase, beginClose]);

  // After open animation completes → interactive live DOM
  useEffect(() => {
    if (phase === "open" && animOpen && !closeStartedRef.current) {
      setShowLive(true);
    }
  }, [phase, animOpen]);

  useEffect(() => {
    if (!showLive || !panelRef.current) return;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [showLive]);

  useEffect(() => {
    if (!showLive || !panelRef.current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        beginClose();
        return;
      }
      if (panelRef.current) trapFocus(panelRef.current, e);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginClose, showLive]);

  if (!open && !mounted) return null;

  const useCanvas =
    !prefersReducedMotion && Boolean(snapshot) && (isAnimating || !showLive);

  return createPortal(
    <div className="fixed inset-0 z-[1400] isolate" role="presentation">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 border-0 p-0 cursor-default"
        style={{
          backgroundColor: `rgba(15, 23, 42, ${frame.backdropOpacity})`,
          backdropFilter: `blur(${frame.backdropOpacity * 12}px)`,
          WebkitBackdropFilter: `blur(${frame.backdropOpacity * 12}px)`,
          pointerEvents: showLive ? "auto" : "none",
        }}
        onClick={beginClose}
        tabIndex={-1}
      />

      {/* Off-screen measure tree for opening snapshot */}
      {open && !showLive && (
        <div
          ref={measureRef}
          className="pointer-events-none fixed overflow-hidden rounded-[20px] border border-white/60 bg-slate-50"
          style={{
            left: destRect.x,
            top: destRect.y,
            width: destRect.width,
            height: destRect.height,
            opacity: 0,
            zIndex: -1,
          }}
          aria-hidden
        >
          {children}
        </div>
      )}

      <GenieCanvasWarp
        snapshot={snapshot}
        strips={frame.strips}
        modalRect={destRect}
        visible={useCanvas}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        className={[
          "fixed flex flex-col overflow-hidden",
          "rounded-[20px] border border-white/60 bg-slate-50 shadow-2xl ring-1 ring-black/5",
          showLive ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
        style={{
          left: destRect.x,
          top: destRect.y,
          width: destRect.width,
          height: destRect.height,
          opacity: showLive ? 1 : 0,
          visibility: showLive ? "visible" : "hidden",
          transform: "translateZ(0)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span id={titleId} className="sr-only">
          {ariaLabel}
        </span>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>,
    document.body
  );
}
