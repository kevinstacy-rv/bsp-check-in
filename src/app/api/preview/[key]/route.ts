import { NextResponse } from "next/server";
import { BadRequest, handle } from "@/lib/api";
import { requireStorage } from "@/lib/storage";
import { PREVIEW_KEY_RE } from "@/lib/types";

// Public: the paired phone isn't signed in. The unguessable key in the link is
// the credential, and it only ever exposes the one badge on screen right now.
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ key: string }> }) => {
  const { key } = await ctx.params;
  if (!PREVIEW_KEY_RE.test(key)) throw new BadRequest("That preview link isn't valid.");
  const redis = requireStorage();
  const [payload] = await Promise.all([
    redis.get(`preview:${key}`),
    redis.set(`preview-seen:${key}`, Date.now(), { ex: 60 }),
  ]);
  return NextResponse.json(
    { payload: payload ?? null },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
});
