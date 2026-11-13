// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The stage's GLSL, draw for draw what model.ts computes. Its constants come
// from model.ts, and the taps are unrolled here rather than looped, so no
// texture read sits inside a loop.
//
// Identifier rules: uniform keys are rewritten into the stage's namespace by
// whole-identifier replace, so `smoothing`, `smoothSize`, `textureAmount`,
// `textureSize`, `maskOn` and `mask` appear only as those, and every helper
// carries an `stb` prefix no engine helper uses. Helpers of a pass with a
// region also compile into its vertex program, so they never name
// gl_FragCoord: the draw's texel is handed to them.

import {
  LEVELS,
  PLAN_LO,
  PLAN_T2_MAX,
  PLAN_T2_MIN,
  PROTECT_FLOOR,
  PROTECT_TAU,
  REF_LONG_EDGE,
  RESIDUAL_TAPS,
  SMOOTH_SIGMA,
  SPLIT_SIGMA,
} from "./model";

/** A GLSL float literal: whole numbers gain ".0" (GLSL ES has no int → float). */
export const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

const taps = (side: 1 | -1): string[] =>
  Array.from({ length: RESIDUAL_TAPS }, (_, i) => i + 1).map((i) => `stbTap(p, dir, ${side * i} * stride)`);

const residualSum = Array.from({ length: RESIDUAL_TAPS }, (_, i) => {
  const k = i + 1;
  const [plus, minus] = [taps(1)[i], taps(-1)[i]];
  return `    w = exp(-${f(k * k)} / (2.0 * t2));\n    acc += w * (${plus} + ${minus});\n    wsum += 2.0 * w;`;
}).join("\n");

/** Shared by every pass: the chain plan, the radii and the taps. */
export const CHAIN_HELPERS = `
ivec2 stbSize() { return ivec2(floor(1.0 / uTexel + 0.5)); }
float stbAnchor() {
  vec2 res = 1.0 / uTexel;
  return max(res.x, res.y) / ${f(REF_LONG_EDGE)};
}
float stbSplitRef(float v) { return ${f(SPLIT_SIGMA.min)} * pow(${f(SPLIT_SIGMA.ratio)}, clamp(v, 0.0, 100.0) / 100.0); }
float stbSmoothRef(float v) { return ${f(SMOOTH_SIGMA.min)} * pow(${f(SMOOTH_SIGMA.ratio)}, clamp(v, 0.0, 100.0) / 100.0); }
float stbSplitVariance(float size) {
  float a = stbAnchor();
  float s = stbSplitRef(size);
  return s * s * a * a;
}
float stbWideVariance(float size, float wide) {
  float a = stbAnchor();
  float s = stbSplitRef(size);
  float e = stbSmoothRef(wide);
  return (s * s + e * e) * a * a;
}
int stbPlan(float v2, out float t2) {
  int n = 0;
  float p = 1.0;
  for (int i = 0; i < ${LEVELS - 1}; i++) {
    float q = p * 4.0;
    if ((q - 1.0) / 3.0 + q * ${f(PLAN_LO)} > v2) break;
    p = q;
    n++;
  }
  t2 = clamp((v2 - (p - 1.0) / 3.0) / p, ${f(PLAN_T2_MIN)}, ${f(PLAN_T2_MAX)});
  return n;
}
ivec4 stbChainRegion(float v2) {
  float t2;
  int n = stbPlan(v2, t2);
  return uPassIndex / 2 <= n ? ivec4(ivec2(0), stbSize()) : ivec4(0);
}
vec3 stbAt(ivec2 t) { return fetchPrev4(clamp(t, ivec2(0), stbSize() - 1)).rgb; }
vec3 stbTap(ivec2 p, ivec2 dir, int k) { return stbAt(p + dir * k); }
vec3 stbChainDraw(ivec2 p, vec3 own, float v2) {
  float t2;
  int n = stbPlan(v2, t2);
  int level = uPassIndex / 2;
  if (level > n) return own;
  ivec2 dir = uPassIndex - 2 * level == 0 ? ivec2(1, 0) : ivec2(0, 1);
  int stride = 1 << level;
  if (level < n) {
    return 0.375 * own + 0.25 * (${taps(1)[0]} + ${taps(-1)[0]}) + 0.0625 * (${taps(1)[1]} + ${taps(-1)[1]});
  }
  vec3 acc = own;
  float wsum = 1.0;
  float w;
${residualSum}
  return acc / wsum;
}`;

