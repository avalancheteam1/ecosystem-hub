/*
  Warnings:

  - A unique constraint covering the columns `[prizeId,placement]` on the table `hackathon_awards` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `placement` to the `hackathon_awards` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "hackathon_awards_prizeId_key";

-- AlterTable
ALTER TABLE "hackathon_awards" ADD COLUMN     "placement" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "hackathon_judges" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "hackathon_organizers" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "hackathon_prizes" ADD COLUMN     "placementTo" INTEGER;

-- AlterTable
ALTER TABLE "hackathon_stages" ADD COLUMN     "advancedOnly" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "hackathons" ADD COLUMN     "resourceLinks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "showBuilderHubLinks" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_awards_prizeId_placement_key" ON "hackathon_awards"("prizeId", "placement");
