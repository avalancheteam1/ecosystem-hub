-- CreateTable
CREATE TABLE "hackathons" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "aboutMd" TEXT NOT NULL DEFAULT '',
    "rulesMd" TEXT,
    "termsUrl" TEXT,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "teamSizeMin" INTEGER NOT NULL DEFAULT 1,
    "teamSizeMax" INTEGER NOT NULL DEFAULT 5,
    "maxParticipants" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "resultsPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hackathons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_tracks" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "descriptionMd" TEXT,
    "sponsor" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hackathon_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_prizes" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "trackId" TEXT,
    "placement" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "amount" TEXT,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hackathon_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_organizers" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_organizers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_judges" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "trackIds" TEXT[],
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_judges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_fields" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "stageId" TEXT,
    "label" TEXT NOT NULL,
    "help" TEXT,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[],
    "maxLength" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_participants" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "termsAcceptedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hackathon_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_stages" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "descriptionMd" TEXT,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "judgingClosedAt" TIMESTAMP(3),
    "reviewMode" TEXT NOT NULL DEFAULT 'all',
    "judgesPerSubmission" INTEGER,
    "sameTrackOnly" BOOLEAN NOT NULL DEFAULT false,
    "scaleMax" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "hackathon_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_criteria" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hackathon_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_submissions" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "trackIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hackathon_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_stage_entries" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "projectVersionId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "teamSnapshot" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "advancedAt" TIMESTAMP(3),
    "advancedById" TEXT,

    CONSTRAINT "hackathon_stage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_judge_assignments" (
    "id" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_judge_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_reviews" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "scores" JSONB NOT NULL DEFAULT '{}',
    "total" DOUBLE PRECISION,
    "comment" TEXT,
    "conflictDeclared" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hackathon_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_awards" (
    "id" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "descriptionMd" TEXT NOT NULL,
    "logoUrl" TEXT,
    "repoUrl" TEXT,
    "demoUrl" TEXT,
    "videoUrl" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "techStack" TEXT[],
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_invites" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hackathons_eventId_key" ON "hackathons"("eventId");

-- CreateIndex
CREATE INDEX "hackathon_tracks_hackathonId_idx" ON "hackathon_tracks"("hackathonId");

-- CreateIndex
CREATE INDEX "hackathon_prizes_hackathonId_idx" ON "hackathon_prizes"("hackathonId");

-- CreateIndex
CREATE INDEX "hackathon_organizers_userId_idx" ON "hackathon_organizers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_organizers_hackathonId_email_key" ON "hackathon_organizers"("hackathonId", "email");

-- CreateIndex
CREATE INDEX "hackathon_judges_userId_idx" ON "hackathon_judges"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_judges_hackathonId_email_key" ON "hackathon_judges"("hackathonId", "email");

-- CreateIndex
CREATE INDEX "form_fields_hackathonId_stageId_idx" ON "form_fields"("hackathonId", "stageId");

-- CreateIndex
CREATE INDEX "hackathon_participants_userId_idx" ON "hackathon_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_participants_hackathonId_userId_key" ON "hackathon_participants"("hackathonId", "userId");

-- CreateIndex
CREATE INDEX "hackathon_stages_hackathonId_order_idx" ON "hackathon_stages"("hackathonId", "order");

-- CreateIndex
CREATE INDEX "hackathon_criteria_stageId_idx" ON "hackathon_criteria"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_submissions_hackathonId_projectId_key" ON "hackathon_submissions"("hackathonId", "projectId");

-- CreateIndex
CREATE INDEX "hackathon_stage_entries_stageId_idx" ON "hackathon_stage_entries"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_stage_entries_submissionId_stageId_key" ON "hackathon_stage_entries"("submissionId", "stageId");

-- CreateIndex
CREATE INDEX "hackathon_judge_assignments_entryId_idx" ON "hackathon_judge_assignments"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_judge_assignments_judgeId_entryId_key" ON "hackathon_judge_assignments"("judgeId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_reviews_assignmentId_key" ON "hackathon_reviews"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_awards_prizeId_key" ON "hackathon_awards"("prizeId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_currentVersionId_key" ON "projects"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "project_versions_projectId_number_key" ON "project_versions"("projectId", "number");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_invites_tokenHash_key" ON "project_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "project_invites_projectId_idx" ON "project_invites"("projectId");

-- AddForeignKey
ALTER TABLE "hackathons" ADD CONSTRAINT "hackathons_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_tracks" ADD CONSTRAINT "hackathon_tracks_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_prizes" ADD CONSTRAINT "hackathon_prizes_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_prizes" ADD CONSTRAINT "hackathon_prizes_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "hackathon_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_organizers" ADD CONSTRAINT "hackathon_organizers_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_organizers" ADD CONSTRAINT "hackathon_organizers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_judges" ADD CONSTRAINT "hackathon_judges_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_judges" ADD CONSTRAINT "hackathon_judges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "hackathon_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_participants" ADD CONSTRAINT "hackathon_participants_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_participants" ADD CONSTRAINT "hackathon_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_stages" ADD CONSTRAINT "hackathon_stages_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_criteria" ADD CONSTRAINT "hackathon_criteria_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "hackathon_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_stage_entries" ADD CONSTRAINT "hackathon_stage_entries_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "hackathon_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_stage_entries" ADD CONSTRAINT "hackathon_stage_entries_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "hackathon_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_stage_entries" ADD CONSTRAINT "hackathon_stage_entries_projectVersionId_fkey" FOREIGN KEY ("projectVersionId") REFERENCES "project_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_judge_assignments" ADD CONSTRAINT "hackathon_judge_assignments_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "hackathon_judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_judge_assignments" ADD CONSTRAINT "hackathon_judge_assignments_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "hackathon_stage_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_reviews" ADD CONSTRAINT "hackathon_reviews_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "hackathon_judge_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_awards" ADD CONSTRAINT "hackathon_awards_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "hackathon_prizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_awards" ADD CONSTRAINT "hackathon_awards_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "hackathon_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "project_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
