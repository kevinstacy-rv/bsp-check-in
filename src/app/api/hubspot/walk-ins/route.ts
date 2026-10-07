import { NextResponse } from "next/server";
import { handle, str } from "@/lib/api";
import { createWalkIn } from "@/lib/hubspot";

export const POST = handle(async (request: Request) => {
  const body = await request.json();
  const result = await createWalkIn(
    {
      firstName: str(body.firstName, "First name"),
      lastName: str(body.lastName, "Last name", { required: false }),
      company: str(body.company, "Organization", { required: false }),
      email: str(body.email, "Email", { required: false, max: 254 }),
    },
    str(body.segmentId, "segmentId", { required: false, max: 40 }) || null,
  );
  return NextResponse.json(result);
});
