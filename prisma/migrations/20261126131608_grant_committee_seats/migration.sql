-- CreateTable
CREATE TABLE "grant_committee_seats" (
    "id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grant_committee_seats_slot_check" CHECK ("slot" BETWEEN 1 AND 4),
    CONSTRAINT "grant_committee_seats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grant_committee_seats_slot_key" ON "grant_committee_seats"("slot");

-- CreateIndex
CREATE UNIQUE INDEX "grant_committee_seats_email_key" ON "grant_committee_seats"("email");

-- CreateIndex
CREATE UNIQUE INDEX "grant_committee_seats_userId_key" ON "grant_committee_seats"("userId");

-- AddForeignKey
ALTER TABLE "grant_committee_seats" ADD CONSTRAINT "grant_committee_seats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
