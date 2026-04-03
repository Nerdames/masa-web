import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// 1. Initialize the Redis Client
// It automatically reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from .env
export const redis = Redis.fromEnv();

// 2. Create the Rate Limiter instance
export const auditLogRateLimiter = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(30, "10 s"), // 30 requests per 10 seconds
  analytics: true, // Optional: gives you a dashboard in Upstash
  prefix: "@upstash/ratelimit",
});