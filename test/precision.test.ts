// Radeon radeonsi runs mediump as fp16: integers above 2048 round, so a pixel
// coordinate converted from a mediump ivec2 loses its parity at large renders.
import { describe, expect, it } from "vitest";
import { FINAL_HELPERS } from "../src/glsl";

describe("FINAL_HELPERS precision", () => {
  it("converts the pixel coordinate from a highp ivec2", () => {
    expect(FINAL_HELPERS).toContain("vec3 stbEven(highp ivec2 p)");
    expect(FINAL_HELPERS).not.toContain("vec3 stbEven(ivec2 p)");
  });
});
