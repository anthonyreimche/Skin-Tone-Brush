// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Ids, the photo's edit keys and the four sliders. Every value lives in the
// photo's param bag under "{STAGE_ID}.{key}"; the brush's own settings are
// session state (store.ts), not part of the edit.

export const EXT_ID = "skin-tone-brush";
export const STAGE_ID = `${EXT_ID}.smooth`;
export const PANEL_ID = `${EXT_ID}.panel`;
export const PAINT_ACTION_ID = `${EXT_ID}.paint`;

export type SliderKey = "smoothing" | "smoothSize" | "textureAmount" | "textureSize";

export interface SliderSpec {
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  default: number;
  /** The undo step a drag of it makes. */
  history: string;
}

/** In panel order. Values are what the slider shows; model.ts maps them. */
export const SLIDERS: readonly SliderSpec[] = [
  { key: "smoothing", label: "Smoothing", min: 0, max: 100, default: 50, history: "Skin Smoothing" },
  { key: "smoothSize", label: "Smoothing size", min: 0, max: 100, default: 50, history: "Skin Smoothing Size" },
  { key: "textureAmount", label: "Texture", min: 0, max: 150, default: 100, history: "Skin Texture" },
  { key: "textureSize", label: "Texture size", min: 0, max: 100, default: 50, history: "Skin Texture Size" },
];

export type Settings = Record<SliderKey, number>;

export const DEFAULT_SETTINGS: Settings = {
  smoothing: 50,
  smoothSize: 50,
  textureAmount: 100,
  textureSize: 50,
};

export const qualified = (key: string): string => `${STAGE_ID}.${key}`;

/** The painted mask (a BrushDab list core bakes into coverage) and the switch
 *  that is 1 while it holds any paint: the stage is dormant at 0. */
export const MASK_KEY = "mask";
export const MASK_ON_KEY = "maskOn";

export const PARAM = {
  mask: qualified(MASK_KEY),
  maskOn: qualified(MASK_ON_KEY),
  smoothing: qualified("smoothing"),
  smoothSize: qualified("smoothSize"),
  textureAmount: qualified("textureAmount"),
  textureSize: qualified("textureSize"),
} as const;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The sliders as the bag holds them, each at its default when absent or not
 *  a number, and clamped to its range. */
export function readSettings(bag: Readonly<Record<string, unknown>>): Settings {
  const out = { ...DEFAULT_SETTINGS };
  for (const s of SLIDERS) {
    const v = bag[PARAM[s.key]];
    if (finite(v)) out[s.key] = Math.min(s.max, Math.max(s.min, v));
  }
  return out;
}

/** The bag entries that hold `settings`. */
export function settingsPatch(settings: Settings): Record<string, number> {
  return Object.fromEntries(SLIDERS.map((s) => [PARAM[s.key], settings[s.key]]));
}
