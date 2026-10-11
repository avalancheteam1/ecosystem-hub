-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "hackathon_organizers_email_idx" ON "hackathon_organizers"("email");

-- CreateIndex
CREATE INDEX "hackathon_judges_email_idx" ON "hackathon_judges"("email");

-- CreateIndex
CREATE INDEX "hackathon_submissions_projectId_idx" ON "hackathon_submissions"("projectId");

-- CreateIndex
CREATE INDEX "project_invites_email_idx" ON "project_invites"("email");
