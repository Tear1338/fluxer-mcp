# Fluxer MCP — Usage Examples & Prompts

Once Fluxer MCP is connected to Claude Code, Claude Desktop, Codex, Cursor, or VS Code, you can issue natural-language instructions directly.

---

## 1. Build an Entire Community from Scratch (Natural Language)

> *"Build a complete French gaming & esports Fluxer community on guild `999000999000999000` with staff roles, LFG forum with tags, tournament announcements, voice squads, and pinned rules. Show me the full dry-run plan first."*

What Fluxer MCP does:
1. Calls `guild_blueprint_plan` (zero mutations) → compiles roles, Fluxer permission bitfields, categories, text/announcement/forum/media/voice channels, forum tags, staff overwrites, and starter welcome/rules embeds.
2. Saves a signed local `plan_ref` and displays every planned operation for your approval.
3. Once you approve (with `MCP_DRY_RUN=false`), calls `guild_blueprint_apply` (`__confirm: true`) and verifies live state via `guild_blueprint_evidence`.

---

## 2. Full Security & Misconfiguration Audit

> *"Run a complete security audit of guild `999000999000999000`: check @everyone permissions, role hierarchy, channel overwrites, invites, webhooks, and recent audit logs. Propose a safe change plan to fix critical issues."*

Tools coordinated:
- `guild_security_audit` → 0–100 security score + prioritized findings
- `roles_analyze_hierarchy` → flags `ADMINISTRATOR`, `MANAGE_ROLES` escalation paths, hoist mismatches
- `audit_log_summary` → flags ban/kick/deletion spikes
- `guild_change_plan` → creates a reversible, signed fix plan (rollback available via `guild_change_restore`)

---

## 3. Anti-Raid Emergency Lockdown & Clean Restore

> *"We're getting raided in guild `999000999000999000`! Lock down verification and @everyone posting/invites, scan #general for spam accounts, and keep a snapshot so we can restore once it's over."*

Tools coordinated:
1. `guild_raid_shield` (`mode: "lockdown"`, `apply: true`) → snapshots previous settings and locks guild down
2. `intelligence_moderate_content` (`channel_id: "..."`) → identifies scam/spam bursts
3. `members_bulk_ban` (`ban_duration_seconds` or permanent, `__confirm: true`) + `messages_bulk_delete`
4. Later: `guild_raid_shield` (`mode: "restore"`, `snapshot_id: "..."`, `apply: true`) → cleanly restores normal permissions!

---

## 4. Backup, Compare (Diff) & Clone a Community

> *"Export a complete signed backup of guild `999000999000999000` named `prod_baseline`, compare it against staging guild `888000888000888000`, and prepare a clone plan to sync missing roles and channels."*

Tools coordinated:
- `guild_backup_export` → signed checksummed snapshot
- `guild_config_diff` → structured added/removed/changed diff
- `guild_clone_plan` → previewable, approval-bound sync plan

---

## 5. Fluxer-Native Features in Action

- **Link Channels (`GUILD_LINK = 998`)**: *"Create a Fluxer link channel named `docs` pointing to `https://docs.fluxer.com/` under the Information category."* → `channels_create_guild_channel` with `type: 998, url: "https://docs.fluxer.com/"`
- **Custom Role Hoist Ordering**: *"Display VIP members above Helpers in the sidebar without changing permission hierarchy."* → `roles_modify_hoist_positions`
- **Temporary Bans**: *"Temporarily ban user `500000000000000099` for 24 hours with reason 'Repeated spam'."* → `members_ban` with `ban_duration_seconds: 86400`
- **Full-Text Message Search**: *"Search all messages mentioning 'migration' in guild `999000999000999000`."* → `messages_search` (`POST /search/messages`)
- **Forum Tag Management**: *"Add a moderated 'Resolved' tag to the support forum."* → `channels_create_forum_tag`
- **Self-Hosted Instance Discovery**: *"Inspect what features and limits our self-hosted Fluxer server supports."* → `instance_get_discovery`
