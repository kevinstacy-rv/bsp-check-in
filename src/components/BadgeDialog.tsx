"use client";

import { useEffect, useRef, useState } from "react";
import { badgeContent, fullName, type Attendee } from "@/lib/types";

/** Fix the name or organization on one attendee's badge. HubSpot isn't changed. */
export function BadgeDialog({
  attendee,
  onClose,
  onSave,
  onDraft,
}: {
  attendee: Attendee | null;
  onClose: () => void;
  onSave: (badge: { name: string; company: string }, print: boolean) => void;
  onDraft: (badge: { name: string; company: string } | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ name: "", company: "" });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (attendee && !dialog.open) {
      setForm(badgeContent(attendee));
      dialog.showModal();
    } else if (!attendee && dialog.open) dialog.close();
  }, [attendee]);

  useEffect(() => {
    onDraft(attendee ? form : null);
  }, [attendee, form, onDraft]);

  const set = (key: "name" | "company") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="badge-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          onSave(form, submitter?.value === "print");
        }}
      >
        <div>
          <div className="eyebrow subtle">Badge only</div>
          <h2 id="badge-title" className="h3">
            Edit badge
          </h2>
        </div>
        <label className="field">
          <span>Name on badge</span>
          <input className="input" autoFocus value={form.name} onChange={set("name")} />
        </label>
        <label className="field">
          <span>Organization on badge</span>
          <input className="input" value={form.company} onChange={set("company")} />
        </label>
        {attendee && (
          <p className="tiny subtle" style={{ margin: 0 }}>
            HubSpot has <strong>{fullName(attendee) || "no name"}</strong>
            {attendee.company ? (
              <>
                {" "}
                at <strong>{attendee.company}</strong>
              </>
            ) : null}
            . Changes here only affect this event&apos;s badge and are noted in the event record.
          </p>
        )}
        <div className="actions">
          <button type="button" className="rv-btn rv-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" value="save" className="rv-btn rv-btn--outline">
            Save
          </button>
          <button type="submit" value="print" className="rv-btn rv-btn--primary" disabled={!form.name.trim()}>
            Save and print
          </button>
        </div>
      </form>
    </dialog>
  );
}
