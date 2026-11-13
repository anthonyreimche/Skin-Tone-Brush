// Static per-pixel texture-read count of one draw: the pass body with its
// helpers expanded, every branch counted (an upper bound), loops with literal
// bounds multiplying what is inside them, and a loop form the analyzer does
// not understand throwing instead of being skipped. Each call of a read the
// host provides (fetchPrev4, fetchInput, …) or a sampler's key counts as one;
// the host's own read of the draw's texel ahead of the body counts as one
// more. A CPU transcription says nothing about what the GPU executes per
// pixel: hang watchdogs see the per-draw cost.

import type { ProcessingStageContribution, StagePass } from "../../src/safelight";

const READS = ["texture", "texelFetch", "textureLod", "textureGrad", "fetchPrev4", "readPrev4", "readPrev", "fetchInput", "readSource"];

type Memo = Map<string, number | null>;

interface Program {
  fns: Map<string, string>;
  reads: readonly string[];
  memo: Memo;
}

const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function closingBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces");
}

function collectFunctions(src: string): Map<string, string> {
  const fns = new Map<string, string>();
  const def = /\b(?:float|int|bool|vec[234]|ivec[234]|mat[34]|void)\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = def.exec(src))) {
    const open = m.index + m[0].length - 1;
    const close = closingBrace(src, open);
    fns.set(m[1], src.slice(open + 1, close));
    def.lastIndex = close;
  }
  return fns;
}

const LOOP = /\bfor\s*\(\s*int\s+(\w+)\s*=\s*(-?\d+)\s*;\s*\1\s*(<=|<)\s*(-?\d+)\s*;\s*\1\s*(?:\+\+|\+=\s*1)\s*\)\s*\{/g;

const calls = (text: string, name: string): number => (text.match(new RegExp(`\\b${name}\\s*\\(`, "g")) ?? []).length;

function functionReads(name: string, p: Program): number {
  const seen = p.memo.get(name);
  if (seen === null) throw new Error(`recursive helper ${name}`);
  if (seen !== undefined) return seen;
  p.memo.set(name, null);
  const v = blockReads(p.fns.get(name) ?? "", p);
  p.memo.set(name, v);
  return v;
}

function flatReads(text: string, p: Program): number {
  if (/\b(for|while|do)\b/.test(text)) throw new Error(`unrecognized loop form: ${text.trim().slice(0, 80)}`);
  let n = 0;
  for (const r of p.reads) n += calls(text, r);
  for (const name of p.fns.keys()) {
    const c = calls(text, name);
    if (c) n += c * functionReads(name, p);
  }
  return n;
}

function blockReads(block: string, p: Program): number {
  let total = 0;
  let cursor = 0;
  const loop = new RegExp(LOOP.source, "g");
  let m: RegExpExecArray | null;
  while ((m = loop.exec(block))) {
    const open = m.index + m[0].length - 1;
    const close = closingBrace(block, open);
    total += flatReads(block.slice(cursor, m.index), p);
    const from = Number(m[2]);
    const to = Number(m[4]);
    const trips = Math.max(0, m[3] === "<=" ? to - from + 1 : to - from);
    total += trips * blockReads(block.slice(open + 1, close), p);
    cursor = close + 1;
    loop.lastIndex = cursor;
  }
  return total + flatReads(block.slice(cursor), p);
}

function count(body: string, helpers: string, extraReads: readonly string[]): number {
  const fns = collectFunctions(stripComments(helpers));
  return blockReads(stripComments(body), { fns, reads: [...READS, ...extraReads], memo: new Map() });
}

/** Reads per pixel of one draw of `pass`, the host's read of its texel included. */
export function passReads(pass: StagePass): number {
  return 1 + count(pass.glsl, pass.helpers ?? "", []);
}

/** Reads per pixel of the stage's inline glsl, `stageResult` included. */
export function inlineReads(stage: ProcessingStageContribution): number {
  const keys = (stage.textures ?? []).filter((t) => t.kind === "coverage" || t.kind === "paint").map((t) => t.key);
  return ((stage.passes?.length ?? 0) > 0 ? 1 : 0) + count(stage.glsl, stage.helpers ?? "", keys);
}
