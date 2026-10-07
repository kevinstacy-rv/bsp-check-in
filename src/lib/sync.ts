"use client";

import { startEventAutosave } from "./events";
import { getState, resolveWalkIn, setState, type Op } from "./store";

class Permanent extends Error {}
class Transient extends Error {}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Transient("Offline. Check-ins are saved and will sync when the connection is back.");
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json as T;
  const message = json?.error || `Request failed (${res.status})`;
  // 400/404/409/422: HubSpot will never accept this change, so don't block the queue on it.
  if ([400, 404, 409, 422].includes(res.status)) throw new Permanent(message);
  throw new Transient(message);
}

async function run(op: Op) {
  const { id } = await post<{ id: string }>("/api/hubspot/walk-ins", { ...op.input, segmentId: op.segmentId });
  resolveWalkIn(op.tempId, id);
}

let running = false;

export async function syncNow() {
  if (running) return;
  running = true;
  setState({ syncing: true });
  try {
    for (;;) {
      const op = getState().outbox[0];
      if (!op) break;
      try {
        await run(op);
        setState((s) => ({ outbox: s.outbox.filter((o) => o.id !== op.id), syncError: null }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (e instanceof Permanent) {
          setState((s) => ({
            outbox: s.outbox.filter((o) => o.id !== op.id),
            failed: [...s.failed.slice(-19), { op, error: message, at: new Date().toISOString() }],
          }));
          continue;
        }
        setState({ syncError: message });
        break;
      }
    }
  } finally {
    running = false;
    setState({ syncing: false });
  }
}

let started = false;

/** Keeps the outbox draining: on reconnect, on an interval, and right after each change. */
export function startSync() {
  if (started) return;
  started = true;
  const update = () => {
    setState({ online: navigator.onLine });
    if (navigator.onLine) void syncNow();
  };
  startEventAutosave();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  setInterval(() => {
    if (getState().outbox.length) void syncNow();
  }, 15000);
  update();
}
