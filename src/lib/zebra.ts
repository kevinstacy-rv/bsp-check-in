// Minimal client for Zebra Browser Print, the local agent that forwards jobs
// from the browser to a USB printer. It speaks the same small HTTP API that
// Zebra's BrowserPrint.js SDK wraps, so there's no SDK to vendor.

export type ZebraDevice = {
  name: string;
  uid: string;
  connection: string;
  deviceType: string;
  provider: string;
  manufacturer: string;
  version?: number;
};

export class BrowserPrintError extends Error {}

const base = () =>
  typeof location !== "undefined" && location.protocol === "https:"
    ? "https://127.0.0.1:9101/"
    : "http://127.0.0.1:9100/";

async function call(path: string, init?: RequestInit, timeoutMs = 6000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base() + path, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new BrowserPrintError(text || `Browser Print returned ${res.status}`);
    return text;
  } catch (e) {
    if (e instanceof BrowserPrintError) throw e;
    throw new BrowserPrintError(
      "Can't reach Zebra Browser Print. Check it's running on this computer and that this site is allowed.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function defaultPrinter(): Promise<ZebraDevice | null> {
  const text = await call("default?type=printer");
  if (!text.trim()) return null;
  return JSON.parse(text) as ZebraDevice;
}

export async function availablePrinters(): Promise<ZebraDevice[]> {
  const text = await call("available");
  if (!text.trim()) return [];
  const json = JSON.parse(text) as { printer?: ZebraDevice[] };
  return json.printer ?? [];
}

/** Finds the saved printer by uid, falling back to Browser Print's default. */
export async function resolvePrinter(uid: string | null): Promise<ZebraDevice | null> {
  if (uid) {
    const match = (await availablePrinters()).find((p) => p.uid === uid);
    if (match) return match;
  }
  return defaultPrinter();
}

export async function sendZpl(device: ZebraDevice, zpl: string): Promise<void> {
  // text/plain keeps this a "simple" request, as the official SDK does, so
  // Browser Print doesn't need to answer a CORS preflight.
  await call(
    "write",
    {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ device, data: zpl }),
    },
    15000,
  );
}
