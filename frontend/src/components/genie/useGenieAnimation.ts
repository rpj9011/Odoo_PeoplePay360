import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  computeGenieFrame,
  computeModalDestRect,
  getElementRect,
  type GenieFrame,
  type Rect,
} from "./genie-utils";

export type GeniePhase = "closed" | "opening" | "open" | "closing";

export interface UseGenieAnimationOptions {
  open: boolean;
  sourceRef: React.RefObject<HTMLElement | null>;
  durationMs?: number;
  onOpenComplete?: () => void;
  onCloseComplete?: () => void;
}

export interface UseGenieAnimationResult {
  phase: GeniePhase;
  mounted: boolean;
  frame: GenieFrame;
  sourceRect: Rect | null;
  destRect: Rect;
  prefersReducedMotion: boolean;
  requestClose: () => void;
  isAnimating: boolean;
}

const DEFAULT_DURATION = 650;

export function useGenieAnimation({
  open,
  sourceRef,
  durationMs = DEFAULT_DURATION,
  onOpenComplete,
  onCloseComplete,
}: UseGenieAnimationOptions): UseGenieAnimationResult {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<GeniePhase>("closed");
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  const [sourceRect, setSourceRect] = useState<Rect | null>(null);
  const [frame, setFrame] = useState<GenieFrame>(() =>
    computeGenieFrame(
      { x: 0, y: 0, width: 40, height: 40 },
      computeModalDestRect(window.innerWidth, window.innerHeight),
      0
    )
  );

  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const progressRef = useRef({ value: 0 });
  const phaseRef = useRef<GeniePhase>("closed");

  const prefersReducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const destRect = useMemo(
    () => computeModalDestRect(viewport.w, viewport.h),
    [viewport.w, viewport.h]
  );

  const isAnimating = phase === "opening" || phase === "closing";

  const measure = useCallback(() => {
    const src = getElementRect(sourceRef.current);
    setSourceRect(src);
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    return src;
  }, [sourceRef]);

  const applyFrame = useCallback((progress: number, src: Rect | null, dest: Rect) => {
    const effectiveSource = src ?? {
      x: dest.x + dest.width / 2 - 16,
      y: dest.y - 8,
      width: 32,
      height: 32,
    };
    setFrame(computeGenieFrame(effectiveSource, dest, progress));
  }, []);

  const killTween = useCallback(() => {
    tweenRef.current?.kill();
    tweenRef.current = null;
  }, []);

  const runTween = useCallback(
    (from: number, to: number, nextPhase: GeniePhase, onDone?: () => void) => {
      killTween();
      progressRef.current.value = from;
      setPhase(nextPhase);
      phaseRef.current = nextPhase;

      const dest = computeModalDestRect(window.innerWidth, window.innerHeight);
      const src = getElementRect(sourceRef.current) ?? sourceRect;

      if (prefersReducedMotion) {
        progressRef.current.value = to;
        applyFrame(to, src, dest);
        onDone?.();
        return;
      }

      tweenRef.current = gsap.to(progressRef.current, {
        value: to,
        duration: durationMs / 1000,
        ease: "power2.inOut",
        onUpdate: () => {
          applyFrame(progressRef.current.value, src, dest);
        },
        onComplete: () => {
          tweenRef.current = null;
          onDone?.();
        },
      });
    },
    [applyFrame, durationMs, killTween, prefersReducedMotion, sourceRect, sourceRef]
  );

  const requestClose = useCallback(() => {
    if (phaseRef.current === "closing" || phaseRef.current === "closed") return;
    measure();
    runTween(progressRef.current.value, 0, "closing", () => {
      setPhase("closed");
      phaseRef.current = "closed";
      setMounted(false);
      onCloseComplete?.();
    });
  }, [measure, onCloseComplete, runTween]);

  useEffect(() => {
    if (open) {
      const src = measure();
      setMounted(true);
      if (prefersReducedMotion) {
        const dest = computeModalDestRect(window.innerWidth, window.innerHeight);
        applyFrame(1, src, dest);
        setPhase("open");
        phaseRef.current = "open";
        onOpenComplete?.();
        return;
      }
      progressRef.current.value = 0;
      applyFrame(0, src, computeModalDestRect(window.innerWidth, window.innerHeight));
      runTween(0, 1, "opening", () => {
        setPhase("open");
        phaseRef.current = "open";
        onOpenComplete?.();
      });
    } else if (mounted && phaseRef.current !== "closing" && phaseRef.current !== "closed") {
      requestClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dest = computeModalDestRect(window.innerWidth, window.innerHeight);
        setViewport({ w: window.innerWidth, h: window.innerHeight });
        const src = getElementRect(sourceRef.current) ?? sourceRect;
        applyFrame(progressRef.current.value, src, dest);
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [applyFrame, mounted, sourceRef, sourceRect]);

  useEffect(() => () => killTween(), [killTween]);

  return {
    phase,
    mounted,
    frame,
    sourceRect,
    destRect,
    prefersReducedMotion,
    requestClose,
    isAnimating,
  };
}
