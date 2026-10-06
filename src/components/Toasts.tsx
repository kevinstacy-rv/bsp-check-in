"use client";

import { useCallback, useState } from "react";

export type Toast = {
  id: number;
  tone: "ok" | "bad";
  message: string;
  action?: { label: string; run: () => void };
};

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-2), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.tone === "ok" ? 3500 : 9000);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === "bad" ? "toast--bad" : ""}`}>
          <span className="toast__icon" aria-hidden>
            {t.tone === "ok" ? "✓" : "!"}
          </span>
          <span>{t.message}</span>
          {t.action && (
            <button
              className="rv-btn rv-btn--sm rv-btn--secondary"
              onClick={() => {
                dismiss(t.id);
                t.action!.run();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
