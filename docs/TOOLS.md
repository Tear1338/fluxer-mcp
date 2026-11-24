# Fluxer MCP — Exhaustive Tool Reference (184 Tools)

Generated directly from `@fluxer-mcp/core`. Every tool targets verified Fluxer API v1 endpoints or deterministic local analysis.

| Category | Tool Count |
| --- | ---: |
| `application` | 2 |
| `audit_log` | 2 |
| `channels` | 23 |
| `discovery` | 6 |
| `emojis` | 8 |
| `guild` | 21 |
| `inspiration` | 1 |
| `instance` | 5 |
| `intelligence` | 5 |
| `invites` | 5 |
| `members` | 18 |
| `messages` | 23 |
| `meta` | 6 |
| `permissions` | 3 |
| `reactions` | 6 |
| `roles` | 8 |
| `stickers` | 8 |
| `threads` | 6 |
| `users` | 11 |
| `webhooks` | 17 |

## `application` (2)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `application_get_current` | read | No | Fetch the current Fluxer bot application metadata (`GET /applications/@me`): id, name, description, bot_public, bot_require_code_grant, verify_key, owner, and bot user info. |
| `application_get_public` | read | No | Fetch public metadata for any Fluxer application/bot by ID (`GET /oauth2/applications/{id}/public`). Useful for auditing bots installed in a community. |

## `audit_log` (2)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `audit_log_get` | read | No | Fetch Fluxer guild audit log entries (`GET /guilds/{guild_id}/audit-logs`) with human-readable Fluxer action names (all 38 Fluxer AuditLogActionTypes). Supports filtering by actor user_id, action_type, and cursor pagination (before/after). |
| `audit_log_summary` | read | No | Aggregate recent guild audit logs into an operational security & moderation summary: counts by action type, top moderators/actors, recent bans/kicks/role-permission changes, and anomaly flags (mass bans, mass channel/role deletions, webhook creations). |

## `channels` (23)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `channels_add_group_dm_recipient` | write | No | Add a user to a Fluxer Group DM channel (`PUT /channels/{channel_id}/recipients/{user_id}`). |
| `channels_bulk_set_overwrites` | write | No | Grouped operation: apply (or preview) a Fluxer permission overwrite across up to 50 channels or every channel inside a target category in one coordinated call. Set `preview: true` to inspect affected channels without mutating Fluxer. |
| `channels_create_forum_tag` | write | No | Create a new tag on a Fluxer forum or media channel (`POST /channels/{channel_id}/tags`). |
| `channels_create_guild_channel` | write | No | Create a new channel in a Fluxer guild (`POST /guilds/{guild_id}/channels`). Supports Fluxer types: 0=GUILD_TEXT, 2=GUILD_VOICE, 4=GUILD_CATEGORY, 5=GUILD_ANNOUNCEMENT, 15=GUILD_FORUM, 16=GUILD_MEDIA, and Fluxer-native 998=GUILD_LINK (with `url`). Also supports content warnings, forum tags, voice connection limits, and initial permission overwrites. |
| `channels_delete` | destructive | Yes | Permanently delete a Fluxer channel or thread (`DELETE /channels/{channel_id}`). DESTRUCTIVE and confirmation-gated. |
| `channels_delete_forum_tag` | destructive | Yes | Delete a tag from a Fluxer forum or media channel (`DELETE /channels/{channel_id}/tags/{tag_id}`). Confirmation-gated. |
| `channels_delete_permissions` | destructive | Yes | Remove a permission overwrite from a Fluxer channel (`DELETE /channels/{channel_id}/permissions/{overwrite_id}`). Confirmation-gated. |
| `channels_follow_announcement` | write | No | Follow a Fluxer announcement channel so published messages crosspost into `webhook_channel_id` (`POST /channels/{channel_id}/followers`). |
| `channels_forum_create_thread` | write | No | Start a standalone thread in a text/announcement channel or create a new post in a forum/media channel (`POST /channels/{channel_id}/threads`). |
| `channels_get` | read | No | Fetch complete metadata for a Fluxer channel or thread (`GET /channels/{channel_id}`), including permission_overwrites, forum available_tags, content_warning settings, link URL, and thread_metadata. |
| `channels_get_follower_stats` | read | No | Fetch Fluxer-native follower statistics for an announcement channel (`GET /channels/{channel_id}/follower-stats`). |
| `channels_get_forum_post_data` | read | No | Fetch Fluxer-native forum post metadata (starter messages & counts) for up to 50 thread IDs (`POST /channels/{channel_id}/post-data`). |
| `channels_get_slowmode` | read | No | Fetch Fluxer-native channel slowmode state (`GET /channels/{channel_id}/slowmode`): rate_limit_per_user, retry_after_ms, next_send_allowed_at, and can_bypass. |
| `channels_list` | read | No | List all channels in a Fluxer guild (`GET /guilds/{guild_id}/channels`), including categories, text, voice, announcement, forum, media, and Fluxer-native GUILD_LINK (998) channels. |
| `channels_list_active_threads_guild` | read | No | List all active threads in a Fluxer guild (`GET /guilds/{guild_id}/threads/active`). |
| `channels_list_joined_private_archived_threads` | read | No | List archived private threads the bot has joined (`GET /channels/{channel_id}/users/@me/threads/archived/private`). |
| `channels_list_private_archived_threads` | read | No | List archived private threads in a Fluxer channel (`GET /channels/{channel_id}/threads/archived/private`). |
| `channels_list_public_archived_threads` | read | No | List archived public threads in a Fluxer channel (`GET /channels/{channel_id}/threads/archived/public`). |
| `channels_modify` | write | No | Update settings on a Fluxer channel or thread (`PATCH /channels/{channel_id}`). Pass only fields to change (name, topic, url, nsfw, slowmode, parent_id, position, content warnings, voice settings, forum settings, or thread archived/locked/auto_archive_duration/applied_tags). |
| `channels_modify_permissions` | write | No | Set or update a permission overwrite for a role (type=0) or member (type=1) on a Fluxer channel (`PUT /channels/{channel_id}/permissions/{overwrite_id}`). |
| `channels_search_threads` | read | No | Search threads and forum posts in a Fluxer channel (`GET /channels/{channel_id}/threads/search`) by name, tags, archived state, and sort order. |
| `channels_trigger_typing` | write | No | Trigger a typing indicator in a Fluxer channel (`POST /channels/{channel_id}/typing`). |
| `channels_update_forum_tag` | write | No | Update an existing tag on a Fluxer forum or media channel (`PUT /channels/{channel_id}/tags/{tag_id}`). |

