import { NextResponse } from "next/server";
import { BadRequest, handle } from "@/lib/api";
import { requireStorage } from "@/lib/storage";
import { PREVIEW_KEY_RE, type PreviewPayload } from "@/lib/types";

const TTL = 60 * 60 * 12;

function key(v: unknown): string {
  if (typeof v !== "string" || !PREVIEW_KEY_RE.test(v)) throw new BadRequest("That preview link isn't valid.");
  return v;
}

function payload(v: unknown): PreviewPayload {
  const p = (v ?? {}) as Record<string, unknown>;
  const text = (x: unknown, max = 200) => (typeof x === "string" ? x.slice(0, max) : "");
  const eventName = text(p.eventName);
  if (p.kind === "idle") return { kind: "idle", eventName };
  if (p.kind !== "badge" && p.kind !== "printing") throw new BadRequest("Unknown preview kind.");
  const mm = (x: unknown) => Math.min(300, Math.max(10, Number(x) || 0));
  return {
    kind: p.kind,
    eventName,
    name: text(p.name),
    company: text(p.company),
    widthMm: mm(p.widthMm),
    heightMm: mm(p.heightMm),
  };
}

/** Station pushes what the phone should show. Staff session required (via the proxy). */
export const POST = handle(async (request: Request) => {
  const body = await request.json();
  const k = key(body.key);
  const redis = requireStorage();
  await redis.set(`preview:${k}`, { ...payload(body.payload), v: Date.now() }, { ex: TTL });
  const seenAt = await redis.get<number>(`preview-seen:${k}`);
  return NextResponse.json({ seenAt: seenAt ?? null });
});

/** Station asks whether the phone is connected. */
export const GET = handle(async (request: Request) => {
  const k = key(new URL(request.url).searchParams.get("key"));
  const seenAt = await requireStorage().get<number>(`preview-seen:${k}`);
  return NextResponse.json({ seenAt: seenAt ?? null });
});
