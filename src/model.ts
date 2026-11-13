// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The CPU reference of the stage, draw for draw (glsl.ts is the GPU side).
//
// Frequency separation, in the perceptual encoding the stage asks for: the
// low layer L is the image blurred by the texture size, and what lies under
// it (x − L) is the texture. Smoothing moves L toward E, a wider blur, so
// blotches of tone and colour even out while the texture stays as it was:
//
//   Δ = s · w · (E − L) + (k − 1) · (x − L)
//
// s is Smoothing, k is Texture. w is 1 for the small differences blotches
// make and falls fast where E and L part by more than PROTECT_TAU of the
// skin's level: beside a brow, a lash line or a lip, where the wide blur would
// bleed the neighbour's tone into the skin. The stage adds Δ by the painted
// coverage.
//
// The passes carry one RGBA16F frame between draws, and the result needs both
// layers, so the wide one is made first and packed into the alpha channel at
// half size (a 2×2 block holds its three channels): it is smooth, so the
// packing loses next to nothing. The colour channels then start again from the
// input and blur to L.
//
// A blur is a chain of separable draws: n levels of the B3 spline à trous at
// strides 1, 2, 4… and one residual level, a sampled Gaussian at the next
// stride, whose width takes up what the B3 levels leave of the variance. Its
// taps then stay within RESIDUAL_TAPS whatever the radius, every draw reads
// at most 13 texels, and the total variance is the one asked for. Radii are
// given at a 4096 px long edge and scaled to the frame, so a preview, a
// thumbnail and an export of any size blur the same share of the photo.

import { DEFAULT_SETTINGS, type Settings } from "./params";

export const REF_LONG_EDGE = 4096;
/** Draw pairs a chain may take: n tops out at LEVELS − 1. */
export const LEVELS = 10;
/** The residual level's taps each side of the centre. */
export const RESIDUAL_TAPS = 6;
/** The residual's variance, in units of its stride squared: a level is added
 *  once the residual would reach PLAN_LO at the next stride, which keeps it
 *  under PLAN_T2_MAX = 1 + 4 · PLAN_LO, inside its taps. */
export const PLAN_LO = 0.5;
export const PLAN_T2_MAX = 3;
export const PLAN_T2_MIN = 1e-4;

export const SPLIT_SIGMA = { min: 1, ratio: 20 } as const;
export const SMOOTH_SIGMA = { min: 4, ratio: 16 } as const;

/** Below this mean level the protection measures against it instead. */
export const PROTECT_FLOOR = 0.02;
export const PROTECT_TAU = 0.1;

const unit = (v: number): number => Math.min(100, Math.max(0, v)) / 100;

/** Texture size → the split blur's σ in px at the reference long edge. */
export const splitSigma = (textureSize: number): number =>
  SPLIT_SIGMA.min * SPLIT_SIGMA.ratio ** unit(textureSize);

/** Smoothing size → how much wider the smooth layer is, σ in px at the
 *  reference long edge; it adds to the split in variance. */
export const smoothSigma = (smoothSize: number): number =>
  SMOOTH_SIGMA.min * SMOOTH_SIGMA.ratio ** unit(smoothSize);

/** Pass pixels per reference pixel. */
export const anchor = (width: number, height: number): number => Math.max(width, height) / REF_LONG_EDGE;

export interface Plan {
  /** B3 levels ahead of the residual. */
  n: number;
  /** The residual's variance, in units of its stride (2^n) squared. */
  t2: number;
}

export function plan(variance: number): Plan {
  let n = 0;
  let p = 1;
  for (let i = 0; i < LEVELS - 1; i++) {
    const q = p * 4;
    if ((q - 1) / 3 + q * PLAN_LO > variance) break;
    p = q;
    n++;
  }
  const t2 = Math.min(PLAN_T2_MAX, Math.max(PLAN_T2_MIN, (variance - (p - 1) / 3) / p));
  return { n, t2 };
}

/** The draws a chain of `p` really takes; the rest of its 2 · LEVELS are
 *  empty. */
export const chainDraws = (p: Plan): number => 2 * (p.n + 1);

export interface Image {
  width: number;
  height: number;
  /** RGBA, rows from the top. */
  data: Float32Array;
}

export type Rgb = [number, number, number];

