// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The processing stage. It runs late in the decode phase, on the image as the
// decode stages and retouching (Heal) leave it ("current"), and ahead of
// exposure, white balance and the tone tools, so dragging those never reruns
// its passes. The perceptual space gives it signed values with no ceiling:
// highlights past white and colours outside sRGB come through unclipped.
//
// The four passes (model.ts has the why): the wide layer, the packing draw,
// the low layer, and the draw that makes Δ. The low layer's state is kept, so
// a Smoothing or Texture drag redraws only the last draw. The stage is dormant
// while nothing is painted, so an unpainted photo runs none of it.

import {
  CHAIN_HELPERS,
  FINAL_GLSL,
  FINAL_HELPERS,
  INLINE_GLSL,
  LOW_GLSL,
  LOW_REGION,
  PACK_GLSL,
  WIDE_GLSL,
  WIDE_REGION,
} from "./glsl";
import { LEVELS } from "./model";
import { MASK_KEY, MASK_ON_KEY, SLIDERS, STAGE_ID, type SliderKey } from "./params";
import type { ProcessingStageContribution, UniformDeclaration } from "./safelight";

/** After every other decode stage that keeps to the default order. */
export const STAGE_PRIORITY = 900;

const slider = (key: SliderKey): UniformDeclaration => {
  const s = SLIDERS.find((x) => x.key === key);
  if (!s) throw new Error(`no slider ${key}`);
  return { key, glslType: "float", default: s.default, range: { min: s.min, max: s.max, step: 1 }, label: s.label };
};

const MASK_ON: UniformDeclaration = { key: MASK_ON_KEY, glslType: "float", default: 0, label: "Painted" };

export function buildStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Skin Tone Brush",
    phase: "decode",
    priority: STAGE_PRIORITY,
    space: { encoding: "perceptual" },
    reads: "current",
    presetScope: "per-image",
    dormantWhen: { [MASK_ON_KEY]: 0 },
    uniforms: [MASK_ON],
    textures: [{ key: MASK_KEY, kind: "coverage" }],
    passes: [
      {
        glsl: WIDE_GLSL,
        helpers: CHAIN_HELPERS,
        region: WIDE_REGION,
        iterations: 2 * LEVELS,
        channels: 4,
        uniforms: [slider("textureSize"), slider("smoothSize")],
      },
      { glsl: PACK_GLSL, helpers: CHAIN_HELPERS, channels: 4 },
      {
        glsl: LOW_GLSL,
        helpers: CHAIN_HELPERS,
        region: LOW_REGION,
        iterations: 2 * LEVELS,
        channels: 4,
        keep: true,
        uniforms: [slider("textureSize")],
      },
      {
        glsl: FINAL_GLSL,
        helpers: `${CHAIN_HELPERS}\n${FINAL_HELPERS}`,
        channels: 4,
        uniforms: [slider("smoothing"), slider("textureAmount")],
      },
    ],
    glsl: INLINE_GLSL,
  };
}
