import "server-only";
import { NextResponse } from "next/server";
import { HubSpotError } from "./hubspot";

/** Wraps a route handler so HubSpot and validation errors come back as JSON with a usable status. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HubSpotError) {
        const status = e.status === 401 || e.status === 403 ? 502 : e.status; // keep 401 for our own session
        return NextResponse.json({ error: `HubSpot: ${e.message}` }, { status });
      }
      if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
    }
  };
}

export class BadRequest extends Error {}

export function str(v: unknown, field: string, { required = true, max = 200 } = {}): string {
  if (v == null || v === "") {
    if (required) throw new BadRequest(`${field} is required.`);
    return "";
  }
  if (typeof v !== "string" || v.length > max) throw new BadRequest(`${field} isn't valid.`);
  return v;
}

export function isoOrNull(v: unknown, field: string): string | null {
  if (v === null) return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new BadRequest(`${field} isn't a valid time.`);
  return v;
}
