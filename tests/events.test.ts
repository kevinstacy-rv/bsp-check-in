import { describe, expect, it } from "vitest";
import { badgeContent, summarizeEvent, type Attendee } from "../src/lib/types";

const a = (over: Partial<Attendee>): Attendee => ({
  id: "1",
  firstName: "Kevin",
  lastName: "Stacy",
  company: "Renewed Vision",
  email: "",
  checkedInAt: null,
  ...over,
});

describe("badgeContent", () => {
  it("prefers the desk's correction, including a deliberately blank organization", () => {
    expect(badgeContent(a({}))).toEqual({ name: "Kevin Stacy", company: "Renewed Vision" });
    expect(badgeContent(a({ badgeName: "Kev", badgeCompany: "" }))).toEqual({ name: "Kev", company: "" });
  });
});

describe("summarizeEvent", () => {
  it("counts check-ins, walk-ins and corrections", () => {
    const s = summarizeEvent({
      id: "abcdefgh",
      name: "BSP",
      segment: { id: "42", name: "Registrants" },
      startedAt: "2026-10-06T15:00:00Z",
      updatedAt: "2026-10-06T18:00:00Z",
      finishedAt: null,
      attendees: [
        a({ id: "1", checkedInAt: "2026-10-06T15:05:00Z" }),
        a({ id: "2", walkIn: true, checkedInAt: "2026-10-06T15:10:00Z", badgeName: "Ana" }),
        a({ id: "3" }),
      ],
    });
    expect(s).toMatchObject({ total: 3, checkedIn: 2, walkIns: 1, corrections: 1, segmentName: "Registrants" });
  });
});
