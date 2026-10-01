/**
 * Best-effort, per-instance request limiting for public endpoints. Each
 * serverless instance keeps its own counters, so add a Vercel Firewall
 * rate-limit rule for a global limit.
 */

import { HttpError } from './http.js';

const buckets = new Map<string, Map<string, number[]>>();

/** Throw 429 once `max` requests from the caller's IP arrive within `windowMs`. */
export function checkRateLimit(request: Request, bucket: string, max: number, windowMs = 60_000): void {
  const ip =
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  let log = buckets.get(bucket);
  if (!log) {
    log = new Map();
    buckets.set(bucket, log);
  }
  const now = Date.now();
  const recent = (log.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new HttpError(429, 'rate_limited');
  recent.push(now);
  if (log.size > 10_000) log.clear();
  log.set(ip, recent);
}
