ALTER TABLE "hackathons" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
-- Start from the Luma event's zone.
UPDATE "hackathons" h SET "timezone" = e."timezone" FROM "events" e WHERE e.id = h."eventId";
