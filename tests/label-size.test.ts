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
