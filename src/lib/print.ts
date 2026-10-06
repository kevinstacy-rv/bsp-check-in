"use client";

import { renderLabel, toZpl, LABEL_HEIGHT_IN, LABEL_WIDTH_IN, type LabelContent } from "./label";
import { getState, setState } from "./store";
import type { PrinterSettings } from "./types";
import { BrowserPrintError, resolvePrinter, sendZpl } from "./zebra";

export async function checkPrinter() {
  const { printer } = getState();
  try {
    const device = await resolvePrinter(printer.printerUid);
    setState({ printerStatus: device ? { state: "ready", name: device.name } : { state: "missing" } });
    return device;
  } catch (e) {
    setState({ printerStatus: { state: "unreachable", message: (e as Error).message } });
    return null;
  }
}

export async function printLabel(content: LabelContent, settings: PrinterSettings = getState().printer) {
  const device = await resolvePrinter(settings.printerUid).catch((e) => {
    setState({ printerStatus: { state: "unreachable", message: (e as Error).message } });
    throw e;
  });
  if (!device) {
    setState({ printerStatus: { state: "missing" } });
    throw new BrowserPrintError("No Zebra printer found. Plug it in and set it as the default in Browser Print.");
  }
  const label = await renderLabel(content, settings);
  await sendZpl(device, toZpl(label, settings));
  setState({ printerStatus: { state: "ready", name: device.name } });
}

/** Fallback for testing without Browser Print: the system print dialog at label size. */
export async function printWithDialog(content: LabelContent, settings: PrinterSettings = getState().printer) {
  const label = await renderLabel(content, { ...settings, rotate: false, offsetX: 0, offsetY: 0 });
  const src = label.canvas.toDataURL("image/png");
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><style>
    @page { size: ${LABEL_WIDTH_IN}in ${LABEL_HEIGHT_IN}in; margin: 0 }
    html, body { margin: 0 }
    img { width: ${LABEL_WIDTH_IN}in; height: ${LABEL_HEIGHT_IN}in; display: block; image-rendering: pixelated }
  </style></head><body><img src="${src}"></body></html>`);
  doc.close();
  const img = doc.querySelector("img")!;
  await (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = r)));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
}
