// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Session state: whether the brush is on, its settings, and whether the
// painted area is shown. Not part of the photo's edit: the mask itself lives
// in the param bag (persistence.ts).

import type { BrushSettings } from "./brush";
import { api } from "./rt";
import type { AppStore } from "./safelight";

export interface BrushState extends BrushSettings {
  armed: boolean;
  /** Tint the painted area on the canvas while the brush is on. */
  showMask: boolean;
  /** A brush slider is being dragged: the overlay shows the brush at the
   *  view's centre. */
  brushPreview: boolean;
  setArmed(v: boolean): void;
  toggleArmed(): void;
  setShowMask(v: boolean): void;
  setBrush(patch: Partial<BrushSettings>): void;
  setBrushPreview(v: boolean): void;
}

let instance: AppStore<BrushState> | null = null;

export function initStore(): AppStore<BrushState> {
  instance = api.stores.create<BrushState>()((set) => ({
    brushSize: api.develop.brush.defaults.size,
    brushFeather: api.develop.brush.defaults.feather,
    brushOpacity: api.develop.brush.defaults.opacity,
    brushFlow: api.develop.brush.defaults.flow,
    brushErase: false,
    armed: false,
    showMask: true,
    brushPreview: false,
    setArmed: (armed) => set({ armed }),
    toggleArmed: () => set((s) => ({ armed: !s.armed })),
    setShowMask: (showMask) => set({ showMask }),
    setBrush: (patch) => set(patch),
    setBrushPreview: (brushPreview) => set({ brushPreview }),
  }));
  return instance;
}

export function store(): AppStore<BrushState> {
  if (!instance) throw new Error("[skin-tone-brush] store used before activate()");
  return instance;
}
