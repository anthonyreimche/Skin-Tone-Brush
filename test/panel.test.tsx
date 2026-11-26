// The panel against the fake API: the sliders write the photo's edit, the
// brush row arms the brush and clears the mask, and the brush's own settings
// show while it is on.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { SkinPanel } from "../src/Panel";
import { PARAM, SLIDERS } from "../src/params";
import { store } from "../src/store";
import { fakeApi, type Rig } from "./support/fake-api";

let rig: Rig;

function mount(initial: Record<string, unknown> = {}) {
  rig = fakeApi(initial);
  activate(rig.api);
  return render(<SkinPanel />);
}

const painted = { [PARAM.mask]: [{ x: 0.5, y: 0.5, radius: 0.1, erase: false, feather: 0.5, opacity: 1, flow: 1, strokeStart: true }], [PARAM.maskOn]: 1 };

beforeEach(() => cleanup());
afterEach(() => deactivate());

describe("the panel", () => {
  it("shows the four sliders at their defaults", () => {
    const { container } = mount();
    expect(rig.sliders(container).map((s) => [s.label, s.value, s.min, s.max, s.defaultValue])).toEqual(
      SLIDERS.map((s) => [s.label, s.default, s.min, s.max, s.default]),
    );
  });

  it("writes a slider as it moves and commits the drag on release", () => {
    const { container } = mount();
    const texture = rig.sliders(container).find((s) => s.label === "Texture");
    act(() => texture?.onChange(40));
    expect(rig.params()[PARAM.textureAmount]).toBe(40);
    expect(rig.commits).toEqual([]);
    act(() => texture?.onCommit?.());
    expect(rig.commits).toEqual(["Skin Texture"]);
    expect(rig.sliders(container).find((s) => s.label === "Texture")?.value).toBe(40);
  });

  it("arms the brush and turns it off again", () => {
    mount();
    fireEvent.click(screen.getByText("Paint"));
    expect(store().getState().armed).toBe(true);
    expect(rig.tool()).not.toBeNull();
    fireEvent.click(screen.getByText("Done"));
    expect(store().getState().armed).toBe(false);
  });

  it("names the shortcut on the Paint button", () => {
    mount();
    expect(screen.getByText("Paint").getAttribute("title")).toContain("Paint over skin (Shift+K)");
  });

  it("explains where the sliders act in tooltips, not panel text", () => {
    mount();
    expect(screen.queryByText("Nothing painted")).toBeNull();
    expect(screen.queryByText(/act only where you paint/)).toBeNull();
    expect(screen.getByText("Paint").getAttribute("title")).toContain("the sliders act only where you paint");
    cleanup();
    deactivate();
    mount(painted);
    expect(screen.queryByText("Painted")).toBeNull();
    expect(screen.getByText("Paint").getAttribute("title")).toBe("Paint over skin (Shift+K)");
  });

  it("lists the brush shortcuts in a tooltip while the brush is on", () => {
    mount();
    fireEvent.click(screen.getByText("Paint"));
    expect(screen.queryByText(/Alt erase/)).toBeNull();
    expect(screen.getByTitle(/Alt erase/)).toBeTruthy();
  });

  it("clears the mask, and offers to only when there is paint", () => {
    mount();
    expect((screen.getByText("Clear") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    deactivate();
    mount(painted);
    const clear = screen.getByText("Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(rig.params()[PARAM.mask]).toEqual([]);
    expect(rig.params()[PARAM.maskOn]).toBe(0);
    expect(rig.commits).toEqual(["Clear Skin Brush"]);
  });

  it("shows the brush's settings while it is on, as percentages", () => {
    const { container } = mount();
    expect(rig.sliders(container).map((s) => s.label)).not.toContain("Size");
    fireEvent.click(screen.getByText("Paint"));
    const brush = rig.sliders(container).slice(SLIDERS.length);
    expect(brush.map((s) => [s.label, s.value, s.defaultValue])).toEqual([
      ["Size", 7, 7],
      ["Feather", 40, 40],
      ["Opacity", 90, 90],
      ["Flow", 80, 80],
    ]);
    expect(screen.getByText("Erase")).toBeTruthy();
    expect(screen.getByText("Show mask")).toBeTruthy();
  });

  it("sets the brush from its sliders and previews the size while one is dragged", () => {
    const { container } = mount();
    fireEvent.click(screen.getByText("Paint"));
    const size = rig.sliders(container).find((s) => s.label === "Size");
    act(() => size?.onChange(20));
    expect(store().getState().brushSize).toBeCloseTo(0.2, 9);
    expect(store().getState().brushPreview).toBe(true);
    act(() => size?.onCommit?.());
    expect(store().getState().brushPreview).toBe(false);
    expect(rig.commits).toEqual([]);
  });

  it("switches Erase and Show mask", () => {
    mount();
    fireEvent.click(screen.getByText("Paint"));
    const toggle = (label: string) => screen.getByText(label).querySelector("input") as HTMLInputElement;
    fireEvent.click(toggle("Erase"));
    expect(store().getState().brushErase).toBe(true);
    expect(toggle("Show mask").checked).toBe(true);
    fireEvent.click(toggle("Show mask"));
    expect(store().getState().showMask).toBe(false);
  });

  it("turns the brush off when another tool takes the canvas", () => {
    mount();
    fireEvent.click(screen.getByText("Paint"));
    act(() => rig.takeCanvas());
    expect(store().getState().armed).toBe(false);
  });

  it("names no other program anywhere it shows", () => {
    const { container } = mount();
    fireEvent.click(screen.getByText("Paint"));
    const text = container.textContent ?? "";
    for (const name of ["Photoshop", "Lightroom", "darktable", "GIMP", "Capture One"]) expect(text).not.toContain(name);
  });
});
