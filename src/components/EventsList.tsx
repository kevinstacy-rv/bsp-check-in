"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { startSync } from "@/lib/sync";
import { useStore } from "@/lib/store";
import type { EventSummary } from "@/lib/types";
import { TopBar } from "./TopBar";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export function EventsList() {
  const currentId = useStore((s) => s.eventId);
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<{ message: string; storage: boolean } | null>(null);

  useEffect(() => {
    startSync();
    fetch("/api/events")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data?.error ?? `Couldn't load events (${res.status})`), data);
        setEvents(data.events);
      })
      .catch((e) =>
        setError({
          message: navigator.onLine ? e.message : "You're offline. Past events load when you're back online.",
          storage: e.storage !== false,
        }),
      );
  }, []);

  return (
    <div className="shell">
      <TopBar active="events" />
      <main className="main">
        <h1 className="rv-label eyebrow">
          <span>Past events</span>
          {events && <span className="subtle">{events.length} saved</span>}
        </h1>

        {error && (
          <div className={`banner ${error.storage ? "banner--bad" : ""}`}>
            <span>
              {!error.storage && <strong>Shared storage isn&apos;t set up yet. </strong>}
              {error.storage
                ? error.message
                : "In Vercel, open this project → Storage → add Upstash for Redis and connect it, then redeploy. Events save automatically after that."}
            </span>
          </div>
        )}

        {!events && !error && (
          <div className="empty">
            <span className="spinner" style={{ display: "inline-block" }} />
          </div>
        )}

        {events?.length === 0 && (
          <div className="empty">
            <div className="h5">No saved events yet</div>
            <p>Events save here automatically once attendees are imported on the Setup page.</p>
          </div>
        )}

        {events && events.length > 0 && (
          <ul className="list events">
            {events.map((e) => {
              const pct = e.total ? Math.round((e.checkedIn / e.total) * 100) : 0;
              return (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="row events__row">
                    <div>
                      <div className="row__name">{e.name}</div>
                      <div className="row__meta">
                        <span>{date(e.startedAt)}</span>
                        {e.segmentName && <span>{e.segmentName}</span>}
                        {e.id === currentId ? (
                          <span className="tag tag--accent">In progress on this computer</span>
                        ) : !e.finishedAt ? (
                          <span className="tag">Not finished</span>
                        ) : null}
                        {e.submittedAt ? (
                          <span className="tag">Submitted to HubSpot</span>
                        ) : e.finishedAt ? (
                          <span className="tag tag--accent">Ready to submit</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="events__stats">
                      <span className="h5">
                        {e.checkedIn}
                        <span className="subtle"> / {e.total}</span>
                      </span>
                      <span className="tiny subtle">
                        {pct}% checked in{e.walkIns ? ` · ${e.walkIns} walk-in${e.walkIns === 1 ? "" : "s"}` : ""}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