/** The wide layer, then the low layer: one draw pair per level, the empty
 *  pairs (levels past the plan's) placed nowhere by the region. */
export const WIDE_GLSL = `c.rgb = stbChainDraw(ivec2(gl_FragCoord.xy), c.rgb, stbWideVariance(textureSize, smoothSize));`;
export const WIDE_REGION = `return stbChainRegion(stbWideVariance(textureSize, smoothSize));`;
export const LOW_GLSL = `c.rgb = stbChainDraw(ivec2(gl_FragCoord.xy), c.rgb, stbSplitVariance(textureSize));`;
export const LOW_REGION = `return stbChainRegion(stbSplitVariance(textureSize));`;

/** The packing draw: the wide layer's 2×2 block means into alpha, the input
 *  back into rgb for the low layer's chain. */
export const PACK_GLSL = `
{
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 nb = max(stbSize() / 2, ivec2(1));
  ivec2 b = min(p / 2, nb - 1) * 2;
  vec3 e = 0.25 * (stbAt(b) + stbAt(b + ivec2(1, 0)) + stbAt(b + ivec2(0, 1)) + stbAt(b + ivec2(1, 1)));
  int ch = p.x % 2 + 2 * (p.y % 2);
  c = vec4(fetchInput(p), ch == 0 ? e.r : (ch == 1 ? e.g : e.b));
}`;

export const FINAL_HELPERS = `
float stbPacked(ivec2 blk, int ch) {
  return fetchPrev4(clamp(blk * 2 + ivec2(ch % 2, ch / 2), ivec2(0), stbSize() - 1)).a;
}
vec3 stbBlock(ivec2 blk) { return vec3(stbPacked(blk, 0), stbPacked(blk, 1), stbPacked(blk, 2)); }
vec3 stbEven(ivec2 p) {
  ivec2 nb = max(stbSize() / 2, ivec2(1));
  vec2 u = (vec2(p) - 0.5) * 0.5;
  vec2 i0 = floor(u);
  vec2 fr = u - i0;
  ivec2 a = clamp(ivec2(i0), ivec2(0), nb - 1);
  ivec2 b = clamp(ivec2(i0) + 1, ivec2(0), nb - 1);
  vec3 top = mix(stbBlock(a), stbBlock(ivec2(b.x, a.y)), fr.x);
  vec3 bottom = mix(stbBlock(ivec2(a.x, b.y)), stbBlock(b), fr.x);
  return mix(top, bottom, fr.y);
}
float stbProtection(vec3 d, vec3 low) {
  float ref = max((abs(low.r) + abs(low.g) + abs(low.b)) / 3.0, ${f(PROTECT_FLOOR)});
  float q = dot(d, d) / (3.0 * ref * ref * ${f(PROTECT_TAU * PROTECT_TAU)});
  return exp(-q * q);
}`;

/** The last draw: Δ, which the inline adds by the coverage. */
export const FINAL_GLSL = `
{
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 low = c.rgb;
  vec3 d = stbEven(p) - low;
  float s = clamp(smoothing, 0.0, 100.0) / 100.0;
  float k = clamp(textureAmount, 0.0, 150.0) / 100.0;
  c = vec4(s * stbProtection(d, low) * d + (k - 1.0) * (fetchInput(p) - low), 1.0);
}`;

export const INLINE_GLSL = `
if (maskOn > 0.5) {
  float cov = mask(srcUv);
  if (cov > 0.0) lin += cov * stageResult;
}`;
