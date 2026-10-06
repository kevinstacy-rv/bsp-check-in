import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { searchSegments } from "@/lib/hubspot";

export const GET = handle(async (request: Request) => {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ segments: await searchSegments(q.slice(0, 100)) });
});
