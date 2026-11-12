import { pruneExpired } from "@/lib/auth";

/**
 * Daily clean-up of expired sessions and tokens, called by Vercel Cron (schedule in vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the route stays closed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json({ deleted: await pruneExpired() });
}
