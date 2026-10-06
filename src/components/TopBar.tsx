"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { syncNow } from "@/lib/sync";

export function TopBar({ active }: { active: "checkin" | "setup" }) {
  const router = useRouter();
  const eventName = useStore((s) => s.eventName);
  const online = useStore((s) => s.online);
  const outbox = useStore((s) => s.outbox);
  const syncing = useStore((s) => s.syncing);
  const syncError = useStore((s) => s.syncError);

  const pending = outbox.length;
  const syncTone = !online || syncError ? "warn" : pending ? "warn" : "ok";
  const syncLabel = !online
    ? `Offline${pending ? ` · ${pending} to sync` : ""}`
    : syncing
      ? `Syncing ${pending}…`
      : pending
        ? `${pending} waiting to sync`
        : "Synced to HubSpot";

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
          title={syncError ?? "Sync now"}
          aria-label={`${syncLabel}. Sync now`}
        >
          {syncing ? <span className="spinner" style={{ width: 10, height: 10 }} /> : <span className={`dot dot--${syncTone}`} />}
          {syncLabel}
        </button>
      </div>

      <nav className="topbar__nav">
        <Link href="/" className="rv-btn rv-btn--ghost" aria-current={active === "checkin" ? "page" : undefined}>
          Check-in
        </Link>
        <Link href="/setup" className="rv-btn rv-btn--ghost" aria-current={active === "setup" ? "page" : undefined}>
          Setup
        </Link>
        <button className="rv-btn rv-btn--ghost" onClick={signOut}>
          Sign out
        </button>
      </nav>
    </header>
  );
}
