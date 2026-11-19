# Earn

- The public catalog and brief read only published rows through server-only queries. Use explicit field projections, apply visibility before pagination, and keep deadlines in UTC.
- Central team1 publishes through `/admin/earn`. Grant `earn.publish` only to designated staff using Hub access management. Reads and all mutations independently check the same permission.
- Drafts are private. Make publication explicit, protect updates with the listing revision, and persist audit metadata in the same transaction. Edit a published brief by first taking it offline.
- GitHub issue links are public references. Enter only URLs cleared for public sharing. Earn does not verify links against the GitHub API.
- Member-only opportunities use the Member Portal. The Hub catalog does not model private Portal work, handle rewards, or write XP.
