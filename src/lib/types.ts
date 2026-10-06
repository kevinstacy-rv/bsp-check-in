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

export type PrinterSettings = {
  dpi: 203 | 300;
  /** Turn the label 90° for rolls that feed the 1.5" edge first. */
  rotate: boolean;
  /** Nudges in dots (positive = right / down). */
  offsetX: number;
  offsetY: number;
  /** Relative darkness, −30..30. 0 uses the printer's own setting. */
  darkness: number;
  /** Browser Print device uid; null uses the default printer. */
  printerUid: string | null;
};

export const DEFAULT_PRINTER: PrinterSettings = {
  dpi: 203,
  rotate: false,
  offsetX: 0,
  offsetY: 0,
  darkness: 0,
  printerUid: null,
};
