/**
 * macOS Genie effect — port of Harshil Shah's SpriteKit algorithm (top-edge variant).
 * Reference: https://harshil.net/blog/recreating-the-mac-genie-effect/
 *
 * Browser uses top-left coordinates (y increases downward).
 * Megaphone / top-bar source → edge = "top" (window sucks upward into icon).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenieMeshOptions {
  rows?: number;
  slideEndFraction?: number;
  translateStartFraction?: number;
}

export interface GenieRow {
  y: number;
  leftX: number;
  rightX: number;
}

export interface GenieStrip {
  /** Warped quad corners (viewport space). */
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
  /** Source texture slice (0–1 normalized height in modal). */
  srcY0: number;
  srcY1: number;
}

export interface GenieFrame {
  polygon: Point[];
  clipPath: string;
  strips: GenieStrip[];
  progress: number;
  backdropOpacity: number;
  blurPx: number;
  modalRect: Rect;
}

const DEFAULT_ROWS = 44;
const SLIDE_END = 0.5;
const TRANSLATE_START = 0.4;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** macOS-like interior bezier easing along curved sides. */
export function easeBezierInterior(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** Global timeline easing — snappy start, soft settle. */
export function easeGenieTimeline(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3.2);
}

export function getElementRect(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function computeModalDestRect(
  viewportW: number,
  viewportH: number,
  preferred?: Partial<Pick<Rect, "width" | "height">>
): Rect {
  const pad = viewportW < 768 ? 0 : 24;
  const maxW = Math.min(preferred?.width ?? 960, viewportW - pad * 2);
  const maxH = Math.min(preferred?.height ?? 720, viewportH - pad * 2);
  const width = Math.max(280, maxW);
  const height = viewportW < 768 ? Math.floor(viewportH * 0.92) : Math.max(400, maxH);
  const x = (viewportW - width) / 2;
  const y = viewportW < 768 ? viewportH - height : (viewportH - height) / 2;
  return { x, y, width, height };
}

/**
 * Compute genie mesh rows for TOP-edge animation.
 * @param maximized Full modal rect (destination when opening).
 * @param minimized Source button rect (origin when opening).
 * @param fraction Animation progress 0 = at source, 1 = fully open.
 */
export function computeTopEdgeGenieRows(
  maximized: Rect,
  minimized: Rect,
  fraction: number,
  options: GenieMeshOptions = {}
): GenieRow[] {
  const rows = options.rows ?? DEFAULT_ROWS;
  const slideEnd = options.slideEndFraction ?? SLIDE_END;
  const translateStart = options.translateStartFraction ?? TRANSLATE_START;

  const f = easeGenieTimeline(fraction);
  const slideProgress = clamp01(f / slideEnd);
  const translateProgress = clamp01((f - translateStart) / (1 - translateStart));

  const leftBezierTopX = maximized.x;
  const rightBezierTopX = maximized.x + maximized.width;

  const leftEdgeDistanceToMove = minimized.x - maximized.x;
  const rightEdgeDistanceToMove =
    minimized.x + minimized.width - (maximized.x + maximized.width);

  // Source sits above modal — move upward (negative Y in TL coords).
  const verticalDistanceToMove = minimized.y - maximized.y;
  const translation = translateProgress * verticalDistanceToMove;

  const topEdgeY = maximized.y + translation;
  const bottomEdgeY = Math.max(
    maximized.y + maximized.height + translation,
    minimized.y + minimized.height
  );

  const leftBezierBottomX = leftBezierTopX + slideProgress * leftEdgeDistanceToMove;
  const rightBezierBottomX = rightBezierTopX + slideProgress * rightEdgeDistanceToMove;

  const bezierTopY = maximized.y;
  const bezierBottomY = minimized.y + minimized.height;
  const bezierHeight = Math.max(0.001, bezierBottomY - bezierTopY);

  const leftX = (y: number): number => {
    if (y < bezierTopY) {
      const ext = bezierHeight > 0 ? (leftBezierBottomX - leftBezierTopX) / bezierHeight : 0;
      return leftBezierTopX + (y - bezierTopY) * ext;
    }
    if (y <= bezierBottomY) {
      const relativeY = (y - bezierTopY) / bezierHeight;
      const eased = easeBezierInterior(relativeY);
      return leftBezierTopX + eased * (leftBezierBottomX - leftBezierTopX);
    }
    return leftBezierBottomX;
  };

  const rightX = (y: number): number => {
    if (y < bezierTopY) {
      const ext = bezierHeight > 0 ? (rightBezierBottomX - rightBezierTopX) / bezierHeight : 0;
      return rightBezierTopX + (y - bezierTopY) * ext;
    }
    if (y <= bezierBottomY) {
      const relativeY = (y - bezierTopY) / bezierHeight;
      const eased = easeBezierInterior(relativeY);
      return rightBezierTopX + eased * (rightBezierBottomX - rightBezierTopX);
    }
    return rightBezierBottomX;
  };

  const result: GenieRow[] = [];
  for (let i = 0; i <= rows; i++) {
    const position = i / rows;
    // position=0 → bottom edge, position=1 → top edge (matches macOS row order).
    const y = topEdgeY * position + bottomEdgeY * (1 - position);
    result.push({ y, leftX: leftX(y), rightX: rightX(y) });
  }
  return result;
}

export function rowsToPolygon(rows: GenieRow[]): Point[] {
  if (rows.length < 2) return [];
  const top = rows[rows.length - 1];
  const bottom = rows[0];
  const leftSide = rows.map((r) => ({ x: r.leftX, y: r.y }));
  const rightSide = rows.map((r) => ({ x: r.rightX, y: r.y }));
  return [
    { x: top.leftX, y: top.y },
    { x: top.rightX, y: top.y },
    ...rightSide.slice(0, -1).reverse(),
    ...leftSide,
  ];
}

export function rowsToStrips(rows: GenieRow[], modalRect: Rect): GenieStrip[] {
  const strips: GenieStrip[] = [];
  const rowCount = rows.length - 1;
  for (let i = 0; i < rowCount; i++) {
    const bottom = rows[i];
    const top = rows[i + 1];
    const srcY0 = 1 - (i + 1) / rowCount;
    const srcY1 = 1 - i / rowCount;
    strips.push({
      tl: { x: top.leftX, y: top.y },
      tr: { x: top.rightX, y: top.y },
      br: { x: bottom.rightX, y: bottom.y },
      bl: { x: bottom.leftX, y: bottom.y },
      srcY0,
      srcY1,
    });
  }
  return strips;
}

export function polygonToClipPath(points: Point[]): string {
  if (points.length < 3) return "none";
  return `polygon(${points.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(", ")})`;
}

export function computeGenieFrame(
  sourceRect: Rect,
  destRect: Rect,
  rawProgress: number,
  options?: GenieMeshOptions
): GenieFrame {
  const progress = clamp01(rawProgress);
  const rows = computeTopEdgeGenieRows(destRect, sourceRect, progress, options);
  const polygon = rowsToPolygon(rows);
  const strips = rowsToStrips(rows, destRect);

  const backdropOpacity = 0.48 * easeGenieTimeline(progress);
  const blurPx = (1 - easeGenieTimeline(progress)) * 5;

  return {
    polygon,
    clipPath: polygonToClipPath(polygon),
    strips,
    progress,
    backdropOpacity,
    blurPx,
    modalRect: destRect,
  };
}

export function polygonToSvgPath(points: Point[]): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")} Z`;
}

