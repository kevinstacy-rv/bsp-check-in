import "server-only";
import { createHash } from "node:crypto";
import type { Attendee, Segment, WalkInInput } from "./types";

// HUBSPOT_API_BASE exists only for local testing against a stand-in API.
const BASE = process.env.HUBSPOT_API_BASE || "https://api.hubapi.com";
const CONTACT_OBJECT_TYPE = "0-1";

export const CHECKIN_EVENT_PROP = process.env.HUBSPOT_CHECKIN_EVENT_PROPERTY || "event_check_in_name";
export const CHECKIN_TIME_PROP = process.env.HUBSPOT_CHECKIN_TIME_PROPERTY || "event_check_in_at";

const CONTACT_PROPS = ["firstname", "lastname", "company", "email", CHECKIN_EVENT_PROP, CHECKIN_TIME_PROP];

export class HubSpotError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function hs<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new HubSpotError("HUBSPOT_TOKEN isn't set on the server.", 500);

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("Retry-After") ?? 1) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
    return hs<T>(path, init, attempt + 1);
  }
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new HubSpotError(
      "the access token was rejected or is missing a scope. Check HUBSPOT_TOKEN and the private app's scopes.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new HubSpotError(body?.message || `request failed (${res.status})`, res.status);
  }
  return body as T;
}

const chunk = <T,>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

// ---------------------------------------------------------------------------
// Segments (contact lists)

type ListSearchResponse = {
  lists: {
    listId: string | number;
    name: string;
    objectTypeId: string;
    processingType: string;
    additionalProperties?: Record<string, string | undefined>;
  }[];
  hasMore: boolean;
  offset: number;
};

export async function searchSegments(query: string): Promise<Segment[]> {
  const out: Segment[] = [];
  let offset = 0;
  // 5 pages × 100 is plenty to find the event segment; refine the search beyond that.
  for (let page = 0; page < 5; page++) {
    const res = await hs<ListSearchResponse>("/crm/v3/lists/search", {
      method: "POST",
      body: JSON.stringify({ query, offset, count: 100, additionalProperties: ["hs_list_size"] }),
    });
    for (const l of res.lists ?? []) {
      if (l.objectTypeId !== CONTACT_OBJECT_TYPE) continue;
      const size = l.additionalProperties?.hs_list_size;
      out.push({
        id: String(l.listId),
        name: l.name,
        size: size != null ? Number(size) : null,
        processingType: l.processingType,
      });
    }
    if (!res.hasMore) break;
    offset = res.offset;
  }
  return out;
}

type MembershipResponse = {
  results: ({ recordId: string } | string)[];
  paging?: { next?: { after: string } };
};

