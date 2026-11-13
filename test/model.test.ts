// The CPU reference of the stage (src/model.ts): the blur chain, the packing
// of the wide layer, and the frequency separation itself, on synthetic skin.

import { describe, expect, it } from "vitest";
import {
  LEVELS,
  PLAN_T2_MAX,
  REF_LONG_EDGE,
  anchor,
  blurChain,
  chainDraws,
  decodePerceptual,
  encodePerceptual,
  imageOf,
  packEven,
  plan,
  separate,
  smoothSigma,
  smoothSkin,
  splitSigma,
  unpackEven,
  type Image,
} from "../src/model";
import { DEFAULT_SETTINGS, type Settings } from "../src/params";

const at = (img: Image, x: number, y: number, ch: number): number => img.data[(y * img.width + x) * 4 + ch];

function impulse(width: number, height: number): Image {
  const img = imageOf(width, height, () => [0, 0, 0]);
  const o = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  img.data[o] = img.data[o + 1] = img.data[o + 2] = 1;
  return img;
}

/** Variance along x of a row-summed impulse response, about its centre. */
function varianceX(img: Image): { sum: number; variance: number } {
  const cx = Math.floor(img.width / 2);
  let sum = 0;
  let m2 = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const v = at(img, x, y, 0);
      sum += v;
      m2 += v * (x - cx) ** 2;
    }
  }
  return { sum, variance: m2 / sum };
}

// Deterministic noise in [-1, 1].
function hash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return 2 * (s - Math.floor(s)) - 1;
}

/** Skin as the stage sees it, in the perceptual encoding: a base tone, red
 *  blotches about a dozen pixels across and pores a pixel wide, sized for
 *  the radii a 256 px render gets at the largest sizes (LARGE). `scale`
 *  samples the same scene at another resolution. */
function skinScene(width: number, height: number, scale = 1, pores = 1) {
  const base: [number, number, number] = [0.78, 0.6, 0.5];
  const blotch = (x: number, y: number) =>
    0.5 * Math.sin((x / scale) * 0.45 + 1.3) * Math.sin((y / scale) * 0.5 + 0.4) +
    0.5 * Math.sin((x / scale) * 0.35 - (y / scale) * 0.3);
  const pore = (x: number, y: number) => hash(Math.floor(x / scale), Math.floor(y / scale), 3);
  const texel = (x: number, y: number): [number, number, number] => {
    const b = blotch(x, y);
    const p = pores * pore(x, y);
    return [base[0] + 0.03 * b + 0.04 * p, base[1] - 0.05 * b + 0.04 * p, base[2] - 0.04 * b + 0.035 * p];
  };
  return { image: imageOf(width, height, texel), blotch, pore };
}

/** The energy of `img − ref` in two bands: what a wide blur keeps (the
 *  blotches) and what it removes (the pores), over the interior. */
function bands(diff: Image, sigma: number, margin: number) {
  const low = blurChain(diff, sigma * sigma);
  let lowE = 0;
  let highE = 0;
  for (let y = margin; y < diff.height - margin; y++) {
    for (let x = margin; x < diff.width - margin; x++) {
      for (let ch = 0; ch < 3; ch++) {
        const l = at(low, x, y, ch);
        lowE += l * l;
        highE += (at(diff, x, y, ch) - l) ** 2;
      }
    }
  }
  return { low: lowE, high: highE };
}

const minus = (a: Image, b: Image): Image =>
  imageOf(a.width, a.height, (x, y) => [0, 1, 2].map((ch) => at(a, x, y, ch) - at(b, x, y, ch)) as [number, number, number]);

const withSettings = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...LARGE, ...over });

// A test frame is a few hundred pixels across, so the radii, anchored to a
// 4096 px long edge, are a sixteenth of their size there: the largest give a
// split of 1.25 px and a wide layer of 4.2 px at 256 px.
const LARGE = { smoothSize: 100, textureSize: 100 };

/** The stage's result, Δ added to the input, in the perceptual encoding. */
function apply(input: Image, settings: Settings): Image {
  const delta = separate(input, settings);
  return imageOf(input.width, input.height, (x, y) =>
    [0, 1, 2].map((ch) => at(input, x, y, ch) + at(delta, x, y, ch)) as [number, number, number],
  );
}

