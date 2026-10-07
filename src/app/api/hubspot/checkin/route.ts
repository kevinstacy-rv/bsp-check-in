import { NextResponse } from "next/server";
import { handle, isoOrNull, str } from "@/lib/api";
import { setCheckIn } from "@/lib/hubspot";

/**
 * Body: { contactId, eventName, at, walkIn?, badgeName?, badgeCompany? }.
 * `at: null` clears the check-in (undo).
 */
export const POST = handle(async (request: Request) => {
  const body = await request.json();
  const contactId = str(body.contactId, "contactId", { max: 40 });
  const eventName = str(body.eventName, "eventName");
  const result = await setCheckIn(contactId, eventName, isoOrNull(body.at, "at"), {
    walkIn: body.walkIn === true,
    badgeName: str(body.badgeName, "badgeName", { required: false }) || undefined,
    badgeCompany: typeof body.badgeCompany === "string" ? body.badgeCompany.slice(0, 200) : undefined,
  });
  return NextResponse.json({ ok: true, ...result });
});
