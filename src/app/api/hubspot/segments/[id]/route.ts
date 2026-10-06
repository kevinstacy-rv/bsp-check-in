import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { ensureCheckInProperties, getSegmentAttendees } from "@/lib/hubspot";

export const maxDuration = 60;

export const GET = handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const event = new URL(request.url).searchParams.get("event") ?? "";
  // Create the check-in properties up front, while staff are still setting up.
  await ensureCheckInProperties();
  return NextResponse.json({ attendees: await getSegmentAttendees(id, event) });
});
