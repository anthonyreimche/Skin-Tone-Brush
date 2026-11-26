// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The Develop panel: the four separation sliders, the brush row (Paint or
// Done, Clear), and while the brush is on its settings, laid out as the other
// brush tools lay theirs: Size, Feather, Opacity and Flow as percentages, an
// Erase switch, Show mask, and the shortcuts. Sliders write the photo's edit
// as they move and commit on release.

import { PAINT_ACTION_ID, SLIDERS, readSettings, type SliderSpec } from "./params";
import { clearMask, commitSlider, hasPaint, readMask, setSlider } from "./persistence";
import { React, api } from "./rt";
import type { BrushSettings } from "./brush";
import { store } from "./store";

const BRUSH_KEYS_TIP = "Alt erase · [ ] size · ⇧[ ] feather · , . opacity · ⇧, ⇧. flow";

type BrushNumber = Exclude<keyof BrushSettings, "brushErase">;

const BRUSH_SLIDERS: { key: BrushNumber; label: string; min: number; max: number; official: "size" | "feather" | "opacity" | "flow" }[] = [
  { key: "brushSize", label: "Size", min: 1, max: 50, official: "size" },
  { key: "brushFeather", label: "Feather", min: 0, max: 100, official: "feather" },
  { key: "brushOpacity", label: "Opacity", min: 1, max: 100, official: "opacity" },
  { key: "brushFlow", label: "Flow", min: 1, max: 100, official: "flow" },
];

export function SkinPanel() {
  const { Slider } = api.components;
  const { Button, Toggle, Row, Stack, tokens } = api.ui;
  const dev = api.stores.useDevelopStore;
  const paramBag = dev((s) => s.paramBag);
  const armed = store()((s) => s.armed);
  const showMask = store()((s) => s.showMask);
  const brush = store()((s) => s);
  const held = api.develop.useCanvasToolHeld();

  // Another tool took the canvas (crop, masks, heal): the brush goes off.
  React.useEffect(() => {
    if (armed && !held) store().getState().setArmed(false);
  }, [armed, held]);

  const settings = readSettings(paramBag);
  const painted = hasPaint(readMask(paramBag));
  const combo = api.keybindings.getBinding(PAINT_ACTION_ID);
  const paintTitle = [
    combo ? `Paint over skin (${combo})` : "Paint over skin",
    painted ? null : "the sliders act only where you paint",
  ]
    .filter(Boolean)
    .join(": ");

  const separationSlider = (s: SliderSpec) => (
    <Slider
      key={s.key}
      label={s.label}
      value={settings[s.key]}
      min={s.min}
      max={s.max}
      step={1}
      defaultValue={s.default}
      onChange={(v: number) => setSlider(s.key, v)}
      onCommit={() => void commitSlider(s.key)}
    />
  );

  const brushSlider = (b: (typeof BRUSH_SLIDERS)[number]) => (
    <Slider
      key={b.key}
      label={b.label}
      value={Math.round(brush[b.key] * 100)}
      min={b.min}
      max={b.max}
      step={1}
      defaultValue={Math.round(api.develop.brush.defaults[b.official] * 100)}
      onChange={(v: number) => {
        store().getState().setBrush({ [b.key]: v / 100 });
        store().getState().setBrushPreview(true);
      }}
      onCommit={() => store().getState().setBrushPreview(false)}
    />
  );

  return (
    <Stack gap={6} style={{ padding: "6px 8px 8px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>{SLIDERS.map(separationSlider)}</div>
      <Row gap={6} style={{ marginTop: "4px" }}>
        <Button
          size="sm"
          active={armed}
          title={paintTitle}
          onClick={() => store().getState().toggleArmed()}
        >
          {armed ? "Done" : "Paint"}
        </Button>
        <Button size="sm" variant="ghost" disabled={!painted} onClick={() => void clearMask()}>
          Clear
        </Button>
      </Row>
      {armed ? (
        <div title={BRUSH_KEYS_TIP}>
          <Stack gap={2} style={{ padding: "6px", borderRadius: "4px", background: tokens.surface2 }}>
            {BRUSH_SLIDERS.map(brushSlider)}
            <Row gap={12} style={{ marginTop: "4px" }}>
              <Toggle checked={brush.brushErase} onChange={(v: boolean) => store().getState().setBrush({ brushErase: v })} label="Erase" />
              <Toggle checked={showMask} onChange={(v: boolean) => store().getState().setShowMask(v)} label="Show mask" />
            </Row>
          </Stack>
        </div>
      ) : null}
    </Stack>
  );
}
