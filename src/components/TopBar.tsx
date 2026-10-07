"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { checkPhone } from "@/lib/preview";
import { useStore } from "@/lib/store";
import { syncNow } from "@/lib/sync";
import { PhonePairDialog } from "./PhonePairDialog";

export function TopBar({ active }: { active: "checkin" | "setup" | "events" }) {
  const router = useRouter();
  const eventName = useStore((s) => s.eventName);
  const online = useStore((s) => s.online);
  const outbox = useStore((s) => s.outbox);
  const syncing = useStore((s) => s.syncing);
  const syncError = useStore((s) => s.syncError);
  const previewKey = useStore((s) => s.previewKey);
  const phoneSeenAt = useStore((s) => s.phoneSeenAt);
  const [pairOpen, setPairOpen] = useState(false);
  const [now, setNow] = useState(0);

  // Keep the phone pill honest once a phone has been paired.
  useEffect(() => {
    if (!previewKey) return;
    const tick = () => {
      setNow(Date.now());
      void checkPhone();
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, [previewKey]);
  const phoneConnected = phoneSeenAt != null && now - phoneSeenAt < 20000;

  const pending = outbox.length;
  const syncTone = !online || syncError ? "warn" : pending ? "warn" : "ok";
  const walkIns = `${pending} walk-in${pending === 1 ? "" : "s"}`;
  const syncLabel = !online
    ? `Offline · saved on this computer${pending ? ` · ${walkIns} to add` : ""}`
    : syncing
      ? `Adding ${walkIns} to HubSpot…`
      : pending
        ? `${walkIns} waiting for HubSpot`
        : "All saved";

  async function signOut() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  return (
    <header className="topbar">
      <div className="topbar__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/propresenter-white-gradient.svg" alt="ProPresenter" />
        <span className="topbar__sep" aria-hidden />
        <div className="topbar__event">
          <div className="eyebrow subtle">Event check-in</div>
          <div className="h5">{eventName || "No event set up"}</div>
        </div>
      </div>

      <div className="status-row">
        <button
          className="pill"
          onClick={() => void syncNow()}
          title={syncError ?? "Check-ins save on this computer and to Past events; walk-ins are added to HubSpot as they happen"}
          aria-label={`${syncLabel}. Sync now`}
        >
          {syncing ? <span className="spinner" style={{ width: 10, height: 10 }} /> : <span className={`dot dot--${syncTone}`} />}
          {syncLabel}
        </button>
        <button className="pill" onClick={() => setPairOpen(true)} title="Show badges on a phone for attendees to check">
          <span className={`dot ${phoneConnected ? "dot--ok" : ""}`} />
          {phoneConnected ? "Phone connected" : "Phone preview"}
        </button>
      </div>

      <nav className="topbar__nav">
        <Link href="/" className="rv-btn rv-btn--ghost" aria-current={active === "checkin" ? "page" : undefined}>
          Check-in
        </Link>
        <Link href="/setup" className="rv-btn rv-btn--ghost" aria-current={active === "setup" ? "page" : undefined}>
          Setup
        </Link>
        <Link href="/events" className="rv-btn rv-btn--ghost" aria-current={active === "events" ? "page" : undefined}>
          Past events
        </Link>
        <button className="rv-btn rv-btn--ghost" onClick={signOut}>
          Sign out
        </button>
      </nav>
      <PhonePairDialog open={pairOpen} onClose={() => setPairOpen(false)} />
    </header>
  );
}