## `discovery` (6)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `discovery_apply` | write | No | Submit a Fluxer Guild Discovery application (`POST /guilds/{guild_id}/discovery`) with description, category_type, primary_language, and custom_tags. |
| `discovery_get_guild_status` | read | No | Check a guild's Fluxer Discovery eligibility, minimum member count, and current discovery application status (`GET /guilds/{guild_id}/discovery`). |
| `discovery_list_categories` | read | No | List all Fluxer Guild Discovery categories (`GET /discovery/categories`) available on this Fluxer instance. |
| `discovery_search_guilds` | read | No | Search public discoverable Fluxer communities (`GET /discovery/guilds`) by query, category, language, tag, and sort order. |
| `discovery_update` | write | No | Update an existing Fluxer Guild Discovery listing or application (`PATCH /guilds/{guild_id}/discovery`). |
| `discovery_withdraw` | destructive | Yes | Withdraw a guild's Fluxer Discovery application or remove it from Discovery (`DELETE /guilds/{guild_id}/discovery`). Confirmation-gated. |

## `emojis` (8)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `emojis_bulk_create` | write | No | Fluxer-native: bulk-create multiple custom emojis in one API call (`POST /guilds/{guild_id}/emojis/bulk`). |
| `emojis_clone` | write | No | Fluxer-native: clone an existing Fluxer emoji by ID into the target guild (`POST /guilds/{guild_id}/emojis/clone`). |
| `emojis_create` | write | No | Create a custom guild emoji (`POST /guilds/{guild_id}/emojis`) using a base64 data URI image. |
| `emojis_delete` | destructive | Yes | Delete a custom guild emoji (`DELETE /guilds/{guild_id}/emojis/{emoji_id}`). Supports Fluxer `purge` query flag. Confirmation-gated. |
| `emojis_get_metadata` | read | No | Fluxer-native: get metadata for any custom emoji by ID (`GET /emojis/{emoji_id}/metadata`). |
| `emojis_get_source` | read | No | Fluxer-native: look up the source guild of a custom emoji (`GET /emojis/{emoji_id}/source`). |
| `emojis_list_guild` | read | No | List all custom emojis in a Fluxer guild (`GET /guilds/{guild_id}/emojis`). |
| `emojis_modify` | write | No | Rename a custom guild emoji (`PATCH /guilds/{guild_id}/emojis/{emoji_id}`). |

