// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The canvas tool held while the brush is on (SKIN_TOOL), so crop, masks and
// heal never paint at the same time. It captures the pointer, maps it to
// source-UV through the overlay's mapping, stamps dabs into the photo's mask
// at the masking panel's spacing and commits one history entry per stroke. It
// draws the official brush ring, a centred reference ring while a brush slider
// is dragged, and, with Show mask on, the painted area's tint. Ctrl, Cmd or
// Space held hands the pointer to the canvas's pan and zoom: core does that
// for a zoomable tool.

import type { PointerEvent as ReactPointerEvent } from "react";
import { lineDabs, makeDab, shouldStamp, type BrushSettings, type Dab, type Point } from "./brush";
import { PARAM } from "./params";
import { appendDabs, endStroke, readMask } from "./persistence";
import { React, api } from "./rt";
import type { CanvasTool } from "./safelight";
import { store } from "./store";
import { addedDabs, paintDabs, paintWash, WASH_ALPHA, type WashGeometry } from "./wash";

const BRUSH_KEYS = { size: "brushSize", feather: "brushFeather", opacity: "brushOpacity", flow: "brushFlow" } as const;

function brushOf(s: BrushSettings): BrushSettings {
  const { brushSize, brushFeather, brushOpacity, brushFlow, brushErase } = s;
  return { brushSize, brushFeather, brushOpacity, brushFlow, brushErase };
}

export function SkinOverlay() {
  const dev = api.stores.useDevelopStore;
  const armed = store()((s) => s.armed);
  const showMask = store()((s) => s.showMask);
  const brushSize = store()((s) => s.brushSize);
  const brushFeather = store()((s) => s.brushFeather);
  const brushErase = store()((s) => s.brushErase);
  const brushPreview = store()((s) => s.brushPreview);
  const photoId = dev((s) => s.photoId);
  const maskValue = dev((s) => s.paramBag[PARAM.mask]);
  const { rect, nonce, toImage, toScreen, radiusToScreen, imageAspect: aspect } = api.develop.useDevelopOverlay();

  const [alt, setAlt] = React.useState(false);
  const [pointer, setPointer] = React.useState<{ x: number; y: number } | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const washRef = React.useRef<HTMLCanvasElement | null>(null);
  /** What the tint canvas shows, so a growing stroke draws only its new dabs. */
  const tint = React.useRef<{
    canvas: HTMLCanvasElement;
    dabs: readonly Dab[];
    nonce: number;
    toScreen: WashGeometry["toScreen"];
    radiusToScreen: WashGeometry["radiusToScreen"];
  } | null>(null);
  const stroke = React.useRef<{ last: Point } | null>(null);
  const lastPoint = React.useRef<Point | null>(null);

  const visible = armed && !!rect && !!photoId && !!toImage && !!toScreen && !!radiusToScreen;

  React.useEffect(() => {
    if (!visible) return;
    return api.develop.setCanvasCursor("crosshair", { priority: 20 });
  }, [visible]);

  // A photo switch mid-stroke must not carry the stroke, or a Shift+click
  // line, over to the next photo.
  React.useEffect(() => {
    stroke.current = null;
    lastPoint.current = null;
  }, [photoId]);

  React.useEffect(() => {
    const el = washRef.current;
    const root = rootRef.current;
    if (!visible || !showMask || !el || !root || !toScreen || !radiusToScreen) return;
    const w = Math.max(1, Math.round(root.clientWidth));
    const h = Math.max(1, Math.round(root.clientHeight));
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
      tint.current = null;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dabs = readMask(dev.getState().paramBag);
    const geo = { toScreen, radiusToScreen };
    const last = tint.current;
    const same = last && last.canvas === el && last.nonce === nonce && last.toScreen === toScreen && last.radiusToScreen === radiusToScreen;
    const added = same ? addedDabs(last.dabs, dabs) : null;
    if (added) paintDabs(ctx, added, geo);
    else paintWash(ctx, dabs, geo, w, h);
    tint.current = { canvas: el, dabs, nonce, toScreen, radiusToScreen };
  }, [visible, showMask, nonce, maskValue, toScreen, radiusToScreen, dev]);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || e.button !== 0 || !toImage) return;
    const at = api.develop.framePoint(e.currentTarget, e.clientX, e.clientY);
    const p = toImage(at.x, at.y);
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const brush = brushOf(store().getState());
    const dabs: Dab[] =
      e.shiftKey && lastPoint.current
        ? lineDabs(lastPoint.current, p, brush, aspect, e.altKey)
        : [makeDab(p, brush, e.altKey, true)];
    appendDabs(dabs);
    lastPoint.current = p;
    stroke.current = { last: p };
    setPointer(at);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || !toImage) return;
    const at = api.develop.framePoint(e.currentTarget, e.clientX, e.clientY);
    setPointer(at);
    setAlt(e.altKey);
    const s = stroke.current;
    if (!s) return;
    const p = toImage(at.x, at.y);
    const brush = brushOf(store().getState());
    if (!shouldStamp(s.last, p, brush, aspect)) return;
    appendDabs([makeDab(p, brush, e.altKey, false)]);
    s.last = p;
    lastPoint.current = p;
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!stroke.current) return;
    stroke.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    void endStroke();
  };

  if (!visible) return null;

  const erasing = alt || brushErase;

  return (
    <div
      ref={rootRef}
      data-testid="skin-tone-brush-overlay"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => {
        if (!stroke.current) setPointer(null);
      }}
      style={{
        position: "absolute",
        inset: 0,
        touchAction: "none",
        overflow: "hidden",
      }}
    >
      {showMask ? (
        <canvas ref={washRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: WASH_ALPHA }} />
      ) : null}
      <api.develop.BrushCursor at={brushPreview ? "centre" : pointer} size={brushSize} feather={brushFeather} erase={erasing} />
    </div>
  );
}

/** Steps the brush by `action` (one of Develop's brush shortcuts) when `run`;
 *  whether it is one. */
function takeAction(action: string, run: boolean): boolean {
  const { brushSize, brushFeather, brushOpacity, brushFlow } = store().getState();
  const step = api.develop.brush.step(action, { size: brushSize, feather: brushFeather, opacity: brushOpacity, flow: brushFlow });
  if (!step) return false;
  if (run) store().getState().setBrush({ [BRUSH_KEYS[step.key]]: step.value });
  return true;
}

/** The tool held while the brush is on. Develop's brush shortcuts set the
 *  brush; Escape turns it off. */
export const SKIN_TOOL: CanvasTool = {
  overlay: SkinOverlay,
  zoomable: true,
  onEscape: () => store().getState().setArmed(false),
  onAction: (action) => takeAction(action, true),
  wants: (action) => takeAction(action, false),
};
