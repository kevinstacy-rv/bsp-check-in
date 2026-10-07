"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { saveEvent } from "@/lib/events";
import { searchAttendees } from "@/lib/search";
import { getState, loadEvent, useStore } from "@/lib/store";
import { startSync } from "@/lib/sync";
import {
  badgeContent,
  fullName,
  isCorrected,
  summarizeEvent,
  type Attendee,
  type EventRecord,
  type Submission,
} from "@/lib/types";
import { TopBar } from "./TopBar";

type Filter = "all" | "in" | "no-show" | "walk-in" | "corrected";

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(event: EventRecord): string {
  const header = [
    "First name",
    "Last name",
    "Organization",
    "Email",
    "Checked in",
    "Walk-in",
    "Badge name",
    "Badge organization",
    "HubSpot contact ID",
  ];
  const rows = event.attendees.map((a) => {
    const badge = badgeContent(a);
    return [
      a.firstName,
      a.lastName,
      a.company,
      a.email,
      a.checkedInAt ? new Date(a.checkedInAt).toISOString() : "",
      a.walkIn ? "yes" : "",
      isCorrected(a) ? badge.name : "",
      isCorrected(a) ? badge.company : "",
      a.id.startsWith("tmp_") ? "" : a.id,
    ];
  });
  return [header, ...rows].map((r) => r.map((c) => csvCell(c ?? "")).join(",")).join("\n");
}

