// The painted area's tint, drawn into a recording 2D context: a soft disc in
// the masks' red per dab at its place and size on screen, erase strokes cut
// out. A stroke that grows adds only its new dabs to what the tint shows.

import { describe, expect, it } from "vitest";
import type { Dab } from "../src/brush";
import { WASH_RGB, addedDabs, dabCircle, paintDabs, paintWash } from "../src/wash";

interface Op {
  op: string;
  composite: string;
  args: number[];
  stops?: string[];
}

function recorder() {
  const ops: Op[] = [];
  let stops: string[] = [];
  const ctx = {
    globalCompositeOperation: "source-over",
    fillStyle: "" as string | object,
    setTransform() {},
    clearRect: (...args: number[]) => ops.push({ op: "clearRect", composite: ctx.globalCompositeOperation, args }),
    createRadialGradient: () => {
      stops = [];
      return { addColorStop: (_at: number, colour: string) => void stops.push(colour) };
    },
    beginPath() {},
    arc: (...args: number[]) => ops.push({ op: "arc", composite: ctx.globalCompositeOperation, args, stops }),
    fill() {},
    fillRect: (...args: number[]) => ops.push({ op: "fillRect", composite: ctx.globalCompositeOperation, args }),
  };
  // A recording stand-in for the few members the tint draws with.
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const geo = { toScreen: (u: number, v: number) => ({ x: u * 400, y: v * 200 }), radiusToScreen: (r: number) => r * 200 };
const dab = (x: number, erase = false): Dab => ({ x, y: 0.5, radius: 0.1, erase, feather: 0.5, opacity: 1, flow: 1 });

describe("the painted area's tint", () => {
  it("places each dab on screen at its radius", () => {
    expect(dabCircle(dab(0.25), geo)).toEqual({ x: 100, y: 100, r: 20 });
    expect(dabCircle({ ...dab(0.25), radius: 0.001 }, geo)).toBeNull();
  });

  it("draws the discs in the tint and cuts the erased ones out, with no pass over the whole canvas", () => {
    const { ctx, ops } = recorder();
    paintWash(ctx, [dab(0.25), dab(0.3, true)], geo, 400, 200);
    expect(ops.map((o) => [o.op, o.composite])).toEqual([
      ["clearRect", "source-over"],
      ["arc", "source-over"],
      ["arc", "destination-out"],
    ]);
    expect(ops[1].args.slice(0, 3)).toEqual([100, 100, 20]);
    expect(ops[1].stops?.every((s) => s.startsWith(`rgba(${WASH_RGB},`))).toBe(true);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("adds dabs over what the tint shows, without clearing it", () => {
    const { ctx, ops } = recorder();
    paintDabs(ctx, [dab(0.4)], geo);
    expect(ops.map((o) => o.op)).toEqual(["arc"]);
  });

  it("finds the dabs a stroke added, and asks for a whole repaint after anything else", () => {
    const a = dab(0.1);
    const b = dab(0.2);
    const c = dab(0.3);
    expect(addedDabs([a, b], [a, b, c])).toEqual([c]);
    expect(addedDabs([a, b], [a, b])).toEqual([]);
    expect(addedDabs([a, b], [a])).toBeNull();
    expect(addedDabs([a, b], [a, { ...b }, c])).toBeNull();
    expect(addedDabs([a, b], [])).toBeNull();
  });
});
