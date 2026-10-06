"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkPrinter } from "@/lib/print";
import { useStore } from "@/lib/store";
import { syncNow } from "@/lib/sync";

export function TopBar({ active }: { active: "checkin" | "setup" }) {
  const router = useRouter();
  const eventName = useStore((s) => s.eventName);
  const online = useStore((s) => s.online);
  const outbox = useStore((s) => s.outbox);
  const syncing = useStore((s) => s.syncing);
  const syncError = useStore((s) => s.syncError);
  const printer = useStore((s) => s.printerStatus);

  const pending = outbox.length;
  const syncTone = !online || syncError ? "warn" : pending ? "warn" : "ok";
  const syncLabel = !online
    ? `Offline${pending ? ` · ${pending} to sync` : ""}`
    : syncing
      ? `Syncing ${pending}…`
      : pending
        ? `${pending} waiting to sync`
        : "Synced to HubSpot";

  const printerTone = printer.state === "ready" ? "ok" : printer.state === "unknown" ? "" : "bad";
  const printerLabel =
    printer.state === "ready"
      ? printer.name
      : printer.state === "missing"
        ? "No printer found"
        : printer.state === "unreachable"
          ? "Browser Print not running"
          : "Checking printer…";

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
        <button
          className="pill"
          onClick={() => void checkPrinter()}
          title={printer.state === "unreachable" ? printer.message : "Check printer"}
        >
          <span className={`dot ${printerTone ? `dot--${printerTone}` : ""}`} />
          {printerLabel}
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
