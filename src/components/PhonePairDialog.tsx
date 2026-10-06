"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { checkPhone, ensurePreviewKey, forgetLastPreview, newPreviewKey, previewUrl, showOnPhone } from "@/lib/preview";
import { setState, useStore } from "@/lib/store";

/** QR code + link that pairs a phone with this station's badge preview. */
export function PhonePairDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const previewKey = useStore((s) => s.previewKey);
  const seenAt = useStore((s) => s.phoneSeenAt);
  const error = useStore((s) => s.previewError);
  const [svg, setSvg] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      ensurePreviewKey();
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const url = previewKey && typeof location !== "undefined" ? previewUrl(previewKey) : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#09090b", light: "#fafafa" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);

  // While the dialog is open, watch for the phone to connect.
  useEffect(() => {
    if (!open) return;
    forgetLastPreview();
    showOnPhone(null);
    void checkPhone();
    const t = setInterval(() => {
      setNow(Date.now());
      void checkPhone();
    }, 2000);
    return () => clearInterval(t);
  }, [open, previewKey]);

  const connected = seenAt != null && now - seenAt < 10000;

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="pair-title">
      <div className="pair">
        <div>
          <div className="eyebrow subtle">Attendee preview</div>
          <h2 id="pair-title" className="h3">
            Show badges on a phone
          </h2>
          <p className="muted tiny" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>
            Scan this with the phone or tablet facing attendees. Whoever you select here appears on it, so they can
            check their name and organization before you print.
          </p>
        </div>

        <div className="pair__qr">
          {svg ? <div className="pair__code" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="pair__code" />}
          <div className="pair__side">
            <div className="row-inline" style={{ gap: 8 }}>
              <span className={`dot ${connected ? "dot--ok" : ""}`} />
              <strong>{connected ? "Phone connected" : "Waiting for a phone…"}</strong>
            </div>
            {error && <p className="error tiny">{error}</p>}
            <code className="code" style={{ whiteSpace: "normal", wordBreak: "break-all" }}>
              {url}
            </code>
            <div className="row-inline">
              <button
                className="rv-btn rv-btn--sm rv-btn--outline"
                onClick={() => navigator.clipboard.writeText(url).catch(() => undefined)}
              >
                Copy link
              </button>
              <button
                className="rv-btn rv-btn--sm rv-btn--ghost"
                onClick={() => {
                  if (confirm("Make a new link? Any phone using the old one stops updating.")) {
                    setState({ previewKey: newPreviewKey(), phoneSeenAt: null });
                  }
                }}
              >
                New link
              </button>
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="rv-btn rv-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
