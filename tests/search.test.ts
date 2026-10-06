import { describe, expect, it } from "vitest";
import { searchAttendees } from "../src/lib/search";
import type { Attendee } from "../src/lib/types";

const a = (id: string, firstName: string, lastName: string, company = "", email = ""): Attendee => ({
  id,
  firstName,
  lastName,
  company,
  email,
  checkedInAt: null,
});

const roster = [
  a("1", "Kevin", "Stacy", "Renewed Vision", "kevin@renewedvision.com"),
  a("2", "José", "Álvarez", "Grace Church"),
  a("3", "Stacy", "Kim", "Vision Church"),
  a("4", "Mary-Kate", "O'Neil"),
];

describe("searchAttendees", () => {
  it("lists everyone by last name when empty", () => {
    expect(searchAttendees(roster, "").map((x) => x.id)).toEqual(["2", "3", "4", "1"]);
  });
  it("matches name prefixes in any order", () => {
    expect(searchAttendees(roster, "stacy kev").map((x) => x.id)).toEqual(["1"]);
  });
  it("ignores accents", () => {
    expect(searchAttendees(roster, "jose alv").map((x) => x.id)).toEqual(["2"]);
  });
  it("ranks name matches above organization matches", () => {
    expect(searchAttendees(roster, "kim").map((x) => x.id)).toEqual(["3"]);
    expect(searchAttendees(roster, "renewed").map((x) => x.id)).toEqual(["1"]);
    expect(searchAttendees(roster, "stacy").map((x) => x.id)).toEqual(["3", "1"]);
  });
  it("handles hyphens and apostrophes", () => {
    expect(searchAttendees(roster, "kate").map((x) => x.id)).toEqual(["4"]);
    expect(searchAttendees(roster, "o'neil").map((x) => x.id)).toEqual(["4"]);
    expect(searchAttendees(roster, "neil").map((x) => x.id)).toEqual(["4"]);
  });
});
