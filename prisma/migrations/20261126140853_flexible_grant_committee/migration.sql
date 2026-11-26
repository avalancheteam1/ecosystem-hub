-- Add the configuration for future shortlists.
CREATE TABLE "grant_committee_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seatCount" INTEGER NOT NULL DEFAULT 4,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "approvalRule" TEXT NOT NULL DEFAULT 'unanimity',

    CONSTRAINT "grant_committee_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "grant_committee_settings_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "grant_committee_settings_size_check" CHECK ("seatCount" BETWEEN 1 AND 32),
    CONSTRAINT "grant_committee_settings_rule_check" CHECK ("approvalRule" IN ('unanimity', 'absolute_majority', 'simple_majority'))
);

-- Keep existing seat IDs and allow new seats beyond the original four.
ALTER TABLE "grant_committee_seats"
    DROP CONSTRAINT "grant_committee_seats_slot_check",
    ADD CONSTRAINT "grant_committee_seats_slot_check" CHECK ("slot" > 0);
