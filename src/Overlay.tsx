// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The canvas tool held while the brush is on (SKIN_TOOL), so crop, masks and
// heal never paint at the same time. It captures the pointer, maps it to
// source-UV through the overlay's mapping, stamps dabs into the photo's mask
// at the masking panel's spacing and commits one history entry per stroke. It
// draws its own brush ring (the native cursor is hidden), a centred
// reference ring while a brush slider is dragged, and, with Show mask on, the
// painted area's tint. Ctrl, Cmd or Space held hands the pointer to the
// canvas's pan and zoom.

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { lineDabs, makeDab, shouldStamp, type BrushSettings, type Dab, type Point } from "./brush";
import { localPoint } from "./geometry";
import { brushStep } from "./keys";
import { PARAM } from "./params";
import { appendDabs, endStroke, readMask } from "./persistence";
import { React, api } from "./rt";
import type { CanvasTool } from "./safelight";
import { store } from "./store";
import { addedDabs, paintDabs, paintWash, WASH_ALPHA, type WashGeometry } from "./wash";

const RING: CSSProperties = {
  position: "absolute",
  display: "none",
  transform: "translate(-50%, -50%)",
  borderRadius: "50%",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.35)",
  pointerEvents: "none",
};

function brushOf(s: BrushSettings): BrushSettings {
  const { brushSize, brushFeather, brushOpacity, brushFlow, brushErase } = s;
  return { brushSize, brushFeather, brushOpacity, brushFlow, brushErase };
}

function isEditable(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
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

  const [gesture, setGesture] = React.useState(false);
  const [alt, setAlt] = React.useState(false);
  const gestureRef = React.useRef(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const ringRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
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
  const cursor = React.useRef({ lx: 0, ly: 0, shown: false });

  const visible = armed && !!rect && !!photoId && !!toImage && !!toScreen && !!radiusToScreen;
  const setGestureState = (v: boolean) => {
    gestureRef.current = v;
    setGesture(v);
  };

  React.useEffect(() => {
    if (!visible || gesture) return;
    return api.develop.setCanvasCursor("none", { priority: 20 });
  }, [visible, gesture]);

  // A photo switch mid-stroke must not carry the stroke, or a Shift+click
  // line, over to the next photo.
  React.useEffect(() => {
    stroke.current = null;
    lastPoint.current = null;
  }, [photoId]);

  React.useEffect(() => {
    if (!visible) {
      setGestureState(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.code === "Space" || e.ctrlKey || e.metaKey) setGestureState(true);
      if (e.altKey) setAlt(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || !(e.ctrlKey || e.metaKey)) setGestureState(false);
      if (!e.altKey) setAlt(false);
    };
    const onBlur = () => {
      setGestureState(false);
      setAlt(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      setGestureState(false);
    };
  }, [visible]);

  const placeRing = (lx: number, ly: number, show: boolean) => {
    cursor.current = { lx, ly, shown: show };
    const s = store().getState();
    const px = radiusToScreen ? radiusToScreen(s.brushSize) : 0;
    const place = (el: HTMLDivElement | null, d: number) => {
      if (!el) return;
      el.style.display = show ? "block" : "none";
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
      el.style.left = `${lx}px`;
      el.style.top = `${ly}px`;
    };
    place(ringRef.current, Math.max(3, px) * 2);
    place(innerRef.current, Math.max(1, px * (1 - s.brushFeather)) * 2);
  };

  // A shortcut or slider resizes the ring at once, not on the next move.
  React.useEffect(() => {
    if (cursor.current.shown) placeRing(cursor.current.lx, cursor.current.ly, true);
  }, [brushSize, brushFeather]);

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

  // Pan or zoom taking over mid-stroke ends the stroke, keeping what is
  // painted, and hides the ring so the hand-off shows.
  React.useEffect(() => {
    if (!gesture || !stroke.current) return;
    stroke.current = null;
    void endStroke();
    placeRing(0, 0, false);
  }, [gesture]);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || gestureRef.current || e.button !== 0 || !toImage) return;
    const { lx, ly } = localPoint(e.currentTarget, e.clientX, e.clientY);
    const p = toImage(lx, ly);
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
    placeRing(lx, ly, true);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || gestureRef.current || !toImage) return;
    const { lx, ly } = localPoint(e.currentTarget, e.clientX, e.clientY);
    placeRing(lx, ly, true);
    setAlt(e.altKey);
    const s = stroke.current;
    if (!s) return;
    const p = toImage(lx, ly);
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
  const ringBorder = `1.5px ${erasing ? "dashed" : "solid"} ${erasing ? "rgba(255,107,107,0.95)" : "rgba(255,255,255,0.9)"}`;
  const refPx = rect && radiusToScreen ? radiusToScreen(brushSize) : 0;
  const centred = (d: number, border: string): CSSProperties => ({
    ...RING,
    display: "block",
    border,
    left: `${rect ? rect.x + rect.w / 2 : 0}px`,
    top: `${rect ? rect.y + rect.h / 2 : 0}px`,
    width: `${d}px`,
    height: `${d}px`,
  });

  return (
    <div
      ref={rootRef}
      data-testid="skin-tone-brush-overlay"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => {
        if (!stroke.current) placeRing(0, 0, false);
      }}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: gesture ? "none" : "auto",
        touchAction: "none",
        cursor: gesture ? "default" : "none",
        overflow: "hidden",
      }}
    >
      {showMask ? (
        <canvas ref={washRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: WASH_ALPHA }} />
      ) : null}
      <div ref={ringRef} style={{ ...RING, border: ringBorder }} />
      <div ref={innerRef} style={{ ...RING, border: "1px solid rgba(255,255,255,0.45)" }} />
      {brushPreview && rect ? (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={centred(Math.max(3, refPx) * 2, "1.5px solid rgba(255,255,255,0.9)")} />
          <div style={centred(Math.max(1, refPx * (1 - brushFeather)) * 2, "1px solid rgba(255,255,255,0.45)")} />
        </div>
      ) : null}
    </div>
  );
}

/** Steps the brush by `action` (one of Develop's brush shortcuts) when `run`;
 *  whether it is one. */
function takeAction(action: string, run: boolean): boolean {
  const patch = brushStep(action, store().getState());
  if (!patch) return false;
  if (run) store().getState().setBrush(patch);
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
