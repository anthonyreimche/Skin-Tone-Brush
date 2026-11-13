// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Writes to the photo's edit. Everything goes through the develop store's
// param bag, which gives undo and redo, the sidecar, photo switches and paste
// settings for free; core bakes the mask's coverage per render. A stroke and
// a slider drag write live and commit once, at the end.

import type { Dab } from "./brush";
import { DEFAULT_SETTINGS, PARAM, SLIDERS, settingsPatch, type SliderKey } from "./params";
import { api } from "./rt";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// The bag comes back from sidecar JSON, so a dab is checked field by field.
function isDab(value: unknown): value is Dab {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Partial<Record<keyof Dab, unknown>>;
  return (
    finite(d.x) &&
    finite(d.y) &&
    finite(d.radius) &&
    finite(d.feather) &&
    finite(d.opacity) &&
    finite(d.flow) &&
    typeof d.erase === "boolean"
  );
}

export function readMask(bag: Readonly<Record<string, unknown>>): Dab[] {
  const value = bag[PARAM.mask];
  return Array.isArray(value) && value.every(isDab) ? value : [];
}

/** Whether the mask holds any paint: a list of erase strokes alone paints
 *  nothing, and leaves the stage dormant. */
export const hasPaint = (dabs: readonly Dab[]): boolean => dabs.some((d) => !d.erase);

/** The bag entries for `dabs`: a new array each time, which is what tells the
 *  renderer to bake the coverage again. */
export function maskPatch(dabs: readonly Dab[]): Record<string, unknown> {
  return { [PARAM.mask]: [...dabs], [PARAM.maskOn]: hasPaint(dabs) ? 1 : 0 };
}

function develop() {
  return api.stores.useDevelopStore.getState();
}

/** Appends a stroke's dabs live, with no history entry. */
export function appendDabs(dabs: readonly Dab[]): void {
  const d = develop();
  d.setDynParams(maskPatch([...readMask(d.paramBag), ...dabs]));
}

export function endStroke(): Promise<void> {
  return develop().commitEdit("Skin Brush Stroke");
}

export async function clearMask(): Promise<void> {
  const d = develop();
  d.setDynParams(maskPatch([]));
  await d.commitEdit("Clear Skin Brush");
}

/** A slider's value, live; commitSlider ends the drag as one undo step. */
export function setSlider(key: SliderKey, value: number): void {
  develop().setDynParam(PARAM[key], value);
}

export function commitSlider(key: SliderKey): Promise<void> {
  const spec = SLIDERS.find((s) => s.key === key);
  return develop().commitEdit(spec?.history ?? "Skin Tone Brush");
}

/** The panel's reset: every slider at its default and the mask cleared. */
export async function resetAll(): Promise<void> {
  const d = develop();
  d.setDynParams({ ...settingsPatch(DEFAULT_SETTINGS), ...maskPatch([]) });
  await d.commitEdit("Reset Skin Tone Brush");
}
