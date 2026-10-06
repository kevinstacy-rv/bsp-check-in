import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireStorage } from "@/lib/storage";
import type { EventSummary } from "@/lib/types";

const SUMMARIES_KEY = "events:summaries";

export const GET = handle(async () => {
  const all = (await requireStorage().hgetall<Record<string, EventSummary>>(SUMMARIES_KEY)) ?? {};
  const events = Object.values(all).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return NextResponse.json({ events });
});