export function imageOf(width: number, height: number, texel: (x: number, y: number) => Readonly<Rgb>): Image {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = texel(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 1;
    }
  }
  return { width, height, data };
}

export interface ModelOptions {
  /** Round what each draw stores to half float, as the GPU's targets do. */
  half?: boolean;
}

/** The value an RGBA16F texel holds for x: 11 significant bits, round to nearest. */
export function toHalf(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const q = 2 ** (Math.max(Math.floor(Math.log2(Math.abs(x))), -14) - 10);
  return Math.round(x / q) * q;
}

function stored(data: Float32Array, opts: ModelOptions): Float32Array {
  if (opts.half) for (let i = 0; i < data.length; i++) data[i] = toHalf(data[i]);
  return data;
}

const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** One draw of a chain: level `level` along x (axis 0) or y (axis 1), on rgb;
 *  alpha is copied. */
function chainDraw(src: Image, level: number, axis: 0 | 1, p: Plan, opts: ModelOptions): Image {
  const { width: w, height: h, data } = src;
  const out = new Float32Array(data);
  const stride = 2 ** level;
  const residual = level === p.n;
  const weights: number[] = [];
  let wsum = 1;
  if (residual) {
    for (let i = 1; i <= RESIDUAL_TAPS; i++) {
      const wi = Math.exp(-(i * i) / (2 * p.t2));
      weights.push(wi);
      wsum += 2 * wi;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const tap = (k: number, ch: number): number => {
        const tx = axis === 0 ? clampInt(x + k * stride, 0, w - 1) : x;
        const ty = axis === 1 ? clampInt(y + k * stride, 0, h - 1) : y;
        return data[(ty * w + tx) * 4 + ch];
      };
      for (let ch = 0; ch < 3; ch++) {
        const own = data[o + ch];
        if (!residual) {
          out[o + ch] = 0.375 * own + 0.25 * (tap(1, ch) + tap(-1, ch)) + 0.0625 * (tap(2, ch) + tap(-2, ch));
        } else {
          let acc = own;
          for (let i = 1; i <= RESIDUAL_TAPS; i++) acc += weights[i - 1] * (tap(i, ch) + tap(-i, ch));
          out[o + ch] = acc / wsum;
        }
      }
    }
  }
  return { width: w, height: h, data: stored(out, opts) };
}

/** Blur rgb to `variance` (px², in this image's pixels); alpha is kept. */
export function blurChain(img: Image, variance: number, opts: ModelOptions = {}): Image {
  const p = plan(variance);
  let cur = img;
  for (let level = 0; level <= p.n; level++) {
    cur = chainDraw(cur, level, 0, p, opts);
    cur = chainDraw(cur, level, 1, p, opts);
  }
  return cur;
}

/** Complete 2×2 blocks along each axis (at least one). */
const blocks = (w: number, h: number): [number, number] => [Math.max(1, w >> 1), Math.max(1, h >> 1)];

/** The packing draw: rgb from `input`, alpha one channel of `even`'s 2×2
 *  block mean (channel (x & 1) + 2 (y & 1); the fourth slot repeats blue). */
export function packEven(even: Image, input: Image, opts: ModelOptions = {}): Image {
  const { width: w, height: h } = even;
  const [nbx, nby] = blocks(w, h);
  const out = new Float32Array(input.data);
  const at = (x: number, y: number, ch: number): number =>
    even.data[(clampInt(y, 0, h - 1) * w + clampInt(x, 0, w - 1)) * 4 + ch];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bx = Math.min(x >> 1, nbx - 1) * 2;
      const by = Math.min(y >> 1, nby - 1) * 2;
      const ch = Math.min(2, (x & 1) + 2 * (y & 1));
      out[(y * w + x) * 4 + 3] = 0.25 * (at(bx, by, ch) + at(bx + 1, by, ch) + at(bx, by + 1, ch) + at(bx + 1, by + 1, ch));
    }
  }
  return { width: w, height: h, data: stored(out, opts) };
}

