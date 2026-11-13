// The canvas tool's overlay against the fake API's 400 × 200 image: strokes
// become dabs in the photo's mask, one undo step each; Alt erases; Shift+click
// draws a line; a held Space or Ctrl hands the pointer to pan and zoom.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Dab } from "../src/brush";
import { activate, deactivate } from "../src/index";
import { SkinOverlay } from "../src/Overlay";
import { PARAM } from "../src/params";
import { readMask } from "../src/persistence";
import { store } from "../src/store";
import { fakeApi, type Rig } from "./support/fake-api";

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

  it("hides the cursor and draws its own ring while on", () => {
    armed();
    expect(rig.cursors).toContain("none");
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
    expect(dabs[0]).toMatchObject({ radius: 0.08, feather: 0.5, opacity: 1, flow: 1, erase: false });
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

  it("hands the pointer to pan and zoom while Space is held, and paints nothing", () => {
    const el = armed();
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
    expect(el.style.pointerEvents).toBe("none");
    fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    expect(mask()).toEqual([]);
    act(() => void window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
    expect(el.style.pointerEvents).toBe("auto");
  });

  it("ends a stroke when pan or zoom takes over mid-stroke, keeping what is painted", () => {
    const el = armed();
    fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "Control" })));
    expect(rig.commits).toEqual(["Skin Brush Stroke"]);
    expect(mask()).toHaveLength(1);
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
