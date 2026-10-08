-- Builders-hub field set for projects + builder profiles. Hand-written so
-- existing project versions keep their data (renames, not drop + add).

-- Stage entries: pre-existing idea + what was built during the event
ALTER TABLE "hackathon_stage_entries" ADD COLUMN "builtDuringEvent" TEXT,
ADD COLUMN "preexistingIdea" BOOLEAN NOT NULL DEFAULT false;

-- Project versions
ALTER TABLE "project_versions" RENAME COLUMN "tagline" TO "shortDescription";
ALTER TABLE "project_versions" RENAME COLUMN "descriptionMd" TO "fullDescription";
ALTER TABLE "project_versions" RENAME COLUMN "links" TO "websites";
ALTER TABLE "project_versions"
  ADD COLUMN "techDescription" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "categories" TEXT[],
  ADD COLUMN "otherCategory" TEXT,
  ADD COLUMN "githubRepos" TEXT[],
  ADD COLUMN "demoLinks" TEXT[],
  ADD COLUMN "coverUrl" TEXT,
  ADD COLUMN "screenshots" TEXT[],
  ADD COLUMN "deployedAddresses" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "socials" JSONB NOT NULL DEFAULT '[]';
UPDATE "project_versions" SET
  "githubRepos" = CASE WHEN "repoUrl" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["repoUrl"] END,
  "demoLinks" = CASE WHEN "demoUrl" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["demoUrl"] END,
  "categories" = ARRAY[]::TEXT[],
  "screenshots" = ARRAY[]::TEXT[],
  -- links were [{label,url}], websites are [{tag,url}]
  "websites" = COALESCE((SELECT jsonb_agg(jsonb_build_object('tag', l->>'label', 'url', l->>'url')) FROM jsonb_array_elements("websites") l), '[]'::jsonb);
ALTER TABLE "project_versions" DROP COLUMN "repoUrl", DROP COLUMN "demoUrl";

-- Builder profile
ALTER TABLE "users"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "builderRoles" TEXT[],
  ADD COLUMN "institution" TEXT,
  ADD COLUMN "companyName" TEXT,
  ADD COLUMN "employeeRole" TEXT,
  ADD COLUMN "githubAccount" TEXT,
  ADD COLUMN "xAccount" TEXT,
  ADD COLUMN "linkedinAccount" TEXT,
  ADD COLUMN "telegramAccount" TEXT,
  ADD COLUMN "otherSocials" TEXT[],
  ADD COLUMN "wallets" TEXT[],
  ADD COLUMN "skills" TEXT[],
  ADD COLUMN "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contactConsent" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
