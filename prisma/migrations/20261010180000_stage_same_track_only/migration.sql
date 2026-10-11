-- AlterTable: "same track only" becomes a real stage setting. Every stage so far filtered by track, so keep that.
ALTER TABLE "hackathon_stages" ALTER COLUMN "sameTrackOnly" SET DEFAULT true;
UPDATE "hackathon_stages" SET "sameTrackOnly" = true;
