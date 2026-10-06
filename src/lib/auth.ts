// Staff session: a signed, expiring cookie. Uses Web Crypto so it runs in the
// proxy as well as in route handlers.

export const SESSION_COOKIE = "checkin_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days covers set-up day through tear-down

const enc = new TextEncoder();

function secret(): string {
  const password = process.env.STAFF_PASSWORD ?? "";
  // Folding the password into the key means changing it signs everyone out.
  return `${process.env.SESSION_SECRET ?? ""}:${password}`;
}

function toBase64Url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authConfigured(): boolean {
  return Boolean(process.env.STAFF_PASSWORD && process.env.SESSION_SECRET);
}

export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.STAFF_PASSWORD;
  if (!expected) return false;
  // Compare HMACs so the comparison time doesn't depend on the password.
  return safeEqual(await sign(`pw:${input}`), await sign(`pw:${expected}`));
}

export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  return `${exp}.${await sign(`session:${exp}`)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !authConfigured()) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now() / 1000) return false;
  return safeEqual(sig, await sign(`session:${exp}`));
}
