-- Project versions become: one editable draft per project + sealed (submitted) versions.
ALTER TABLE "project_versions" ADD COLUMN "sealedAt" TIMESTAMP(3), ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Versions a submission points at are sealed.
UPDATE "project_versions" v SET "sealedAt" = v."createdAt"
WHERE EXISTS (SELECT 1 FROM "hackathon_stage_entries" e WHERE e."projectVersionId" = v.id);

-- Unused intermediate versions (neither sealed nor the project's current one) are dropped.
DELETE FROM "project_versions" v
WHERE v."sealedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."currentVersionId" = v.id);

-- Renumber without gaps: sealed versions in order, then the draft.
UPDATE "project_versions" SET "number" = -"number";
UPDATE "project_versions" v SET "number" = r.n
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY ("sealedAt" IS NULL), "createdAt") AS n FROM "project_versions") r
WHERE r.id = v.id;
