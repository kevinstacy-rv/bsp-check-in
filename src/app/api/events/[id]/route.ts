import { NextResponse } from "next/server";
import { BadRequest, handle, str } from "@/lib/api";
import { requireStorage } from "@/lib/storage";
import { EVENT_ID_RE, summarizeEvent, type Attendee, type EventRecord } from "@/lib/types";

const SUMMARIES_KEY = "events:summaries";
const eventKey = (id: string) => `event:${id}`;
type Ctx = { params: Promise<{ id: string }> };

async function eventId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!EVENT_ID_RE.test(id)) throw new BadRequest("That event id isn't valid.");
  return id;
}

const optIso = (v: unknown, field: string) => {
  if (v == null) return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new BadRequest(`${field} isn't a valid time.`);
  return v;
};

function attendee(v: unknown): Attendee {
  const a = (v ?? {}) as Record<string, unknown>;
  const opt = (x: unknown, f: string) => (x === undefined ? undefined : str(x, f, { required: false }));
  return {
    id: str(a.id, "attendee id", { max: 60 }),
    firstName: str(a.firstName, "firstName", { required: false }),
    lastName: str(a.lastName, "lastName", { required: false }),
    company: str(a.company, "company", { required: false }),
    email: str(a.email, "email", { required: false, max: 254 }),
    checkedInAt: optIso(a.checkedInAt, "checkedInAt"),
    ...(a.walkIn ? { walkIn: true } : {}),
    ...(a.badgeName !== undefined ? { badgeName: opt(a.badgeName, "badgeName") } : {}),
    ...(a.badgeCompany !== undefined ? { badgeCompany: opt(a.badgeCompany, "badgeCompany") } : {}),
  };
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const event = await requireStorage().get<EventRecord>(eventKey(await eventId(ctx)));
  if (!event) return NextResponse.json({ error: "That event wasn't found." }, { status: 404 });
  return NextResponse.json({ event });
});

/** Saves the station's event. Called repeatedly during the event, so it's an upsert. */
export const PUT = handle(async (request: Request, ctx: Ctx) => {
  const id = await eventId(ctx);
  const body = await request.json();
  if (!Array.isArray(body.attendees) || body.attendees.length > 10000) throw new BadRequest("attendees isn't valid.");
  const segment = body.segment
    ? { id: str(body.segment.id, "segment id", { max: 40 }), name: str(body.segment.name, "segment name") }
    : null;
  const event: EventRecord = {
    id,
    name: str(body.name, "Event name"),
    segment,
    startedAt: optIso(body.startedAt, "startedAt") ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: optIso(body.finishedAt, "finishedAt"),
    attendees: body.attendees.map(attendee),
  };
  const redis = requireStorage();
  // The station's autosave doesn't know about the HubSpot submission; keep it.
  const previous = await redis.get<EventRecord>(eventKey(id));
  if (previous?.submission) event.submission = previous.submission;
  await redis.set(eventKey(id), event);
  await redis.hset(SUMMARIES_KEY, { [id]: summarizeEvent(event) });
  return NextResponse.json({ ok: true, updatedAt: event.updatedAt });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const id = await eventId(ctx);
  const redis = requireStorage();
  await redis.del(eventKey(id));
  await redis.hdel(SUMMARIES_KEY, id);
  return NextResponse.json({ ok: true });
});
