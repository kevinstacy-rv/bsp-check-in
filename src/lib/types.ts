export type Attendee = {
  /** HubSpot contact id, or a `tmp_` id for a walk-in that hasn't synced yet. */
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  /** ISO timestamp of check-in for the current event, or null. */
  checkedInAt: string | null;
  walkIn?: boolean;
  /** Badge-only corrections made at the desk. HubSpot keeps the original. */
  badgeName?: string;
  badgeCompany?: string;
};

export type Segment = {
  id: string;
  name: string;
  size: number | null;
  processingType: string;
};

export type WalkInInput = {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
};

export const fullName = (a: Pick<Attendee, "firstName" | "lastName">) =>
  [a.firstName, a.lastName].filter(Boolean).join(" ").trim();

/** What goes on the badge: the desk's correction if there is one, otherwise HubSpot's values. */
export const badgeContent = (a: Attendee) => ({
  name: a.badgeName?.trim() || fullName(a),
  company: a.badgeCompany !== undefined ? a.badgeCompany : a.company,
});

export const isCorrected = (a: Attendee) => a.badgeName !== undefined || a.badgeCompany !== undefined;

/** A saved event, as kept in shared storage. */
export type EventRecord = {
  id: string;
  name: string;
  segment: { id: string; name: string } | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  attendees: Attendee[];
  /** Set by "Submit attendance to HubSpot". */
  submission?: Submission;
};

export type Submission = {
  submittedAt: string;
  listId: string;
  listName: string;
  attendees: number;
  eventsLogged: number;
  eventError: string | null;
  /** Contacts whose timeline event is already logged, so resubmits skip them. */
  loggedContactIds?: string[];
};

export type EventSummary = {
  id: string;
  name: string;
  segmentName: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  total: number;
  checkedIn: number;
  walkIns: number;
  corrections: number;
  submittedAt: string | null;
};

export function summarizeEvent(e: EventRecord): EventSummary {
  return {
    id: e.id,
    name: e.name,
    segmentName: e.segment?.name ?? null,
    startedAt: e.startedAt,
    updatedAt: e.updatedAt,
    finishedAt: e.finishedAt,
    total: e.attendees.length,
    checkedIn: e.attendees.filter((a) => a.checkedInAt).length,
    walkIns: e.attendees.filter((a) => a.walkIn).length,
    corrections: e.attendees.filter(isCorrected).length,
    submittedAt: e.submission?.submittedAt ?? null,
  };
}

/** What the paired phone shows. */
export type PreviewPayload =
  | { kind: "idle"; eventName: string }
  | {
      kind: "badge" | "printing";
      eventName: string;
      name: string;
      company: string;
      widthMm: number;
      heightMm: number;
    };

export const PREVIEW_KEY_RE = /^[A-Za-z0-9_-]{22,64}$/;
export const EVENT_ID_RE = /^[a-z0-9]{8,40}$/;

/** Brother DK label rolls the QL-800 takes. Sizes are as the badge reads (landscape). */
export const LABEL_SIZES = {
  "dk-1234": { name: "DK-1234 name badge · 86 × 60 mm", widthMm: 86, heightMm: 60, paper: "60mm x 86mm" },
  "dk-1202": { name: "DK-1202 shipping label · 100 × 62 mm", widthMm: 100, heightMm: 62, paper: "62mm x 100mm" },
  "dk-2205": { name: "DK-2205 continuous 62 mm · cut to length", widthMm: 100, heightMm: 62, continuous: true, paper: "62mm" },
  "dk-1201": { name: "DK-1201 address label · 90 × 29 mm", widthMm: 90, heightMm: 29, paper: "29mm x 90mm" },
  custom: { name: "Custom size", widthMm: 100, heightMm: 62, paper: "your roll's size" },
} as const;

export type LabelSizeId = keyof typeof LABEL_SIZES;

export type PrinterSettings = {
  label: LabelSizeId;
  /** Used for "custom", and as the cut length of continuous rolls. */
  widthMm: number;
  heightMm: number;
  /** Nudges in millimetres (positive = right / down). */
  offsetXMm: number;
  offsetYMm: number;
  /** The badge prints sideways on the roll; flip it if it comes out upside down. */
  flip: boolean;
};

export const DEFAULT_PRINTER: PrinterSettings = {
  label: "dk-1234",
  widthMm: 86,
  heightMm: 60,
  offsetXMm: 0,
  offsetYMm: 0,
  flip: false,
};

/** The badge's printed size for the chosen roll. */
export function labelSizeMm(p: PrinterSettings): { widthMm: number; heightMm: number } {
  const preset = LABEL_SIZES[p.label] ?? LABEL_SIZES["dk-1234"];
  if (p.label === "custom") return { widthMm: p.widthMm, heightMm: p.heightMm };
  if ("continuous" in preset) return { widthMm: p.widthMm, heightMm: preset.heightMm };
  return { widthMm: preset.widthMm, heightMm: preset.heightMm };
}
