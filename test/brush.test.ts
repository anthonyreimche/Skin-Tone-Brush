// The stroke model, the brush shortcuts' steps, and the writes to the photo's
// edit: what reaches the param bag and which undo steps it makes.

import { beforeEach, describe, expect, it } from "vitest";
import { DAB_SPACING, lineDabs, makeDab, shouldStamp, type BrushSettings, type Dab } from "../src/brush";
import { brushStep } from "../src/keys";
import { DEFAULT_SETTINGS, PARAM, readSettings } from "../src/params";
import { appendDabs, clearMask, commitSlider, endStroke, hasPaint, maskPatch, readMask, resetAll, setSlider } from "../src/persistence";
import { initRuntime } from "../src/rt";
import { fakeApi, type Rig } from "./support/fake-api";

const BRUSH: BrushSettings = { brushSize: 0.1, brushFeather: 0.4, brushOpacity: 0.8, brushFlow: 0.6, brushErase: false };

describe("the stroke model", () => {
  it("stamps a dab with the brush frozen into it", () => {
    expect(makeDab({ x: 0.2, y: 0.3 }, BRUSH, false, true)).toEqual({
      x: 0.2,
      y: 0.3,
      radius: 0.1,
      erase: false,
      feather: 0.4,
      opacity: 0.8,
      flow: 0.6,
      strokeStart: true,
    });
    expect(makeDab({ x: 0, y: 0 }, BRUSH, false, false)).not.toHaveProperty("strokeStart");
  });

  it("erases with Alt held or with Erase on", () => {
    expect(makeDab({ x: 0, y: 0 }, BRUSH, true, true).erase).toBe(true);
    expect(makeDab({ x: 0, y: 0 }, { ...BRUSH, brushErase: true }, false, true).erase).toBe(true);
  });

  it("spaces dabs a quarter radius apart, round on screen", () => {
    const step = BRUSH.brushSize * DAB_SPACING;
    expect(shouldStamp({ x: 0, y: 0 }, { x: 0, y: step * 0.99 }, BRUSH, 2)).toBe(false);
    expect(shouldStamp({ x: 0, y: 0 }, { x: 0, y: step }, BRUSH, 2)).toBe(true);
    // Across the width, a 2:1 image doubles the screen distance.
    expect(shouldStamp({ x: 0, y: 0 }, { x: step / 2, y: 0 }, BRUSH, 2)).toBe(true);
  });

  it("draws a Shift+click line as one stroke at that spacing", () => {
    const dabs = lineDabs({ x: 0, y: 0.5 }, { x: 0, y: 0.6 }, BRUSH, 1, false);
    expect(dabs).toHaveLength(Math.ceil(0.1 / (BRUSH.brushSize * DAB_SPACING) - 1e-9));
    expect(dabs.filter((d) => d.strokeStart)).toHaveLength(1);
    expect(dabs[0].strokeStart).toBe(true);
    expect(dabs[dabs.length - 1].y).toBeCloseTo(0.6, 12);
  });
});

describe("the brush shortcuts", () => {
  it("step one setting within core's limits", () => {
    expect(brushStep("brush.larger", BRUSH)).toEqual({ brushSize: 0.11 });
    expect(brushStep("brush.smaller", { ...BRUSH, brushSize: 0.01 })).toEqual({ brushSize: 0.01 });
    expect(brushStep("brush.featherUp", { ...BRUSH, brushFeather: 1 })).toEqual({ brushFeather: 1 });
    expect(brushStep("brush.flowDown", BRUSH)).toEqual({ brushFlow: 0.5 });
    expect(brushStep("develop.undo", BRUSH)).toBeNull();
  });
});

describe("the photo's edit", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = fakeApi();
    initRuntime(rig.api);
  });

  const dab = (erase = false): Dab => ({ x: 0.5, y: 0.5, radius: 0.1, erase, feather: 0.5, opacity: 1, flow: 1 });

  it("reads back only a well-formed dab list", () => {
    expect(readMask({ [PARAM.mask]: [dab()] })).toEqual([dab()]);
    expect(readMask({ [PARAM.mask]: [{ x: 0.5 }] })).toEqual([]);
    expect(readMask({ [PARAM.mask]: "nope" })).toEqual([]);
    expect(readMask({})).toEqual([]);
  });

  it("turns the stage on only while something is painted", () => {
    expect(maskPatch([dab()])[PARAM.maskOn]).toBe(1);
    expect(maskPatch([dab(true)])[PARAM.maskOn]).toBe(0);
    expect(maskPatch([])[PARAM.maskOn]).toBe(0);
    expect(hasPaint([dab(true), dab()])).toBe(true);
  });

  it("appends a stroke live as a new array, and commits it once at its end", async () => {
    appendDabs([dab()]);
    const first = rig.params()[PARAM.mask];
    appendDabs([dab(), dab()]);
    expect(rig.params()[PARAM.mask]).not.toBe(first);
    expect(readMask(rig.params())).toHaveLength(3);
    expect(rig.params()[PARAM.maskOn]).toBe(1);
    expect(rig.commits).toEqual([]);
    await endStroke();
    expect(rig.commits).toEqual(["Skin Brush Stroke"]);
  });

  it("clears the mask as one undo step", async () => {
    appendDabs([dab()]);
    await clearMask();
    expect(rig.params()[PARAM.mask]).toEqual([]);
    expect(rig.params()[PARAM.maskOn]).toBe(0);
    expect(rig.commits).toEqual(["Clear Skin Brush"]);
  });

  it("writes a slider live and commits its drag under the slider's name", async () => {
    setSlider("smoothing", 72);
    expect(rig.params()[PARAM.smoothing]).toBe(72);
    await commitSlider("smoothing");
    await commitSlider("textureAmount");
    expect(rig.commits).toEqual(["Skin Smoothing", "Skin Texture"]);
  });

  it("resets every slider and clears the mask as one undo step", async () => {
    appendDabs([dab()]);
    setSlider("textureSize", 10);
    await resetAll();
    expect(readSettings(rig.params())).toEqual(DEFAULT_SETTINGS);
    expect(readMask(rig.params())).toEqual([]);
    expect(rig.commits).toEqual(["Reset Skin Tone Brush"]);
  });

  it("reads the sliders at their defaults when absent, clamped when out of range", () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ [PARAM.textureAmount]: 900, [PARAM.smoothing]: -4, [PARAM.textureSize]: "x" })).toEqual({
      ...DEFAULT_SETTINGS,
      textureAmount: 150,
      smoothing: 0,
    });
  });
});
