"use client";

import { useEffect, useRef, useState } from "react";
import { renderLabel, type LabelContent } from "@/lib/label";
import type { PrinterSettings } from "@/lib/types";

/** Shows the exact 1-bit image the printer will burn. */
export function LabelPreview({ content, settings }: { content: LabelContent; settings: PrinterSettings }) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderLabel(content, { ...settings, rotate: false })
      .then(({ canvas }) => {
        if (cancelled || !holder.current) return;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Badge preview for ${content.name}`);
        holder.current.replaceChildren(canvas);
        setError(null);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [content, settings]);

  return (
    <div className="preview">
      <div ref={holder} style={{ width: "100%", display: "grid", placeItems: "center" }} />
      {error && <p className="error">{error}</p>}
    </div>
  );
}
