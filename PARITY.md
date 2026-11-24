# Fluxer MCP — Discord MCP Parity & Compatibility Matrix

This document tracks the individual analysis and porting status of every single tool from the upstream [cappyeo/discord-mcp](https://github.com/cappyeo/discord-mcp) repository (v0.34.1, 222 tools) against the live **Fluxer API v1** OpenAPI 3.1.0 specification (`https://api.fluxer.app/v1/openapi.json`, 363 paths / 445 operations) and the [fluxerapp/fluxer](https://github.com/fluxerapp/fluxer) source code, plus all **Fluxer-native & advanced tools** added beyond the original project.

> **Verification methodology**: No Discord feature was assumed to exist on Fluxer. Every endpoint, HTTP method, payload field, permission bit, channel type, audit-log action, and error code was verified directly against Fluxer's live OpenAPI 3.1.0 specification and `fluxerapp/fluxer/packages/constants/src/`.

## Summary

| Category | Upstream Tools | Ported / Adapted | Incompatible (No Fluxer API) | New Fluxer-Native / Advanced Tools | Total Fluxer MCP Tools |
| --- | ---: | ---: | ---: | ---: | ---: |
| `instance` (NEW) | 0 | 0 | 0 | 3 | **3** |
| `application` | 5 | 1 | 4 | 1 | **2** |
| `audit_log` | 1 | 1 | 0 | 1 | **2** |
| `automod` | 5 | 0 | 5 | 0 | **0** *(documented)* |
| `channels` | 14 | 14 | 0 | 7 | **21** |
| `commands` | 15 | 0 | 15 | 0 | **0** *(documented)* |
| `components_v2` | 8 | 0 | 8 | 0 | **0** *(documented)* |
| `discovery` (NEW) | 0 | 0 | 0 | 6 | **6** |
| `emojis` | 5 | 4 | 1 | 4 | **8** |
| `app_emojis` | 5 | 0 | 5 | 0 | **0** *(documented)* |
| `events` (scheduled) | 6 | 0 | 6 | 0 | **0** *(documented)* |
| `guild` & orchestration | 23 | 10 | 13 | 9 | **19** |
| `inspiration` | 1 | 1 | 0 | 0 | **1** |
| `intelligence` | 5 | 5 | 0 | 0 | **5** |
| `interactions` | 8 | 0 | 8 | 0 | **0** *(documented)* |
| `invites` | 4 | 4 | 0 | 1 | **5** |
| `members` | 15 | 15 | 0 | 3 | **18** |
| `messages` | 16 | 16 | 0 | 4 | **20** |
| `meta` & workflows | 6 | 6 | 0 | 0 | **6** |
| `monetization` | 8 | 0 | 8 | 0 | **0** *(documented)* |
| `onboarding` | 2 | 0 | 2 | 0 | **0** *(documented)* |
| `permissions` | 3 | 3 | 0 | 0 | **3** |
| `polls` | 2 | 0 | 2 | 0 | **0** *(documented)* |
| `reactions` | 5 | 5 | 0 | 1 | **6** |
| `roles` | 5 | 5 | 0 | 3 | **8** |
| `soundboard` | 7 | 0 | 7 | 0 | **0** *(documented)* |
| `stage_instances` | 4 | 0 | 4 | 0 | **0** *(documented)* |
| `stickers` | 7 | 5 | 2 | 3 | **8** |
| `templates` | 9 | 0 | 9 | 0 | **0** *(replaced by native backup/diff/clone/blueprint)* |
| `threads` | 6 | 6 | 0 | 0 | **6** |
| `users` | 6 | 6 | 0 | 2 | **8** |
| `voice` | 3 | 0 | 3 | 0 | **0** *(voice moderation via `members_voice_moderate`)* |
| `webhooks` | 13 | 13 | 0 | 4 | **17** |
| **TOTAL** | **222** | **120** | **102** | **52** | **172** |

---

## Key Architectural Differences Between Discord API v10 and Fluxer API v1

| Area | Discord API v10 | Fluxer API v1 |
| --- | --- | --- |
| Base URL & Versioning | Fixed `https://discord.com/api/v10` | Configurable (`https://api.fluxer.app/v1` default) + self-hosted instances |
| Instance Discovery | None | `GET /.well-known/fluxer` returns endpoints, features, limits, community mode, SSO, branding, voice origins |
| API Error Codes | Numeric integers (`10003`, `50013`) | String constants (`UNKNOWN_CHANNEL`, `ACCESS_DENIED`, `BOTS_CANNOT_CREATE_GUILDS`, `RATE_LIMITED`) |
| Gateway Intents | Privileged intents required (`GUILD_MEMBERS`, `MESSAGE_CONTENT`) | **No intents required**; uses `GatewayIdentifyFlags` (`DEBOUNCE_MESSAGE_REACTIONS`, `CHANNEL_THREADS`, `GUILD_VISITS`) |
| Permissions Bitfield | 46+ Discord bits | 37 core bits + 4 thread bits; includes Fluxer-native `PIN_MESSAGES` (bit 51), `BYPASS_SLOWMODE` (52), `UPDATE_RTC_REGION` (53), `VIEW_CHANNEL_MEMBERS` (54), `CREATE_EXPRESSIONS` (43), `MANAGE_EXPRESSIONS` (30) |
| Channel Types | Includes `GUILD_STAGE_VOICE (13)`, `GUILD_DIRECTORY (14)` | No Stage/Directory; adds Fluxer-native `GUILD_LINK (998)` and `DM_PERSONAL_NOTES (999)` |
| Guild Deletion | `DELETE /guilds/{guild_id}` | `POST /guilds/{guild_id}/delete` |
| Guild Creation by Bots | Allowed (under 10 guilds) | Forbidden (`BOTS_CANNOT_CREATE_GUILDS`; `POST /guilds` requires user session) |
| Verification Levels | 0..4 (`VERY_HIGH`) | 0..3 (`NONE`, `LOW`, `MEDIUM`, `HIGH`) |
| Guild Extra Controls | Community/Onboarding/AutoMod/Widgets | `disabled_operations` bitfield, `splash_card_alignment`, `content_warning_level/text`, `message_history_cutoff`, `RAID_DETECTED`, `INVITES_DISABLED`, `MEMBER_DMS_DISABLED` |
| Pinned Messages List | `GET /channels/{id}/pins` → `Message[]` | `GET /channels/{id}/messages/pins` → `{ items, has_more }` (paginated) |
| Member Search | `GET /guilds/{id}/members/search` | `POST /guilds/{id}/members-search` with rich filters (`role_ids`, `is_bot`, `join_source_type`, `source_invite_code`, date bounds, sorting) |
| Message Search | User-only (unavailable to bots) | `POST /search/messages` **bot-accessible** with full-text & filter queries |
| Role Positions | `PATCH /guilds/{id}/roles` → `Role[]` | `PATCH /guilds/{id}/roles` → `204 No Content`, PLUS `PATCH/DELETE /guilds/{id}/roles/hoist-positions` |
| Temporary Bans | Not natively in ban body | Native `ban_duration_seconds` + `reason` in `PUT /guilds/{id}/bans/{user_id}` body; response includes `moderator_id`, `banned_at`, `expires_at` |
| Sticker Upload | `multipart/form-data` | JSON `{ name, description, tags, image }` (data URI) + bulk create + clone |
| Forum Tags | Only via `PATCH /channels/{id}` | Dedicated CRUD: `POST/PUT/DELETE /channels/{id}/tags` + `POST /channels/{id}/post-data` |
| Webhooks | Standard + GitHub + Slack | Standard + GitHub + Slack + **Instatus** + **Libredesk** |

---

## Complete Tool-by-Tool Compatibility Matrix

Status legend:
- `PORTED` — Ported natively to Fluxer API v1 with adapted schemas, permissions, and tests.
- `ADAPTED` — Ported and enhanced/re-architected specifically for Fluxer semantics.
- `INCOMPATIBLE` — No equivalent endpoint exists in Fluxer API v1 (documented with alternatives where applicable).
- `NEW` — Brand-new Fluxer-native or advanced community administration tool.

### 1. Instance & Self-Hosted (`instance`) — NEW

| Fluxer MCP Tool | Upstream Equivalent | Status | Fluxer Endpoint / Implementation |
| --- | --- | --- | --- |
| `instance_get_discovery` | — | `NEW` | `GET /.well-known/fluxer` (unversioned) |
| `instance_list_badges` | — | `NEW` | `GET /instance/badges` |
| `instance_get_gateway` | — | `NEW` | `GET /gateway/bot` |

### 2. Application (`application`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `application_get_current` | `application_get_current` | `PORTED` | `GET /applications/@me` |
| `application_modify_current` | — | `INCOMPATIBLE` | `PATCH /oauth2/applications/{id}` is user-session-only in Fluxer API v1 (`sessionToken` required, bots denied). |
| `application_get_activity_instance` | — | `INCOMPATIBLE` | Fluxer has no Embedded Activities API. |
| `application_get_role_connection_metadata` | — | `INCOMPATIBLE` | Fluxer has no Linked Role Connection Metadata API. |
| `application_modify_role_connection_metadata` | — | `INCOMPATIBLE` | Fluxer has no Linked Role Connection Metadata API. |
| — | `application_get_public` | `NEW` | `GET /oauth2/applications/{id}/public` |

### 3. Audit Log (`audit_log`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `audit_log_get` | `audit_log_get` | `PORTED` | `GET /guilds/{guild_id}/audit-logs` with all 38 Fluxer `AuditLogActionType` names |
| — | `audit_log_summary` | `NEW` | Aggregated moderation & configuration change report from guild audit logs |

### 4. AutoMod (`automod`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes |
| --- | --- | --- | --- |
| `automod_list_rules` | — | `INCOMPATIBLE` | Fluxer API v1 has no `/auto-moderation/rules` endpoints. Use `intelligence_moderate_content` + `guild_security_audit` + `guild_raid_shield` + Fluxer `explicit_content_filter` / `verification_level`. |
| `automod_get_rule` | — | `INCOMPATIBLE` | Same as above. |
| `automod_create_rule` | — | `INCOMPATIBLE` | Same as above. |
| `automod_modify_rule` | — | `INCOMPATIBLE` | Same as above. |
| `automod_delete_rule` | — | `INCOMPATIBLE` | Same as above. |

### 5. Channels, Forums & Threads (`channels`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `channels_list` | `channels_list` | `PORTED` | `GET /guilds/{guild_id}/channels` (supports Fluxer `GUILD_LINK=998`, content warnings, forum tags) |
| `channels_get` | `channels_get` | `PORTED` | `GET /channels/{channel_id}` |
| `channels_create_guild_channel` | `channels_create_guild_channel` | `ADAPTED` | `POST /guilds/{guild_id}/channels` (supports `GUILD_LINK` `url`, `content_warning_level/text`, `rtc_p2p`, `voice_connection_limit`) |
| `channels_modify` | `channels_modify` | `ADAPTED` | `PATCH /channels/{channel_id}` (supports Fluxer fields + thread properties) |
| `channels_delete` | `channels_delete` | `PORTED` | `DELETE /channels/{channel_id}` (confirmation-gated) |
| `channels_modify_permissions` | `channels_modify_permissions` | `PORTED` | `PUT /channels/{channel_id}/permissions/{overwrite_id}` |
| `channels_delete_permissions` | `channels_delete_permissions` | `PORTED` | `DELETE /channels/{channel_id}/permissions/{overwrite_id}` |
| `channels_trigger_typing` | `channels_trigger_typing` | `PORTED` | `POST /channels/{channel_id}/typing` |
| `channels_follow_announcement` | `channels_follow_announcement` | `PORTED` | `POST /channels/{channel_id}/followers` |
| `channels_forum_create_thread` | `channels_forum_create_thread` | `PORTED` | `POST /channels/{channel_id}/threads` |
| `channels_list_active_threads_guild` | `channels_list_active_threads_guild` | `PORTED` | `GET /guilds/{guild_id}/threads/active` |
| `channels_list_public_archived_threads` | `channels_list_public_archived_threads` | `PORTED` | `GET /channels/{channel_id}/threads/archived/public` |
| `channels_list_private_archived_threads` | `channels_list_private_archived_threads` | `PORTED` | `GET /channels/{channel_id}/threads/archived/private` |
| `channels_list_joined_private_archived_threads` | `channels_list_joined_private_archived_threads` | `PORTED` | `GET /channels/{channel_id}/users/@me/threads/archived/private` |
| — | `channels_get_slowmode` | `NEW` | `GET /channels/{channel_id}/slowmode` |
| — | `channels_get_follower_stats` | `NEW` | `GET /channels/{channel_id}/follower-stats` |
| — | `channels_create_forum_tag` | `NEW` | `POST /channels/{channel_id}/tags` |
| — | `channels_update_forum_tag` | `NEW` | `PUT /channels/{channel_id}/tags/{tag_id}` |
| — | `channels_delete_forum_tag` | `NEW` | `DELETE /channels/{channel_id}/tags/{tag_id}` |
| — | `channels_get_forum_post_data` | `NEW` | `POST /channels/{channel_id}/post-data` |
| — | `channels_search_threads` | `NEW` | `GET /channels/{channel_id}/threads/search` |

### 6. Slash Commands (`commands`) & Interactions (`interactions`) & Components V2 (`components_v2`)

| Upstream Category | Count | Status | Notes |
| --- | ---: | --- | --- |
| `commands_*` | 15 | `INCOMPATIBLE` | Fluxer API v1 has no Application/Slash Commands endpoints. Bots use prefix commands over Gateway or direct MCP tools. |
| `interactions_*` | 8 | `INCOMPATIBLE` | Fluxer API v1 has no Interactions callback/followup endpoints. |
| `components_v2_*` | 8 | `INCOMPATIBLE` | Fluxer API v1 has no Discord Components V2 schema. Use rich embeds (`messages_compose` / `messages_send`) instead. |

### 7. Guild Discovery (`discovery`) — NEW

| Fluxer MCP Tool | Upstream Equivalent | Status | Fluxer Endpoint |
| --- | --- | --- | --- |
| `discovery_list_categories` | — | `NEW` | `GET /discovery/categories` |
| `discovery_search_guilds` | — | `NEW` | `GET /discovery/guilds` |
| `discovery_get_guild_status` | — | `NEW` | `GET /guilds/{guild_id}/discovery` |
| `discovery_apply` | — | `NEW` | `POST /guilds/{guild_id}/discovery` |
| `discovery_update` | — | `NEW` | `PATCH /guilds/{guild_id}/discovery` |
| `discovery_withdraw` | — | `NEW` | `DELETE /guilds/{guild_id}/discovery` |

### 8. Emojis (`emojis`) & App Emojis (`app_emojis`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `emojis_list_guild` | `emojis_list_guild` | `PORTED` | `GET /guilds/{guild_id}/emojis` |
| `emojis_get` | — | `INCOMPATIBLE` | No `GET /guilds/{id}/emojis/{emoji_id}` route in Fluxer; use `emojis_list_guild` or `emojis_get_metadata`. |
| `emojis_create` | `emojis_create` | `PORTED` | `POST /guilds/{guild_id}/emojis` |
| `emojis_modify` | `emojis_modify` | `PORTED` | `PATCH /guilds/{guild_id}/emojis/{emoji_id}` |
| `emojis_delete` | `emojis_delete` | `PORTED` | `DELETE /guilds/{guild_id}/emojis/{emoji_id}` (supports Fluxer `purge` query param) |
| — | `emojis_bulk_create` | `NEW` | `POST /guilds/{guild_id}/emojis/bulk` |
| — | `emojis_clone` | `NEW` | `POST /guilds/{guild_id}/emojis/clone` |
| — | `emojis_get_metadata` | `NEW` | `GET /emojis/{emoji_id}/metadata` |
| — | `emojis_get_source` | `NEW` | `GET /emojis/{emoji_id}/source` |
| `app_emojis_*` (5 tools) | — | `INCOMPATIBLE` | Fluxer API v1 has no application-scoped emojis endpoints. |

### 9. Guild / Community Management & Advanced Orchestration (`guild`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `guild_get` | `guild_get` | `ADAPTED` | `GET /guilds/{guild_id}` (full Fluxer fields: `verification_level`, `mfa_level`, `explicit_content_filter`, `disabled_operations`, `content_warning_*`, `splash_card_alignment`, `badge_ids`, `features`) |
| `guild_modify` | `guild_modify` | `ADAPTED` | `PATCH /guilds/{guild_id}` (Fluxer `GuildUpdateRequest` schema) |
| `guild_get_vanity_url` | `guild_get_vanity_url` | `PORTED` | `GET /guilds/{guild_id}/vanity-url` |
| `guild_blueprint_compile` | `guild_blueprint_compile` | `ADAPTED` | Pure Fluxer natural-language community architect (no Discord template dependency!) |
| `guild_blueprint_plan` | `guild_blueprint_plan` | `ADAPTED` | Target-bound Fluxer dry-run plan with permissions, role hierarchy, hoist positions, forum tags, link channels, signed `plan_ref` |
| `guild_blueprint_apply` | `guild_blueprint_apply` | `ADAPTED` | Confirmation-gated, checkpointed, resumable Fluxer blueprint applier with live readback |
| `guild_blueprint_evidence` | `guild_blueprint_evidence` | `ADAPTED` | Live readback & drift detector against applied Fluxer blueprint |
| `guild_change_plan` | `guild_change_plan` | `ADAPTED` | Bounded in-place change preview with snapshot digest and signed `plan_ref` |
| `guild_change_apply` | `guild_change_apply` | `ADAPTED` | Drift-checked apply preserving IDs and storing pre-change backup |
| `guild_change_restore` | `guild_change_restore` | `ADAPTED` | Restores pre-change guild/role/channel/overwrite state from verified snapshot |
| — | `guild_delete` | `NEW` | `POST /guilds/{guild_id}/delete` (strict confirmation-gated; note Fluxer uses POST not DELETE) |
| — | `guild_update_vanity_url` | `NEW` | `PATCH /guilds/{guild_id}/vanity-url` |
| — | `guild_update_channel_positions` | `NEW` | `PATCH /guilds/{guild_id}/channels` |
| — | `guild_list_invites` | `NEW` | `GET /guilds/{guild_id}/invites` |
| — | `guild_security_audit` | `NEW` | Comprehensive security, misconfiguration, dangerous-permission, invite, webhook & raid-posture audit |
| — | `guild_backup_export` | `NEW` | Complete checksummed JSON export of community settings, roles, hoist positions, channels, overwrites, tags, emojis, stickers, vanity URL, discovery |
| — | `guild_config_diff` | `NEW` | Compare two community backups or backup vs live guild with security-impact annotations |
| — | `guild_clone_plan` | `NEW` | Generate previewable, approval-bound duplication/restore plan from a source guild or backup to a target guild |
| — | `guild_raid_shield` | `NEW` | Anti-raid assessment and reversible lockdown / restore coordinator |
| `guild_begin_prune` / `guild_get_prune_count` | — | `INCOMPATIBLE` | No member prune endpoint in Fluxer API v1. |
| `guild_list_integrations` / `guild_delete_integration` | — | `INCOMPATIBLE` | No guild integrations endpoint in Fluxer API v1. |
| `guild_get_welcome_screen` / `guild_modify_welcome_screen` | — | `INCOMPATIBLE` | No welcome screen endpoint; Fluxer uses `rules_channel_id`, `system_channel_id`, `system_channel_flags` in `guild_modify` + pinned/welcome messages. |
| `guild_get_widget*` (3) / `guild_modify_widget` | — | `INCOMPATIBLE` | No guild widget API in Fluxer API v1. |
| `guild_list_voice_regions` | — | `INCOMPATIBLE` | No guild voice-regions endpoint (`GET /channels/{id}/rtc-regions` is user-session-only). |
| `guild_modify_current_voice_state` / `guild_modify_user_voice_state` | — | `INCOMPATIBLE` | No REST voice-state endpoints; use `members_voice_moderate` (`PATCH /guilds/{id}/members/{user_id}` with `mute`, `deaf`, `channel_id`). |

### 10. Invites (`invites`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `invites_list_channel` | `invites_list_channel` | `PORTED` | `GET /channels/{channel_id}/invites` |
| `invites_create_channel` | `invites_create_channel` | `PORTED` | `POST /channels/{channel_id}/invites` |
| `invites_get` | `invites_get` | `PORTED` | `GET /invites/{invite_code}` |
| `invites_delete` | `invites_delete` | `PORTED` | `DELETE /invites/{invite_code}` |
| — | `invites_list_guild` | `NEW` | `GET /guilds/{guild_id}/invites` |

### 11. Members & Moderation (`members`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `members_list` | `members_list` | `PORTED` | `GET /guilds/{guild_id}/members` |
| `members_get` | `members_get` | `PORTED` | `GET /guilds/{guild_id}/members/{user_id}` |
| `members_search` | `members_search` | `ADAPTED` | `POST /guilds/{guild_id}/members-search` (Fluxer rich filter body) |
| `members_get_current_user` | `members_get_current_user` | `PORTED` | `GET /guilds/{guild_id}/members/@me` |
| `members_modify` | `members_modify` | `ADAPTED` | `PATCH /guilds/{guild_id}/members/{user_id}` (adds Fluxer `timeout_reason`, `mute`, `deaf`, `channel_id`, `bio`, `pronouns`) |
| `members_modify_current` | `members_modify_current` | `ADAPTED` | `PATCH /guilds/{guild_id}/members/@me` |
| `members_add_role` | `members_add_role` | `PORTED` | `PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id}` |
| `members_remove_role` | `members_remove_role` | `PORTED` | `DELETE /guilds/{guild_id}/members/{user_id}/roles/{role_id}` |
| `members_bulk_add_role` | `members_bulk_add_role` | `PORTED` | Batched concurrent role assignment with partial-failure reporting |
| `members_kick` | `members_kick` | `PORTED` | `DELETE /guilds/{guild_id}/members/{user_id}` (confirmation-gated) |
| `members_ban` | `members_ban` | `ADAPTED` | `PUT /guilds/{guild_id}/bans/{user_id}` (supports Fluxer native `ban_duration_seconds` temp-bans + `reason` body!) |
| `members_bulk_ban` | `members_bulk_ban` | `ADAPTED` | Coordinated bounded batch ban via Fluxer `PUT /bans/{user_id}` (confirmation-gated) |
| `members_unban` | `members_unban` | `PORTED` | `DELETE /guilds/{guild_id}/bans/{user_id}` |
| `members_list_bans` | `members_list_bans` | `PORTED` | `GET /guilds/{guild_id}/bans` (includes Fluxer `moderator_id`, `banned_at`, `expires_at`) |
| `members_get_ban` | `members_get_ban` | `PORTED` | `GET /guilds/{guild_id}/bans/{user_id}` |
| — | `members_bulk_remove_role` | `NEW` | Batched concurrent role removal with partial-failure reporting |
| — | `members_timeout` | `NEW` | Ergonomic timeout/clear-timeout helper with Fluxer `timeout_reason` |
| — | `members_voice_moderate` | `NEW` | Voice server-mute, deafen, move channel, or disconnect via Fluxer member PATCH |

### 12. Messages, Pins & Search (`messages`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `messages_send` | `messages_send` | `ADAPTED` | `POST /channels/{channel_id}/messages` (up to 4000 chars, embeds, replies, allowed_mentions, flags) |
| `messages_read` | `messages_read` | `PORTED` | `GET /channels/{channel_id}/messages` with untrusted content fencing |
| `messages_get` | `messages_get` | `PORTED` | `GET /channels/{channel_id}/messages/{message_id}` |
| `messages_edit` | `messages_edit` | `PORTED` | `PATCH /channels/{channel_id}/messages/{message_id}` |
| `messages_delete` | `messages_delete` | `PORTED` | `DELETE /channels/{channel_id}/messages/{message_id}` (confirmation-gated) |
| `messages_bulk_delete` | `messages_bulk_delete` | `PORTED` | `POST /channels/{channel_id}/messages/bulk-delete` (confirmation-gated) |
| `messages_pin` | `messages_pin` | `PORTED` | `PUT /channels/{channel_id}/pins/{message_id}` |
| `messages_unpin` | `messages_unpin` | `PORTED` | `DELETE /channels/{channel_id}/pins/{message_id}` |
| `messages_list_pins` | `messages_list_pins` | `ADAPTED` | `GET /channels/{channel_id}/messages/pins` (Fluxer paginated `{ items, has_more }`) |
| `messages_crosspost` | `messages_crosspost` | `PORTED` | `POST /channels/{channel_id}/messages/{message_id}/crosspost` |
| `messages_create_thread` | `messages_create_thread` | `PORTED` | `POST /channels/{channel_id}/messages/{message_id}/threads` |
| `messages_context` | `messages_context` | `ADAPTED` | Bounded conversation context with Fluxer jump-URL citations |
| `messages_search_recent` | `messages_search_recent` | `PORTED` | Bounded client-side scan over recent channel messages |
| `messages_compose` | `messages_compose` | `ADAPTED` | Local rich-embed message builder & validator (Fluxer `RichEmbedRequest`) |
| `messages_publish` | `messages_publish` | `ADAPTED` | Publish composed rich message to channel |
| `messages_update` | `messages_update` | `ADAPTED` | Update published rich message in channel |
| — | `messages_search` | `NEW` | `POST /search/messages` — Fluxer native bot-accessible full-text search! |
| — | `messages_delete_attachment` | `NEW` | `DELETE /channels/{channel_id}/messages/{message_id}/attachments/{attachment_id}` |
| — | `messages_get_crosspost_source` | `NEW` | `GET /channels/{channel_id}/messages/{message_id}/crosspost-source` |
| — | `messages_refresh_attachment_urls` | `NEW` | `POST /attachments/refresh-urls` |

### 13. Permissions (`permissions`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes |
| --- | --- | --- | --- |
| `permissions_audit_channel` | `permissions_audit_channel` | `ADAPTED` | Fluxer 37+4 permission bitfield evaluation per role |
| `permissions_explain` | `permissions_explain` | `ADAPTED` | Step-by-step effective permission trace for a member in a channel/thread |
| `permissions_member_access_report` | `permissions_member_access_report` | `ADAPTED` | Guild-wide channel access matrix for a member |

### 14. Reactions (`reactions`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `reactions_create` | `reactions_create` | `PORTED` | `PUT /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me` |
| `reactions_delete_own` | `reactions_delete_own` | `PORTED` | `DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me` |
| `reactions_delete_user` | `reactions_delete_user` | `PORTED` | `DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/{user_id}` |
| `reactions_delete_all` | `reactions_delete_all` | `PORTED` | `DELETE /channels/{channel_id}/messages/{message_id}/reactions` |
| `reactions_list` | `reactions_list` | `PORTED` | `GET /channels/{channel_id}/messages/{message_id}/reactions/{emoji}` |
| — | `reactions_delete_emoji` | `NEW` | `DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}` |

### 15. Roles (`roles`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `roles_list` | `roles_list` | `ADAPTED` | `GET /guilds/{guild_id}/roles` (includes Fluxer `hoist_position`) |
| `roles_create` | `roles_create` | `ADAPTED` | `POST /guilds/{guild_id}/roles` (supports `icon_source_role_id`) |
| `roles_modify` | `roles_modify` | `ADAPTED` | `PATCH /guilds/{guild_id}/roles/{role_id}` (supports `hoist_position`) |
| `roles_delete` | `roles_delete` | `PORTED` | `DELETE /guilds/{guild_id}/roles/{role_id}` (confirmation-gated) |
| `roles_modify_positions` | `roles_modify_positions` | `ADAPTED` | `PATCH /guilds/{guild_id}/roles` (handles Fluxer 204 No Content response) |
| — | `roles_modify_hoist_positions` | `NEW` | `PATCH /guilds/{guild_id}/roles/hoist-positions` |
| — | `roles_reset_hoist_positions` | `NEW` | `DELETE /guilds/{guild_id}/roles/hoist-positions` |
| — | `roles_analyze_hierarchy` | `NEW` | Full role hierarchy, hoist alignment, privilege escalation & dangerous-permission analyzer |

### 16. Stickers (`stickers`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `stickers_list_guild` | `stickers_list_guild` | `PORTED` | `GET /guilds/{guild_id}/stickers` |
| `stickers_get` | `stickers_get_metadata` | `ADAPTED` | `GET /stickers/{sticker_id}/metadata` |
| `stickers_create_guild_sticker` | `stickers_create_guild_sticker` | `ADAPTED` | `POST /guilds/{guild_id}/stickers` (Fluxer JSON `{ name, description, tags, image }`) |
| `stickers_modify_guild_sticker` | `stickers_modify_guild_sticker` | `PORTED` | `PATCH /guilds/{guild_id}/stickers/{sticker_id}` |
| `stickers_delete_guild_sticker` | `stickers_delete_guild_sticker` | `PORTED` | `DELETE /guilds/{guild_id}/stickers/{sticker_id}` (supports `purge` query param) |
| `stickers_get_guild_sticker` | — | `INCOMPATIBLE` | No single guild sticker GET; use `stickers_list_guild` or `stickers_get_metadata`. |
| `stickers_list_packs` | — | `INCOMPATIBLE` | Fluxer has no Nitro sticker packs endpoint. |
| — | `stickers_bulk_create` | `NEW` | `POST /guilds/{guild_id}/stickers/bulk` |
| — | `stickers_clone` | `NEW` | `POST /guilds/{guild_id}/stickers/clone` |
| — | `stickers_get_source` | `NEW` | `GET /stickers/{sticker_id}/source` |

### 17. Threads (`threads`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `threads_join` | `threads_join` | `PORTED` | `PUT /channels/{channel_id}/thread-members/@me` |
| `threads_leave` | `threads_leave` | `PORTED` | `DELETE /channels/{channel_id}/thread-members/@me` |
| `threads_add_member` | `threads_add_member` | `PORTED` | `PUT /channels/{channel_id}/thread-members/{user_id}` |
| `threads_remove_member` | `threads_remove_member` | `PORTED` | `DELETE /channels/{channel_id}/thread-members/{user_id}` |
| `threads_get_member` | `threads_get_member` | `PORTED` | `GET /channels/{channel_id}/thread-members/{user_id}` |
| `threads_list_members` | `threads_list_members` | `PORTED` | `GET /channels/{channel_id}/thread-members` |

### 18. Users (`users`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `users_get_current` | `users_get_current` | `PORTED` | `GET /users/@me` |
| `users_get` | `users_get` | `PORTED` | `GET /users/{user_id}` |
| `users_modify_current` | `users_modify_current` | `ADAPTED` | `PATCH /users/@me` (supports Fluxer `global_name`, `bio`, `pronouns`, `accent_color`, `avatar`, `banner`) |
| `users_list_current_user_guilds` | `users_list_current_user_guilds` | `PORTED` | `GET /users/@me/guilds` |
| `users_leave_guild` | `users_leave_guild` | `PORTED` | `DELETE /users/@me/guilds/{guild_id}` (confirmation-gated) |
| `users_create_dm` | `users_create_dm` | `PORTED` | `POST /users/@me/channels` (DM-consent-gated) |
| — | `users_get_profile` | `NEW` | `GET /users/{target_id}/profile` |
| — | `users_list_dm_channels` | `NEW` | `GET /users/@me/channels` |

### 19. Webhooks (`webhooks`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes / Fluxer Endpoint |
| --- | --- | --- | --- |
| `webhooks_list_channel` | `webhooks_list_channel` | `PORTED` | `GET /channels/{channel_id}/webhooks` |
| `webhooks_list_guild` | `webhooks_list_guild` | `PORTED` | `GET /guilds/{guild_id}/webhooks` |
| `webhooks_create` | `webhooks_create` | `PORTED` | `POST /channels/{channel_id}/webhooks` |
| `webhooks_get` | `webhooks_get` | `PORTED` | `GET /webhooks/{webhook_id}` |
| `webhooks_get_with_token` | `webhooks_get_with_token` | `PORTED` | `GET /webhooks/{webhook_id}/{token}` |
| `webhooks_modify` | `webhooks_modify` | `PORTED` | `PATCH /webhooks/{webhook_id}` |
| `webhooks_modify_with_token` | `webhooks_modify_with_token` | `PORTED` | `PATCH /webhooks/{webhook_id}/{token}` |
| `webhooks_delete` | `webhooks_delete` | `PORTED` | `DELETE /webhooks/{webhook_id}` |
| `webhooks_delete_with_token` | `webhooks_delete_with_token` | `PORTED` | `DELETE /webhooks/{webhook_id}/{token}` |
| `webhooks_execute` | `webhooks_execute` | `PORTED` | `POST /webhooks/{webhook_id}/{token}` |
| `webhooks_get_message` | `webhooks_get_message` | `PORTED` | `GET /webhooks/{webhook_id}/{token}/messages/{message_id}` |
| `webhooks_edit_message` | `webhooks_edit_message` | `PORTED` | `PATCH /webhooks/{webhook_id}/{token}/messages/{message_id}` |
| `webhooks_delete_message` | `webhooks_delete_message` | `PORTED` | `DELETE /webhooks/{webhook_id}/{token}/messages/{message_id}` |
| — | `webhooks_execute_github` | `NEW` | `POST /webhooks/{webhook_id}/{token}/github` |
| — | `webhooks_execute_slack` | `NEW` | `POST /webhooks/{webhook_id}/{token}/slack` |
| — | `webhooks_execute_instatus` | `NEW` | `POST /webhooks/{webhook_id}/{token}/instatus` |
| — | `webhooks_execute_libredesk` | `NEW` | `POST /webhooks/{webhook_id}/{token}/libredesk` |

### 20. Intelligence, Inspiration & Meta/Workflows (`intelligence`, `inspiration`, `meta`)

| Upstream Tool | Fluxer MCP Tool | Status | Notes |
| --- | --- | --- | --- |
| `intelligence_summarize_channel` | `intelligence_summarize_channel` | `ADAPTED` | Reads Fluxer channel messages + structured summary/highlights |
| `intelligence_classify_messages` | `intelligence_classify_messages` | `ADAPTED` | Classifies messages (support, bug, spam, announcement, discussion, etc.) |
| `intelligence_extract_entities` | `intelligence_extract_entities` | `ADAPTED` | Extracts mentions, channels, URLs, emails, invites, dates, code blocks |
| `intelligence_moderate_content` | `intelligence_moderate_content` | `ADAPTED` | Heuristic content & spam/raid moderation scanner (compensates for absent server-side AutoMod API) |
| `intelligence_draft_response` | `intelligence_draft_response` | `ADAPTED` | Context-grounded reply draft without mutating Fluxer |
| `inspiration_emoji_gg_search` | `inspiration_emoji_gg_search` | `PORTED` | Read-only external emoji discovery for `emojis_create` / `emojis_bulk_create` |
| `discord_intent_plan` | `fluxer_intent_plan` | `ADAPTED` | Maps natural-language goals to Fluxer MCP tools, permissions, and execution order |
| `mcp_pipeline` | `mcp_pipeline` | `ADAPTED` | Multi-step tool pipeline with `${step.field}` interpolation and conditional execution |
| `workflow_start` / `workflow_status` / `workflow_resume` / `workflow_cancel` | `workflow_*` (4 tools) | `ADAPTED` | Durable local checkpointed multi-step workflow execution |

### 21. Fully Incompatible Discord-Only Categories (Documented Limitations)

| Upstream Category | Tools | Reason | Native Fluxer Alternative |
| --- | ---: | --- | --- |
| `events` (Scheduled Events) | 6 | No guild scheduled events API in Fluxer v1 | Announcement channels + pinned schedule embeds |
| `stage_instances` | 4 | No Stage channel type (`13`) or stage instances in Fluxer v1 | Voice channels (`GUILD_VOICE=2`) + `members_voice_moderate` |
| `polls` | 2 | No native polls API in Fluxer v1 | Reaction-based voting via `messages_send` + `reactions_create` + `reactions_list` |
| `monetization` | 8 | No third-party app SKUs/Entitlements/Subscriptions API | None (Fluxer Plutonium billing is platform-owned) |
| `onboarding` | 2 | No Discord Guild Onboarding prompts API | `rules_channel_id` + `system_channel_id` + `guild_blueprint_plan` welcome/rules channel setup |
| `soundboard` | 7 | No guild soundboard API (only user-scoped `/users/@me/entrance-sounds`) | None for bots |
| `templates` | 9 | No `/guilds/templates` API in Fluxer v1 | **`guild_backup_export`**, **`guild_config_diff`**, **`guild_clone_plan`**, **`guild_blueprint_compile`**, **`guild_blueprint_plan`** |
| `voice` (REST state) | 3 | No REST `/voice/regions` or `/guilds/{id}/voice-states` endpoints (`rtc-regions` is user-only) | **`members_voice_moderate`** (mute/deafen/move/disconnect) + Gateway `VOICE_STATE_UPDATE` subscriptions |