/** Draw warped texture strips to canvas (true mesh deformation). */
export function drawGenieStrips(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  strips: GenieStrip[],
  imageWidth: number,
  imageHeight: number
): void {
  const w = ctx.canvas.width / (window.devicePixelRatio || 1);
  const h = ctx.canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  for (const strip of strips) {
    const sh = strip.srcY1 - strip.srcY0;
    if (sh <= 0) continue;

    const sy = strip.srcY0 * imageHeight;
    const shPx = sh * imageHeight;

    const minX = Math.min(strip.tl.x, strip.tr.x, strip.br.x, strip.bl.x);
    const maxX = Math.max(strip.tl.x, strip.tr.x, strip.br.x, strip.bl.x);
    const minY = Math.min(strip.tl.y, strip.tr.y, strip.br.y, strip.bl.y);
    const maxY = Math.max(strip.tl.y, strip.tr.y, strip.br.y, strip.bl.y);
    const dw = maxX - minX;
    const dh = maxY - minY;
    if (dh < 0.3 || dw < 0.3) continue;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(strip.tl.x, strip.tl.y);
    ctx.lineTo(strip.tr.x, strip.tr.y);
    ctx.lineTo(strip.br.x, strip.br.y);
    ctx.lineTo(strip.bl.x, strip.bl.y);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, 0, sy, imageWidth, shPx, minX, minY, dw, dh);
    ctx.restore();
  }
}
