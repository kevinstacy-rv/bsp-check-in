import { NextResponse } from "next/server";
import { BadRequest, handle } from "@/lib/api";
import { submitAttendance } from "@/lib/hubspot";
import { requireStorage } from "@/lib/storage";
import { EVENT_ID_RE, badgeContent, isCorrected, summarizeEvent, type EventRecord } from "@/lib/types";

export const maxDuration = 60;

/**
 * Writes the permanent attendance record for a saved event: a static
 * "<event> – Attended" segment and a Custom Event on each attendee.
 * Uses the saved record, so the station should be synced and saved first.
 */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!EVENT_ID_RE.test(id)) throw new BadRequest("That event id isn't valid.");
  const redis = requireStorage();
  const event = await redis.get<EventRecord>(`event:${id}`);
  if (!event) return NextResponse.json({ error: "That event wasn't found." }, { status: 404 });

  const attended = event.attendees.filter((a) => a.checkedInAt);
  const unsynced = attended.filter((a) => a.id.startsWith("tmp_"));
  if (unsynced.length) {
    throw new BadRequest(
      `${unsynced.length} walk-in${unsynced.length === 1 ? " hasn't" : "s haven't"} reached HubSpot yet. Open check-in on the station while online so they sync, then submit again.`,
    );
  }

  const result = await submitAttendance(
    event.name,
    attended.map((a) => ({
      contactId: a.id,
      checkedInAt: a.checkedInAt!,
      walkIn: a.walkIn,
      ...(isCorrected(a) ? { badgeName: badgeContent(a).name, badgeCompany: badgeContent(a).company } : {}),
    })),
    new Set(event.submission?.loggedContactIds ?? []),
  );

  event.submission = {
    submittedAt: new Date().toISOString(),
    listId: result.list.id,
    listName: result.list.name,
    attendees: attended.length,
    eventsLogged: result.loggedContactIds.filter((cid) => attended.some((a) => a.id === cid)).length,
    eventError: result.eventError,
    loggedContactIds: result.loggedContactIds,
  };
  await redis.set(`event:${id}`, event);
  await redis.hset("events:summaries", { [id]: summarizeEvent(event) });

  return NextResponse.json({ ...result, submission: event.submission });
});
