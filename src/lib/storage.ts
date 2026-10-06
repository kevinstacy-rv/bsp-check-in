import "server-only";
import { Redis } from "@upstash/redis";

// Shared storage for past events and the phone preview: an Upstash Redis
// database added to the Vercel project (Storage → Upstash for Redis). The
// integration may name its variables KV_* or UPSTASH_REDIS_*; accept either.

let client: Redis | null | undefined;

export function storage(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
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