async function listMemberIds(listId: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: "250", ...(after ? { after } : {}) });
    const res = await hs<MembershipResponse>(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships?${qs}`);
    for (const r of res.results ?? []) ids.push(typeof r === "string" ? r : String(r.recordId));
    after = res.paging?.next?.after;
  } while (after);
  return ids;
}

type ContactRecord = { id: string; properties: Record<string, string | null | undefined> };

async function batchReadContacts(ids: string[]): Promise<ContactRecord[]> {
  const out: ContactRecord[] = [];
  for (const batch of chunk(ids, 100)) {
    const res = await hs<{ results: ContactRecord[] }>("/crm/v3/objects/contacts/batch/read", {
      method: "POST",
      body: JSON.stringify({ properties: CONTACT_PROPS, inputs: batch.map((id) => ({ id })) }),
    });
    out.push(...res.results);
  }
  return out;
}

/** Names of each contact's associated company, for contacts whose `company` text field is blank. */
async function associatedCompanyNames(contactIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!contactIds.length) return names;

  const contactToCompany = new Map<string, string>();
  for (const batch of chunk(contactIds, 100)) {
    const res = await hs<{ results: { from: { id: string }; to: { toObjectId: string | number }[] }[] }>(
      "/crm/v4/associations/contacts/companies/batch/read",
      { method: "POST", body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }) },
    );
    for (const r of res.results ?? []) {
      const first = r.to?.[0];
      if (first) contactToCompany.set(String(r.from.id), String(first.toObjectId));
    }
  }

  const companyIds = [...new Set(contactToCompany.values())];
  const companyName = new Map<string, string>();
  for (const batch of chunk(companyIds, 100)) {
    const res = await hs<{ results: ContactRecord[] }>("/crm/v3/objects/companies/batch/read", {
      method: "POST",
      body: JSON.stringify({ properties: ["name"], inputs: batch.map((id) => ({ id })) }),
    });
    for (const c of res.results) if (c.properties.name) companyName.set(c.id, c.properties.name);
  }

  for (const [contactId, companyId] of contactToCompany) {
    const name = companyName.get(companyId);
    if (name) names.set(contactId, name);
  }
  return names;
}

export async function getSegmentAttendees(listId: string, eventName: string): Promise<Attendee[]> {
  const ids = await listMemberIds(listId);
  const contacts = await batchReadContacts(ids);

  const missingCompany = contacts.filter((c) => !c.properties.company?.trim()).map((c) => c.id);
  // Company names are nice-to-have; don't fail the import over the association lookup.
  const fallback = await associatedCompanyNames(missingCompany).catch(() => new Map<string, string>());

  return contacts.map((c) => {
    const p = c.properties;
    const checkedInHere = eventName && p[CHECKIN_EVENT_PROP] === eventName && p[CHECKIN_TIME_PROP];
    return {
      id: c.id,
      firstName: p.firstname?.trim() ?? "",
      lastName: p.lastname?.trim() ?? "",
      company: p.company?.trim() || fallback.get(c.id) || "",
      email: p.email?.trim() ?? "",
      checkedInAt: checkedInHere ? new Date(p[CHECKIN_TIME_PROP]!).toISOString() : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Check-in properties

let propertiesReady: Promise<void> | null = null;

/** Creates the two check-in contact properties if this portal doesn't have them yet. */
export function ensureCheckInProperties(): Promise<void> {
  propertiesReady ??= (async () => {
    const wanted = [
      {
        name: CHECKIN_EVENT_PROP,
        label: "Event check-in: event",
        type: "string",
        fieldType: "text",
        description: "The last event this contact checked in at (set by the event check-in app).",
      },
      {
        name: CHECKIN_TIME_PROP,
        label: "Event check-in: time",
        type: "datetime",
        fieldType: "date",
        description: "When this contact last checked in at an event (set by the event check-in app).",
      },
    ];
    for (const prop of wanted) {
      try {
        await hs(`/crm/v3/properties/contacts/${prop.name}`);
      } catch (e) {
        if (!(e instanceof HubSpotError) || e.status !== 404) throw e;
        await hs("/crm/v3/properties/contacts", {
          method: "POST",
          body: JSON.stringify({ ...prop, groupName: "contactinformation" }),
        });
      }
    }
  })().catch((e) => {
    propertiesReady = null; // retry on the next call
    throw e;
  });
  return propertiesReady;
}

function checkInProperties(eventName: string, at: string | null) {
  return at
    ? { [CHECKIN_EVENT_PROP]: eventName, [CHECKIN_TIME_PROP]: new Date(at).toISOString() }
    : { [CHECKIN_EVENT_PROP]: "", [CHECKIN_TIME_PROP]: "" };
}

/**
 * Records a check-in (or, with `at: null`, clears it) on the contact's two
 * quick-filter properties. Fully reversible: the permanent attendance record
 * (segment + Custom Events) is written only when staff submit the event.
 */
export async function setCheckIn(contactId: string, eventName: string, at: string | null): Promise<void> {
  await ensureCheckInProperties();
  await hs(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: checkInProperties(eventName, at) }),
  });
}

// ---------------------------------------------------------------------------
// Walk-ins

async function findContactByEmail(email: string): Promise<string | null> {
  const res = await hs<{ results: { id: string }[] }>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      limit: 1,
    }),
  });
  return res.results?.[0]?.id ?? null;
}

/**
 * Creates (or, when the email already exists, updates) the walk-in's contact,
 * records the check-in (unless `at` is null), and tries to add them to the event segment.
 */
export async function createWalkIn(
  input: WalkInInput,
  eventName: string,
  at: string | null,
  segmentId: string | null,
): Promise<{ id: string; existing: boolean }> {
  await ensureCheckInProperties();
  const email = input.email.trim().toLowerCase();
  const props: Record<string, string> = {
    ...(at ? checkInProperties(eventName, at) : {}),
    firstname: input.firstName.trim(),
    lastname: input.lastName.trim(),
    ...(input.company.trim() ? { company: input.company.trim() } : {}),
  };

  let id = email ? await findContactByEmail(email) : null;
  const existing = Boolean(id);
  if (id) {
    // Don't overwrite an existing contact's name; staff typed it in a hurry.
    const { firstname: _f, lastname: _l, ...rest } = props;
    await hs(`/crm/v3/objects/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ properties: rest }) });
  } else {
    const created = await hs<{ id: string }>("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({ properties: { ...props, ...(email ? { email } : {}) } }),
    });
    id = created.id;
  }

  if (segmentId) {
    // Only static (MANUAL/SNAPSHOT) segments accept direct adds. An active
    // segment rejects this, which is fine: the contact still carries the check-in.
    await hs(`/crm/v3/lists/${encodeURIComponent(segmentId)}/memberships/add`, {
      method: "PUT",
      body: JSON.stringify([id]),
    }).catch(() => undefined);
  }
  return { id: id!, existing };
}

// ---------------------------------------------------------------------------
// Submitting attendance (after the event)
//
// Creates a static segment of everyone who checked in and logs a
// "Checked in at event" Custom Event on each of their timelines. Events can't
// be edited or deleted in HubSpot, which is why this waits until staff submit.
// Resubmitting is safe: the segment is brought in line and occurrence ids are
// derived from contact + check-in time, so nobody is logged twice.
// Custom Events need an Enterprise hub and the analytics.behavioral_events.send
// and behavioral_events.event_definitions.read_write scopes.

