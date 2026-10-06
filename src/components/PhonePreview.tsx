"use client";

// The attendee-facing phone. Shows whichever badge the check-in station has
// on screen so the attendee can check their name and organization before it
// prints. Polls once a second while visible.

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { renderLabel } from "@/lib/label";
import { DEFAULT_PRINTER, PREVIEW_KEY_RE, type PreviewPayload } from "@/lib/types";

type Status = "connecting" | "live" | "lost" | "invalid";

export function PhonePreview() {
  const key = useSearchParams().get("k") ?? "";
  const [payload, setPayload] = useState<(PreviewPayload & { v?: number }) | null>(null);
  const [status, setStatus] = useState<Status>(PREVIEW_KEY_RE.test(key) ? "connecting" : "invalid");
  const holder = useRef<HTMLDivElement>(null);
  const lastV = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!PREVIEW_KEY_RE.test(key)) return;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/preview/${encodeURIComponent(key)}`, { cache: "no-store" });
          if (res.status === 400) {
            setStatus("invalid");
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
          const { payload: next } = await res.json();
          failures = 0;
          setStatus("live");
          if (next && next.v !== lastV.current) {
            lastV.current = next.v;
            setPayload(next);
          }
        } catch {
          if (++failures >= 3) setStatus("lost");
        }
      }
      timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [key]);

  const badge = payload && payload.kind !== "idle" ? payload : null;

  useEffect(() => {
    if (!badge || !holder.current) return;
    let cancelled = false;
    renderLabel(
      { name: badge.name, company: badge.company },
      { ...DEFAULT_PRINTER, label: "custom", widthMm: badge.widthMm, heightMm: badge.heightMm },
    ).then(({ canvas }) => {
      if (cancelled || !holder.current) return;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Badge for ${badge.name}${badge.company ? `, ${badge.company}` : ""}`);
      holder.current.replaceChildren(canvas);
    });
    return () => {
      cancelled = true;
    };
  }, [badge]);

  if (status === "invalid") {
    return (
      <main className="phone">
        <Lockup />
        <div className="phone__body">
          <h1 className="h3">This link doesn&apos;t work</h1>
          <p className="muted">Ask the check-in team for the current QR code.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="phone">
      <Lockup />
      <div className="phone__body" aria-live="polite">
        {badge ? (
          <>
            <div className="eyebrow subtle">{badge.kind === "printing" ? "Printing now" : "Check your badge"}</div>
            <h1 className="h3">
              {badge.kind === "printing" ? "Your badge is on its way" : "Does this look right?"}
            </h1>
            <div className="phone__badge" ref={holder} />
            <dl className="phone__fields">
              <div>
                <dt className="eyebrow subtle">Name</dt>
                <dd>{badge.name || "—"}</dd>
              </div>
              <div>
                <dt className="eyebrow subtle">Organization</dt>
                <dd>{badge.company || "—"}</dd>
              </div>
            </dl>
            {badge.kind === "badge" && (
              <p className="muted phone__hint">If anything needs changing, let the team member at the desk know.</p>
            )}
          </>
        ) : (
          <>
            <div className="eyebrow subtle">{payload?.eventName || "Welcome"}</div>
            <h1 className="h1 phone__welcome">Welcome!</h1>
            <p className="muted">Tell us your name and your badge will show up here so you can check it.</p>
          </>
        )}
      </div>
      <footer className="phone__status tiny subtle">
        <span className={`dot ${status === "live" ? "dot--ok" : status === "lost" ? "dot--bad" : ""}`} />
        {status === "live" ? "Connected to check-in" : status === "lost" ? "Reconnecting…" : "Connecting…"}
      </footer>
    </main>
  );
}

function Lockup() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="phone__logo" src="/brand/propresenter-white-gradient.svg" alt="ProPresenter" />;
}