export function EventDetail({ id }: { id: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const currentId = useStore((s) => s.eventId);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const highlightSubmit = useSearchParams().get("submit") === "1";

  useEffect(() => {
    startSync();
    fetch(`/api/events/${encodeURIComponent(id)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? `Couldn't load this event (${res.status})`);
        setEvent(data.event);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const summary = useMemo(() => (event ? summarizeEvent(event) : null), [event]);
  const rows = useMemo(() => {
    if (!event) return [];
    const found = searchAttendees(event.attendees, query);
    const keep: Record<Filter, (a: Attendee) => boolean> = {
      all: () => true,
      in: (a) => Boolean(a.checkedInAt),
      "no-show": (a) => !a.checkedInAt,
      "walk-in": (a) => Boolean(a.walkIn),
      corrected: isCorrected,
    };
    return found.filter(keep[filter]);
  }, [event, query, filter]);

  function download() {
    if (!event) return;
    const blob = new Blob([toCsv(event)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${event.name.replace(/[^\w\- ]+/g, "").trim() || "event"} check-ins.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function makeCurrent(mode: "resume" | "copy") {
    if (!event) return;
    const s = getState();
    if (s.outbox.length) {
      setError(
        `This computer has ${s.outbox.length} change${s.outbox.length === 1 ? "" : "s"} that haven't reached HubSpot yet. Get online and let them sync first.`,
      );
      return;
    }
    let newName: string | undefined;
    if (mode === "copy") {
      const answer = prompt("Name for the new event", event.name);
      if (answer === null || !answer.trim()) return;
      newName = answer.trim();
    }
    if (s.roster.length && s.eventId && s.eventId !== event.id) {
      if (!confirm(`This replaces "${s.eventName}" on this computer. It stays saved in Past events.`)) return;
    }
    setBusy(true);
    try {
      // Make sure whatever was on the station is saved before swapping it out.
      if (s.eventId && s.eventId !== event.id) await saveEvent();
      loadEvent(event, mode, newName);
      await saveEvent();
    } finally {
      setBusy(false);
    }
    // A copied event should pick up new RSVPs from HubSpot before doors open.
    router.push(mode === "copy" ? "/setup" : "/");
  }

  async function submitToHubSpot() {
    if (!event || !summary) return;
    const s = getState();
    if (s.eventId === event.id) {
      // Submit what HubSpot will actually agree with: everything synced and saved.
      if (s.outbox.length) {
        setError("This computer still has check-ins that haven't reached HubSpot. Get online and let them sync, then submit.");
        return;
      }
      const saved = await saveEvent();
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
    }
    const again = Boolean(event.submission);
    const message = again
      ? `Submit again? The "${event.submission!.listName}" segment is updated to match the ${summary.checkedIn} people checked in now, and anyone newly checked in gets a "Checked in at event" on their timeline. Events already logged stay on timelines.`
      : `Submit ${summary.checkedIn} attendees to HubSpot?\n\nThis creates the segment "${event.name} – Attended" and logs "Checked in at event" on each attendee's timeline. Timeline events can't be removed later, so make sure check-in is done.`;
    if (!confirm(message)) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(id)}/submit`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Submit failed (${res.status})`);
      const submission = data.submission as Submission;
      setEvent({ ...event, submission });
      setNotice(
        `Submitted. "${submission.listName}" now has ${submission.attendees} ${submission.attendees === 1 ? "person" : "people"}` +
          (data.added || data.removed ? ` (${data.added} added, ${data.removed} removed)` : "") +
          (submission.eventError
            ? "."
            : data.eventsLogged
              ? `, and ${plural(data.eventsLogged, "new timeline event")} logged.`
              : ". No new timeline events were needed."),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!event || !confirm(`Delete "${event.name}" from Past events? This can't be undone. HubSpot isn't changed.`)) return;
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) router.replace("/events");
    else setError((await res.json().catch(() => null))?.error ?? "Couldn't delete the event.");
  }

  return (
    <div className="shell">
      <TopBar active="events" />
      <main className="main">
        <Link href="/events" className="rv-btn rv-btn--ghost rv-btn--sm" style={{ marginLeft: -10, marginBottom: 12 }}>
          ← Past events
        </Link>

        {error && <div className="banner banner--bad">{error}</div>}
        {notice && <div className="banner">{notice}</div>}

        {event && summary && (
          <>
            <div className="stats">
              <div>
                <div className="eyebrow subtle" style={{ marginBottom: 6 }}>
                  {dateTime(event.startedAt)}
                  {event.segment ? ` · ${event.segment.name}` : ""}
                </div>
                <h1 className="h3">{event.name}</h1>
                <div className="tiny subtle" style={{ marginTop: 4 }}>
                  {event.id === currentId
                    ? "In progress on this computer"
                    : event.finishedAt
                      ? `Finished ${dateTime(event.finishedAt)}`
                      : `Last saved ${dateTime(event.updatedAt)}`}
                </div>
              </div>
              <div className="row-inline">
                {event.id === currentId ? (
                  <Link href="/" className="rv-btn rv-btn--primary">
                    Open check-in
                  </Link>
                ) : (
                  <button className="rv-btn rv-btn--primary" onClick={() => makeCurrent("resume")} disabled={busy}>
                    {busy && <span className="spinner" />}
                    Resume this event
                  </button>
                )}
                <button className="rv-btn rv-btn--outline" onClick={() => makeCurrent("copy")} disabled={busy}>
                  Start new event from this
                </button>
                <button className="rv-btn rv-btn--secondary" onClick={download}>
                  Download CSV
                </button>
                <button className="rv-btn rv-btn--ghost" onClick={remove}>
                  Delete
                </button>
              </div>
            </div>

            <section className={`card submit-card ${highlightSubmit && !event.submission ? "submit-card--focus" : ""}`}>
              <div className="row-inline" style={{ justifyContent: "space-between" }}>
                <div className="row-inline" style={{ gap: 10 }}>
                  <span className={`dot ${event.submission ? "dot--ok" : "dot--warn"}`} />
                  <span className="h5">
                    {event.submission ? "Attendance submitted to HubSpot" : "Attendance not submitted to HubSpot yet"}
                  </span>
                </div>
                <button className="rv-btn rv-btn--primary" onClick={submitToHubSpot} disabled={submitting || !summary.checkedIn}>
                  {submitting && <span className="spinner" />}
                  {event.submission ? "Submit again" : "Submit attendance to HubSpot"}
                </button>
              </div>
              {event.submission ? (
                <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  {dateTime(event.submission.submittedAt)} · {plural(event.submission.attendees, "attendee")} in the
                  segment <strong>{event.submission.listName}</strong>
                  {event.submission.eventError
                    ? null
                    : ` · "Checked in at event" on ${plural(event.submission.eventsLogged, "timeline")}`}
                  . Submit again after any late changes to update the segment.
                </p>
              ) : (
                <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  When check-in is done, submit to create the segment <strong>{event.name} – Attended</strong> and log
                  &ldquo;Checked in at event&rdquo; on each attendee&apos;s timeline. Until then, everything in HubSpot can
                  still be undone.
                </p>
              )}
              {event.submission?.eventError && (
                <p className="tiny" style={{ margin: 0, color: "var(--accent-secondary)" }}>
                  The segment is up to date, but timeline events weren&apos;t logged: {event.submission.eventError}
                </p>
              )}
            </section>

            <div className="kpis">
              <div className="kpi">
                <span className="eyebrow subtle">Checked in</span>
                <span className="h3">
                  {summary.checkedIn}
                  <span className="subtle h5"> of {summary.total}</span>
                </span>
              </div>
              <div className="kpi">
                <span className="eyebrow subtle">Attendance</span>
                <span className="h3">{summary.total ? Math.round((summary.checkedIn / summary.total) * 100) : 0}%</span>
              </div>
              <div className="kpi">
                <span className="eyebrow subtle">Walk-ins</span>
                <span className="h3">{summary.walkIns}</span>
              </div>
              <div className="kpi">
                <span className="eyebrow subtle">Badge corrections</span>
                <span className="h3">{summary.corrections}</span>
              </div>
            </div>

            <div className="searchbar" style={{ marginTop: "var(--space-lg)" }}>
              <input
                className="input"
                type="search"
                placeholder="Search attendees"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="filters" role="group" aria-label="Filter">
              {(
                [
                  ["all", "Everyone"],
                  ["in", "Checked in"],
                  ["no-show", "Didn't check in"],
                  ["walk-in", "Walk-ins"],
                  ["corrected", "Corrected badges"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>

            <ul className="list">
              {rows.map((a) => {
                const badge = badgeContent(a);
                return (
                  <li key={a.id} className="row" style={{ cursor: "default" }}>
                    <div>
                      <div className="row__name">{fullName(a) || a.email || "No name"}</div>
                      <div className="row__meta">
                        {a.company && <span>{a.company}</span>}
                        {a.walkIn && <span className="tag">Walk-in</span>}
                        {isCorrected(a) && (
                          <span className="tag tag--accent">
                            Badge: {badge.name}
                            {badge.company ? ` · ${badge.company}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="row__actions">
                      {a.checkedInAt ? (
                        <span className="badge">✓ {time(a.checkedInAt)}</span>
                      ) : (
                        <span className="tiny subtle">Didn&apos;t check in</span>
                      )}
                    </div>
                  </li>
                );
              })}
              {rows.length === 0 && <li className="empty">No attendees match.</li>}
            </ul>
          </>
        )}

        {!event && !error && (
          <div className="empty">
            <span className="spinner" style={{ display: "inline-block" }} />
          </div>
        )}
      </main>
    </div>
  );
}
