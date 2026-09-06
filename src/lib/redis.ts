import { Redis } from "@upstash/redis";

// One shared client. Upstash's REST-based client is stateless per call
// (just an HTTPS request under the hood), so creating this once at module
// scope and reusing it across invocations is safe and normal — unlike a
// real TCP connection pool, there's no "connection" to leak or share
// incorrectly between requests.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL ?? "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
});