## `guild` (21)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `guild_backup_export` | read | No | Export a complete, checksummed, HMAC-signed configuration backup of a Fluxer community (guild settings, roles + hoist positions, channels + categories + forum tags + link URLs + overwrites, emojis, stickers, vanity URL, discovery status, and invites). Stored locally and returned for diffing, restoration, or community cloning. |
| `guild_blueprint_apply` | destructive | Yes | Execute a signed Fluxer blueprint or clone plan (`plan_ref`) against its locked target guild. Idempotently creates missing roles, categories, channels (with overwrites & forum tags), applies safe guild settings, posts starter messages, and verifies live readback. Confirmation-gated. |
| `guild_blueprint_compile` | read | No | Design-only, zero-API-call compiler: transforms any natural-language community description (English or French) into a complete, security-hardened Fluxer community blueprint (roles, Fluxer permission bitfields, categories, text/announcement/voice/forum/media/link channels, forum tags, staff area, and welcome/rules posts). |
| `guild_blueprint_evidence` | read | No | Verify live Fluxer guild state against a signed blueprint `plan_ref` and report whether every planned role, category, and channel is present (`verified`) or missing/drifted (`drifted`). |
| `guild_blueprint_plan` | read | No | Required first step to build or structure a complete Fluxer community from a natural-language prompt. Reads live guild state, computes a non-destructive diff of missing roles, categories, channels, overwrites, and starter posts, checks bot permissions, saves a signed local `plan_ref`, and performs ZERO mutations. |
| `guild_change_apply` | destructive | Yes | Apply a verified `guild_change_plan` (`plan_ref`) to its locked Fluxer guild. Preserves pre-change snapshot for rollback via `guild_change_restore`. Confirmation-gated. |
| `guild_change_plan` | read | No | Inspect a live Fluxer guild and prepare a signed, previewable in-place change plan for bounded role, channel, and permission-overwrite edits. Preserves IDs and snapshots the pre-change state for rollback via `guild_change_restore`. |
| `guild_change_restore` | destructive | Yes | Roll back roles, channels, and permission overwrites edited by a previous `guild_change_plan` back to the exact signed pre-change snapshot. Confirmation-gated. |
| `guild_clone_plan` | read | No | Generate a non-destructive, previewable duplication/restore plan to replicate roles, categories, channels, and guild settings from a source Fluxer guild or exported backup into a target Fluxer guild. Produces a signed plan reference usable with `guild_blueprint_apply`. |
| `guild_config_diff` | read | No | Compare two Fluxer community configurations — either two saved backup IDs, a saved backup against a live guild, or two live guilds — and report added/removed/changed roles, permissions, channels, overwrites, and security settings. |
| `guild_configure_welcome` | write | No | Configure Fluxer community welcome & rules systems in one coordinated operation: sets `system_channel_id`, `system_channel_flags` (join notifications), and `rules_channel_id` via `PATCH /guilds/{guild_id}`, and optionally posts & pins a rich welcome/rules embed. Set `preview: true` to inspect changes without mutating Fluxer. |
| `guild_delete` | destructive | Yes | Permanently delete a Fluxer guild (`POST /guilds/{guild_id}/delete`). IRREVERSIBLE and strictly confirmation-gated (requires guild ownership, MCP_DRY_RUN=false, and __confirm: true). Note: Fluxer uses POST /delete rather than HTTP DELETE. |
| `guild_get` | read | No | Fetch complete Fluxer community (guild) metadata (`GET /guilds/{guild_id}`): verification_level (0..3), mfa_level, explicit_content_filter, nsfw_level, content_warning settings, disabled_operations, features, badge_ids, rules/system/afk channels, vanity_url_code, and member counts. |
| `guild_get_vanity_url` | read | No | Get a Fluxer guild's custom vanity URL code and use count (`GET /guilds/{guild_id}/vanity-url`). |
| `guild_list_invites` | read | No | List all active invites across a Fluxer guild (`GET /guilds/{guild_id}/invites`). |
| `guild_modify` | write | No | Update Fluxer guild settings (`PATCH /guilds/{guild_id}`). Supports name, verification_level (0=NONE..3=HIGH), mfa_level (0..1), explicit_content_filter (0..2), default_message_notifications (0..1), system/afk channels, system_channel_flags, nsfw/nsfw_level, content_warning_level/text, splash_card_alignment, icon/banner/splash, features, and message_history_cutoff. |
| `guild_raid_shield` | write | No | Anti-raid & emergency lockdown coordinator for Fluxer communities. Modes: `assess` (read-only posture check), `lockdown` (saves pre-lockdown snapshot and raises verification_level to HIGH + removes CREATE_INSTANT_INVITE / SEND_MESSAGES / ADD_REACTIONS from @everyone, previewable unless `apply: true`), and `restore` (reverts guild & @everyone permissions from the saved pre-lockdown snapshot). |
| `guild_remediate_plan` | read | No | Automated inconsistency & security misconfiguration detector + restorable remediation planner. Inspects live Fluxer guild settings, `@everyone` dangerous permissions, and exposed rules/announcement channel overwrites, then saves a signed, previewable `plan_ref` executable via `guild_change_apply` and reversible via `guild_change_restore`. Performs ZERO mutations. |
| `guild_security_audit` | read | No | Perform a comprehensive Fluxer community security & misconfiguration audit. Inspects verification_level, MFA moderation enforcement, explicit_content_filter, @everyone dangerous permissions, overly privileged roles (ADMINISTRATOR / MANAGE_ROLES), channel overwrite exposure leaks, unexpiring/unlimited invites, active webhooks, and raid flags. Returns a 0-100 security score, prioritized findings, and concrete remediation actions. |
| `guild_update_channel_positions` | write | No | Bulk-reorder channels and move channels between categories (`PATCH /guilds/{guild_id}/channels`). Supports Fluxer `preceding_sibling_id` and `lock_permissions`. |
| `guild_update_vanity_url` | write | No | Fluxer-native: set or clear a guild's custom vanity URL (`PATCH /guilds/{guild_id}/vanity-url`). Requires VANITY_URL guild feature. |

