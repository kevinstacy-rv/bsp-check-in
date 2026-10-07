import { NextResponse } from "next/server";
import { handle, isoOrNull, str } from "@/lib/api";
import { setCheckIn } from "@/lib/hubspot";

/** Body: { contactId, eventName, at } — `at: null` clears the check-in (undo). */
export const POST = handle(async (request: Request) => {
  const body = await request.json();
  const contactId = str(body.contactId, "contactId", { max: 40 });
  const eventName = str(body.eventName, "eventName");
  await setCheckIn(contactId, eventName, isoOrNull(body.at, "at"));
  return NextResponse.json({ ok: true });
});
