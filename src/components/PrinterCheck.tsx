"use client";

// Browsers can't see which printer drivers are installed, so we verify the
// printer the only reliable way: print a test badge and ask whether it came
// out. Until someone confirms it did, the setup steps (driver download first)
// stay open and the check-in screen shows a reminder.

import { useEffect, useState } from "react";
import { printLabel } from "@/lib/print";
import { setState, useStore } from "@/lib/store";
import type { LabelContent } from "@/lib/label";

export const QL800_DRIVER_URL = "https://support.brother.com/g/b/downloadtop.aspx?c=us&lang=en&prod=lpql800eus";

type Step = "idle" | "printing" | "asking" | "failed";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

const isMac = () => typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

export function PrinterCheck({
  sample,
  onToast,
}: {
  sample: LabelContent;
  onToast: (tone: "ok" | "bad", message: string) => void;
}) {
  const verifiedAt = useStore((s) => s.printerVerifiedAt);
  const [step, setStep] = useState<Step>("idle");
  const [dialogShown, setDialogShown] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [origin, setOrigin] = useState("https://your-check-in-site");
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setOrigin(location.origin);
    setMac(isMac());
  }, []);

  // A separate Chrome profile keeps kiosk printing off everyday browsing.
  const launchCommand = `open -na "Google Chrome" --args --kiosk-printing --user-data-dir="$HOME/Library/Application Support/CheckInChrome" ${origin}`;
  const stepsOpen = !verifiedAt || showSteps || step === "failed";

  async function test() {
    setStep("printing");
    try {
      const result = await printLabel(sample);
      setDialogShown(result.dialogShown);
      setStep("asking");
    } catch (e) {
      onToast("bad", (e as Error).message);
      setStep("failed");
    }
  }

  function confirm(printed: boolean) {
    if (printed) {
      setState({ printerVerifiedAt: new Date().toISOString() });
      setStep("idle");
      setShowSteps(false);
      onToast("ok", "Printer confirmed. You're ready to check people in.");
    } else {
      setState({ printerVerifiedAt: null });
      setStep("failed");
    }
  }

  return (
    <div className="card printer-check">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <div className="row-inline" style={{ gap: 10 }}>
          <span className={`dot ${verifiedAt ? "dot--ok" : "dot--warn"}`} />
          <span className="h5">{verifiedAt ? "Printer working" : "Printer not set up on this computer"}</span>
        </div>
        {verifiedAt && step === "idle" && (
          <span className="tiny subtle">Confirmed {when(verifiedAt)}</span>
        )}
      </div>

      {!mac && (
        <p className="tiny" style={{ margin: 0, color: "var(--accent-secondary)" }}>
          This doesn&apos;t look like a Mac. These steps are for macOS; on Windows, install the Windows driver from the
          same download page.
        </p>
      )}

      {step === "asking" ? (
        <div className="check-question">
          <div style={{ fontWeight: 600 }}>Did the test badge come out of the printer?</div>
          {dialogShown && (
            <p className="tiny muted" style={{ margin: 0 }}>
              Chrome showed its print dialog, so this window isn&apos;t in kiosk mode yet. That&apos;s fine for this
              test. Use the command below for one-click printing at the event.
            </p>
          )}
          <div className="row-inline">
            <button className="rv-btn rv-btn--primary" onClick={() => confirm(true)}>
              Yes, it printed
            </button>
            <button className="rv-btn rv-btn--outline" onClick={() => confirm(false)}>
              No
            </button>
          </div>
        </div>
      ) : (
        <div className="row-inline">
          <button className="rv-btn rv-btn--primary" onClick={test} disabled={step === "printing"}>
            {step === "printing" && <span className="spinner" />}
            {verifiedAt ? "Print another test badge" : "Print a test badge"}
          </button>
          {!verifiedAt && (
            <a className="rv-btn rv-btn--outline" href={QL800_DRIVER_URL} target="_blank" rel="noreferrer">
              Download QL-800 driver
            </a>
          )}
          {verifiedAt && !stepsOpen && (
            <button className="rv-btn rv-btn--ghost" onClick={() => setShowSteps(true)}>
              Show setup steps
            </button>
          )}
        </div>
      )}

      {step === "failed" && (
        <div className="check-help">
          <div style={{ fontWeight: 600 }}>Let&apos;s get it printing</div>
          <ul className="tiny muted">
            <li>
              <strong>Driver installed?</strong> Download and install the QL-800 printer driver for macOS, then add the
              printer in System Settings → Printers &amp; Scanners.{" "}
              <a href={QL800_DRIVER_URL} target="_blank" rel="noreferrer">
                Download the driver
              </a>
            </li>
            <li>
              <strong>Editor Lite off?</strong> If the green Editor Lite light is on, the Mac sees the printer as a USB
              drive. Hold the button until the light goes out.
            </li>
            <li>
              <strong>Default printer?</strong> In Printers &amp; Scanners, set the QL-800 as the default printer.
            </li>
            <li>
              <strong>Powered, cabled and loaded?</strong> Check the USB cable, the power light and that the label roll
              is seated with the cover closed.
            </li>
            <li>
              <strong>Wrong size or shrunk?</strong> Open the window without <code>--kiosk-printing</code>, print from
              the dialog with the QL-800, your roll&apos;s paper size, margins None and scale 100%, then relaunch.
            </li>
          </ul>
        </div>
      )}

      {stepsOpen && step !== "failed" && (
        <ol className="tiny muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <a href={QL800_DRIVER_URL} target="_blank" rel="noreferrer">
              Download the QL-800 driver
            </a>{" "}
            for macOS, install it, then add the printer in System Settings → Printers &amp; Scanners and make it the
            default.
          </li>
          <li>Turn off Editor Lite: hold its button on the printer until the green light goes out.</li>
          <li>Open Terminal and run the command below. It opens this site in its own Chrome window that prints without asking.</li>
          <li>In that window, sign in and print a test badge.</li>
        </ol>
      )}

      {stepsOpen && (
        <div className="row-inline" style={{ flexWrap: "nowrap" }}>
          <code className="code">{launchCommand}</code>
          <button
            className="rv-btn rv-btn--sm rv-btn--outline"
            onClick={() =>
              navigator.clipboard
                .writeText(launchCommand)
                .then(() => onToast("ok", "Command copied"))
                .catch(() => onToast("bad", "Couldn't copy. Select the command and copy it."))
            }
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
