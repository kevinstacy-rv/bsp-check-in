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

/** Brother DK label rolls the QL-800 takes. Sizes are as the badge reads (landscape). */
export const LABEL_SIZES = {
  "dk-1202": { name: "DK-1202 shipping label · 100 × 62 mm", widthMm: 100, heightMm: 62 },
  "dk-2205": { name: "DK-2205 continuous 62 mm · cut to length", widthMm: 100, heightMm: 62, continuous: true },
  "dk-1201": { name: "DK-1201 address label · 90 × 29 mm", widthMm: 90, heightMm: 29 },
  custom: { name: "Custom size", widthMm: 100, heightMm: 62 },
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
};

export const DEFAULT_PRINTER: PrinterSettings = {
  label: "dk-1202",
  widthMm: 100,
  heightMm: 62,
  offsetXMm: 0,
  offsetYMm: 0,
};

/** The badge's printed size for the chosen roll. */
export function labelSizeMm(p: PrinterSettings): { widthMm: number; heightMm: number } {
  const preset = LABEL_SIZES[p.label] ?? LABEL_SIZES["dk-1202"];
  if (p.label === "custom") return { widthMm: p.widthMm, heightMm: p.heightMm };
  if ("continuous" in preset) return { widthMm: p.widthMm, heightMm: preset.heightMm };
  return { widthMm: preset.widthMm, heightMm: preset.heightMm };
}
