"use client";

import { useEffect, useRef, useState } from "react";
import type { WalkInInput } from "@/lib/types";

const blank: WalkInInput = { firstName: "", lastName: "", company: "", email: "" };

export function WalkInDialog({
  open,
  initialName,
  onClose,
  onSubmit,
  onDraft,
}: {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onSubmit: (input: WalkInInput) => void;
  /** Called as staff type, so the attendee can check spelling on the paired phone. */
  onDraft?: (input: WalkInInput | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<WalkInInput>(blank);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Start from whatever staff already typed in the search box.
      const [firstName = "", ...rest] = initialName.trim().split(/\s+/);
      setForm({ ...blank, firstName, lastName: rest.join(" ") });
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialName]);

  useEffect(() => {
    onDraft?.(open ? form : null);
  }, [open, form, onDraft]);

  const set = (key: keyof WalkInInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="walkin-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.firstName.trim()) return;
          onSubmit(form);
        }}
      >
        <div>
          <div className="eyebrow subtle">Not on the list</div>
          <h2 id="walkin-title" className="h3">
            Add a walk-in
          </h2>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>First name</span>
            <input className="input" required autoFocus value={form.firstName} onChange={set("firstName")} />
          </label>
          <label className="field">
            <span>Last name</span>
            <input className="input" value={form.lastName} onChange={set("lastName")} />
          </label>
        </div>
        <label className="field">
          <span>Organization</span>
          <input className="input" value={form.company} onChange={set("company")} />
        </label>
        <label className="field">
          <span>Email (optional)</span>
          <input className="input" type="email" value={form.email} onChange={set("email")} />
        </label>
        <p className="tiny subtle" style={{ margin: 0 }}>
          We&apos;ll add them to HubSpot and check them in. If the email already belongs to a contact, we&apos;ll
          update that contact instead of making a duplicate.
        </p>
        <div className="actions">
          <button type="button" className="rv-btn rv-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="rv-btn rv-btn--primary" disabled={!form.firstName.trim()}>
            Check in and print
          </button>
        </div>
      </form>
    </dialog>
  );
}
