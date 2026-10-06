// Turns a 1-bit image into a ZPL ^GF graphic using Zebra's ASCII compression,
// so a full-label bitmap is a few KB instead of ~50 KB of raw hex.

/** Zebra repeat-count characters: G–Y = 1–19, g–z = 20–400 in steps of 20. */
export function repeatCount(n: number): string {
  let out = "";
  while (n >= 400) {
    out += "z";
    n -= 400;
  }
  if (n >= 20) {
    out += String.fromCharCode("g".charCodeAt(0) + Math.floor(n / 20) - 1);
    n %= 20;
  }
  if (n > 0) out += String.fromCharCode("G".charCodeAt(0) + n - 1);
  return out;
}

/** Compresses one hex row. `,` fills the rest of the row with 0, `!` with F. */
export function compressRow(hex: string): string {
  const zeros = hex.match(/0+$/)?.[0].length ?? 0;
  const ones = hex.match(/F+$/)?.[0].length ?? 0;
  let body = hex;
  let tail = "";
  if (zeros > 1) {
    body = hex.slice(0, hex.length - zeros);
    tail = ",";
  } else if (ones > 1) {
    body = hex.slice(0, hex.length - ones);
    tail = "!";
  }

  let out = "";
  for (let i = 0; i < body.length; ) {
    let j = i + 1;
    while (j < body.length && body[j] === body[i]) j++;
    const run = j - i;
    out += (run > 1 ? repeatCount(run) : "") + body[i];
    i = j;
  }
  return out + tail;
}

/**
 * `pixels` holds one byte per pixel, row-major: 1 = black (burned), 0 = white.
 * Returns the ^GFA command for the image.
 */
export function graphicField(pixels: Uint8Array, width: number, height: number): string {
  const bytesPerRow = Math.ceil(width / 8);
  const total = bytesPerRow * height;
  let data = "";
  let prev = "";

  for (let y = 0; y < height; y++) {
    let hex = "";
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < width && pixels[y * width + x]) byte |= 0x80 >> bit;
      }
      hex += byte.toString(16).toUpperCase().padStart(2, "0");
    }
    // `:` repeats the previous row exactly.
    data += hex === prev ? ":" : compressRow(hex);
    prev = hex;
  }

  return `^GFA,${total},${total},${bytesPerRow},${data}`;
}

export type LabelJob = {
  pixels: Uint8Array;
  width: number;
  height: number;
  /** Relative darkness, −30..30. 0 leaves the printer's setting alone. */
  darkness?: number;
  copies?: number;
};

export function labelZpl({ pixels, width, height, darkness = 0, copies = 1 }: LabelJob) {
  return [
    "^XA",
    "^PON",
    `^PW${width}`,
    `^LL${height}`,
    "^LH0,0",
    darkness ? `^MD${Math.max(-30, Math.min(30, Math.round(darkness)))}` : "",
    `^FO0,0${graphicField(pixels, width, height)}^FS`,
    `^PQ${Math.max(1, copies)}`,
    "^XZ",
  ].join("");
}
