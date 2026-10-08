-- CreateTable
CREATE TABLE "portal_profiles" (
    "userId" TEXT NOT NULL,
    "tier" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "portal_chapter_memberships" (
    "userId" TEXT NOT NULL,
    "chapterSlug" TEXT NOT NULL,
    "chapterName" TEXT NOT NULL,
    "lead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "portal_chapter_memberships_pkey" PRIMARY KEY ("userId","chapterSlug")
);

-- CreateIndex
CREATE INDEX "portal_chapter_memberships_chapterSlug_idx" ON "portal_chapter_memberships"("chapterSlug");

-- AddForeignKey
ALTER TABLE "portal_profiles" ADD CONSTRAINT "portal_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_chapter_memberships" ADD CONSTRAINT "portal_chapter_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "portal_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
