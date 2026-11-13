// The stage on the real renderer. Run via `npm run test:gpu` (run.cjs copies
// this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//  • core's stage contract takes the stage without a warning, and every
//    program, pass and region vertex program included, builds;
//  • an unpainted photo renders bit for bit as without the stage in the live
//    view (dormant), and within float rounding in an export;
//  • in float32 with half-float targets, through the host's input target,
//    regions, packing into alpha and coverage bake, the result lands on the
//    CPU model (model.ts, run with half-float storage) for several settings
//    and radii, highlights past white included (where core's clipped-channel
//    reconstruction, which runs on a RAW after the decode stages, leaves the
//    pixel alone);
//  • only painted pixels change;
//  • a zoomed view shows the very pixels the whole view does, and a render at
//    half the size (a smaller export) the same change;
//  • a kept low layer gives what a full run gives, and a Smoothing or
//    Texture change redraws one draw;
//  • while painting, a stroke runs no pass and builds no program, and each
//    dab's tint costs well under a frame (the coverage bake's cost is logged).
//
// Frames are read at "pre-output" as drawn: with the open probe and no other
// stage, that is `lin` as the stage left it, linear, sign and headroom intact.

import { describe, expect, it } from "vitest";
import { makeDab, shouldStamp, type BrushSettings, type Dab } from "@stb/brush";
import { EXT_ID, PARAM, DEFAULT_SETTINGS, type Settings } from "@stb/params";
import { maskPatch, readMask } from "@stb/persistence";
import { paintDabs, paintWash } from "@stb/wash";
import { buildStage } from "@stb/stage";
import { decodePerceptual, encodePerceptual, smoothSkin, type Image } from "@stb/model";
import { CURRENT_PROCESS_VERSION } from "@/catalog/types";
import { checkStageContract } from "@/extensions/stage-validation";
import { CoverageBaker, coverageSignature } from "@/rendering/webgl/mask-coverage";
import type { WebGLRenderer } from "@/rendering/webgl/renderer";
import {
  OPEN_PROBE,
  type FloatImage,
  type Frame,
  floatImage,
  glHarness,
  identityParams,
  rendererBuildError,
  trackGlObjects,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";

const STAGE = buildStage();
const AS_DRAWN = { encoding: "perceptual" } as const;

function hash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return 2 * (s - Math.floor(s)) - 1;
}

/** Linear skin: a tone, red blotches about a dozen pixels across, pores a
 *  pixel wide (`pores` 0 leaves them out), a dark brow band (`brow` false
 *  leaves it out), and `gain` to push it past white. */
function skin(width: number, height: number, { gain = 1, pores = 1, scale = 1, brow: withBrow = true } = {}): FloatImage {
  return floatImage(width, height, (x, y) => {
    const u = x / scale;
    const v = y / scale;
    const b = 0.5 * Math.sin(u * 0.45 + 1.3) * Math.sin(v * 0.5 + 0.4) + 0.5 * Math.sin(u * 0.35 - v * 0.3);
    const p = pores * hash(Math.floor(u), Math.floor(v), 3);
    const brow = withBrow && u > 0.7 * (width / scale) && u < 0.78 * (width / scale) ? 0.5 : 0;
    const enc = [0.78 + 0.03 * b + 0.04 * p - brow, 0.6 - 0.05 * b + 0.04 * p - brow, 0.5 - 0.04 * b + 0.035 * p - brow * 0.8];
    return [0, 1, 2].map((ch) => gain * decodePerceptual(enc[ch])) as [number, number, number];
  });
}

const W = 512;
const H = 256;
const SOURCE = skin(W, H);

const dab = (x: number, radius: number) => ({
  x,
  y: 0.5,
  radius,
  erase: false,
  feather: 0,
  opacity: 1,
  flow: 1,
  strokeStart: true,
});

/** Covers the whole frame. */
const EVERYWHERE = [dab(0.5, 3)];

