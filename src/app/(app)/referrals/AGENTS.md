# Referrals & groups

Rules for this area. The root `AGENTS.md` applies too.

## Referrals & groups (`src/app/(app)/referrals/` - routes `/referrals`, `/groups/[slug]`, admin `/admin/groups`)
- `?ref=<code>` on any page → `src/proxy.ts` sets a first-wins `ref` cookie (30 days). Better Auth `user.create.after` → `attributeReferral` writes one `Referral` per new user (existing users never count) + a **snapshot** of the referrer's groups (`ReferralGroup`). Never blocks sign-up.
- Codes: several per user (max 10), always random (`generateCode`, never user-chosen), labelled, deactivate instead of delete. QR per link via `QrCodeDialog` (`src/components/qr-code-dialog.tsx`, builder `src/lib/qr.ts`, ported from the member portal). Rules in `_lib/rules.ts` (tested).
- Groups: **manual** groups = `GroupMember` rows (members/leads), no chapter link. **Automatic** = chapter groups: one `Group` per portal chapter (`portalChapterSlug`, read-only, created by `ensureChapterGroups`). Members/leads/tier come from a stored read-only copy (`PortalProfile`, `PortalChapterMembership`) refreshed on sign-in and after 24 h (`refreshPortalProfile`, `getPortalProfile` in `src/lib/member-portal.ts`); pages never call the portal. Portal `senior` is reported as `core`. Needs `MEMBER_PORTAL_API_KEY` (scope `members:chapters`). Chapter groups are created only for **live** chapters (`ensureChapterGroups`, on `/admin/groups` load and each refresh). An onboarding counts for the referrer's manual groups + their **primary** chapter group only (`countingGroups`, `getUserGroups().counting`).
- Visibility: referrers see counts; leads (per-object, `canViewGroup` in `src/lib/groups.ts`) and `referrals.view` see group totals + referrer name/count; nobody sees who was referred. `groups.manage` edits groups.
