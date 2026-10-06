import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, authConfigured, checkPassword, createSessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "STAFF_PASSWORD and SESSION_SECRET need to be set on the server." },
      { status: 500 },
    );
  }
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (typeof password !== "string" || !(await checkPassword(password))) {
    // Slow down guessing a little.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "That password didn't work." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
