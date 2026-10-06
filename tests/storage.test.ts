import { describe, expect, it } from "vitest";
import { findCredentials } from "../src/lib/storage";

describe("findCredentials", () => {
  it("reads the plain Vercel KV names", () => {
    expect(findCredentials({ KV_REST_API_URL: "u", KV_REST_API_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
  });
  it("reads names with a custom prefix", () => {
    expect(
      findCredentials({ bsp_KV_REST_API_URL: "u", bsp_KV_REST_API_TOKEN: "t", bsp_KV_REST_API_READ_ONLY_TOKEN: "ro" }),
    ).toEqual({ url: "u", token: "t" });
    expect(findCredentials({ BSP_UPSTASH_REDIS_REST_URL: "u", BSP_UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({
      url: "u",
      token: "t",
    });
  });
  it("never pairs a URL with another prefix's token", () => {
    expect(findCredentials({ a_KV_REST_API_URL: "u", b_KV_REST_API_TOKEN: "t" })).toBeNull();
  });
});