/** The wide layer at texel (x, y), bilinear between the block centres. */
export function unpackEven(packed: Image, x: number, y: number): Rgb {
  const { width: w, height: h, data } = packed;
  const [nbx, nby] = blocks(w, h);
  const block = (bx: number, by: number): Rgb => {
    const ch = (c: number): number => {
      const tx = clampInt(bx * 2 + (c & 1), 0, w - 1);
      const ty = clampInt(by * 2 + (c >> 1), 0, h - 1);
      return data[(ty * w + tx) * 4 + 3];
    };
    return [ch(0), ch(1), ch(2)];
  };
  const ux = (x - 0.5) * 0.5;
  const uy = (y - 0.5) * 0.5;
  const ix = Math.floor(ux);
  const iy = Math.floor(uy);
  const fx = ux - ix;
  const fy = uy - iy;
  const ax = clampInt(ix, 0, nbx - 1);
  const ay = clampInt(iy, 0, nby - 1);
  const bx = clampInt(ix + 1, 0, nbx - 1);
  const by = clampInt(iy + 1, 0, nby - 1);
  const p00 = block(ax, ay);
  const p10 = block(bx, ay);
  const p01 = block(ax, by);
  const p11 = block(bx, by);
  const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
  return [0, 1, 2].map((c) => mix(mix(p00[c], p10[c], fx), mix(p01[c], p11[c], fx), fy)) as Rgb;
}

/** The evening weight for a difference `d` between the layers over a low
 *  layer `low`. */
export function protection(d: Readonly<Rgb>, low: Readonly<Rgb>): number {
  const ref = Math.max((Math.abs(low[0]) + Math.abs(low[1]) + Math.abs(low[2])) / 3, PROTECT_FLOOR);
  const rel2 = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) / (3 * ref * ref);
  const q = rel2 / (PROTECT_TAU * PROTECT_TAU);
  return Math.exp(-q * q);
}

/** The variances (px², in the frame's pixels) of the two blurs. */
export function variances(width: number, height: number, settings: Settings): { split: number; wide: number } {
  const a2 = anchor(width, height) ** 2;
  const s = splitSigma(settings.textureSize);
  const e = smoothSigma(settings.smoothSize);
  return { split: s * s * a2, wide: (s * s + e * e) * a2 };
}

/** The passes on `input` (perceptual): Δ per pixel in rgb. */
export function separate(input: Image, settings: Settings = DEFAULT_SETTINGS, opts: ModelOptions = {}): Image {
  const { width: w, height: h } = input;
  const x0 = opts.half ? { width: w, height: h, data: stored(new Float32Array(input.data), opts) } : input;
  const v = variances(w, h, settings);
  const wide = blurChain(x0, v.wide, opts);
  const packed = packEven(wide, x0, opts);
  const low = blurChain(packed, v.split, opts);
  const s = unit(settings.smoothing);
  const k = Math.min(150, Math.max(0, settings.textureAmount)) / 100;
  const out = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const l: Rgb = [low.data[o], low.data[o + 1], low.data[o + 2]];
      const e = unpackEven(low, x, y);
      const d: Rgb = [e[0] - l[0], e[1] - l[1], e[2] - l[2]];
      const wgt = protection(d, l);
      for (let ch = 0; ch < 3; ch++) out[o + ch] = s * wgt * d[ch] + (k - 1) * (x0.data[o + ch] - l[ch]);
      out[o + 3] = 1;
    }
  }
  return { width: w, height: h, data: stored(out, opts) };
}

export const encodePerceptual = (x: number): number => {
  const a = Math.abs(x);
  const e = a < 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055;
  return Math.sign(x) * e;
};

export const decodePerceptual = (y: number): number => {
  const a = Math.abs(y);
  const d = a < 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4;
  return Math.sign(y) * d;
};

/** The whole stage on a linear frame: Δ added in the perceptual encoding by
 *  `coverage` (0 to 1), linear out. */
export function smoothSkin(
  linear: Image,
  coverage: (x: number, y: number) => number,
  settings: Settings = DEFAULT_SETTINGS,
  opts: ModelOptions = {},
): Image {
  const { width: w, height: h } = linear;
  const encoded = { width: w, height: h, data: linear.data.map((v, i) => (i % 4 === 3 ? v : encodePerceptual(v))) };
  const delta = separate(encoded, settings, opts);
  const out = new Float32Array(linear.data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cov = coverage(x, y);
      if (cov <= 0) continue;
      const o = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) out[o + ch] = decodePerceptual(encoded.data[o + ch] + cov * delta.data[o + ch]);
    }
  }
  return { width: w, height: h, data: out };
}
