import { describe, expect, it } from "vitest";
import { DEFAULT_PRINTER, labelSizeMm } from "../src/lib/types";

describe("labelSizeMm", () => {
  it("uses the die-cut roll's fixed size", () => {
    expect(labelSizeMm({ ...DEFAULT_PRINTER, label: "dk-1202", widthMm: 250 })).toEqual({ widthMm: 100, heightMm: 62 });
  });
  it("takes the cut length for continuous rolls but keeps the tape width", () => {
    expect(labelSizeMm({ ...DEFAULT_PRINTER, label: "dk-2205", widthMm: 90, heightMm: 10 })).toEqual({
      widthMm: 90,
      heightMm: 62,
    });
  });
  it("uses both dimensions for a custom size", () => {
    expect(labelSizeMm({ ...DEFAULT_PRINTER, label: "custom", widthMm: 76, heightMm: 38 })).toEqual({
      widthMm: 76,
      heightMm: 38,
    });
  });
});

describe("default roll", () => {
  it("is the DK-1234 name badge", () => {
    expect(labelSizeMm(DEFAULT_PRINTER)).toEqual({ widthMm: 86, heightMm: 60 });
  });
});

describe("DK-2251", () => {
  it("is 62 mm tape cut to the chosen length, and prints red unless turned off", async () => {
    const { printsRed } = await import("../src/lib/types");
    const p = { ...DEFAULT_PRINTER, label: "dk-2251" as const, widthMm: 86 };
    expect(labelSizeMm(p)).toEqual({ widthMm: 86, heightMm: 62 });
    expect(printsRed(p)).toBe(true);
    expect(printsRed({ ...p, red: false })).toBe(false);
    expect(printsRed(DEFAULT_PRINTER)).toBe(false);
  });
});