## `inspiration` (1)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `inspiration_emoji_gg_search` | read | No | Search public community emojis on emoji.gg (read-only external lookup) to discover artwork candidates for `emojis_create` / `emojis_bulk_create`. |

## `instance` (5)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `instance_get_discovery` | read | No | Fetch the Fluxer instance discovery document (`GET /.well-known/fluxer`). Reports API version, public/gateway/media/webapp endpoints, enabled features (voice, discovery, self_hosted, SSO, registration mode), community settings, and message/emoji/sticker limits. Essential for adapting to Cloud vs self-hosted Fluxer instances. |
| `instance_get_gateway` | read | No | Fetch Fluxer WebSocket Gateway connection info (`GET /gateway/bot`), including WebSocket URL, recommended shard count, and session_start_limit. |
| `instance_get_gateway_events` | read | No | Inspect live Fluxer WebSocket Gateway connection state, heartbeat ACK latency, and recent buffered dispatch events (requires GATEWAY=true at server startup). |
| `instance_list_badges` | read | No | List community badges defined on this Fluxer instance (`GET /instance/badges`). Useful for inspecting guild badge IDs on Cloud or custom self-hosted instances. |
| `instance_list_experiments` | read | No | Fetch Fluxer instance & bot experiment feature-flag assignments (`GET /experiments`). Useful for checking feature rollouts on Cloud or self-hosted Fluxer instances. |

## `intelligence` (5)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `intelligence_classify_messages` | read | No | Classify recent Fluxer channel messages into operational categories (`question`, `bug_report`, `announcement`, `moderation_risk`, `feedback`, `general`). |
| `intelligence_draft_response` | read | No | Inspect recent channel context and assemble a structured non-mutating reply brief & draft template for human or AI review before calling `messages_send`. |
| `intelligence_extract_entities` | read | No | Extract structured entities from recent Fluxer messages: URLs, Fluxer user/role/channel mentions, invite codes, and fenced code blocks. |
| `intelligence_moderate_content` | read | No | Read-only heuristic moderation & spam/raid scanner (compensates for Fluxer having no server-side AutoMod API). Scores text or recent channel messages for spam, phishing/giveaway scams, invite links, mass mentions, duplicate message bursts, and excessive caps, recommending exact moderation actions. |
| `intelligence_summarize_channel` | read | No | Analyze recent messages in a Fluxer channel and produce a structured activity digest (message count, active participants, top keywords, link count, and fenced recent highlights). |

## `invites` (5)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `invites_create_channel` | write | No | Create a new invite for a Fluxer channel (`POST /channels/{channel_id}/invites`). Supports max_age (seconds, 0=never), max_uses (0=unlimited), temporary membership, and unique code generation. |
| `invites_delete` | destructive | Yes | Revoke/delete a Fluxer invite (`DELETE /invites/{invite_code}`). Confirmation-gated. |
| `invites_get` | read | No | Inspect a Fluxer invite by code (`GET /invites/{invite_code}`), including guild, channel, inviter, and member/presence counts. |
| `invites_list_channel` | read | No | List active invites targeting a specific Fluxer channel (`GET /channels/{channel_id}/invites`). |
| `invites_list_guild` | read | No | List all active invites across a Fluxer guild (`GET /guilds/{guild_id}/invites`), including uses, max_uses, max_age, temporary flag, and inviter. |