export const CHECKIN_EVENT = {
  name: "event_check_in",
  label: "Checked in at event",
  description: "Logged by the event check-in app when staff submit an event's attendance.",
};

const EVENT_PROPERTIES = [
  { name: "event_name", label: "Event", type: "string", description: "The event name set in the check-in app." },
  { name: "walk_in", label: "Walk-in", type: "string", description: "Yes if they registered at the door." },
  { name: "badge_name", label: "Name on badge", type: "string", description: "Set only when staff corrected the badge." },
  {
    name: "badge_company",
    label: "Organization on badge",
    type: "string",
    description: "Set only when staff corrected the badge.",
  },
];

let definition: Promise<string> | null = null;

/** The event's fully qualified name, creating the definition the first time. */
function checkInEventName(): Promise<string> {
  definition ??= (async () => {
    try {
      const found = await hs<{ fullyQualifiedName: string }>(`/events/v3/event-definitions/${CHECKIN_EVENT.name}`);
      return found.fullyQualifiedName;
    } catch (e) {
      if (!(e instanceof HubSpotError) || e.status !== 404) throw e;
    }
    const created = await hs<{ fullyQualifiedName: string }>("/events/v3/event-definitions", {
      method: "POST",
      body: JSON.stringify({ ...CHECKIN_EVENT, primaryObject: "CONTACT", propertyDefinitions: EVENT_PROPERTIES }),
    });
    return created.fullyQualifiedName;
  })().catch((e) => {
    definition = null;
    throw e;
  });
  return definition;
}

/** Same inputs give the same id, so resubmitting can't log an event twice. */
export function occurrenceId(...parts: string[]): string {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function findOrCreateStaticList(name: string): Promise<{ id: string; name: string }> {
  const res = await hs<ListSearchResponse>("/crm/v3/lists/search", {
    method: "POST",
    body: JSON.stringify({ query: name, count: 100 }),
  });
  const match = res.lists?.find((l) => l.name === name && l.objectTypeId === CONTACT_OBJECT_TYPE);
  if (match) return { id: String(match.listId), name };
  const created = await hs<{ list: { listId: string | number; name: string } }>("/crm/v3/lists", {
    method: "POST",
    body: JSON.stringify({ name, objectTypeId: CONTACT_OBJECT_TYPE, processingType: "MANUAL" }),
  });
  return { id: String(created.list.listId), name: created.list.name };
}

export type AttendanceRecord = {
  contactId: string;
  checkedInAt: string;
  walkIn?: boolean;
  badgeName?: string;
  badgeCompany?: string;
};

export type SubmitResult = {
  list: { id: string; name: string };
  added: number;
  removed: number;
  eventsLogged: number;
  eventError: string | null;
};

/** `alreadyLogged`: contacts whose event went out on an earlier submit. */
export async function submitAttendance(
  eventName: string,
  attendees: AttendanceRecord[],
  alreadyLogged: ReadonlySet<string> = new Set(),
): Promise<SubmitResult & { loggedContactIds: string[] }> {
  const list = await findOrCreateStaticList(`${eventName} – Attended`);

  // Bring the segment in line with who actually checked in.
  const want = new Set(attendees.map((a) => a.contactId));
  const have = new Set(await listMemberIds(list.id));
  const toAdd = [...want].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));
  for (const batch of chunk(toAdd, 500)) {
    await hs(`/crm/v3/lists/${list.id}/memberships/add`, { method: "PUT", body: JSON.stringify(batch) });
  }
  for (const batch of chunk(toRemove, 500)) {
    await hs(`/crm/v3/lists/${list.id}/memberships/remove`, { method: "PUT", body: JSON.stringify(batch) });
  }

  // Timeline events. Missing plan or scopes shouldn't undo the segment work.
  let eventsLogged = 0;
  let eventError: string | null = null;
  const logged = new Set(alreadyLogged);
  const toLog = attendees.filter((a) => !logged.has(a.contactId));
  try {
    const fqn = toLog.length ? await checkInEventName() : "";
    for (const batch of chunk(toLog, 500)) {
      await hs("/events/v3/send/batch", {
        method: "POST",
        body: JSON.stringify({
          inputs: batch.map((a) => ({
            eventName: fqn,
            objectId: a.contactId,
            occurredAt: new Date(a.checkedInAt).toISOString(),
            uuid: occurrenceId(CHECKIN_EVENT.name, a.contactId, a.checkedInAt),
            properties: {
              event_name: eventName,
              walk_in: a.walkIn ? "Yes" : "No",
              ...(a.badgeName ? { badge_name: a.badgeName } : {}),
              ...(a.badgeCompany !== undefined ? { badge_company: a.badgeCompany } : {}),
            },
          })),
        }),
      });
      eventsLogged += batch.length;
      batch.forEach((a) => logged.add(a.contactId));
    }
  } catch (e) {
    if (!(e instanceof HubSpotError) || ![400, 401, 403, 404].includes(e.status)) throw e;
    eventError = `Custom Events weren't logged: ${e.message}`;
  }

  return { list, added: toAdd.length, removed: toRemove.length, eventsLogged, eventError, loggedContactIds: [...logged] };
}
