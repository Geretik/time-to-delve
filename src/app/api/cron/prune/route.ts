import { pruneExpired } from "@/lib/auth";

/**
 * Daily clean-up of expired sessions, tokens and rate-limit counters, called by Vercel Cron (schedule in vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the route stays closed.
 * Answers 500 when a part of the clean-up failed (null instead of its count), so the cron run shows as failed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const deleted = await pruneExpired();
  const failed = Object.values(deleted).includes(null);
  return Response.json({ deleted }, { status: failed ? 500 : 200 });
}
