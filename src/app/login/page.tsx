"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "That password didn't work.");
        return;
      }
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch {
      setError("Can't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login__card" onSubmit={submit}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/propresenter-white-gradient.svg" alt="ProPresenter" />
      <div>
        <div className="eyebrow muted" style={{ marginBottom: 8 }}>
          Staff only
        </div>
        <h1 className="h3">Sign in to check-in</h1>
      </div>
      <label className="field">
        <span>Staff password</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="rv-btn rv-btn--primary rv-btn--lg" disabled={busy || !password}>
        {busy ? <span className="spinner" /> : null}
        Sign in
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
