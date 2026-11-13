// The stage's shape, and what each of its draws reads. The GLSL itself runs in
// test/gpu (npm run test:gpu); these pin the parts that keep an unpainted
// photo free, a slider drag cheap and every draw within the read budget.

import { describe, expect, it } from "vitest";
import { CHAIN_HELPERS, FINAL_HELPERS, f } from "../src/glsl";
import { LEVELS } from "../src/model";
import { MASK_KEY, MASK_ON_KEY, STAGE_ID } from "../src/params";
import { buildStage } from "../src/stage";
import { inlineReads, passReads } from "./support/fetch-budget";

const stage = buildStage();
const passes = stage.passes ?? [];
const uniformKeys = (i: number) => (passes[i].uniforms ?? []).map((u) => u.key);

/** About what a GPU hang watchdog tolerates per draw at a large render. */
const READ_BUDGET = 25;

describe("the stage", () => {
  it("runs late in decode, on the image as retouching leaves it, signed and unclipped", () => {
    expect(stage.id).toBe(STAGE_ID);
    expect(stage.phase).toBe("decode");
    expect(stage.reads).toBe("current");
    expect(stage.space).toEqual({ encoding: "perceptual" });
  });

  it("is dormant while nothing is painted, and its inline is gated the same way", () => {
    expect(stage.dormantWhen).toEqual({ [MASK_ON_KEY]: 0 });
    expect(stage.uniforms.find((u) => u.key === MASK_ON_KEY)?.default).toBe(0);
    expect(stage.glsl.trim().startsWith(`if (${MASK_ON_KEY} > 0.5) {`)).toBe(true);
  });

  it("reads its mask as painted coverage, kept out of presets", () => {
    expect(stage.textures).toEqual([{ key: MASK_KEY, kind: "coverage" }]);
    expect(stage.presetScope).toBe("per-image");
  });

  it("keeps the low layer's state, so Smoothing and Texture redraw only the last draw", () => {
    expect(passes.map((p) => p.keep === true)).toEqual([false, false, true, false]);
    expect(uniformKeys(0)).toEqual(["textureSize", "smoothSize"]);
    expect(uniformKeys(1)).toEqual([]);
    expect(uniformKeys(2)).toEqual(["textureSize"]);
    expect(uniformKeys(3)).toEqual(["smoothing", "textureAmount"]);
  });

  it("carries four channels through every pass, the wide layer packed in alpha", () => {
    expect(passes.map((p) => p.channels)).toEqual([4, 4, 4, 4]);
  });

  it("gives each chain a draw pair per level and places the unused pairs nowhere", () => {
    for (const i of [0, 2]) {
      expect(passes[i].iterations).toBe(2 * LEVELS);
      expect(passes[i].region).toMatch(/stbChainRegion/);
    }
    expect(passes[1].iterations).toBeUndefined();
    expect(passes[3].iterations).toBeUndefined();
  });

  it("keeps fragment-only built-ins out of the helpers its region passes compile into a vertex program", () => {
    for (const text of [CHAIN_HELPERS, FINAL_HELPERS]) expect(text).not.toMatch(/\b(gl_FragCoord|discard|dFdx|dFdy|fwidth)\b/);
  });

  it("names no const array, which Direct3D 11 copies into every pixel's scratch memory", () => {
    for (const p of passes) expect(`${p.glsl}\n${p.helpers}`).not.toMatch(/\bconst\s+(?:\w+\s+)*\w+\s*\[/);
  });

  it("names nothing with a word GLSL ES 3.00 keeps for itself", () => {
    // Keywords and reserved words that read like ordinary names.
    const reserved = ["smooth", "flat", "centroid", "sample", "patch", "input", "output", "filter", "common", "partition", "active", "invariant", "layout", "precision", "attribute", "varying", "buffer", "shared", "resource", "noinline", "inline", "external", "interface", "union", "enum", "cast", "namespace", "using", "half", "fixed", "long", "short", "superp", "lowp", "highp", "mediump"];
    const declared = /\b(?:float|int|bool|u?int|[iu]?vec[234]|mat[234])\s+(\w+)/g;
    for (const text of [stage.glsl, ...passes.flatMap((p) => [p.glsl, p.helpers ?? "", p.region ?? ""])]) {
      for (const m of text.matchAll(declared)) expect(reserved).not.toContain(m[1]);
    }
  });

  it("writes float literals with a decimal point", () => {
    expect(f(4096)).toBe("4096.0");
    expect(f(0.5)).toBe("0.5");
    expect(CHAIN_HELPERS).not.toMatch(/[^\w.]\d+\s*\)\s*\/\s*\d+\.0/);
  });
});

describe("reads per draw", () => {
  it("stays within the budget in every pass", () => {
    const reads = passes.map(passReads);
    console.log(`[skin-tone-brush] reads per draw: ${reads.join(", ")}; inline ${inlineReads(stage)}`);
    for (const r of reads) expect(r).toBeLessThanOrEqual(READ_BUDGET);
  });

  it("counts the residual level's taps and the B3 level's both in a chain draw", () => {
    expect(passReads(passes[0])).toBe(1 + 4 + 12);
    expect(passReads(passes[2])).toBe(1 + 4 + 12);
  });

  it("reads a 2×2 block and the input in the packing draw, twelve packed texels in the last", () => {
    expect(passReads(passes[1])).toBe(1 + 4 + 1);
    expect(passReads(passes[3])).toBe(1 + 12 + 1);
  });

  it("reads the coverage and the result in the inline", () => {
    expect(inlineReads(stage)).toBe(2);
  });
});