## `members` (18)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `members_add_role` | write | No | Assign a role to a Fluxer guild member (`PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id}`). |
| `members_ban` | destructive | Yes | Ban a user from a Fluxer guild (`PUT /guilds/{guild_id}/bans/{user_id}`). Supports Fluxer-native temporary bans via `ban_duration_seconds`, message purge via `delete_message_seconds` (0..604800), and `reason`. Confirmation-gated. |
| `members_bulk_add_role` | write | No | Assign a role to up to 50 Fluxer guild members in one coordinated batch with per-user status reporting. |
| `members_bulk_ban` | destructive | Yes | Ban up to 50 users from a Fluxer guild in one coordinated batch (`PUT /guilds/{guild_id}/bans/{user_id}` per user). Supports Fluxer-native `ban_duration_seconds` and `delete_message_seconds`. Confirmation-gated. |
| `members_bulk_remove_role` | write | No | Remove a role from up to 50 Fluxer guild members in one coordinated batch with per-user status reporting. |
| `members_get` | read | No | Fetch a single member record in a Fluxer guild (`GET /guilds/{guild_id}/members/{user_id}`). |
| `members_get_ban` | read | No | Inspect a specific ban record in a Fluxer guild (`GET /guilds/{guild_id}/bans/{user_id}`). |
| `members_get_current_user` | read | No | Fetch the current bot's own member record in a Fluxer guild (`GET /guilds/{guild_id}/members/@me`). |
| `members_kick` | destructive | Yes | Kick a member from a Fluxer guild (`DELETE /guilds/{guild_id}/members/{user_id}`). Confirmation-gated. |
| `members_list` | read | No | List members in a Fluxer guild (`GET /guilds/{guild_id}/members`) with cursor pagination. |
| `members_list_bans` | read | No | List all banned users in a Fluxer guild (`GET /guilds/{guild_id}/bans`), including Fluxer-native `moderator_id`, `banned_at`, and `expires_at` for temporary bans. |
| `members_modify` | write | No | Modify a Fluxer guild member (`PATCH /guilds/{guild_id}/members/{user_id}`): nickname, roles, voice mute/deaf/channel_id, timeout (`communication_disabled_until` + Fluxer-native `timeout_reason`), or per-guild profile fields. |
| `members_modify_current` | write | No | Update the bot's own per-guild profile in a Fluxer guild (`PATCH /guilds/{guild_id}/members/@me`): nick, bio, pronouns, accent_color, avatar, banner. |
| `members_remove_role` | write | No | Remove a role from a Fluxer guild member (`DELETE /guilds/{guild_id}/members/{user_id}/roles/{role_id}`). |
| `members_search` | read | No | Search members in a Fluxer guild using Fluxer's native `POST /guilds/{guild_id}/members-search` endpoint. Supports text query, role_ids, is_bot, join_source_type, source_invite_code, join/account date ranges, and sorting. |
| `members_timeout` | write | No | Timeout (mute communication) or clear timeout for a Fluxer member using `PATCH /guilds/{guild_id}/members/{user_id}` with Fluxer-native `timeout_reason`. Pass `duration_seconds: 0` to lift an active timeout. |
| `members_unban` | write | No | Unban a user from a Fluxer guild (`DELETE /guilds/{guild_id}/bans/{user_id}`). |
| `members_voice_moderate` | write | No | Moderate a member in Fluxer voice channels: server-mute, server-deafen, move to another voice channel, or disconnect (`disconnect: true` sends `channel_id: null`). |

