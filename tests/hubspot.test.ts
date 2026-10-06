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

const propsOk = () => {
  routes["GET /crm/v3/properties/contacts/[a-z_]+"] = () => ({ json: {} });
};

describe("getSegmentAttendees", () => {
  it("pages memberships, reads contacts and falls back to the associated company", async () => {
    propsOk();
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
            event_check_in_name: id === "2" ? "BSP" : id === "3" ? "Old event" : null,
            event_check_in_at: id !== "1" ? "2026-10-06T15:00:00.000Z" : null,
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
    const people = await getSegmentAttendees("42", "BSP");
    expect(people.map((p) => [p.id, p.company, p.checkedInAt])).toEqual([
      ["1", "Renewed Vision", null],
      ["2", "Hillsong", "2026-10-06T15:00:00.000Z"],
      ["3", "", null], // checked in to a different event
    ]);
  });
});

describe("setCheckIn", () => {
  it("creates missing properties once, then patches the contact", async () => {
    let created = 0;
    routes["GET /crm/v3/properties/contacts/[a-z_]+"] = () => ({ status: 404, json: {} });
    routes["POST /crm/v3/properties/contacts"] = () => {
      created++;
      return { status: 201, json: {} };
    };
    routes["PATCH /crm/v3/objects/contacts/7"] = () => ({ json: {} });

    const { setCheckIn } = await import("../src/lib/hubspot");
    await setCheckIn("7", "BSP", "2026-10-06T15:00:00.000Z");
    await setCheckIn("7", "BSP", null);
    expect(created).toBe(2);
    const patches = calls.filter((c) => c.method === "PATCH").map((c) => c.body);
    expect(patches).toEqual([
      { properties: { event_check_in_name: "BSP", event_check_in_at: "2026-10-06T15:00:00.000Z" } },
      { properties: { event_check_in_name: "", event_check_in_at: "" } },
    ]);
  });
});

describe("createWalkIn", () => {
  it("updates an existing contact found by email without renaming it", async () => {
    propsOk();
    routes["POST /crm/v3/objects/contacts/search"] = () => ({ json: { results: [{ id: "55" }] } });
    routes["PATCH /crm/v3/objects/contacts/55"] = () => ({ json: {} });
    routes["PUT /crm/v3/lists/42/memberships/add"] = () => ({ status: 400, json: { message: "dynamic list" } });

    const { createWalkIn } = await import("../src/lib/hubspot");
    const res = await createWalkIn(
      { firstName: "kev", lastName: "s", company: "RV", email: "Kevin@Example.com " },
      "BSP",
      "2026-10-06T15:00:00.000Z",
      "42",
    );
    expect(res).toEqual({ id: "55", existing: true });
    const search = calls.find((c) => c.path.endsWith("/search"))!.body as any;
    expect(search.filterGroups[0].filters[0].value).toBe("kevin@example.com");
    const patch = calls.find((c) => c.method === "PATCH")!.body as any;
    expect(patch.properties.firstname).toBeUndefined();
    expect(patch.properties.company).toBe("RV");
  });

  it("creates a new contact when there's no email", async () => {
    propsOk();
    routes["POST /crm/v3/objects/contacts"] = () => ({ status: 201, json: { id: "77" } });
    const { createWalkIn } = await import("../src/lib/hubspot");
    const res = await createWalkIn({ firstName: "Ana", lastName: "Li", company: "", email: "" }, "BSP", null, null);
    expect(res).toEqual({ id: "77", existing: false });
    const create = calls.find((c) => c.path === "/crm/v3/objects/contacts")!.body as any;
    expect(create.properties).toEqual({ firstname: "Ana", lastname: "Li" });
  });
});
