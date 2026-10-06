import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());

const person = (id: string) => ({ id, firstName: id, lastName: "", company: "", email: "", checkedInAt: null });

async function fresh() {
  const store = await import("../src/lib/store");
  store.setState({ eventName: "BSP", roster: [person("1"), person("2")], outbox: [] });
  return store;
}

describe("offline queue", () => {
  it("queues a check-in, and an undo before sync cancels it outright", async () => {
    const s = await fresh();
    s.checkIn("1");
    expect(s.getState().outbox.map((o) => o.kind)).toEqual(["checkin"]);
    s.undoCheckIn("1");
    expect(s.getState().outbox).toEqual([]);
    expect(s.getState().roster[0].checkedInAt).toBeNull();
  });

  it("sends an undo when the check-in already synced", async () => {
    const s = await fresh();
    s.setState({ roster: [{ ...person("1"), checkedInAt: "2026-10-06T15:00:00Z" }] });
    s.undoCheckIn("1");
    expect(s.getState().outbox.map((o) => o.kind)).toEqual(["undo"]);
  });

  it("swaps a walk-in's temporary id for the HubSpot id, merging duplicates", async () => {
    const s = await fresh();
    const w = s.addWalkIn({ firstName: "Ana", lastName: "Li", company: "", email: "" });
    s.undoCheckIn(w.id);
    const op = s.getState().outbox[0];
    expect(op.kind === "walkin" && op.at).toBeNull();

    s.checkIn(w.id);
    s.resolveWalkIn(w.id, "2"); // email matched contact 2, already on the roster
    const roster = s.getState().roster;
    expect(roster.map((a) => a.id)).toEqual(["1", "2"]);
    expect(roster[1].checkedInAt).not.toBeNull();
  });

  it("keeps unsynced check-ins and walk-ins when re-importing", async () => {
    const s = await fresh();
    s.checkIn("1");
    s.addWalkIn({ firstName: "Ana", lastName: "", company: "", email: "" });
    s.importRoster([person("1"), person("2"), person("3")]);
    const roster = s.getState().roster;
    expect(roster.map((a) => a.id).slice(0, 3)).toEqual(["1", "2", "3"]);
    expect(roster[0].checkedInAt).not.toBeNull();
    expect(roster[3].walkIn).toBe(true);
  });
});

describe("badge corrections", () => {
  it("stores only what differs from HubSpot and survives a re-import", async () => {
    const s = await fresh();
    s.setState({ roster: [{ ...person("1"), firstName: "Kevin", lastName: "Stacy", company: "Renewed Vision" }] });
    s.setBadge("1", { name: "Kev Stacy", company: "Renewed Vision" });
    let a = s.getState().roster[0];
    expect(a.badgeName).toBe("Kev Stacy");
    expect(a.badgeCompany).toBeUndefined();

    s.importRoster([{ ...person("1"), firstName: "Kevin", lastName: "Stacy", company: "Renewed Vision" }]);
    a = s.getState().roster[0];
    expect(a.badgeName).toBe("Kev Stacy");

    // Typing the HubSpot values back clears the correction.
    s.setBadge("1", { name: "Kevin Stacy", company: "Renewed Vision" });
    a = s.getState().roster[0];
    expect(a.badgeName).toBeUndefined();
  });
});