## `messages` (23)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `messages_bulk_delete` | destructive | Yes | Bulk-delete 2 to 100 messages in a Fluxer channel (`POST /channels/{channel_id}/messages/bulk-delete`). Confirmation-gated. |
| `messages_complete_attachment_upload` | write | No | Fluxer-native: finalize 1 to 10 multipart presigned attachment uploads (`POST /channels/{channel_id}/attachments/complete`) after bytes have been uploaded. |
| `messages_compose` | read | No | Local read-only rich message & embed composer/validator for Fluxer. Validates content length (<=4000), embed limits (<=10 embeds, <=25 fields/embed), and returns a ready-to-publish payload without calling Fluxer. |
| `messages_context` | read | No | Gather bounded conversation context from a Fluxer channel with explicit Fluxer jump-URL citations, participant list, and untrusted content boundaries. |
| `messages_create_thread` | write | No | Start a thread from an existing Fluxer message (`POST /channels/{channel_id}/messages/{message_id}/threads`). |
| `messages_crosspost` | write | No | Publish/crosspost an announcement message to following channels (`POST /channels/{channel_id}/messages/{message_id}/crosspost`). |
| `messages_delete` | destructive | Yes | Delete a single message (`DELETE /channels/{channel_id}/messages/{message_id}`). Confirmation-gated. |
| `messages_delete_attachment` | destructive | Yes | Fluxer-native: remove a single attachment from a message without deleting the entire message (`DELETE /channels/{channel_id}/messages/{message_id}/attachments/{attachment_id}`). Confirmation-gated. |
| `messages_edit` | write | No | Edit a bot-authored Fluxer message (`PATCH /channels/{channel_id}/messages/{message_id}`). |
| `messages_get` | read | No | Fetch a single Fluxer message by ID (`GET /channels/{channel_id}/messages/{message_id}`). |
| `messages_get_crosspost_source` | read | No | Fluxer-native: inspect the originating source community/channel of a crossposted announcement message (`GET /channels/{channel_id}/messages/{message_id}/crosspost-source`). |
| `messages_list_pins` | read | No | List pinned messages in a Fluxer channel (`GET /channels/{channel_id}/messages/pins`). Returns Fluxer's native paginated `{ items, has_more }` structure. |
| `messages_pin` | write | No | Pin a message in a Fluxer channel (`PUT /channels/{channel_id}/pins/{message_id}`). Note: Fluxer has a dedicated PIN_MESSAGES permission (bit 51). |
| `messages_preload_channels` | read | No | Fluxer-native batch API optimization: preload recent messages across up to 100 channels in a SINGLE API request (`POST /users/@me/preload-messages`). Reduces API calls and rate-limit pressure when auditing multiple channels. |
| `messages_publish` | write | No | Publish a rich composed message (content + embeds + optional allowed_mentions) to a Fluxer channel (`POST /channels/{channel_id}/messages`). |
| `messages_read` | read | No | Read recent messages from a Fluxer channel (`GET /channels/{channel_id}/messages`) with cursor pagination (before/after/around) and untrusted content fencing. |
| `messages_refresh_attachment_urls` | read | No | Fluxer-native: refresh expiring signed Fluxer media attachment URLs (`POST /attachments/refresh-urls`). |
| `messages_request_attachment_upload` | write | No | Fluxer-native: request presigned attachment upload URLs for 1 to 10 files in a channel (`POST /channels/{channel_id}/attachments`). Follow with uploading file bytes and `messages_complete_attachment_upload`. |
| `messages_search` | read | No | Fluxer-native bot-accessible full-text message search (`POST /search/messages`). Search across a guild or channels by keywords, exact_phrases, author_id, mentions, pinned, has (link/embed/file/image/video), attachment filters, date/ID bounds, and sort order. |
| `messages_search_recent` | read | No | Bounded client-side filter over the most recent messages in a channel (substring, author_id, or regex-free keyword match) without relying on search indexing. |
| `messages_send` | write | No | Send a message to a Fluxer channel (`POST /channels/{channel_id}/messages`). Supports text (up to 4000 chars), rich embeds, reply references, allowed_mentions, flags (e.g. SUPPRESS_EMBEDS=4, SUPPRESS_NOTIFICATIONS=4096), sticker_ids, and tts. |
| `messages_unpin` | write | No | Unpin a message in a Fluxer channel (`DELETE /channels/{channel_id}/pins/{message_id}`). |
| `messages_update` | write | No | Update an existing rich composed message (content and/or embeds) in a Fluxer channel (`PATCH /channels/{channel_id}/messages/{message_id}`). |

## `meta` (6)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `fluxer_intent_plan` | read | No | Translate a natural-language goal into a recommended sequence of Fluxer MCP tools, required Fluxer permissions, and safety considerations without calling the Fluxer API. |
| `mcp_pipeline` | write | No | Execute a sequential multi-step Fluxer MCP tool pipeline (up to 20 steps) with `${stepId.field}` output interpolation. Every step passes through the full Fluxer MCP safety, allowlist, and confirmation middleware. |
| `workflow_cancel` | write | No | Mark a durable Fluxer workflow as cancelled so it cannot be resumed. |
| `workflow_resume` | write | No | Resume a failed or paused durable Fluxer workflow from its next incomplete step. |
| `workflow_start` | write | No | Start a durable, locally checkpointed multi-step Fluxer workflow (`workflow_id`). Progress is persisted after every step so interrupted or failed runs can be inspected (`workflow_status`), resumed (`workflow_resume`), or cancelled (`workflow_cancel`). |
| `workflow_status` | read | No | Inspect the checkpointed status and step results of a durable Fluxer workflow. |

## `permissions` (3)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `permissions_audit_channel` | read | No | Audit which roles in a Fluxer guild can view, send messages in, or manage a given channel or thread (evaluating each role independently with @everyone and channel/parent overwrites using Fluxer's exact permission bits). |
| `permissions_explain` | read | No | Compute and explain a specific member's effective Fluxer permissions in a channel or thread, with a complete step-by-step trace (owner, @everyone, roles, ADMINISTRATOR bypass, channel overwrites, and active timeout restrictions). |
| `permissions_member_access_report` | read | No | Generate a guild-wide access matrix showing every channel a member can view, send in, connect/speak in, or moderate across an entire Fluxer community. |

