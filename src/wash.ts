// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The on-canvas tint of the painted area, in the masks' tint colour. Drawn in
// screen space from the dabs, each mapped through the overlay's source-UV to
// screen helpers, with the coverage bake's rules for flow and erase: the
// shader's coverage is the exact one, this is the view of it that follows
// every stroke at once. The opacity ceiling is folded into each dab's alpha
// rather than applied per pixel, and each disc is drawn in the tint itself
// (the canvas is shown at WASH_ALPHA), so a dab added to a stroke is drawn
// over what the canvas holds and nothing else is drawn again.

import type { Dab } from "./brush";

export interface WashGeometry {
  toScreen(u: number, v: number): { x: number; y: number };
  radiusToScreen(r: number): number;
}

export const WASH_RGB = "230, 64, 64";
/** The tint canvas's opacity. */
export const WASH_ALPHA = 0.5;

export function dabCircle(dab: Dab, geo: WashGeometry): { x: number; y: number; r: number } | null {
  const r = geo.radiusToScreen(dab.radius);
  if (r < 0.3) return null;
  const { x, y } = geo.toScreen(dab.x, dab.y);
  return { x, y, r };
}

/** Draws `dabs` over what the canvas holds: a paint dab adds its disc, an
 *  erase dab cuts its disc out. */
export function paintDabs(ctx: CanvasRenderingContext2D, dabs: readonly Dab[], geo: WashGeometry): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const dab of dabs) {
    const c = dabCircle(dab, geo);
    if (!c) continue;
    const core = Math.max(0, Math.min(1, 1 - dab.feather));
    const alpha = Math.max(0, Math.min(1, dab.flow * (dab.erase ? 1 : dab.opacity)));
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    grad.addColorStop(0, `rgba(${WASH_RGB}, ${alpha})`);
    grad.addColorStop(core, `rgba(${WASH_RGB}, ${alpha})`);
    grad.addColorStop(1, `rgba(${WASH_RGB}, 0)`);
    ctx.globalCompositeOperation = dab.erase ? "destination-out" : "source-over";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

/** The whole tint of `dabs`, from a cleared canvas. */
export function paintWash(
  ctx: CanvasRenderingContext2D,
  dabs: readonly Dab[],
  geo: WashGeometry,
  width: number,
  height: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  paintDabs(ctx, dabs, geo);
}

/** The dabs `next` adds to a tint that shows `shown`: the tail past it when
 *  `next` keeps every shown dab in place, as a growing stroke does; null when
 *  the tint must be painted again whole (an undo, a clear, another photo). */
export function addedDabs(shown: readonly Dab[], next: readonly Dab[]): readonly Dab[] | null {
  if (next.length < shown.length) return null;
  for (let i = 0; i < shown.length; i++) if (next[i] !== shown[i]) return null;
  return next.slice(shown.length);
}
