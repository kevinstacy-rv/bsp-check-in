"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { printLabel } from "@/lib/print";
import { normalize, queryTokens, searchAttendees } from "@/lib/search";
import { addWalkIn, checkIn, dismissFailed, undoCheckIn, useStore } from "@/lib/store";
import { startSync, syncNow } from "@/lib/sync";
import { fullName, type Attendee, type WalkInInput } from "@/lib/types";
import { Toasts, useToasts } from "./Toasts";
import { TopBar } from "./TopBar";
import { WalkInDialog } from "./WalkInDialog";

type Filter = "all" | "waiting" | "in";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  return (
    <>
      {text.split(/(\s+)/).map((word, i) => {
        const n = normalize(word);
        const t = tokens.find((t) => n.startsWith(t));
        return t ? (
          <span key={i}>
            <mark>{word.slice(0, t.length)}</mark>
            {word.slice(t.length)}
          </span>
        ) : (
          <span key={i}>{word}</span>
        );
      })}
    </>
  );
}

const SearchIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);

export function CheckInApp() {
  const roster = useStore((s) => s.roster);
  const eventName = useStore((s) => s.eventName);
  const segment = useStore((s) => s.segment);
  const failed = useStore((s) => s.failed);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [printing, setPrinting] = useState<Set<string>>(new Set());
  const [walkInOpen, setWalkInOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    startSync();
  }, []);

  const tokens = useMemo(() => queryTokens(deferredQuery), [deferredQuery]);
  const results = useMemo(() => {
    const found = searchAttendees(roster, deferredQuery);
    if (filter === "waiting") return found.filter((a) => !a.checkedInAt);
    if (filter === "in") return found.filter((a) => a.checkedInAt);
    return found;
  }, [roster, deferredQuery, filter]);

  const checkedIn = useMemo(() => roster.filter((a) => a.checkedInAt).length, [roster]);

  useEffect(() => setSelected(0), [deferredQuery, filter]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const resetSearch = useCallback(() => {
    setQuery("");
    searchRef.current?.focus();
  }, []);

  const print = useCallback(
    async (attendee: Attendee, { reprint = false } = {}) => {
      if (printing.has(attendee.id)) return;
      const name = fullName(attendee);
      // Check in first, so a printer problem never loses the check-in.
      const wasIn = Boolean(attendee.checkedInAt);
      if (!wasIn) {
        checkIn(attendee.id);
        void syncNow();
      }
      setPrinting((p) => new Set(p).add(attendee.id));
      resetSearch();
      try {
        await printLabel({ name, company: attendee.company });
        push({ tone: "ok", message: reprint || wasIn ? `Sent ${name}'s badge to the printer` : `${name} is checked in` });
      } catch (e) {
        push({
          tone: "bad",
          message: `${wasIn ? "The badge didn't print." : `${name} is checked in, but the badge didn't print.`} ${(e as Error).message}`,
          action: { label: "Try again", run: () => void print({ ...attendee, checkedInAt: new Date().toISOString() }, { reprint: true }) },
        });
      } finally {
        setPrinting((p) => {
          const next = new Set(p);
          next.delete(attendee.id);
          return next;
        });
      }
    },
    [printing, push, resetSearch],
  );

  const undo = (a: Attendee) => {
    undoCheckIn(a.id);
    void syncNow();
    push({ tone: "ok", message: `Undid ${fullName(a)}'s check-in` });
  };

  const submitWalkIn = (input: WalkInInput) => {
    setWalkInOpen(false);
    const attendee = addWalkIn(input);
    void syncNow();
    void print({ ...attendee, checkedInAt: null }).then(() => undefined);
  };

  // Typing anywhere jumps to search, so staff never have to click the box first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (walkInOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target.closest("input, textarea, select, dialog")) return;
      if (e.key === "/" || e.key.length === 1) {
        searchRef.current?.focus();
        if (e.key === "/") e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walkInOpen]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = results[selected];
      if (a && deferredQuery.trim()) void print(a);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };

  const ready = Boolean(segment && eventName && roster.length);
  const pct = roster.length ? (checkedIn / roster.length) * 100 : 0;

  return (
    <div className="shell">
      <TopBar active="checkin" />
      <main className="main">
        {!ready ? (
          <div className="empty" style={{ borderTop: "var(--stroke-hairline) solid var(--border)" }}>
            <div className="h5">Let&apos;s get the event set up</div>
            <p>Name the event and import its attendees from a HubSpot segment. It takes about a minute.</p>
            <Link href="/setup" className="rv-btn rv-btn--primary">
              Set up the event
            </Link>
          </div>
        ) : (
          <>
            {failed.length > 0 && (
              <div className="banner banner--bad">
                <span>
                  <strong>
                    {failed.length} change{failed.length === 1 ? "" : "s"} didn&apos;t reach HubSpot.
                  </strong>{" "}
                  Last error: {failed[failed.length - 1].error}
                </span>
                <button className="rv-btn rv-btn--sm rv-btn--secondary" onClick={dismissFailed}>
                  Dismiss
                </button>
              </div>
            )}

            <section className="stats" aria-label="Progress">
              <div>
                <div className="eyebrow subtle" style={{ marginBottom: 6 }}>
                  Checked in
                </div>
                <div className="stats__count">
                  <span className="h1">{checkedIn}</span>
                  <span className="h5 subtle">of {roster.length}</span>
                </div>
              </div>
              <button className="rv-btn rv-btn--secondary rv-btn--lg" onClick={() => setWalkInOpen(true)}>
                <span aria-hidden style={{ fontSize: 20, lineHeight: 0 }}>
                  +
                </span>
                Add walk-in
              </button>
            </section>
            <div className="progress" aria-hidden>
              <div style={{ width: `${pct}%` }} />
            </div>

            <div className="searchbar">
              <label className="search">
                <SearchIcon />
                <input
                  ref={searchRef}
                  className="input"
                  type="search"
                  placeholder="Search by name, organization or email"
                  aria-label="Search attendees"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKey}
                  aria-controls="attendees"
                  aria-activedescendant={results[selected] ? `a-${results[selected].id}` : undefined}
                />
              </label>
            </div>

            <div className="row-inline" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <div className="filters" role="group" aria-label="Filter">
                {(
                  [
                    ["all", "Everyone"],
                    ["waiting", "Not checked in"],
                    ["in", "Checked in"],
                  ] as const
                ).map(([key, label]) => (
                  <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="tiny subtle">
                <span className="kbd">↑</span> <span className="kbd">↓</span> to choose, <span className="kbd">Enter</span>{" "}
                to check in and print
              </span>
            </div>

            <ul className="list" id="attendees" role="listbox" ref={listRef} aria-label="Attendees">
              {results.map((a, i) => {
                const busy = printing.has(a.id);
                return (
                  <li
                    key={a.id}
                    id={`a-${a.id}`}
                    className="row"
                    role="option"
                    aria-selected={i === selected}
                    onClick={() => setSelected(i)}
                  >
                    <div>
                      <div className="row__name">
                        <Highlight text={fullName(a) || a.email || "No name"} tokens={tokens} />
                      </div>
                      <div className="row__meta">
                        {a.company && (
                          <span>
                            <Highlight text={a.company} tokens={tokens} />
                          </span>
                        )}
                        {a.walkIn && <span className="tag">Walk-in</span>}
                      </div>
                    </div>
                    <div className="row__actions">
                      {a.checkedInAt && (
                        <>
                          <span className="badge">✓ Checked in {time(a.checkedInAt)}</span>
                          <button
                            className="rv-btn rv-btn--ghost rv-btn--sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              undo(a);
                            }}
                          >
                            Undo
                          </button>
                        </>
                      )}
                      <button
                        className={`rv-btn ${a.checkedInAt ? "rv-btn--outline" : "rv-btn--primary"}`}
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void print(a, { reprint: Boolean(a.checkedInAt) });
                        }}
                      >
                        {busy && <span className="spinner" />}
                        {a.checkedInAt ? "Reprint" : "Print"}
                      </button>
                    </div>
                  </li>
                );
              })}
              {results.length === 0 && (
                <li className="empty">
                  <div className="h5">
                    {query.trim() ? <>No one matches &ldquo;{query}&rdquo;</> : "No one here yet"}
                  </div>
                  <p>Try part of their first or last name, or add them as a walk-in.</p>
                  <button className="rv-btn rv-btn--primary" onClick={() => setWalkInOpen(true)}>
                    Add walk-in
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
      </main>

      <WalkInDialog
        open={walkInOpen}
        initialName={results.length === 0 ? query : ""}
        onClose={() => {
          setWalkInOpen(false);
          searchRef.current?.focus();
        }}
        onSubmit={submitWalkIn}
      />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
