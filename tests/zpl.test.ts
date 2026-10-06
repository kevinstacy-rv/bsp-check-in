import { describe, expect, it } from "vitest";
import { compressRow, graphicField, labelZpl, repeatCount } from "../src/lib/zpl";

/** Reverses Zebra ASCII compression, to prove the encoder is lossless. */
function decode(data: string, bytesPerRow: number): string[] {
  const rowLen = bytesPerRow * 2;
  const rows: string[] = [];
  let row = "";
  let count = 0;
  for (const ch of data) {
    if (ch >= "G" && ch <= "Y") count += ch.charCodeAt(0) - 70;
    else if (ch >= "g" && ch <= "z") count += (ch.charCodeAt(0) - 102) * 20;
    else if (ch === ",") {
      rows.push(row.padEnd(rowLen, "0"));
      row = "";
    } else if (ch === "!") {
      rows.push(row.padEnd(rowLen, "F"));
      row = "";
    } else if (ch === ":") {
      rows.push(rows[rows.length - 1]);
    } else {
      row += ch.repeat(count || 1);
      count = 0;
      if (row.length === rowLen) {
        rows.push(row);
        row = "";
      }
    }
  }
  return rows;
}

describe("repeatCount", () => {
  it("encodes Zebra repeat counts", () => {
    expect(repeatCount(1)).toBe("G");
    expect(repeatCount(19)).toBe("Y");
    expect(repeatCount(20)).toBe("g");
    expect(repeatCount(45)).toBe("hK");
    expect(repeatCount(400)).toBe("z");
    expect(repeatCount(421)).toBe("zgG");
  });
});

describe("compressRow", () => {
  it("collapses trailing zeros and runs", () => {
    expect(compressRow("0000")).toBe(",");
    expect(compressRow("FFFF00")).toBe("JF,");
    expect(compressRow("A0FFFF")).toBe("A0!");
  });
});

describe("graphicField", () => {
  it("round-trips a random bitmap", () => {
    const width = 203;
    const height = 40;
    const pixels = new Uint8Array(width * height);
    let seed = 7;
    for (let i = 0; i < pixels.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      // Mostly white with black blocks, like a badge.
      pixels[i] = (Math.floor(i / width) % 9 < 3 && seed % 5 === 0) ? 1 : 0;
    }
    // Repeat a row to exercise ':'.
    pixels.copyWithin(width * 10, width * 9, width * 10);

    const gf = graphicField(pixels, width, height);
    const [, total, , bpr, data] = gf.match(/^\^GFA,(\d+),(\d+),(\d+),(.*)$/)!;
    expect(Number(bpr)).toBe(26);
    expect(Number(total)).toBe(26 * height);

    const rows = decode(data, Number(bpr));
    expect(rows).toHaveLength(height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = parseInt(rows[y].slice(Math.floor(x / 8) * 2, Math.floor(x / 8) * 2 + 2), 16);
        const bit = (byte >> (7 - (x % 8))) & 1;
        expect(bit).toBe(pixels[y * width + x]);
      }
    }
  });
});

describe("labelZpl", () => {
  it("wraps the graphic in a label", () => {
    const zpl = labelZpl({ pixels: new Uint8Array(16 * 2), width: 16, height: 2, darkness: 5 });
    expect(zpl.startsWith("^XA")).toBe(true);
    expect(zpl.endsWith("^XZ")).toBe(true);
    expect(zpl).toContain("^PW16");
    expect(zpl).toContain("^MD5");
  });
});