const flatField = (rgb: [number, number, number]) => imageOf(96, 64, () => rgb);

describe("the slider radii", () => {
  it("map the sliders onto pixels at the reference long edge, logarithmically", () => {
    expect(splitSigma(0)).toBeCloseTo(1, 9);
    expect(splitSigma(100)).toBeCloseTo(20, 9);
    expect(smoothSigma(0)).toBeCloseTo(4, 9);
    expect(smoothSigma(100)).toBeCloseTo(64, 9);
    expect(splitSigma(50)).toBeCloseTo(Math.sqrt(20), 9);
  });

  it("anchors to the long edge, so a radius is the same share of any render", () => {
    expect(anchor(REF_LONG_EDGE, 2000)).toBe(1);
    expect(anchor(1000, 2048)).toBe(0.5);
  });
});

describe("the blur chain plan", () => {
  it("splits any variance into B3 levels and one residual level", () => {
    for (const v of [0, 0.3, 2.9, 3, 3.1, 20, 300, 5000, 1e5]) {
      const p = plan(v);
      expect(p.n).toBeGreaterThanOrEqual(0);
      expect(p.n).toBeLessThanOrEqual(LEVELS - 1);
      expect(p.t2).toBeLessThanOrEqual(PLAN_T2_MAX);
      expect(chainDraws(p)).toBe(2 * (p.n + 1));
    }
  });

  it("puts the variance it was given into the chain, up to the cap", () => {
    for (const v of [3.5, 20, 300, 5000, 70000]) {
      const p = plan(v);
      expect((4 ** p.n - 1) / 3 + 4 ** p.n * p.t2).toBeCloseTo(v, 6);
    }
  });
});

describe("the blur chain", () => {
  for (const sigma of [0.9, 1.6, 3, 5.5, 9, 17, 33]) {
    it(`blurs an impulse to variance σ² at σ = ${sigma} px, normalized`, () => {
      // Square, so the clamped edges never reach the response and it keeps its mass.
      const size = Math.max(65, Math.ceil(sigma * 14) | 1);
      const out = blurChain(impulse(size, size), sigma * sigma);
      const { sum, variance } = varianceX(out);
      expect(sum).toBeCloseTo(1, 6);
      expect(Math.abs(variance - sigma * sigma) / (sigma * sigma)).toBeLessThan(0.03);
    });
  }

  it("is close to a true Gaussian", () => {
    const sigma = 12;
    const out = blurChain(impulse(257, 3), sigma * sigma);
    const cy = 1;
    let row = 0;
    for (let x = 0; x < 257; x++) row += at(out, x, cy, 0);
    let l1 = 0;
    for (let x = 0; x < 257; x++) {
      const g = Math.exp(-((x - 128) ** 2) / (2 * sigma * sigma)) / (Math.sqrt(2 * Math.PI) * sigma);
      l1 += Math.abs(at(out, x, cy, 0) / row - g);
    }
    expect(l1).toBeLessThan(0.04);
  });

  it("grows its variance smoothly across the level boundaries", () => {
    let last = 0;
    for (let v = 1; v < 400; v *= 1.15) {
      const { variance } = varianceX(blurChain(impulse(161, 3), v));
      expect(variance).toBeGreaterThan(last);
      expect(Math.abs(variance - v) / v).toBeLessThan(0.03);
      last = variance;
    }
  });

  it("keeps the alpha it was handed", () => {
    const img = imageOf(32, 32, (x) => [x / 32, 0.5, 0.2]);
    for (let i = 0; i < img.width * img.height; i++) img.data[i * 4 + 3] = (i % 7) / 7;
    const out = blurChain(img, 30);
    for (let i = 0; i < img.width * img.height; i++) expect(out.data[i * 4 + 3]).toBe(img.data[i * 4 + 3]);
  });
});