## `reactions` (6)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `reactions_create` | write | No | Add a reaction to a Fluxer message (`PUT /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me`). |
| `reactions_delete_all` | destructive | Yes | Remove ALL reactions from a message (`DELETE /channels/{channel_id}/messages/{message_id}/reactions`). Confirmation-gated. |
| `reactions_delete_emoji` | destructive | No | Remove all reactions of a specific emoji from a message (`DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}`). |
| `reactions_delete_own` | write | No | Remove the bot's own reaction from a message (`DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me`). |
| `reactions_delete_user` | write | No | Remove a specific user's reaction from a message (`DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/{user_id}`). |
| `reactions_list` | read | No | List users who reacted with an emoji (`GET /channels/{channel_id}/messages/{message_id}/reactions/{emoji}`). |

## `roles` (8)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `roles_analyze_hierarchy` | read | No | Analyze a Fluxer guild's complete role hierarchy: flags dangerous @everyone permissions, roles with ADMINISTRATOR or privilege-escalation paths (MANAGE_ROLES above moderator roles), hoist vs hierarchy mismatches, duplicate role names, and which roles the bot can/cannot manage. |
| `roles_create` | write | No | Create a new role in a Fluxer guild (`POST /guilds/{guild_id}/roles`). Supports name, color, permissions (base-10 bitfield string), hoist, mentionable, icon, unicode_emoji, and Fluxer-native `icon_source_role_id`. |
| `roles_delete` | destructive | Yes | Delete a role from a Fluxer guild (`DELETE /guilds/{guild_id}/roles/{role_id}`). Confirmation-gated. |
| `roles_list` | read | No | List all roles in a Fluxer guild (`GET /guilds/{guild_id}/roles`), sorted by hierarchy position and including Fluxer-native `hoist_position` and decoded permission names. |
| `roles_modify` | write | No | Modify an existing Fluxer guild role (`PATCH /guilds/{guild_id}/roles/{role_id}`), including Fluxer-native `hoist_position`. |
| `roles_modify_hoist_positions` | write | No | Fluxer-native: update custom sidebar hoist positions independently of permission hierarchy (`PATCH /guilds/{guild_id}/roles/hoist-positions`). |
| `roles_modify_positions` | write | No | Reorder role hierarchy positions in a Fluxer guild (`PATCH /guilds/{guild_id}/roles`). Note: Fluxer returns 204 No Content on success. |
| `roles_reset_hoist_positions` | write | No | Fluxer-native: reset all custom role hoist positions back to follow standard role hierarchy (`DELETE /guilds/{guild_id}/roles/hoist-positions`). |

## `stickers` (8)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `stickers_bulk_create` | write | No | Fluxer-native: bulk-create guild stickers (`POST /guilds/{guild_id}/stickers/bulk`). |
| `stickers_clone` | write | No | Fluxer-native: clone an existing sticker by ID into the target guild (`POST /guilds/{guild_id}/stickers/clone`). |
| `stickers_create_guild_sticker` | write | No | Create a custom sticker in a Fluxer guild (`POST /guilds/{guild_id}/stickers`). Note: Fluxer accepts JSON `{ name, description?, tags?, image }` with a base64 data URI. |
| `stickers_delete_guild_sticker` | destructive | Yes | Delete a custom guild sticker (`DELETE /guilds/{guild_id}/stickers/{sticker_id}`). Confirmation-gated. |
| `stickers_get_metadata` | read | No | Fluxer-native: fetch metadata for a sticker by ID (`GET /stickers/{sticker_id}/metadata`). |
| `stickers_get_source` | read | No | Fluxer-native: look up the source guild of a sticker (`GET /stickers/{sticker_id}/source`). |
| `stickers_list_guild` | read | No | List all custom stickers in a Fluxer guild (`GET /guilds/{guild_id}/stickers`). |
| `stickers_modify_guild_sticker` | write | No | Modify a Fluxer guild sticker's name, description, or tags (`PATCH /guilds/{guild_id}/stickers/{sticker_id}`). |

## `threads` (6)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `threads_add_member` | write | No | Add a user to a Fluxer thread (`PUT /channels/{channel_id}/thread-members/{user_id}`). |
| `threads_get_member` | read | No | Get a specific thread member record (`GET /channels/{channel_id}/thread-members/{user_id}`). |
| `threads_join` | write | No | Join a Fluxer thread as the current bot (`PUT /channels/{channel_id}/thread-members/@me`). |
| `threads_leave` | write | No | Leave a Fluxer thread as the current bot (`DELETE /channels/{channel_id}/thread-members/@me`). |
| `threads_list_members` | read | No | List members of a Fluxer thread (`GET /channels/{channel_id}/thread-members`). |
| `threads_remove_member` | write | No | Remove a user from a Fluxer thread (`DELETE /channels/{channel_id}/thread-members/{user_id}`). |

