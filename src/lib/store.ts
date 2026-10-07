"use client";

// Everything the station needs lives here and is saved to localStorage, so a
// reload, a crash or lost Wi-Fi never loses the roster or a check-in. Changes
// bound for HubSpot wait in `outbox` until sync.ts delivers them.

import { useSyncExternalStore } from "react";
import {
  DEFAULT_PRINTER,
  type Attendee,
  type EventRecord,
  type PrinterSettings,
  type Segment,
  type WalkInInput,
} from "./types";

/** Changes bound for HubSpot during the event: only creating walk-ins' contacts. */
export type Op = {
  id: string;
  kind: "walkin";
  tempId: string;
  input: WalkInInput;
  segmentId: string | null;
};

export type FailedOp = { op: Op; error: string; at: string };

type Persisted = {
  eventName: string;
  segment: Segment | null;
  roster: Attendee[];
  importedAt: string | null;
  outbox: Op[];
  failed: FailedOp[];
  printer: PrinterSettings;
  /** When staff confirmed a test badge printed on this computer. */
  printerVerifiedAt: string | null;
  /** Identifies the current event in shared storage (past events). */
  eventId: string | null;
  eventStartedAt: string | null;
  eventSavedAt: string | null;
  /** Secret in the phone preview link. */
  previewKey: string | null;
};

type Runtime = {
  online: boolean;
  syncing: boolean;
  syncError: string | null;
  /** Last time the paired phone polled for the preview (ms epoch). */
  phoneSeenAt: number | null;
  previewError: string | null;
};

export type State = Persisted & Runtime;

const KEY = "bsp-checkin:v1";

const initial: State = {
  eventName: "",
  segment: null,
  roster: [],
  importedAt: null,
  outbox: [],
  failed: [],
  printer: DEFAULT_PRINTER,
  printerVerifiedAt: null,
  eventId: null,
  eventStartedAt: null,
  eventSavedAt: null,
  previewKey: null,
  online: true,
  syncing: false,
  syncError: null,
  phoneSeenAt: null,
  previewError: null,
};

let state: State = initial;
let loaded = false;
const listeners = new Set<() => void>();

function readStorage(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const saved = readStorage();
  state = {
    ...initial,
    ...saved,
    printer: migratePrinter(saved.printer),
    // Older versions queued check-ins for HubSpot; only walk-ins are queued now.
    outbox: (saved.outbox ?? []).filter((o) => o.kind === "walkin"),
    online: navigator.onLine,
  };
  // Keep a second tab (e.g. setup open beside check-in) in step.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    state = { ...state, ...readStorage() };
    listeners.forEach((l) => l());
  });
}

/**
 * Stations saved before the DK-1234 option existed still carry the old
 * DK-1202 default, which doesn't match the name-badge roll we use.
 */
function migratePrinter(saved: Partial<PrinterSettings> | undefined): PrinterSettings {
  const merged = { ...DEFAULT_PRINTER, ...saved };
  if (saved && saved.flip === undefined && saved.label === "dk-1202") {
    return { ...merged, label: "dk-1234", widthMm: 86, heightMm: 60 };
  }
  return merged;
}

function persist() {
  const { online: _o, syncing: _s, syncError: _e, phoneSeenAt: _p, previewError: _pe, ...rest } = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    // Storage full or blocked: the in-memory state still works for this session.
  }
}

export function getState(): State {
  load();
  return state;
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  load();
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Selectors must return existing references (fields of state), not new objects. */
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(initial),
  );
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const isTemp = (id: string) => id.startsWith("tmp_");

function patchAttendee(roster: Attendee[], id: string, patch: Partial<Attendee>) {
  return roster.map((a) => (a.id === id ? { ...a, ...patch } : a));
}

// ---------------------------------------------------------------------------
// Actions

// Check-ins stay in the app (and the autosaved event record) until staff
// submit attendance after the event, so Undo never touches HubSpot.

export function checkIn(id: string): Attendee | undefined {
  const at = new Date().toISOString();
  setState((s) => ({ roster: patchAttendee(s.roster, id, { checkedInAt: at }) }));
  return getState().roster.find((a) => a.id === id);
}

export function undoCheckIn(id: string) {
  setState((s) => ({ roster: patchAttendee(s.roster, id, { checkedInAt: null }) }));
}

export function addWalkIn(input: WalkInInput): Attendee {
  const at = new Date().toISOString();
  const attendee: Attendee = {
    id: `tmp_${uid()}`,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    company: input.company.trim(),
    email: input.email.trim(),
    checkedInAt: at,
    walkIn: true,
  };
  setState((s) => ({
    roster: [...s.roster, attendee],
    outbox: [
      ...s.outbox,
      { id: uid(), kind: "walkin", tempId: attendee.id, input, segmentId: s.segment?.id ?? null },
    ],
  }));
  return attendee;
}