describe("the wide layer packed into alpha", () => {
  it("comes back from its half-size blocks within a hair of the smooth layer", () => {
    const smooth = blurChain(skinScene(120, 90).image, 64);
    const input = imageOf(120, 90, () => [0, 0, 0]);
    const packed = packEven(smooth, input);
    let worst = 0;
    for (let y = 2; y < 88; y++) {
      for (let x = 2; x < 118; x++) {
        const got = unpackEven(packed, x, y);
        for (let ch = 0; ch < 3; ch++) worst = Math.max(worst, Math.abs(got[ch] - at(smooth, x, y, ch)));
      }
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it("seeds the colour channels with the input", () => {
    const input = skinScene(31, 17).image;
    const packed = packEven(blurChain(input, 50), input);
    for (let i = 0; i < 31 * 17; i++) {
      for (let ch = 0; ch < 3; ch++) expect(packed.data[i * 4 + ch]).toBe(input.data[i * 4 + ch]);
    }
  });

  it("reads only texels inside an odd-sized frame", () => {
    const input = imageOf(7, 5, (x, y) => [x, y, x + y]);
    const packed = packEven(input, input);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) for (const v of unpackEven(packed, x, y)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("the frequency separation", () => {
  it("changes nothing at Smoothing 0 and Texture 100, exactly", () => {
    const { image } = skinScene(80, 60);
    const delta = separate(image, withSettings({ smoothing: 0, textureAmount: 100 }));
    for (let i = 0; i < delta.data.length; i++) if (i % 4 !== 3) expect(Math.abs(delta.data[i])).toBe(0);
  });

  for (const rgb of [
    [0.7, 0.55, 0.45],
    [1.6, 1.3, 1.1],
    [-0.02, 0.3, 0.6],
  ] as [number, number, number][]) {
    it(`leaves a flat field of ${rgb.join(", ")} as it was`, () => {
      const delta = separate(flatField(rgb), withSettings({ smoothing: 100, textureAmount: 0 }));
      for (let i = 0; i < delta.data.length; i++) if (i % 4 !== 3) expect(Math.abs(delta.data[i])).toBeLessThan(1e-9);
    });
  }

  it("evens the blotches and keeps the pores at full Smoothing", () => {
    const { image, blotch, pore } = skinScene(256, 192);
    const out = apply(image, withSettings({ smoothing: 100, textureAmount: 100 }));
    const flat = imageOf(256, 192, () => [0.78, 0.6, 0.5]);
    // How much of each pattern is left: the change projected onto it.
    const left = (pattern: (x: number, y: number) => number) => {
      let before = 0;
      let after = 0;
      for (let y = 24; y < 168; y++) {
        for (let x = 24; x < 232; x++) {
          const p = pattern(x, y);
          before += (at(image, x, y, 1) - at(flat, x, y, 1)) * p;
          after += (at(out, x, y, 1) - at(flat, x, y, 1)) * p;
        }
      }
      return after / before;
    };
    expect(left(blotch)).toBeLessThan(0.4);
    expect(left(pore)).toBeGreaterThan(0.9);
  });

  it("keeps the mean skin colour", () => {
    const { image } = skinScene(256, 192);
    const out = apply(image, withSettings({ smoothing: 100 }));
    for (let ch = 0; ch < 3; ch++) {
      let a = 0;
      let b = 0;
      for (let y = 24; y < 168; y++) {
        for (let x = 24; x < 232; x++) {
          a += decodePerceptual(at(image, x, y, ch));
          b += decodePerceptual(at(out, x, y, ch));
        }
      }
      expect(Math.abs(b / a - 1)).toBeLessThan(0.005);
    }
  });

  it("takes the pores out at Texture 0 and strengthens them at 150", () => {
    const { image } = skinScene(256, 192);
    const flat = imageOf(256, 192, () => [0.78, 0.6, 0.5]);
    const sigma = splitSigma(100) * anchor(256, 192);
    const before = bands(minus(image, flat), sigma, 24).high;
    const none = bands(minus(apply(image, withSettings({ smoothing: 0, textureAmount: 0 })), flat), sigma, 24).high;
    const more = bands(minus(apply(image, withSettings({ smoothing: 0, textureAmount: 150 })), flat), sigma, 24).high;
    expect(none / before).toBeLessThan(0.15);
    expect(Math.sqrt(more / before)).toBeGreaterThan(1.35);
  });

  it("evens skin less beside a strong edge, so a dark brow doesn't bleed into it", () => {
    const width = 192;
    const edge = imageOf(width, 64, (x) => (x < width / 2 ? [0.75, 0.6, 0.5] : [0.15, 0.1, 0.08]));
    const settings = withSettings({ smoothing: 100 });
    const delta = separate(edge, settings);
    // The wide layer is far darker than the narrow one just inside the skin…
    const wide = blurChain(edge, (splitSigma(100) ** 2 + smoothSigma(100) ** 2) * anchor(width, 64) ** 2);
    const narrow = blurChain(edge, (splitSigma(100) * anchor(width, 64)) ** 2);
    const x = width / 2 - 3;
    expect(at(narrow, x, 32, 0) - at(wide, x, 32, 0)).toBeGreaterThan(0.05);
    // …but the evening there stays small.
    expect(Math.abs(at(delta, x, 32, 0))).toBeLessThan(0.01);
  });

  it("gives the same result at twice the resolution", () => {
    const settings = withSettings({ smoothing: 100, textureAmount: 100 });
    // Smooth skin: pores a pixel wide are another pattern at another size.
    const small = skinScene(160, 120, 1, 0);
    const large = skinScene(320, 240, 2, 0);
    const a = separate(small.image, settings);
    const b = separate(large.image, settings);
    let worst = 0;
    for (let y = 16; y < 104; y++) {
      for (let x = 16; x < 144; x++) {
        for (let ch = 0; ch < 3; ch++) {
          const down =
            (at(b, 2 * x, 2 * y, ch) + at(b, 2 * x + 1, 2 * y, ch) + at(b, 2 * x, 2 * y + 1, ch) + at(b, 2 * x + 1, 2 * y + 1, ch)) / 4;
          worst = Math.max(worst, Math.abs(down - at(a, x, y, ch)));
        }
      }
    }
    expect(worst).toBeLessThan(4e-3);
  });

  it("lands within half-float rounding when every draw is stored as the GPU stores it", () => {
    const { image } = skinScene(96, 72);
    const settings = withSettings({ smoothing: 80, textureAmount: 60 });
    const exact = separate(image, settings);
    const half = separate(image, settings, { half: true });
    let worst = 0;
    for (let i = 0; i < exact.data.length; i++) if (i % 4 !== 3) worst = Math.max(worst, Math.abs(exact.data[i] - half.data[i]));
    expect(worst).toBeLessThan(2e-3);
  });
});

describe("the perceptual encoding", () => {
  it("round-trips, sign and headroom kept", () => {
    for (const v of [-0.4, -0.001, 0, 0.002, 0.18, 1, 3.5]) expect(decodePerceptual(encodePerceptual(v))).toBeCloseTo(v, 12);
  });
});

describe("the stage on a linear frame", () => {
  const linear = imageOf(64, 48, (x, y) => {
    const v = 0.3 + 0.1 * Math.sin(x * 0.3) * Math.cos(y * 0.2) + 0.05 * hash(x, y, 1);
    return [v * 1.2, v, v * 0.8];
  });

  it("leaves unpainted pixels exactly as they were", () => {
    const out = smoothSkin(linear, () => 0, withSettings({ smoothing: 100 }));
    expect(out.data).toEqual(linear.data);
  });

  it("applies the change by the painted coverage, highlights past white kept", () => {
    const bright = imageOf(64, 48, (x, y) => {
      const p = [0, 1, 2].map((ch) => at(linear, x, y, ch) * 4) as [number, number, number];
      return p;
    });
    const settings = withSettings({ smoothing: 100 });
    const full = smoothSkin(bright, () => 1, settings);
    const half = smoothSkin(bright, () => 0.5, settings);
    let over = 0;
    for (let i = 0; i < full.data.length; i++) {
      if (i % 4 === 3) continue;
      if (full.data[i] > 1) over++;
      const inP = encodePerceptual(bright.data[i]);
      const fullP = encodePerceptual(full.data[i]);
      expect(encodePerceptual(half.data[i])).toBeCloseTo(inP + 0.5 * (fullP - inP), 6);
    }
    expect(over).toBeGreaterThan(1000);
  });
});
