"use client";

// Sends the badge on screen to the paired phone. The phone polls for it;
// see app/preview. Nothing here blocks check-in: if the network or storage
// is down, the phone simply stops updating.

import { getState, setState } from "./store";
import { labelSizeMm, type PreviewPayload } from "./types";

export function newPreviewKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function ensurePreviewKey(): string {
  const existing = getState().previewKey;
  if (existing) return existing;
  const previewKey = newPreviewKey();
  setState({ previewKey });
  return previewKey;
}

export const previewUrl = (key: string) => `${location.origin}/preview?k=${encodeURIComponent(key)}`;

let lastSent = "";
let timer: ReturnType<typeof setTimeout> | null = null;
/** Keeps "Your badge is on its way" up briefly after printing, instead of jumping straight back to welcome. */
let holdUntil = 0;
let holdFor = "";

/** What the phone should show: a badge, a "printing" confirmation, or the welcome screen. */
export function showOnPhone(content: { name: string; company: string } | null, kind: "badge" | "printing" = "badge") {
  const { previewKey, eventName, printer } = getState();
  if (!previewKey) return;
  const who = content ? `${content.name}\u0000${content.company}` : "";
  if (Date.now() < holdUntil && kind !== "printing") {
    if (!content) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => showOnPhone(null), holdUntil - Date.now() + 50);
      return;
    }
    // The same person's badge again (the screen catching up): keep "printing" up.
    if (who === holdFor) return;
  }
  holdUntil = kind === "printing" ? Date.now() + 5000 : 0;
  holdFor = kind === "printing" ? who : "";
  const payload: PreviewPayload = content
    ? { kind, eventName, name: content.name, company: content.company, ...labelSizeMm(printer) }
    : { kind: "idle", eventName };
  const json = JSON.stringify(payload);
  if (json === lastSent) return;
  if (timer) clearTimeout(timer);
  // Debounce typing and arrow-key scrolling; send "printing" straight away.
  timer = setTimeout(() => void send(previewKey, payload, json), kind === "printing" ? 0 : 250);
}

async function send(key: string, payload: PreviewPayload, json: string) {
  try {
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, payload }),
    });
    if (res.ok) {
      lastSent = json;
      const { seenAt } = await res.json();
      setState({ phoneSeenAt: seenAt });
    }
  } catch {
    // Offline: the phone keeps showing the last badge.
  }
}

export async function checkPhone(): Promise<number | null> {
  const key = getState().previewKey;
  if (!key) return null;
  try {
    const res = await fetch(`/api/preview?key=${encodeURIComponent(key)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setState({ phoneSeenAt: null, previewError: data?.error ?? null });
      return null;
    }
    const { seenAt } = await res.json();
    setState({ phoneSeenAt: seenAt, previewError: null });
    return seenAt;
  } catch {
    return null;
  }
}

export function forgetLastPreview() {
  lastSent = "";
}
