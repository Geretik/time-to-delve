-- reset_at changes meaning (end of a fixed window → when the counter is empty again),
-- so counters from before would be misread. They are short-lived; start over.
DELETE FROM "rate_limits";--> statement-breakpoint
ALTER TABLE "rate_limits" DROP COLUMN "count";
