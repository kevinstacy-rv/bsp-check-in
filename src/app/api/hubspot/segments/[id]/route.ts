import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getSegmentAttendees } from "@/lib/hubspot";

export const maxDuration = 60;

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return NextResponse.json({ attendees: await getSegmentAttendees(id) });
});
