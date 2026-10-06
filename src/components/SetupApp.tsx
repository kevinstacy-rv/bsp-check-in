"use client";

import { useEffect, useMemo, useState } from "react";
import { saveEvent as saveEventRecord } from "@/lib/events";
import { ensureEvent, getState, importRoster, setState, updatePrinter, useStore } from "@/lib/store";
import { startSync } from "@/lib/sync";
import { LABEL_SIZES, labelSizeMm, type Attendee, type LabelSizeId, type Segment } from "@/lib/types";
import { LabelPreview } from "./LabelPreview";
import { PrinterCheck } from "./PrinterCheck";
import { Toasts, useToasts } from "./Toasts";
import { TopBar } from "./TopBar";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

export function SetupApp() {
  const eventName = useStore((s) => s.eventName);
  const segment = useStore((s) => s.segment);
  const roster = useStore((s) => s.roster);
  const importedAt = useStore((s) => s.importedAt);
  const outbox = useStore((s) => s.outbox);
  const printer = useStore((s) => s.printer);
  const { toasts, push, dismiss } = useToasts();

  const [eventDraft, setEventDraft] = useState("");
  const [query, setQuery] = useState("");
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [picked, setPicked] = useState<Segment | null>(null);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [importing, setImporting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const eventSavedAt = useStore((s) => s.eventSavedAt);
  const [sample, setSample] = useState({ name: "Kevin Stacy", company: "Renewed Vision" });

  useEffect(() => {
    startSync();
    setEventDraft(getState().eventName);
    setPicked(getState().segment);
    void findSegments("");
  }, []);

  async function findSegments(q: string) {
    setLoadingSegments(true);
    try {
      const { segments } = await getJson<{ segments: Segment[] }>(`/api/hubspot/segments?q=${encodeURIComponent(q)}`);
      setSegments(segments);
    } catch (e) {
      push({ tone: "bad", message: `Couldn't load segments. ${(e as Error).message}` });
    } finally {
      setLoadingSegments(false);
    }
  }

  function saveEvent() {
    const name = eventDraft.trim();
    if (!name || name === eventName) return;
    setState({ eventName: name });
    push({
      tone: "ok",
      message: roster.length ? "Event renamed. Import again to refresh who's checked in." : "Event saved",
    });
  }

  async function runImport(target: Segment) {
    const name = eventDraft.trim();
    if (!name) {
      push({ tone: "bad", message: "Name the event first. It's saved on each contact when they check in." });
      return;
    }
    setImporting(true);
    try {
      setState({ eventName: name, segment: target });
      const { attendees } = await getJson<{ attendees: Attendee[] }>(
        `/api/hubspot/segments/${encodeURIComponent(target.id)}?event=${encodeURIComponent(name)}`,
      );
      importRoster(attendees);
      ensureEvent();
      void saveEventRecord();
      push({ tone: "ok", message: `Imported ${attendees.length} attendees from ${target.name}` });
    } catch (e) {
      push({ tone: "bad", message: `Import didn't finish. ${(e as Error).message}` });
    } finally {
      setImporting(false);
    }
  }

  function clearStation() {
    setState({
      eventName: "",
      segment: null,
      roster: [],
      importedAt: null,
      failed: [],
      eventId: null,
      eventStartedAt: null,
      eventSavedAt: null,
    });
    setEventDraft("");
    setPicked(null);
  }

  async function finishEvent() {
    if (outbox.length) {
      push({ tone: "bad", message: `${outbox.length} changes haven't reached HubSpot yet. Get back online before finishing.` });
      return;
    }
    if (!confirm("Finish this event? It's saved to Past events, then cleared from this computer. HubSpot isn't changed."))
      return;
    setFinishing(true);
    const result = await saveEventRecord({ finished: true });
    setFinishing(false);
    if (result.ok) {
      clearStation();
      push({ tone: "ok", message: "Event saved to Past events" });
      return;
    }
    if (
      confirm(
        `The event couldn't be saved to Past events: ${result.error}\n\nClear it from this computer anyway? The check-ins are still in HubSpot.`,
      )
    ) {
      clearStation();
    }
  }


  const previewContent = useMemo(() => ({ ...sample }), [sample]);
  const size = labelSizeMm(printer);
  const preset = LABEL_SIZES[printer.label] ?? LABEL_SIZES["dk-1202"];
  const mmInput = (value: number, onChange: (v: number) => void, min = 10, max = 300) => (
    <input
      className="input"
      type="number"
      step="1"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
  const checkedIn = roster.filter((a) => a.checkedInAt).length;

  return (
    <div className="shell">
      <TopBar active="setup" />
      <main className="main">
        <div className="setup">
          <div>
            <section className="section">
              <h2 className="rv-label eyebrow">
                <span>1 · Event</span>
              </h2>
              <label className="field">
                <span>Event name</span>
                <div className="row-inline" style={{ flexWrap: "nowrap" }}>
                  <input
                    className="input"
                    placeholder="e.g. Backstage Pass 2026"
                    value={eventDraft}
                    onChange={(e) => setEventDraft(e.target.value)}
                    onBlur={saveEvent}
                    onKeyDown={(e) => e.key === "Enter" && saveEvent()}
                  />
                </div>
              </label>
              <p className="tiny subtle" style={{ margin: 0 }}>
                Saved to each contact&apos;s <strong>Event check-in: event</strong> property in HubSpot, with the time in{" "}
                <strong>Event check-in: time</strong>. Keep the name the same all event.
              </p>
            </section>

            <section className="section">
              <h2 className="rv-label eyebrow">
                <span>2 · Attendees</span>
                {importedAt && <span className="subtle">Imported {when(importedAt)}</span>}
              </h2>

              {segment && roster.length > 0 && (
                <div className="card">
                  <div className="h5">{segment.name}</div>
                  <div className="muted">
                    {roster.length} attendees · {checkedIn} checked in
                  </div>
                  <div className="row-inline" style={{ marginTop: 8 }}>
                    <button className="rv-btn rv-btn--outline" disabled={importing} onClick={() => runImport(segment)}>
                      {importing && <span className="spinner" />}
                      Refresh from HubSpot
                    </button>
                  </div>
                </div>
              )}

              <form
                className="row-inline"
                style={{ flexWrap: "nowrap" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void findSegments(query);
                }}
              >
                <input
                  className="input"
                  placeholder="Search HubSpot segments"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button className="rv-btn rv-btn--secondary" disabled={loadingSegments} style={{ height: 48 }}>
                  {loadingSegments ? <span className="spinner" /> : "Search"}
                </button>
              </form>

              {segments && (
                <ul className="segments">
                  {segments.length === 0 && <li className="empty">No contact segments match that search.</li>}
                  {segments.map((s) => (
                    <li key={s.id}>
                      <button type="button" aria-pressed={picked?.id === s.id} onClick={() => setPicked(s)}>
                        <span>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          <span className="tiny subtle" style={{ display: "block" }}>
                            {s.processingType === "MANUAL" || s.processingType === "SNAPSHOT"
                              ? "Static segment"
                              : "Active segment"}
                          </span>
                        </span>
                        {s.size != null && <span className="muted">{s.size.toLocaleString()}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                className="rv-btn rv-btn--primary rv-btn--lg"
                disabled={!picked || importing}
                onClick={() => picked && runImport(picked)}
              >
                {importing && <span className="spinner" />}
                {picked ? `Import ${picked.name}` : "Choose a segment to import"}
              </button>
              <p className="tiny subtle" style={{ margin: 0 }}>
                Imports first name, last name and organization (the contact&apos;s company field, or its associated
                company). The list is saved on this computer so check-in keeps working offline.
              </p>
            </section>
          </div>

          <div>
            <section className="section" id="printer">
              <h2 className="rv-label eyebrow">
                <span>3 · Printer</span>
              </h2>
              <PrinterCheck sample={sample} onToast={(tone, message) => push({ tone, message })} />

              <label className="field">
                <span>Label roll</span>
                <select
                  className="select"
                  value={printer.label}
                  onChange={(e) => {
                    const label = e.target.value as LabelSizeId;
                    const next = LABEL_SIZES[label];
                    updatePrinter(label === "custom" ? { label } : { label, widthMm: next.widthMm, heightMm: next.heightMm });
                  }}
                >
                  {(Object.keys(LABEL_SIZES) as LabelSizeId[]).map((id) => (
                    <option key={id} value={id}>
                      {LABEL_SIZES[id].name}
                    </option>
                  ))}
                </select>
              </label>

              {printer.label === "custom" ? (
                <div className="grid-2">
                  <label className="field">
                    <span>Width (mm)</span>
                    {mmInput(printer.widthMm, (widthMm) => updatePrinter({ widthMm }))}
                  </label>
                  <label className="field">
                    <span>Height (mm)</span>
                    {mmInput(printer.heightMm, (heightMm) => updatePrinter({ heightMm }), 10, 62)}
                  </label>
                </div>
              ) : "continuous" in preset ? (
                <label className="field">
                  <span>Badge length (mm)</span>
                  {mmInput(printer.widthMm, (widthMm) => updatePrinter({ widthMm }), 40, 300)}
                </label>
              ) : null}

              <div className="grid-2">
                <label className="field">
                  <span>Nudge right (mm)</span>
                  {mmInput(printer.offsetXMm, (offsetXMm) => updatePrinter({ offsetXMm }), -20, 20)}
                </label>
                <label className="field">
                  <span>Nudge down (mm)</span>
                  {mmInput(printer.offsetYMm, (offsetYMm) => updatePrinter({ offsetYMm }), -20, 20)}
                </label>
              </div>
            </section>

            <section className="section">
              <h2 className="rv-label eyebrow">
                <span>4 · Badge</span>
                <span className="subtle">
                  {size.widthMm} × {size.heightMm} mm
                </span>
              </h2>
              <LabelPreview content={previewContent} settings={printer} />
              <div className="grid-2">
                <label className="field">
                  <span>Sample name</span>
                  <input className="input" value={sample.name} onChange={(e) => setSample((s) => ({ ...s, name: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Sample organization</span>
                  <input
                    className="input"
                    value={sample.company}
                    onChange={(e) => setSample((s) => ({ ...s, company: e.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="section">
              <h2 className="rv-label eyebrow">
                <span>This computer</span>
              </h2>
              <p className="tiny subtle" style={{ margin: 0 }}>
                The event saves to Past events automatically while you work
                {eventSavedAt ? <> (last saved {when(eventSavedAt)})</> : null}. When it&apos;s over, finish it to save the
                final record and clear the attendee list from this computer. Nothing in HubSpot changes.
              </p>
              <div>
                <button className="rv-btn rv-btn--secondary" onClick={finishEvent} disabled={finishing || !roster.length}>
                  {finishing && <span className="spinner" />}
                  Finish event
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
