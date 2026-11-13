// What activate() registers and how the brush takes the canvas; what
// deactivate() takes back.

import { afterEach, describe, expect, it } from "vitest";
import manifest from "../safelight.json";
import pkg from "../package.json";
import { activate, deactivate } from "../src/index";
import { SKIN_TOOL } from "../src/Overlay";
import { EXT_ID, PAINT_ACTION_ID, PANEL_ID, STAGE_ID } from "../src/params";
import { store } from "../src/store";
import { fakeApi } from "./support/fake-api";

afterEach(() => deactivate());

describe("activate", () => {
  it("registers the stage, the panel and the brush's shortcut", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.stages.map((s) => s.id)).toEqual([STAGE_ID]);
    expect(rig.panels.map((p) => [p.id, p.title])).toEqual([[PANEL_ID, "Skin Tone Brush"]]);
    expect(rig.panels[0].defaultDock?.module).toBe("develop");
    expect(rig.keybindings.map((k) => [k.id, k.defaultCombo, k.category])).toEqual([[PAINT_ACTION_ID, "Shift+K", "Develop"]]);
  });

  it("names its contributions under the manifest's id", () => {
    expect(EXT_ID).toBe(manifest.id);
    for (const id of [STAGE_ID, PANEL_ID, PAINT_ACTION_ID]) expect(id.startsWith(`${manifest.id}.`)).toBe(true);
  });

  it("keeps the manifest and package versions in step", () => {
    expect(manifest.version).toBe("1.0.0");
    expect(pkg.version).toBe(manifest.version);
    expect(manifest.license).toBe("GPL-3.0-or-later");
    expect(pkg.license).toBe(manifest.license);
  });

  it("holds the canvas while the brush is on and lets it go when off", () => {
    const rig = fakeApi();
    activate(rig.api);
    store().getState().setArmed(true);
    expect(rig.tool()).toBe(SKIN_TOOL);
    store().getState().setArmed(false);
    expect(rig.tool()).toBeNull();
  });

  it("turns the brush off on Escape", () => {
    const rig = fakeApi();
    activate(rig.api);
    store().getState().setArmed(true);
    SKIN_TOOL.onEscape?.();
    expect(store().getState().armed).toBe(false);
    expect(rig.tool()).toBeNull();
  });

  it("toggles the brush with its shortcut in Develop with a photo open, and nowhere else", () => {
    const rig = fakeApi();
    activate(rig.api);
    const press = () => rig.keybindings[0].handler();
    press();
    expect(store().getState().armed).toBe(true);
    press();
    expect(store().getState().armed).toBe(false);
    rig.ui.setState({ activeModule: "library" });
    press();
    expect(store().getState().armed).toBe(false);
    rig.ui.setState({ activeModule: "develop" });
    rig.develop.setState({ photoId: null });
    press();
    expect(store().getState().armed).toBe(false);
  });

  it("takes Develop's brush shortcuts while it holds the canvas", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(SKIN_TOOL.wants?.("brush.larger")).toBe(true);
    expect(SKIN_TOOL.wants?.("develop.undo")).toBe(false);
    const before = store().getState().brushSize;
    SKIN_TOOL.onAction?.("brush.larger");
    expect(store().getState().brushSize).toBeCloseTo(before + 0.01, 9);
  });

  it("unregisters the stage and lets the canvas go on deactivate, once", () => {
    const rig = fakeApi();
    activate(rig.api);
    store().getState().setArmed(true);
    deactivate();
    deactivate();
    expect(rig.unregistered).toEqual([STAGE_ID]);
    expect(rig.tool()).toBeNull();
  });
});
