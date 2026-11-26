// The canvas tool's overlay against the fake API's 400 × 200 image: strokes
// become dabs in the photo's mask, one undo step each; Alt erases; Shift+click
// draws a line; Space and Ctrl pan and zoom through core.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dab } from "../src/brush";
import { activate, deactivate } from "../src/index";
import { SkinOverlay } from "../src/Overlay";
import { PARAM } from "../src/params";
import { readMask } from "../src/persistence";
import { store } from "../src/store";
import { BRUSH_DEFAULTS, fakeApi, type Rig } from "./support/fake-api";

let rig: Rig;

beforeAll(() => {
  // jsdom has no pointer capture and no 2D canvas (test/wash.test.ts draws the tint).
  Object.assign(HTMLElement.prototype, {
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
  });
  Object.assign(HTMLCanvasElement.prototype, { getContext: () => null });
});

beforeEach(() => {
  cleanup();
  rig = fakeApi();
  activate(rig.api);
});
afterEach(() => deactivate());

function armed() {
  act(() => store().getState().setArmed(true));
  render(<SkinOverlay />);
  return screen.getByTestId("skin-tone-brush-overlay");
}

const mask = (): Dab[] => readMask(rig.params());

describe("the brush overlay", () => {
  it("draws nothing while the brush is off", () => {
    const { container } = render(<SkinOverlay />);
    expect(container.innerHTML).toBe("");
  });

  it("paints a stroke at the brush's spacing and commits it once", () => {
    const el = armed();
    fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 101, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 110, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    const dabs = mask();
    expect(dabs.map((d) => [d.x, d.y])).toEqual([
      [0.25, 0.5],
      [0.275, 0.5],
      [0.3, 0.5],
    ]);
    expect(dabs.map((d) => d.strokeStart === true)).toEqual([true, false, false]);
    expect(dabs[0]).toMatchObject({ radius: BRUSH_DEFAULTS.size, feather: BRUSH_DEFAULTS.feather, opacity: BRUSH_DEFAULTS.opacity, flow: BRUSH_DEFAULTS.flow, erase: false });
    expect(rig.params()[PARAM.maskOn]).toBe(1);
    expect(rig.commits).toEqual(["Skin Brush Stroke"]);
  });

  it("erases with Alt held", () => {
    const el = armed();
    fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 100, altKey: true, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(mask()[0].erase).toBe(true);
    expect(rig.params()[PARAM.maskOn]).toBe(0);
  });

  it("draws a straight stroke from the last point on Shift+click", () => {
    const el = armed();
    fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    fireEvent.pointerDown(el, { button: 0, clientX: 200, clientY: 100, shiftKey: true, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    const dabs = mask();
    expect(dabs.length).toBeGreaterThan(10);
    expect(dabs.filter((d) => d.strokeStart)).toHaveLength(2);
    expect(dabs[dabs.length - 1].x).toBeCloseTo(0.5, 12);
    expect(rig.commits).toEqual(["Skin Brush Stroke", "Skin Brush Stroke"]);
  });

  it("starts afresh on another photo: no line back to the last one's point", () => {
    const el = armed();
    fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    act(() => rig.develop.setState({ photoId: "photo-2", paramBag: {} }));
    fireEvent.pointerDown(el, { button: 0, clientX: 200, clientY: 100, shiftKey: true, pointerId: 1 });
    expect(mask()).toHaveLength(1);
  });

  it("leaves Space, Ctrl and Cmd to core: no key listeners of its own", () => {
    const add = vi.spyOn(window, "addEventListener");
    try {
      armed();
      expect(add.mock.calls.filter(([type]) => type === "keydown" || type === "keyup")).toEqual([]);
    } finally {
      add.mockRestore();
    }
  });

  it("starts from the official brush's defaults", () => {
    expect(store().getState()).toMatchObject({ brushSize: BRUSH_DEFAULTS.size, brushFeather: BRUSH_DEFAULTS.feather, brushOpacity: BRUSH_DEFAULTS.opacity, brushFlow: BRUSH_DEFAULTS.flow });
  });

  it("keeps the crosshair under the official ring", () => {
    armed();
    expect(rig.cursors).toContain("crosshair");
    expect(rig.cursors).not.toContain("none");
  });

  it("draws the official ring at the pointer, sized by the brush, red when erasing", () => {
    const el = armed();
    expect(rig.brushCursor()).toBeNull();
    fireEvent.pointerMove(el, { clientX: 120, clientY: 80, pointerId: 1 });
    expect(rig.brushCursor()).toEqual({ at: { x: 120, y: 80 }, size: BRUSH_DEFAULTS.size, feather: BRUSH_DEFAULTS.feather, erase: false });
    fireEvent.pointerMove(el, { clientX: 120, clientY: 80, altKey: true, pointerId: 1 });
    expect(rig.brushCursor()?.erase).toBe(true);
    fireEvent.pointerLeave(el, { pointerId: 1 });
    expect(rig.brushCursor()).toBeNull();
  });

  it("shows the ring at the centre while a brush slider is dragged", () => {
    armed();
    act(() => store().getState().setBrushPreview(true));
    expect(rig.brushCursor()).toMatchObject({ at: "centre", size: BRUSH_DEFAULTS.size });
  });

  it("steps the brush with core's steps from the held tool's shortcuts", () => {
    armed();
    const tool = rig.tool();
    if (!tool?.onAction || !tool.wants) throw new Error("the tool takes no shortcuts");
    expect(tool.wants("brush.larger")).toBe(true);
    expect(tool.wants("develop.undo")).toBe(false);
    expect(store().getState().brushSize).toBe(BRUSH_DEFAULTS.size);
    expect(tool.onAction("brush.larger")).toBe(true);
    expect(store().getState().brushSize).toBeCloseTo(BRUSH_DEFAULTS.size + 0.01, 12);
    expect(tool.onAction("brush.flowUp")).toBe(true);
    expect(store().getState().brushFlow).toBeCloseTo(BRUSH_DEFAULTS.flow + 0.1, 12);
    expect(tool.onAction("develop.undo")).toBe(false);
  });

  it("shows the painted area only with Show mask on", () => {
    armed();
    expect(document.querySelector("canvas")).not.toBeNull();
    act(() => store().getState().setShowMask(false));
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("adds each new dab to the tint as it is stamped, and repaints it whole only after an undo or a clear", () => {
    const calls = { clear: 0, arc: 0 };
    const ctx = {
      globalCompositeOperation: "source-over",
      fillStyle: "",
      setTransform() {},
      clearRect: () => void calls.clear++,
      createRadialGradient: () => ({ addColorStop() {} }),
      beginPath() {},
      arc: () => void calls.arc++,
      fill() {},
    };
    // A counting stand-in for the members the tint draws with.
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.assign(HTMLCanvasElement.prototype, { getContext: () => ctx });
    try {
      const el = armed();
      expect(calls).toEqual({ clear: 1, arc: 0 });
      fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
      for (let x = 110; x <= 200; x += 10) fireEvent.pointerMove(el, { clientX: x, clientY: 100, pointerId: 1 });
      fireEvent.pointerUp(el, { pointerId: 1 });
      const dabs = mask().length;
      expect(dabs).toBeGreaterThan(5);
      expect(calls).toEqual({ clear: 1, arc: dabs });
      act(() => rig.develop.setState({ paramBag: { ...rig.params(), [PARAM.mask]: mask().slice(0, 2) } }));
      expect(calls).toEqual({ clear: 2, arc: dabs + 2 });
      act(() => rig.develop.setState({ paramBag: { ...rig.params(), [PARAM.mask]: [] } }));
      expect(calls).toEqual({ clear: 3, arc: dabs + 2 });
    } finally {
      Object.assign(HTMLCanvasElement.prototype, { getContext });
    }
  });
});