const bag = (settings: Partial<Settings>, mask: object[] = EVERYWHERE): Record<string, unknown> => ({
  [PARAM.mask]: mask,
  [PARAM.maskOn]: mask.length > 0 ? 1 : 0,
  ...Object.fromEntries(Object.entries({ ...DEFAULT_SETTINGS, ...settings }).map(([k, v]) => [PARAM[k as keyof Settings], v])),
});

function read(renderer: WebGLRenderer): Frame {
  const f = renderer.readFloatFrame("pre-output", Infinity, AS_DRAWN);
  if (!f) throw new Error("readFloatFrame returned null");
  return f;
}

function frame(
  b: Record<string, unknown> | null,
  source: FloatImage = SOURCE,
  processVersion = CURRENT_PROCESS_VERSION,
  live = false,
): Frame {
  return withRenderer({ stages: b ? [STAGE] : [], pipeline: OPEN_PROBE, skipDormantStages: live }, (renderer) => {
    renderer.setImage(source);
    renderer.setParams(identityParams({ processVersion }));
    if (b) renderer.setContributedParams(b);
    return read(renderer);
  });
}

/** Texels that differ between two frames, and by how much at most. Counted
 *  rather than compared with toEqual, whose diff of half a million floats
 *  stalls the browser. */
function difference(a: Frame, b: Frame): { count: number; worst: number } {
  let count = 0;
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    if (d > 0 || Number.isNaN(d)) count++;
    worst = Math.max(worst, Number.isNaN(d) ? Infinity : d);
  }
  return { count, worst };
}

const asImage = (f: Frame): Image => ({ width: f.width, height: f.height, data: f.data });

/** Core's clipped-channel reconstruction (shaders.ts reconstructClipped) runs
 *  on a RAW after the decode stages and rebuilds a pixel whose channels sit
 *  on both sides of this level; a pixel with all or none above it it leaves
 *  alone. */
const CLIP = 0.98;
const mixedClip = (d: Float32Array, px: number): boolean => {
  const n = [0, 1, 2].filter((ch) => d[px * 4 + ch] >= CLIP).length;
  return n > 0 && n < 3;
};

/** Worst and rms |GPU − model| of the change, in the perceptual encoding the
 *  stage works in and relative to the value past 1 (where a half float's step
 *  grows with it), the model run from the frame the stage was handed, over
 *  the pixels core's clip reconstruction leaves alone (`compared` of them). */
function versusModel(base: Frame, out: Frame, settings: Settings): { worst: number; rms: number; moved: number; compared: number } {
  const want = smoothSkin(asImage(base), () => 1, settings, { half: true });
  let worst = 0;
  let sum = 0;
  let moved = 0;
  let n = 0;
  let where = "";
  for (let i = 0; i < out.data.length; i++) {
    if (i % 4 === 3) continue;
    const px = Math.floor(i / 4);
    if (mixedClip(base.data, px) || mixedClip(want.data, px)) continue;
    const got = encodePerceptual(out.data[i]);
    const exp = encodePerceptual(want.data[i]);
    // A value that isn't finite fails the bound below.
    const e = Number.isFinite(got) ? Math.abs(got - exp) / Math.max(1, Math.abs(exp)) : Infinity;
    if (e > worst) {
      where = `x ${px % out.width} y ${Math.floor(px / out.width)} ch ${i % 4}: in ${base.data[i].toFixed(4)} gpu ${out.data[i].toFixed(4)} model ${want.data[i].toFixed(4)}`;
    }
    worst = Math.max(worst, e);
    sum += e * e;
    moved = Math.max(moved, Math.abs(got - encodePerceptual(base.data[i])));
    n++;
  }
  console.log(`[stb-gpu] worst at ${where}`);
  return { worst, rms: Math.sqrt(sum / n), moved, compared: n / (3 * out.width * out.height) };
}

const LARGE = { smoothSize: 100, textureSize: 100 };

