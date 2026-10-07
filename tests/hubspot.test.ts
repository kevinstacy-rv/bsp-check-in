import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { method: string; path: string; body: unknown };
let calls: Call[] = [];
let routes: Record<string, (body: any, url: URL) => { status?: number; json?: unknown }> = {};

beforeEach(() => {
  vi.resetModules();
  process.env.HUBSPOT_TOKEN = "test";
  calls = [];
  routes = {};
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const key = `${method} ${url.pathname}`;
    const handler = routes[key] ?? Object.entries(routes).find(([k]) => new RegExp(`^${k}$`).test(key))?.[1];
    const res = handler ? handler(body, url) : { status: 404, json: { message: "not found" } };
    return new Response(res.status === 204 ? null : JSON.stringify(res.json ?? {}), { status: res.status ?? 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());


describe("getSegmentAttendees", () => {
  it("pages memberships, reads contacts and falls back to the associated company", async () => {
    routes["GET /crm/v3/lists/42/memberships"] = (_b, url) =>
      url.searchParams.get("after")
        ? { json: { results: [{ recordId: "3" }] } }
        : { json: { results: [{ recordId: "1" }, { recordId: "2" }], paging: { next: { after: "x" } } } };
    routes["POST /crm/v3/objects/contacts/batch/read"] = (body) => ({
      json: {
        results: body.inputs.map(({ id }: { id: string }) => ({
          id,
          properties: {
            firstname: { "1": "Kevin", "2": "Ana", "3": "Marcus" }[id],
            lastname: "X",
            company: id === "1" ? "Renewed Vision" : "",
          },
        })),
      },
    });
    routes["POST /crm/v4/associations/contacts/companies/batch/read"] = () => ({
      json: { results: [{ from: { id: "2" }, to: [{ toObjectId: 900 }] }] },
    });
    routes["POST /crm/v3/objects/companies/batch/read"] = () => ({
      json: { results: [{ id: "900", properties: { name: "Hillsong" } }] },
    });

    const { getSegmentAttendees } = await import("../src/lib/hubspot");
    const people = await getSegmentAttendees("42");
    expect(people.map((p) => [p.id, p.company, p.checkedInAt])).toEqual([
      ["1", "Renewed Vision", null],
      ["2", "Hillsong", null],
      ["3", "", null],
    ]);
    const read = calls.find((c) => c.path.endsWith("/contacts/batch/read"))!.body as any;
    expect(read.properties).toEqual(["firstname", "lastname", "company", "email"]);
  });
});

describe("createWalkIn", () => {
  it("uses an existing contact found by email and leaves it unchanged", async () => {
    routes["POST /crm/v3/objects/contacts/search"] = () => ({ json: { results: [{ id: "55" }] } });
    routes["PUT /crm/v3/lists/42/memberships/add"] = () => ({ status: 400, json: { message: "dynamic list" } });

    const { createWalkIn } = await import("../src/lib/hubspot");
    const res = await createWalkIn({ firstName: "kev", lastName: "s", company: "RV", email: "Kevin@Example.com " }, "42");
    expect(res).toEqual({ id: "55", existing: true });
    const search = calls.find((c) => c.path.endsWith("/search"))!.body as any;
    expect(search.filterGroups[0].filters[0].value).toBe("kevin@example.com");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("creates a new contact when there's no email", async () => {
    routes["POST /crm/v3/objects/contacts"] = () => ({ status: 201, json: { id: "77" } });
    const { createWalkIn } = await import("../src/lib/hubspot");
    const res = await createWalkIn({ firstName: "Ana", lastName: "Li", company: "", email: "" }, null);
    expect(res).toEqual({ id: "77", existing: false });
    const create = calls.find((c) => c.path === "/crm/v3/objects/contacts")!.body as any;
    expect(create.properties).toEqual({ firstname: "Ana", lastname: "Li" });
  });
});

describe("submitAttendance", () => {
  const people = [
    { contactId: "1", checkedInAt: "2026-10-06T15:00:00.000Z" },
    { contactId: "2", checkedInAt: "2026-10-06T15:05:00.000Z", walkIn: true, badgeName: "Kev", badgeCompany: "RV" },
  ];

  it("creates the segment, syncs membership and logs one timeline event per attendee", async () => {
    routes["POST /crm/v3/lists/search"] = () => ({ json: { lists: [], hasMore: false } });
    routes["POST /crm/v3/lists"] = (body) => ({ json: { list: { listId: 900, name: body.name } } });
    routes["GET /crm/v3/lists/900/memberships"] = () => ({ json: { results: [{ recordId: "2" }, { recordId: "9" }] } });
    routes["PUT /crm/v3/lists/900/memberships/(add|remove)"] = () => ({ json: {} });
    routes["GET /events/v3/event-definitions/event_check_in"] = () => ({ status: 404, json: {} });
    routes["POST /events/v3/event-definitions"] = (body) => ({ json: { fullyQualifiedName: `pe1_${body.name}` } });
    routes["POST /events/v3/send/batch"] = () => ({ status: 204 });

    const { submitAttendance } = await import("../src/lib/hubspot");
    const res = await submitAttendance("BSP 2026", people);

    expect(res).toEqual({
      list: { id: "900", name: "BSP 2026 – Attended" },
      added: 1,
      removed: 1,
      eventsLogged: 2,
      eventError: null,
      loggedContactIds: ["1", "2"],
    });
    expect(calls.find((c) => c.path === "/crm/v3/lists")!.body).toMatchObject({ processingType: "MANUAL", objectTypeId: "0-1" });
    expect(calls.find((c) => c.path.endsWith("/memberships/add"))!.body).toEqual(["1"]);
    expect(calls.find((c) => c.path.endsWith("/memberships/remove"))!.body).toEqual(["9"]);
    const inputs = (calls.find((c) => c.path === "/events/v3/send/batch")!.body as any).inputs;
    expect(inputs[0]).toMatchObject({
      eventName: "pe1_event_check_in",
      objectId: "1",
      occurredAt: "2026-10-06T15:00:00.000Z",
      properties: { event_name: "BSP 2026", walk_in: "No" },
    });
    expect(inputs[1].properties).toEqual({ event_name: "BSP 2026", walk_in: "Yes", badge_name: "Kev", badge_company: "RV" });
  });

  it("reuses the segment and only logs attendees not logged before", async () => {
    routes["POST /crm/v3/lists/search"] = () => ({
      json: { lists: [{ listId: 900, name: "BSP 2026 – Attended", objectTypeId: "0-1", processingType: "MANUAL" }] },
    });
    routes["GET /crm/v3/lists/900/memberships"] = () => ({ json: { results: [{ recordId: "1" }, { recordId: "2" }] } });
    routes["PUT /crm/v3/lists/900/memberships/(add|remove)"] = () => ({ json: {} });
    routes["GET /events/v3/event-definitions/event_check_in"] = () => ({ json: { fullyQualifiedName: "pe1_event_check_in" } });
    routes["POST /events/v3/send/batch"] = () => ({ status: 204 });

    const { submitAttendance } = await import("../src/lib/hubspot");
    const first = await submitAttendance("BSP 2026", people.slice(0, 1));
    const second = await submitAttendance("BSP 2026", people, new Set(first.loggedContactIds));
    expect(calls.some((c) => c.path === "/crm/v3/lists")).toBe(false);
    // The second submit only logs the newly checked-in contact.
    const batches = calls.filter((c) => c.path === "/events/v3/send/batch").map((c) => (c.body as any).inputs);
    expect(batches.map((b) => b.map((i: any) => i.objectId))).toEqual([["1"], ["2"]]);
    expect(second.loggedContactIds.sort()).toEqual(["1", "2"]);
    expect(batches[0][0].uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("still updates the segment when the account can't use Custom Events", async () => {
    routes["POST /crm/v3/lists/search"] = () => ({ json: { lists: [] } });
    routes["POST /crm/v3/lists"] = (body) => ({ json: { list: { listId: 900, name: body.name } } });
    routes["GET /crm/v3/lists/900/memberships"] = () => ({ json: { results: [] } });
    routes["PUT /crm/v3/lists/900/memberships/add"] = () => ({ json: {} });
    routes["GET /events/v3/event-definitions/event_check_in"] = () => ({ status: 403, json: {} });

    const { submitAttendance } = await import("../src/lib/hubspot");
    const res = await submitAttendance("BSP 2026", people);
    expect(res.added).toBe(2);
    expect(res.eventsLogged).toBe(0);
    expect(res.eventError).toMatch(/Custom Events/);
  });
});

describe("during the event", () => {
  it("never writes check-in properties to contacts", async () => {
    const mod = await import("../src/lib/hubspot");
    expect("setCheckIn" in mod).toBe(false);
    expect("ensureCheckInProperties" in mod).toBe(false);
  });
});
