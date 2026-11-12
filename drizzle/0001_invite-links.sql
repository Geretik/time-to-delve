ALTER TABLE "tokens" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "note" text DEFAULT '' NOT NULL;