describe("Skin Tone Brush on the GPU", () => {
  it("passes core's stage contract without a warning", () => {
    expect(checkStageContract(STAGE, EXT_ID)).toMatchObject({ error: null, warnings: [] });
  });

  it("builds every program, its passes' region programs included", () => {
    const error = rendererBuildError({ stages: [STAGE] });
    if (error) console.log(`[stb-gpu] build error: ${error}`);
    expect(error).toBeNull();
  });

  it("leaves an unpainted photo exactly as it was in the live view, where it is dormant", () => {
    const plain = frame(null);
    expect(difference(frame({}, SOURCE, CURRENT_PROCESS_VERSION, true), plain)).toEqual({ count: 0, worst: 0 });
    expect(difference(frame(bag({ smoothing: 100 }, []), SOURCE, CURRENT_PROCESS_VERSION, true), plain)).toEqual({ count: 0, worst: 0 });
  });

  it("moves an unpainted photo by float rounding at most in an export, which runs every stage", () => {
    const plain = frame(null);
    const { worst } = difference(frame(bag({ smoothing: 100 }, [])), plain);
    console.log(`[stb-gpu] unpainted export: worst ${worst.toExponential(2)}`);
    expect(worst).toBeLessThan(2e-6);
  });

  const cases: [string, Partial<Settings>, FloatImage][] = [
    ["full smoothing, largest sizes", { smoothing: 100, textureAmount: 100, ...LARGE }, SOURCE],
    ["half smoothing, texture off, largest sizes", { smoothing: 50, textureAmount: 0, ...LARGE }, SOURCE],
    ["texture 150, no smoothing", { smoothing: 0, textureAmount: 150, ...LARGE }, SOURCE],
    ["the defaults", {}, SOURCE],
    ["wide smoothing, small texture", { smoothing: 80, textureAmount: 60, smoothSize: 100, textureSize: 20 }, SOURCE],
    ["past white", { smoothing: 100, textureAmount: 70, ...LARGE }, skin(W, H, { gain: 8, brow: false })],
    ["a wider frame, more levels", { smoothing: 100, textureAmount: 50, ...LARGE }, skin(1024, 192)],
  ];
  for (const [name, over, source] of cases) {
    it(`lands on the CPU model: ${name}`, () => {
      const settings = { ...DEFAULT_SETTINGS, ...over };
      const base = frame(null, source);
      const out = frame(bag(settings), source);
      const { worst, rms, moved, compared } = versusModel(base, out, settings);
      console.log(
        `[stb-gpu] ${name}: worst ${worst.toExponential(2)}, rms ${rms.toExponential(2)}, largest change ${moved.toFixed(4)}, ${(100 * compared).toFixed(1)} % compared`,
      );
      expect(compared).toBeGreaterThan(0.9);
      expect(moved).toBeGreaterThan(0.01);
      expect(worst).toBeLessThan(2e-3);
      expect(rms).toBeLessThan(3e-4);
    });
  }

  it("keeps highlights past white", () => {
    const out = frame(bag({ smoothing: 100, ...LARGE }), skin(W, H, { gain: 8, brow: false }));
    let over = 0;
    for (let i = 0; i < out.data.length; i++) if (i % 4 !== 3 && out.data[i] > 1.05) over++;
    expect(over / (3 * W * H)).toBeGreaterThan(0.9);
  });

  it("changes only the painted pixels", () => {
    const base = frame(null);
    // Radius 0.6 image heights at x 0.25 on a 2:1 frame reaches x 0.55.
    const out = frame(bag({ smoothing: 100, ...LARGE }, [dab(0.25, 0.6)]));
    let changed = 0;
    let outside = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const d = Math.abs(out.data[o + ch] - base.data[o + ch]);
          if (x > 0.62 * W) outside = Math.max(outside, d / Math.max(1, Math.abs(base.data[o + ch])));
          else if (x < 0.4 * W && d > 1e-3) changed++;
        }
      }
    }
    console.log(`[stb-gpu] unpainted side moved by at most ${outside.toExponential(2)}`);
    expect(outside).toBeLessThanOrEqual(1e-6);
    expect(changed).toBeGreaterThan(1000);
  });

  it("shows the same pixels zoomed in as in the whole view", () => {
    const b = bag({ smoothing: 100, textureAmount: 60, ...LARGE });
    const [whole, zoomed] = withRenderer({ stages: [STAGE], pipeline: OPEN_PROBE }, (renderer) => {
      renderer.setImage(SOURCE);
      renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
      renderer.setContributedParams(b);
      const all = read(renderer);
      renderer.setViewport({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, W / 2, H / 2);
      return [all, read(renderer)];
    });
    expect([zoomed.width, zoomed.height]).toEqual([W / 2, H / 2]);
    let worst = 0;
    for (let y = 0; y < H / 2; y++) {
      for (let x = 0; x < W / 2; x++) {
        for (let ch = 0; ch < 3; ch++) {
          const a = zoomed.data[(y * (W / 2) + x) * 4 + ch];
          const c = whole.data[((y + H / 4) * W + x + W / 4) * 4 + ch];
          worst = Math.max(worst, Math.abs(encodePerceptual(a) - encodePerceptual(c)));
        }
      }
    }
    console.log(`[stb-gpu] zoomed vs whole: worst ${worst.toExponential(2)}`);
    expect(worst).toBeLessThan(1e-5);
  });

  it("makes the same change in a render half the size, as an export at another size does", () => {
    // Smooth skin and no brow: a pixel-wide pore or a sharp edge is another
    // pattern at another size, so only the smooth change can match.
    const smooth = skin(W, H, { pores: 0, brow: false });
    const b = bag({ smoothing: 100, textureAmount: 100, ...LARGE });
    const change = (maxEdge: number): Frame =>
      withRenderer({ stages: [STAGE], pipeline: OPEN_PROBE }, (renderer) => {
        renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
        renderer.setImage(smooth, maxEdge);
        const base = read(renderer);
        renderer.setContributedParams(b);
        const out = read(renderer);
        return { ...out, data: out.data.map((v, i) => encodePerceptual(v) - encodePerceptual(base.data[i])) };
      });
    const full = change(W);
    const half = change(W / 2);
    expect([half.width, half.height]).toEqual([W / 2, H / 2]);
    let worst = 0;
    let moved = 0;
    let where = "";
    for (let y = 8; y < H / 2 - 8; y++) {
      for (let x = 8; x < W / 2 - 8; x++) {
        for (let ch = 0; ch < 3; ch++) {
          const at = (xx: number, yy: number) => full.data[(yy * W + xx) * 4 + ch];
          const down = (at(2 * x, 2 * y) + at(2 * x + 1, 2 * y) + at(2 * x, 2 * y + 1) + at(2 * x + 1, 2 * y + 1)) / 4;
          const e = Math.abs(down - half.data[(y * (W / 2) + x) * 4 + ch]);
          if (e > worst) where = `x ${x} y ${y} ch ${ch}`;
          worst = Math.max(worst, e);
          moved = Math.max(moved, Math.abs(down));
        }
      }
    }
    console.log(`[stb-gpu] half size vs full: worst ${worst.toExponential(2)} at ${where} of a change up to ${moved.toFixed(4)}`);
    expect(moved).toBeGreaterThan(0.01);
    expect(worst).toBeLessThan(4e-3);
  });

  it("resumes from the kept low layer as a full run draws, one draw for a Smoothing or Texture change", () => {
    const first = bag({ smoothing: 50, textureAmount: 100, ...LARGE });
    const second = bag({ smoothing: 100, textureAmount: 40, ...LARGE });
    const third = bag({ smoothing: 100, textureAmount: 40, smoothSize: 100, textureSize: 70 });
    const [resumed, draws, rerun] = withRenderer(
      { stages: [STAGE], pipeline: OPEN_PROBE, keepPassCheckpoints: true },
      (renderer): [Frame, number, Frame] => {
        renderer.setImage(SOURCE);
        renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
        renderer.setContributedParams(first);
        read(renderer);
        const before = renderer.renderDrawCounts.pass;
        renderer.setContributedParams(second);
        const out = read(renderer);
        const drawn = renderer.renderDrawCounts.pass - before;
        renderer.setContributedParams(third);
        return [out, drawn, read(renderer)];
      },
    );
    expect(draws).toBe(1);
    expect(difference(resumed, frame(second))).toEqual({ count: 0, worst: 0 });
    expect(difference(rerun, frame(third))).toEqual({ count: 0, worst: 0 });
  });

  it("works on a version 1 photo too", () => {
    const settings = { ...DEFAULT_SETTINGS, smoothing: 100, ...LARGE };
    const base = frame(null, SOURCE, 1);
    const out = frame(bag(settings), SOURCE, 1);
    const { worst, moved } = versusModel(base, out, settings);
    expect(moved).toBeGreaterThan(0.01);
    expect(worst).toBeLessThan(2e-3);
  });
});