/** Called once HubSpot has created the walk-in's contact. */
export function resolveWalkIn(tempId: string, realId: string) {
  setState((s) => {
    const temp = s.roster.find((a) => a.id === tempId);
    const existing = s.roster.find((a) => a.id === realId);
    let roster: Attendee[];
    if (existing && temp) {
      // Their email matched someone already on the list: merge into that row.
      roster = s.roster
        .filter((a) => a.id !== tempId)
        .map((a) => (a.id === realId ? { ...a, checkedInAt: temp.checkedInAt ?? a.checkedInAt } : a));
    } else {
      roster = patchAttendee(s.roster, tempId, { id: realId });
    }
    return { roster };
  });
}

/**
 * Replaces the roster with a fresh HubSpot import. Check-ins and badge
 * corrections live only in the app, so they carry across for everyone
 * still on the list; walk-ins stay even if they aren't in the segment.
 */
export function importRoster(fetched: Attendee[]) {
  setState((s) => {
    const local = new Map(s.roster.map((a) => [a.id, a]));
    const ids = new Set(fetched.map((a) => a.id));
    const merged = fetched.map((a) => {
      const mine = local.get(a.id);
      if (!mine) return a;
      return {
        ...a,
        checkedInAt: mine.checkedInAt,
        ...(mine.walkIn ? { walkIn: true } : {}),
        ...(mine.badgeName !== undefined ? { badgeName: mine.badgeName } : {}),
        ...(mine.badgeCompany !== undefined ? { badgeCompany: mine.badgeCompany } : {}),
      };
    });
    const walkIns = s.roster.filter((a) => a.walkIn && !ids.has(a.id));
    return { roster: [...merged, ...walkIns], importedAt: new Date().toISOString() };
  });
}

/** Starts a new event record the first time attendees are imported. */
export function ensureEvent() {
  const s = getState();
  if (s.eventId) return s.eventId;
  const eventId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  setState({ eventId, eventStartedAt: new Date().toISOString(), eventSavedAt: null });
  return eventId;
}

/** Badge-only correction. Passing the HubSpot value (or blank name) clears the override. */
export function setBadge(id: string, badge: { name: string; company: string }) {
  setState((s) => ({
    roster: s.roster.map((a) => {
      if (a.id !== id) return a;
      const { badgeName: _n, badgeCompany: _c, ...rest } = a;
      const name = badge.name.trim();
      const company = badge.company.trim();
      const original = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
      return {
        ...rest,
        ...(name && name !== original ? { badgeName: name } : {}),
        ...(company !== a.company.trim() ? { badgeCompany: company } : {}),
      };
    }),
  }));
}

/**
 * Puts a saved event on this station. "resume" carries on the same record
 * (check-ins, walk-ins, corrections); "copy" starts a new event with the same
 * segment and people, nobody checked in yet.
 */
export function loadEvent(event: EventRecord, mode: "resume" | "copy", newName?: string) {
  const now = new Date().toISOString();
  if (mode === "resume") {
    // Walk-ins that never reached HubSpot still need creating.
    const outbox: Op[] = event.attendees
      .filter((a) => a.id.startsWith("tmp_"))
      .map((a) => ({
        id: uid(),
        kind: "walkin",
        tempId: a.id,
        input: { firstName: a.firstName, lastName: a.lastName, company: a.company, email: a.email },
        segmentId: event.segment?.id ?? null,
      }));
    setState({
      eventName: event.name,
      segment: event.segment ? { ...event.segment, size: null, processingType: "" } : null,
      roster: event.attendees,
      importedAt: event.updatedAt,
      outbox,
      failed: [],
      eventId: event.id,
      eventStartedAt: event.startedAt,
      eventSavedAt: event.updatedAt,
    });
    return;
  }
  setState({
    eventName: newName?.trim() || event.name,
    segment: event.segment ? { ...event.segment, size: null, processingType: "" } : null,
    // Unsynced walk-ins from the old event have no HubSpot contact; leave them out.
    roster: event.attendees
      .filter((a) => !a.id.startsWith("tmp_"))
      .map(({ checkedInAt: _c, walkIn: _w, badgeName: _n, badgeCompany: _b, ...a }) => ({ ...a, checkedInAt: null })),
    importedAt: now,
    outbox: [],
    failed: [],
    eventId: null,
    eventStartedAt: null,
    eventSavedAt: null,
  });
  ensureEvent();
}

export function updatePrinter(patch: Partial<PrinterSettings>) {
  setState((s) => ({ printer: { ...s.printer, ...patch } }));
}

export function dismissFailed() {
  setState({ failed: [] });
}