## `users` (11)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `users_check_tag` | read | No | Fluxer-native: check whether a Fluxer username + 4-digit discriminator tag is available (`GET /users/check-tag`). |
| `users_create_dm` | write | No | Open or retrieve a direct message channel with a Fluxer user (`POST /users/@me/channels`). Subject to MCP_DM_CONSENT_MODE. |
| `users_get` | read | No | Fetch public information for a Fluxer user by snowflake ID (`GET /users/{user_id}`). |
| `users_get_current` | read | No | Fetch the currently authenticated Fluxer bot user (`GET /users/@me`). |
| `users_get_profile` | read | No | Fetch extended Fluxer user profile (`GET /users/{target_id}/profile`), optionally scoped to a guild to include per-guild profile overrides, bio, pronouns, and badges. |
| `users_leave_guild` | destructive | Yes | Remove the bot from a Fluxer guild (`DELETE /users/@me/guilds/{guild_id}`). Destructive & confirmation-gated. |
| `users_list_current_user_guilds` | read | No | List guilds the authenticated Fluxer bot belongs to (`GET /users/@me/guilds`), with optional approximate member/presence counts and pagination. |
| `users_list_dm_channels` | read | No | List private/DM channels accessible to the current Fluxer bot (`GET /users/@me/channels`). |
| `users_modify_current` | write | No | Update the current Fluxer bot profile (`PATCH /users/@me`): username, global_name, bio, pronouns, accent_color, avatar (data URI or null), or banner. |
| `users_pin_dm_channel` | write | No | Fluxer-native: pin a direct message channel in the current user DM list (`PUT /users/@me/channels/{channel_id}/pin`). |
| `users_unpin_dm_channel` | write | No | Fluxer-native: unpin a direct message channel in the current user DM list (`DELETE /users/@me/channels/{channel_id}/pin`). |

## `webhooks` (17)

| Tool | Risk | Confirm | Description |
| --- | --- | --- | --- |
| `webhooks_create` | write | No | Create an incoming webhook on a Fluxer channel (`POST /channels/{channel_id}/webhooks`). |
| `webhooks_delete` | destructive | Yes | Delete a Fluxer webhook (`DELETE /webhooks/{webhook_id}`). Confirmation-gated. |
| `webhooks_delete_message` | destructive | Yes | Delete a message sent by a Fluxer webhook (`DELETE /webhooks/{webhook_id}/{token}/messages/{message_id}`). Confirmation-gated. |
| `webhooks_delete_with_token` | destructive | Yes | Delete a Fluxer webhook via its opaque token (`DELETE /webhooks/{webhook_id}/{token}`). Confirmation-gated. |
| `webhooks_edit_message` | write | No | Edit a message previously sent by a Fluxer webhook (`PATCH /webhooks/{webhook_id}/{token}/messages/{message_id}`). |
| `webhooks_execute` | write | No | Execute a Fluxer webhook (`POST /webhooks/{webhook_id}/{token}`). Supports content, embeds, username/avatar_url overrides, wait=true (return message object), thread_id, and forum thread_name/applied_tags. |
| `webhooks_execute_github` | write | No | Execute a GitHub-compatible Fluxer webhook (`POST /webhooks/{webhook_id}/{token}/github`). |
| `webhooks_execute_instatus` | write | No | Fluxer-native: execute an Instatus incident/status webhook (`POST /webhooks/{webhook_id}/{token}/instatus`). |
| `webhooks_execute_libredesk` | write | No | Fluxer-native: execute a Libredesk support-desk webhook (`POST /webhooks/{webhook_id}/{token}/libredesk`). |
| `webhooks_execute_slack` | write | No | Execute a Slack-compatible Fluxer webhook (`POST /webhooks/{webhook_id}/{token}/slack`). |
| `webhooks_get` | read | No | Get a Fluxer webhook by ID (`GET /webhooks/{webhook_id}`). |
| `webhooks_get_message` | read | No | Fetch a message sent by a Fluxer webhook (`GET /webhooks/{webhook_id}/{token}/messages/{message_id}`). |
| `webhooks_get_with_token` | read | No | Get a Fluxer webhook using its opaque token (`GET /webhooks/{webhook_id}/{token}`, no bot auth required). |
| `webhooks_list_channel` | read | No | List webhooks configured on a Fluxer channel (`GET /channels/{channel_id}/webhooks`). |
| `webhooks_list_guild` | read | No | List all webhooks across a Fluxer guild (`GET /guilds/{guild_id}/webhooks`). |
| `webhooks_modify` | write | No | Modify a Fluxer webhook (`PATCH /webhooks/{webhook_id}`): rename, update avatar, or move to another channel. |
| `webhooks_modify_with_token` | write | No | Modify a Fluxer webhook using its opaque token (`PATCH /webhooks/{webhook_id}/{token}`). |