/** The dabs a stroke across the photo's middle, from x0 to x1 in source UV,
 *  stamps with `brush`, the pointer sampled every 2 px of a 1500 × 1000 view. */
function stroke(brush: BrushSettings, x0 = 0.05, x1 = 0.95, y = 0.5, aspect = 1.5): Dab[] {
  const dabs = [makeDab({ x: x0, y }, brush, false, true)];
  let last = { x: x0, y };
  for (let px = x0 * 1500; px <= x1 * 1500; px += 2) {
    const p = { x: px / 1500, y };
    if (!shouldStamp(last, p, brush, aspect)) continue;
    dabs.push(makeDab(p, brush, false, false));
    last = p;
  }
  return dabs;
}

const BRUSH: BrushSettings = { brushSize: 0.08, brushFeather: 0.5, brushOpacity: 1, brushFlow: 1, brushErase: false };

describe("Skin Tone Brush's cost while painting", () => {
  const { gl } = glHarness();
  const LIVE = { stages: [STAGE], pipeline: OPEN_PROBE, keepPassCheckpoints: true, skipDormantStages: true } as const;
  const draws = (r: WebGLRenderer, frame: () => unknown): { pass: number; split: number } => {
    const before = { ...r.renderDrawCounts };
    frame();
    return { pass: r.renderDrawCounts.pass - before.pass, split: r.renderDrawCounts.split - before.split };
  };

  it("draws nothing and stays out of the program while nothing is painted", () => {
    withRenderer(LIVE, (r) => {
      r.setImage(SOURCE);
      r.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
      for (const b of [{}, bag({ smoothing: 100 }, []), bag({}, [{ ...dab(0.5, 0.2), erase: true }])]) {
        r.setContributedParams({ ...b, [PARAM.maskOn]: 0 });
        expect(draws(r, () => read(r))).toEqual({ pass: 0, split: 0 });
        expect(r.dormantStages).toEqual([STAGE.id]);
      }
    });
  });

  it("neither runs a pass again nor builds a program as a stroke grows, is erased or cleared", () => {
    const dabs = stroke(BRUSH);
    withRenderer(LIVE, (r) => {
      r.setImage(SOURCE);
      r.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
      const settings = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [PARAM[k as keyof Settings], v]));
      r.setContributedParams({ ...settings, ...maskPatch(dabs.slice(0, 1)) });
      expect(draws(r, () => read(r)).pass).toBeGreaterThan(0);
      const tally = trackGlObjects(gl);
      try {
        for (let n = 2; n <= dabs.length; n++) {
          r.setContributedParams({ ...settings, ...maskPatch(dabs.slice(0, n)) });
          expect(draws(r, () => read(r)), `dab ${n}`).toEqual({ pass: 0, split: 0 });
        }
        const erased = [...dabs, makeDab({ x: 0.5, y: 0.5 }, { ...BRUSH, brushErase: true }, false, true)];
        r.setContributedParams({ ...settings, ...maskPatch(erased) });
        expect(draws(r, () => read(r))).toEqual({ pass: 0, split: 0 });
        r.setContributedParams({ ...settings, ...maskPatch([]) });
        expect(draws(r, () => read(r))).toEqual({ pass: 0, split: 0 });
        expect(tally.created.program).toBe(0);
        expect(tally.created.shader).toBe(0);
      } finally {
        tally.restore();
      }
    });
  });

  // What one more dab costs where it lands. The overlay draws its tint on the
  // main thread: only the new dab, in well under a frame. Core signs and bakes
  // the coverage off the main thread, in the render worker: measured here, not
  // held to a bound, since the extension has no say in it.
  it("draws each dab's tint well under a frame, at every brush size, with a long history", () => {
    const history = Array.from({ length: 12 }, (_, i) => stroke({ ...BRUSH, brushSize: 0.01 }, 0.05, 0.95, 0.05 + i * 0.075)).flat();
    const cases: [string, Dab[], Dab[]][] = [
      ["largest brush", [], stroke({ ...BRUSH, brushSize: 0.5 })],
      ["default brush", [], stroke(BRUSH)],
      ["smallest brush", [], stroke({ ...BRUSH, brushSize: 0.01 })],
      [`smallest brush over ${history.length} dabs`, history, stroke({ ...BRUSH, brushSize: 0.01 }, 0.05, 0.95, 0.52)],
      [`largest brush over ${history.length} dabs`, history, stroke({ ...BRUSH, brushSize: 0.5 })],
    ];
    const canvas = document.createElement("canvas");
    canvas.width = 1500;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas");
    const geo = { toScreen: (u: number, v: number) => ({ x: u * 1500, y: v * 1000 }), radiusToScreen: (r: number) => r * 1000 };
    for (const [name, before, dabs] of cases) {
      const baker = new CoverageBaker();
      const worst = { edit: 0, sign: 0, bake: 0, tint: 0, whole: 0 };
      paintWash(ctx, before, geo, 1500, 1000);
      for (let n = 1; n <= dabs.length; n++) {
        const te = performance.now();
        const edit = maskPatch([...readMask({ [PARAM.mask]: [...before, ...dabs.slice(0, n - 1)] }), dabs[n - 1]]);
        const items = [{ id: PARAM.mask, dabs: readMask(edit) }];
        const t0 = performance.now();
        coverageSignature(items, 1.5);
        const t1 = performance.now();
        baker.bake(items, 1.5);
        const t2 = performance.now();
        paintDabs(ctx, dabs.slice(n - 1, n), geo);
        ctx.getImageData(0, 0, 1, 1);
        const t3 = performance.now();
        if (n === 1) continue;
        worst.edit = Math.max(worst.edit, t0 - te);
        worst.sign = Math.max(worst.sign, t1 - t0);
        worst.bake = Math.max(worst.bake, t2 - t1);
        worst.tint = Math.max(worst.tint, t3 - t2);
      }
      const t4 = performance.now();
      paintWash(ctx, [...before, ...dabs], geo, 1500, 1000);
      ctx.getImageData(0, 0, 1, 1);
      worst.whole = performance.now() - t4;
      console.log(
        `[stb-gpu] ${name}, ${dabs.length} dabs: worst dab: edit ${worst.edit.toFixed(1)} ms and tint ${worst.tint.toFixed(1)} ms on the main thread; ` +
          `in the worker, signing ${worst.sign.toFixed(1)} ms and baking ${worst.bake.toFixed(1)} ms. ` +
          `Whole tint (zoom, undo): ${worst.whole.toFixed(1)} ms`,
      );
      expect(worst.edit + worst.tint).toBeLessThan(8);
    }
  });
});
