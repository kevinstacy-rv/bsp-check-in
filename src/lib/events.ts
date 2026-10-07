"use client";

// Keeps the current event saved to shared storage so it shows up under Past
// events, from any computer. Saves quietly in the background whenever
// something changed, and once more when staff finish the event.

import { ensureEvent, getState, setState } from "./store";
import type { EventRecord } from "./types";

export type SaveResult = { ok: true } | { ok: false; error: string; storageMissing?: boolean };

let lastSaved = "";
let saving = false;

function snapshot(finishedAt: string | null = null) {
  const s = getState();
  if (!s.eventId || !s.eventName) return null;
  const body: Omit<EventRecord, "id" | "updatedAt"> = {
    name: s.eventName,
    segment: s.segment ? { id: s.segment.id, name: s.segment.name } : null,
    startedAt: s.eventStartedAt ?? new Date().toISOString(),
    finishedAt,
    attendees: s.roster,
  };
  return { id: s.eventId, body };
}

export async function saveEvent({ finished = false } = {}): Promise<SaveResult> {
  const snap = snapshot(finished ? new Date().toISOString() : null);
  if (!snap) return { ok: false, error: "Set up an event first." };
  const json = JSON.stringify(snap.body);
  if (!finished && json === lastSaved) return { ok: true };

  try {
    const res = await fetch(`/api/events/${snap.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: json,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? `Save failed (${res.status})`, storageMissing: data?.storage === false };
    lastSaved = json;
    setState({ eventSavedAt: data.updatedAt ?? new Date().toISOString() });
    return { ok: true };
  } catch {
    return { ok: false, error: "Offline. The event will save when the connection is back." };
  }
}

let started = false;

export function startEventAutosave() {
  if (started) return;
  started = true;
  const tick = async () => {
    const s = getState();
    if (saving || !navigator.onLine || !s.eventName || !s.roster.length) return;
    // Stations set up before saved events existed get an event record now.
    if (!s.eventId) ensureEvent();
    saving = true;
    try {
      await saveEvent();
    } finally {
      saving = false;
    }
  };
  // Check-ins live only on the station and in this record until attendance is
  // submitted, so save often (it only sends when something changed).
  setInterval(tick, 10000);
  window.addEventListener("online", () => void tick());
  void tick();
}
