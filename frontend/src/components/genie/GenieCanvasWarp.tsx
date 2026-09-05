import { useEffect, useRef } from "react";
import type { GenieStrip } from "./genie-utils";
import { drawGenieStrips } from "./genie-utils";

interface GenieCanvasWarpProps {
  snapshot: HTMLCanvasElement | null;
  strips: GenieStrip[];
  modalRect: { width: number; height: number };
  visible: boolean;
}

export default function GenieCanvasWarp({
  snapshot,
  strips,
  modalRect,
  visible,
}: GenieCanvasWarpProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot || !visible) return;

    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    drawGenieStrips(ctx, snapshot, strips, snapshot.width, snapshot.height);
  }, [snapshot, strips, visible]);

  if (!visible || !snapshot) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[1403]"
      style={{ width: "100%", height: "100%", willChange: "contents" }}
      aria-hidden
    />
  );
}
