// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Frequency-separation skin smoothing under a brush. The stage (stage.ts)
// splits the painted skin into its tone and colour and its texture and evens
// out the first; the panel (Panel.tsx) holds the sliders and the brush; the
// overlay (Overlay.tsx) is the canvas tool held while the brush is on, and
// paints the photo's mask, which core bakes into the stage's coverage.

import { SKIN_TOOL } from "./Overlay";
import { SkinPanel } from "./Panel";
import { EXT_ID, PAINT_ACTION_ID, PANEL_ID, STAGE_ID } from "./params";
import { resetAll } from "./persistence";
import { initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";
import { buildStage } from "./stage";
import { initStore, store } from "./store";

export { EXT_ID, PANEL_ID };

// Null until activate() runs.
let activeHost: SafelightAPI | null = null;
let unfollow: (() => void) | null = null;

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initStore();
  activeHost = host;
  host.registerProcessingStage(buildStage());

  // The brush on holds the canvas; off lets it go.
  unfollow = store().subscribe((s, prev) => {
    if (s.armed !== prev.armed) host.develop.setCanvasTool(s.armed ? SKIN_TOOL : null);
  });

  host.registerKeybinding({
    id: PAINT_ACTION_ID,
    label: "Paint skin smoothing",
    category: "Develop",
    defaultCombo: "Shift+K",
    handler: () => {
      if (host.navigation.current() === "develop" && host.stores.useDevelopStore.getState().photoId) store().getState().toggleArmed();
    },
  });

  host.registerPanel({
    id: PANEL_ID,
    title: "Skin Tone Brush",
    component: SkinPanel,
    defaultDock: { module: "develop", direction: "right", width: 250 },
    modules: ["develop"],
    onReset: () => void resetAll(),
  });
}

export function deactivate(): void {
  const host = activeHost;
  if (!host) return;
  activeHost = null;
  // The host sweeps the panel, shortcut, canvas tool and stage itself; this
  // drops the brush so a re-enable starts clean. A throw here would skip that
  // sweep, so a failure is logged instead.
  try {
    store().getState().setArmed(false);
    unfollow?.();
    unfollow = null;
    host.develop.setCanvasTool(null);
    host.unregisterProcessingStage(STAGE_ID);
  } catch (err) {
    console.warn("[skin-tone-brush] deactivate failed:", err);
  }
}
