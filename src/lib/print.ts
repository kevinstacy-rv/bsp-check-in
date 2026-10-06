"use client";

// Prints the badge through the operating system's printer driver (the Brother
// QL-800 on the check-in Mac). The page is sized exactly to the label, so the
// driver picks the matching DK paper size.
//
// Launch Chrome with --kiosk-printing and print() goes straight to the default
// printer with no dialog; without it, staff see the normal print dialog.

import { renderLabel, type LabelContent } from "./label";
import { getState } from "./store";
import type { PrinterSettings } from "./types";

let queue: Promise<void> = Promise.resolve();

export type PrintResult = {
  /** True when Chrome showed its print dialog, i.e. it wasn't launched with --kiosk-printing. */
  dialogShown: boolean;
};

async function printOnce(content: LabelContent, settings: PrinterSettings): Promise<PrintResult> {
  const label = await renderLabel(content, settings);
  const blob = await new Promise<Blob>((resolve, reject) =>
    label.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the badge."))), "image/png"),
  );
  const src = URL.createObjectURL(blob);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);

  try {
    const doc = frame.contentDocument!;
    const w = `${label.widthMm}mm`;
    const h = `${label.heightMm}mm`;
    doc.open();
    doc.write(`<!doctype html><html><head><title>Badge</title><style>
      @page { size: ${w} ${h}; margin: 0 }
      html, body { margin: 0; padding: 0 }
      img { display: block; width: ${w}; height: ${h} }
    </style></head><body><img alt=""></body></html>`);
    doc.close();

    const img = doc.querySelector("img")!;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't load the badge image."));
      img.src = src;
    });

    const win = frame.contentWindow!;
    win.focus();
    // Blocks while a dialog is open; returns at once under --kiosk-printing.
    const started = performance.now();
    win.print();
    return { dialogShown: performance.now() - started > 1000 };
  } finally {
    // Give the spooler a moment before tearing the frame down.
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(src);
    }, 2000);
  }
}

/** Prints one badge. Jobs run one after another so two quick presses don't collide. */
export function printLabel(content: LabelContent, settings: PrinterSettings = getState().printer): Promise<PrintResult> {
  const job = queue.then(() => printOnce(content, settings));
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}
