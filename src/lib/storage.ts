import "server-only";
import { Redis } from "@upstash/redis";

// Shared storage for past events and the phone preview: an Upstash Redis
// database added to the Vercel project (Storage → Upstash for Redis). The
// integration names its variables KV_REST_API_* or UPSTASH_REDIS_REST_*, with
// any custom prefix chosen when connecting it (e.g. bsp_KV_REST_API_URL).

const PAIRS = [
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
] as const;

/** Finds the REST URL and token, with or without a custom prefix. */
export function findCredentials(env: Record<string, string | undefined>): { url: string; token: string } | null {
  for (const [urlName, tokenName] of PAIRS) {
    if (env[urlName] && env[tokenName]) return { url: env[urlName]!, token: env[tokenName]! };
  }
  for (const [urlName, tokenName] of PAIRS) {
    for (const key of Object.keys(env)) {
      if (!key.endsWith(urlName) || !env[key]) continue;
      const token = env[key.slice(0, -urlName.length) + tokenName];
      if (token) return { url: env[key]!, token };
    }
  }
  return null;
}

let client: Redis | null | undefined;

export function storage(): Redis | null {
  if (client !== undefined) return client;
  const creds = findCredentials(process.env);
  client = creds ? new Redis(creds) : null;
  return client;
}

export class StorageMissing extends Error {
  constructor() {
    super("Shared storage isn't set up. Add Upstash for Redis to the Vercel project, then redeploy.");
  }
}

export function requireStorage(): Redis {
  const r = storage();
  if (!r) throw new StorageMissing();
  return r;
}
