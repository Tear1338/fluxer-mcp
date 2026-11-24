import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fluxerHandlers,
  MOCK_BOT_ID,
  MOCK_CHANNEL_ID,
  MOCK_FORUM_CHANNEL_ID,
  MOCK_GUILD_ID,
  MOCK_MOD_ROLE_ID,
  MOCK_USER_ID,
  MOCK_WEBHOOK_ID,
  MOCK_WEBHOOK_TOKEN,
} from '@fluxer-mcp/server-mocks';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NoopAuditSink } from './audit.js';
import { loadConfig } from './config.js';
import { FluxerRestClient } from './fluxer/rest.js';
import { createLogger } from './logger.js';
import { buildServer } from './server.js';
import { ALL_FLUXER_TOOLS } from './tools/index.js';

const MOCK_MSG_ID = '700000000000000001';
const MOCK_MSG_ID_2 = '700000000000000002';
const MOCK_EMOJI_ID = '100000000000000001';
const MOCK_STICKER_ID = '200000000000000001';
const MOCK_TAG_ID = '300000000000000001';
const MOCK_ATTACHMENT_ID = '400000000000000001';
const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

const mswServer = setupServer(
  ...fluxerHandlers,
  http.get('https://emoji.gg/api/', () =>
    HttpResponse.json([
      {
        id: 1,
        title: 'fluxer_spark',
        slug: 'fluxer-spark',
        image: 'https://cdn3.emoji.gg/emojis/1-fluxer.png',
        category: 1,
        faves: 99,
      },
    ]),
  ),
);

const tempDirs: string[] = [];

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => {
  mswServer.close();
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('Exhaustive 100% tool suite coverage (every single Fluxer MCP tool invoked over MCP)', () => {
  it('invokes ALL 184 registered Fluxer MCP tools cleanly with zero failures', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'fluxer-all-tools-'));
    tempDirs.push(stateDir);
    const config = loadConfig({
      FLUXER_TOKEN: 'fluxer_exhaustive_test_token_0123456789abcdef',
      MCP_STATE_DIR: stateDir,
      MCP_DRY_RUN: 'false',
      MCP_AUDIT_SINK: 'none',
      LOG_LEVEL: 'fatal',
    });
    const logger = createLogger(config);
    const rest = FluxerRestClient.fromConfig(config, logger);
    const built = buildServer({ rest, config, logger, auditSink: new NoopAuditSink() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await built.server.connect(serverTransport);
    const client = new Client({ name: 'exhaustive-test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    const called = new Set<string>();
    const invoke = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError, `Tool "${name}" returned error: ${JSON.stringify(res)}`).not.toBe(true);
      called.add(name);
      return (res.structuredContent ?? {}) as Record<string, unknown>;
    };

    try {
      // --- instance (5) & application (2) ---
      await invoke('instance_get_discovery', {});
      await invoke('instance_list_badges', {});
      await invoke('instance_get_gateway', {});
      await invoke('instance_get_gateway_events', {});
      await invoke('instance_list_experiments', {});
      await invoke('application_get_current', {});
      await invoke('application_get_public', { application_id: MOCK_BOT_ID });

      // --- audit_log (2) ---
      await invoke('audit_log_get', { guild_id: MOCK_GUILD_ID });
      await invoke('audit_log_summary', { guild_id: MOCK_GUILD_ID });

      // --- guild (21) ---
      await invoke('guild_get', { guild_id: MOCK_GUILD_ID });
      await invoke('guild_modify', { guild_id: MOCK_GUILD_ID, name: 'Updated Community' });
      await invoke('guild_delete', { guild_id: MOCK_GUILD_ID, __confirm: true });
      await invoke('guild_get_vanity_url', { guild_id: MOCK_GUILD_ID });
      await invoke('guild_update_vanity_url', { guild_id: MOCK_GUILD_ID, code: 'fluxer-hub' });
      await invoke('guild_list_invites', { guild_id: MOCK_GUILD_ID });
      await invoke('guild_update_channel_positions', {
        guild_id: MOCK_GUILD_ID,
        positions: [{ id: MOCK_CHANNEL_ID, position: 0 }],
      });
      await invoke('guild_security_audit', { guild_id: MOCK_GUILD_ID });
      await invoke('guild_raid_shield', { guild_id: MOCK_GUILD_ID, mode: 'assess' });
      await invoke('guild_configure_welcome', {
        guild_id: MOCK_GUILD_ID,
        system_channel_id: MOCK_CHANNEL_ID,
        preview: true,
      });
      await invoke('guild_backup_export', { guild_id: MOCK_GUILD_ID, backup_name: 'all_snap' });
      await invoke('guild_config_diff', {
        source_backup_id: 'all_snap',
        target_guild_id: MOCK_GUILD_ID,
      });
      await invoke('guild_clone_plan', { guild_id: MOCK_GUILD_ID, source_backup_id: 'all_snap' });
      await invoke('guild_blueprint_compile', { request: 'Developer open-source community' });
      const bp = await invoke('guild_blueprint_plan', {
        guild_id: MOCK_GUILD_ID,
        request: 'Developer open-source community',
      });
      await invoke('guild_blueprint_apply', {
        guild_id: MOCK_GUILD_ID,
        plan_ref: String(bp.plan_ref),
        __confirm: true,
      });
      await invoke('guild_blueprint_evidence', {
        guild_id: MOCK_GUILD_ID,
        plan_ref: String(bp.plan_ref),
      });
      const chg = await invoke('guild_change_plan', {
        guild_id: MOCK_GUILD_ID,
        request: 'Adjust channel slowmode',
        channels: [{ id: MOCK_CHANNEL_ID, patch: { rate_limit_per_user: 5 } }],
      });
      await invoke('guild_change_apply', {
        guild_id: MOCK_GUILD_ID,
        plan_ref: String(chg.plan_ref),
        __confirm: true,
      });
      await invoke('guild_change_restore', {
        guild_id: MOCK_GUILD_ID,
        plan_ref: String(chg.plan_ref),
        __confirm: true,
      });
      await invoke('guild_remediate_plan', {
        guild_id: MOCK_GUILD_ID,
        enforce_min_verification_level: 2,
      });

      // --- channels (23) ---
      await invoke('channels_list', { guild_id: MOCK_GUILD_ID });
      await invoke('channels_get', { channel_id: MOCK_CHANNEL_ID });
      await invoke('channels_create_guild_channel', {
        guild_id: MOCK_GUILD_ID,
        name: 'announcements',
        type: 5,
      });
      await invoke('channels_modify', { channel_id: MOCK_CHANNEL_ID, topic: 'Updated topic' });
      await invoke('channels_delete', { channel_id: MOCK_CHANNEL_ID, __confirm: true });
      await invoke('channels_modify_permissions', {
        channel_id: MOCK_CHANNEL_ID,
        overwrite_id: MOCK_MOD_ROLE_ID,
        type: 0,
        allow: '1024',
        deny: '0',
      });
      await invoke('channels_delete_permissions', {
        channel_id: MOCK_CHANNEL_ID,
        overwrite_id: MOCK_MOD_ROLE_ID,
        __confirm: true,
      });
      await invoke('channels_bulk_set_overwrites', {
        guild_id: MOCK_GUILD_ID,
        channel_ids: [MOCK_CHANNEL_ID],
        overwrite_id: MOCK_MOD_ROLE_ID,
        type: 0,
        allow: '1024',
      });
      await invoke('channels_trigger_typing', { channel_id: MOCK_CHANNEL_ID });
      await invoke('channels_get_slowmode', { channel_id: MOCK_CHANNEL_ID });
      await invoke('channels_follow_announcement', {
        channel_id: MOCK_CHANNEL_ID,
        webhook_channel_id: MOCK_FORUM_CHANNEL_ID,
      });
      await invoke('channels_get_follower_stats', { channel_id: MOCK_CHANNEL_ID });
      await invoke('channels_create_forum_tag', {
        channel_id: MOCK_FORUM_CHANNEL_ID,
        name: 'Bug',
      });
      await invoke('channels_update_forum_tag', {
        channel_id: MOCK_FORUM_CHANNEL_ID,
        tag_id: MOCK_TAG_ID,
        name: 'Resolved',
      });
      await invoke('channels_delete_forum_tag', {
        channel_id: MOCK_FORUM_CHANNEL_ID,
        tag_id: MOCK_TAG_ID,
        __confirm: true,
      });
      await invoke('channels_get_forum_post_data', {
        channel_id: MOCK_FORUM_CHANNEL_ID,
        thread_ids: [MOCK_CHANNEL_ID],
      });
      await invoke('channels_forum_create_thread', {
        channel_id: MOCK_FORUM_CHANNEL_ID,
        name: 'Welcome post',
        message: { content: 'First post' },
      });
      await invoke('channels_list_active_threads_guild', { guild_id: MOCK_GUILD_ID });
      await invoke('channels_list_public_archived_threads', { channel_id: MOCK_CHANNEL_ID });
      await invoke('channels_list_private_archived_threads', { channel_id: MOCK_CHANNEL_ID });
      await invoke('channels_list_joined_private_archived_threads', {
        channel_id: MOCK_CHANNEL_ID,
      });
      await invoke('channels_search_threads', { channel_id: MOCK_FORUM_CHANNEL_ID, name: 'test' });
      await invoke('channels_add_group_dm_recipient', {
        channel_id: MOCK_CHANNEL_ID,
        user_id: MOCK_USER_ID,
      });

      // --- threads (6) ---
      await invoke('threads_join', { channel_id: MOCK_CHANNEL_ID });
      await invoke('threads_leave', { channel_id: MOCK_CHANNEL_ID });
      await invoke('threads_add_member', { channel_id: MOCK_CHANNEL_ID, user_id: MOCK_USER_ID });
      await invoke('threads_remove_member', { channel_id: MOCK_CHANNEL_ID, user_id: MOCK_USER_ID });
      await invoke('threads_get_member', { channel_id: MOCK_CHANNEL_ID, user_id: MOCK_USER_ID });
      await invoke('threads_list_members', { channel_id: MOCK_CHANNEL_ID });

      // --- roles (8) ---
      await invoke('roles_list', { guild_id: MOCK_GUILD_ID });
      await invoke('roles_create', { guild_id: MOCK_GUILD_ID, name: 'Contributor' });
      await invoke('roles_modify', {
        guild_id: MOCK_GUILD_ID,
        role_id: MOCK_MOD_ROLE_ID,
        hoist: true,
      });
      await invoke('roles_delete', {
        guild_id: MOCK_GUILD_ID,
        role_id: MOCK_MOD_ROLE_ID,
        __confirm: true,
      });
      await invoke('roles_modify_positions', {
        guild_id: MOCK_GUILD_ID,
        positions: [{ id: MOCK_MOD_ROLE_ID, position: 2 }],
      });
      await invoke('roles_modify_hoist_positions', {
        guild_id: MOCK_GUILD_ID,
        hoist_positions: [{ id: MOCK_MOD_ROLE_ID, hoist_position: 1 }],
      });
      await invoke('roles_reset_hoist_positions', { guild_id: MOCK_GUILD_ID });
      await invoke('roles_analyze_hierarchy', { guild_id: MOCK_GUILD_ID });

      // --- permissions (3) ---
      await invoke('permissions_audit_channel', {
        guild_id: MOCK_GUILD_ID,
        channel_id: MOCK_CHANNEL_ID,
      });
      await invoke('permissions_explain', {
        guild_id: MOCK_GUILD_ID,
        channel_id: MOCK_CHANNEL_ID,
        user_id: MOCK_USER_ID,
      });
      await invoke('permissions_member_access_report', {
        guild_id: MOCK_GUILD_ID,
        user_id: MOCK_USER_ID,
      });

      // --- members (18) ---
      await invoke('members_list', { guild_id: MOCK_GUILD_ID });
      await invoke('members_get', { guild_id: MOCK_GUILD_ID, user_id: MOCK_USER_ID });
      await invoke('members_get_current_user', { guild_id: MOCK_GUILD_ID });
      await invoke('members_search', { guild_id: MOCK_GUILD_ID, query: 'alice' });
      await invoke('members_modify', {
        guild_id: MOCK_GUILD_ID,
        user_id: MOCK_USER_ID,
        nick: 'AliceMod',
      });
      await invoke('members_modify_current', { guild_id: MOCK_GUILD_ID, nick: 'FluxerBot' });
      await invoke('members_add_role', {
        guild_id: MOCK_GUILD_ID,
        user_id: MOCK_USER_ID,
        role_id: MOCK_MOD_ROLE_ID,
      });
      await invoke('members_remove_role', {
        guild_id: MOCK_GUILD_ID,
        user_id: MOCK_USER_ID,
        role_id: MOCK_MOD_ROLE_ID,
      });
      await invoke('members_bulk_add_role', {
        guild_id: MOCK_GUILD_ID,
        user_ids: [MOCK_USER_ID],
        role_id: MOCK_MOD_ROLE_ID,
      });
      await invoke('members_bulk_remove_role', {
        guild_id: MOCK_GUILD_ID,
        user_ids: [MOCK_USER_ID],
        role_id: MOCK_MOD_ROLE_ID,
      });
      await invoke('members_timeout', {
        guild_id: MOCK_GUILD_ID,
        user_id: MOCK_USER_ID,
        duration_seconds: 60,
        timeout_reason: 'Test',
      });
      await invoke('members_voice_moderate', {
        guild_id: MOCK_GUILD_ID,
        user_id: MOCK_USER_ID,
        mute: true,
      });
      await invoke('members_kick', {
        guild_id: MOCK_GUILD_ID,
        user_id: MOCK_USER_ID,
        __confirm: true,
      });
      await invoke('members_ban', {
        guild_id: MOCK_GUILD_ID,
        user_id: MOCK_USER_ID,
        __confirm: true,
      });
      await invoke('members_bulk_ban', {
        guild_id: MOCK_GUILD_ID,
        user_ids: [MOCK_USER_ID],
        __confirm: true,
      });
      await invoke('members_unban', { guild_id: MOCK_GUILD_ID, user_id: MOCK_USER_ID });
      await invoke('members_list_bans', { guild_id: MOCK_GUILD_ID });
      await invoke('members_get_ban', { guild_id: MOCK_GUILD_ID, user_id: MOCK_USER_ID });

      // --- messages (23) ---
      await invoke('messages_send', { channel_id: MOCK_CHANNEL_ID, content: 'Hello!' });
      await invoke('messages_read', { channel_id: MOCK_CHANNEL_ID });
      await invoke('messages_get', { channel_id: MOCK_CHANNEL_ID, message_id: MOCK_MSG_ID });
      await invoke('messages_edit', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        content: 'Edited!',
      });
      await invoke('messages_delete', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        __confirm: true,
      });
      await invoke('messages_bulk_delete', {
        channel_id: MOCK_CHANNEL_ID,
        messages: [MOCK_MSG_ID, MOCK_MSG_ID_2],
        __confirm: true,
      });
      await invoke('messages_pin', { channel_id: MOCK_CHANNEL_ID, message_id: MOCK_MSG_ID });
      await invoke('messages_unpin', { channel_id: MOCK_CHANNEL_ID, message_id: MOCK_MSG_ID });
      await invoke('messages_list_pins', { channel_id: MOCK_CHANNEL_ID });
      await invoke('messages_crosspost', { channel_id: MOCK_CHANNEL_ID, message_id: MOCK_MSG_ID });
      await invoke('messages_get_crosspost_source', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
      });
      await invoke('messages_create_thread', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        name: 'Discussion',
      });
      await invoke('messages_delete_attachment', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        attachment_id: MOCK_ATTACHMENT_ID,
        __confirm: true,
      });
      await invoke('messages_refresh_attachment_urls', {
        attachment_urls: ['https://media.fluxer.app/attachments/1/file.png'],
      });
      await invoke('messages_search', { guild_id: MOCK_GUILD_ID, content: 'Fluxer' });
      await invoke('messages_search_recent', { channel_id: MOCK_CHANNEL_ID, query: 'Fluxer' });
      await invoke('messages_context', { channel_id: MOCK_CHANNEL_ID });
      await invoke('messages_compose', {
        content: 'Welcome',
        embeds: [{ title: 'Rules', description: 'Be kind' }],
      });
      await invoke('messages_publish', {
        channel_id: MOCK_CHANNEL_ID,
        embeds: [{ title: 'Announcement', description: 'v1.0 live!' }],
      });
      await invoke('messages_update', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        content: 'Updated rich post',
      });
      await invoke('messages_request_attachment_upload', {
        channel_id: MOCK_CHANNEL_ID,
        attachments: [{ id: 0, filename: 'logo.png', file_size: 1024, content_type: 'image/png' }],
      });
      await invoke('messages_complete_attachment_upload', {
        channel_id: MOCK_CHANNEL_ID,
        uploads: [{ upload_filename: 'uploads/0_logo.png', upload_id: 'upl_0' }],
      });
      await invoke('messages_preload_channels', {
        channel_ids: [MOCK_CHANNEL_ID, MOCK_FORUM_CHANNEL_ID],
      });

      // --- reactions (6) ---
      await invoke('reactions_create', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        emoji: '🔥',
      });
      await invoke('reactions_delete_own', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        emoji: '🔥',
      });
      await invoke('reactions_delete_user', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        emoji: '🔥',
        user_id: MOCK_USER_ID,
      });
      await invoke('reactions_delete_emoji', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        emoji: '🔥',
      });
      await invoke('reactions_delete_all', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        __confirm: true,
      });
      await invoke('reactions_list', {
        channel_id: MOCK_CHANNEL_ID,
        message_id: MOCK_MSG_ID,
        emoji: '🔥',
      });

      // --- invites (5) ---
      await invoke('invites_list_guild', { guild_id: MOCK_GUILD_ID });
      await invoke('invites_list_channel', { channel_id: MOCK_CHANNEL_ID });
      await invoke('invites_create_channel', { channel_id: MOCK_CHANNEL_ID, max_age: 3600 });
      await invoke('invites_get', { invite_code: 'flux123' });
      await invoke('invites_delete', { invite_code: 'flux123', __confirm: true });

      // --- emojis (8), stickers (8), inspiration (1) ---
      await invoke('emojis_list_guild', { guild_id: MOCK_GUILD_ID });
      await invoke('emojis_create', { guild_id: MOCK_GUILD_ID, name: 'spark', image: DATA_URI });
      await invoke('emojis_bulk_create', {
        guild_id: MOCK_GUILD_ID,
        emojis: [{ name: 'spark2', image: DATA_URI }],
      });
      await invoke('emojis_clone', { guild_id: MOCK_GUILD_ID, source_emoji_id: MOCK_EMOJI_ID });
      await invoke('emojis_modify', {
        guild_id: MOCK_GUILD_ID,
        emoji_id: MOCK_EMOJI_ID,
        name: 'spark_v2',
      });
      await invoke('emojis_delete', {
        guild_id: MOCK_GUILD_ID,
        emoji_id: MOCK_EMOJI_ID,
        __confirm: true,
      });
      await invoke('emojis_get_metadata', { emoji_id: MOCK_EMOJI_ID });
      await invoke('emojis_get_source', { emoji_id: MOCK_EMOJI_ID });

      await invoke('stickers_list_guild', { guild_id: MOCK_GUILD_ID });
      await invoke('stickers_create_guild_sticker', {
        guild_id: MOCK_GUILD_ID,
        name: 'wave',
        image: DATA_URI,
      });
      await invoke('stickers_bulk_create', {
        guild_id: MOCK_GUILD_ID,
        stickers: [{ name: 'wave2', image: DATA_URI }],
      });
      await invoke('stickers_clone', {
        guild_id: MOCK_GUILD_ID,
        source_sticker_id: MOCK_STICKER_ID,
      });
      await invoke('stickers_modify_guild_sticker', {
        guild_id: MOCK_GUILD_ID,
        sticker_id: MOCK_STICKER_ID,
        name: 'wave_v2',
      });
      await invoke('stickers_delete_guild_sticker', {
        guild_id: MOCK_GUILD_ID,
        sticker_id: MOCK_STICKER_ID,
        __confirm: true,
      });
      await invoke('stickers_get_metadata', { sticker_id: MOCK_STICKER_ID });
      await invoke('stickers_get_source', { sticker_id: MOCK_STICKER_ID });
      await invoke('inspiration_emoji_gg_search', { query: 'fluxer' });

      // --- discovery (6) ---
      await invoke('discovery_list_categories', {});
      await invoke('discovery_search_guilds', { query: 'fluxer' });
      await invoke('discovery_get_guild_status', { guild_id: MOCK_GUILD_ID });
      await invoke('discovery_apply', {
        guild_id: MOCK_GUILD_ID,
        description: 'Official Fluxer test community for open-source builders.',
        category_type: 2,
      });
      await invoke('discovery_update', {
        guild_id: MOCK_GUILD_ID,
        description: 'Updated Fluxer test community description for open-source.',
      });
      await invoke('discovery_withdraw', { guild_id: MOCK_GUILD_ID, __confirm: true });

      // --- webhooks (17) ---
      await invoke('webhooks_list_channel', { channel_id: MOCK_CHANNEL_ID });
      await invoke('webhooks_list_guild', { guild_id: MOCK_GUILD_ID });
      await invoke('webhooks_create', { channel_id: MOCK_CHANNEL_ID, name: 'Deploy Hook' });
      await invoke('webhooks_get', { webhook_id: MOCK_WEBHOOK_ID });
      await invoke('webhooks_modify', { webhook_id: MOCK_WEBHOOK_ID, name: 'CI Hook v2' });
      await invoke('webhooks_delete', { webhook_id: MOCK_WEBHOOK_ID, __confirm: true });
      await invoke('webhooks_get_with_token', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
      });
      await invoke('webhooks_modify_with_token', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        name: 'Token Hook',
      });
      await invoke('webhooks_delete_with_token', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        __confirm: true,
      });
      await invoke('webhooks_execute', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        content: 'Build passed!',
      });
      await invoke('webhooks_get_message', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        message_id: MOCK_MSG_ID,
      });
      await invoke('webhooks_edit_message', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        message_id: MOCK_MSG_ID,
        content: 'Updated webhook post',
      });
      await invoke('webhooks_delete_message', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        message_id: MOCK_MSG_ID,
        __confirm: true,
      });
      await invoke('webhooks_execute_github', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        event: 'push',
        payload: { ref: 'refs/heads/main' },
      });
      await invoke('webhooks_execute_slack', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        text: 'Hello from Slack format',
      });
      await invoke('webhooks_execute_instatus', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        payload: { incident: 'ok' },
      });
      await invoke('webhooks_execute_libredesk', {
        webhook_id: MOCK_WEBHOOK_ID,
        webhook_token: MOCK_WEBHOOK_TOKEN,
        payload: { ticket: 1 },
      });

      // --- users (11) ---
      await invoke('users_get_current', {});
      await invoke('users_get', { user_id: MOCK_USER_ID });
      await invoke('users_get_profile', { user_id: MOCK_USER_ID, guild_id: MOCK_GUILD_ID });
      await invoke('users_modify_current', { bio: 'Fluxer MCP bot' });
      await invoke('users_list_current_user_guilds', {});
      await invoke('users_leave_guild', { guild_id: MOCK_GUILD_ID, __confirm: true });
      await invoke('users_create_dm', { recipient_id: MOCK_USER_ID });
      await invoke('users_list_dm_channels', {});
      await invoke('users_pin_dm_channel', { channel_id: '888000000000000001' });
      await invoke('users_unpin_dm_channel', { channel_id: '888000000000000001' });
      await invoke('users_check_tag', { username: 'fluxer_hero', discriminator: '1338' });

      // --- intelligence (5) ---
      await invoke('intelligence_summarize_channel', { channel_id: MOCK_CHANNEL_ID });
      await invoke('intelligence_classify_messages', { channel_id: MOCK_CHANNEL_ID });
      await invoke('intelligence_extract_entities', { channel_id: MOCK_CHANNEL_ID });
      await invoke('intelligence_moderate_content', { channel_id: MOCK_CHANNEL_ID });
      await invoke('intelligence_draft_response', {
        channel_id: MOCK_CHANNEL_ID,
        intent: 'Welcome new members',
      });

      // --- meta (6) ---
      await invoke('fluxer_intent_plan', { goal: 'create a new community and audit security' });
      await invoke('mcp_pipeline', {
        steps: [{ id: 's1', tool: 'guild_get', arguments: { guild_id: MOCK_GUILD_ID } }],
      });
      const wf = await invoke('workflow_start', {
        name: 'Exhaustive workflow',
        steps: [{ id: 's1', tool: 'guild_get', arguments: { guild_id: MOCK_GUILD_ID } }],
      });
      const wfId = String(wf.workflow_id);
      await invoke('workflow_status', { workflow_id: wfId });
      await invoke('workflow_resume', { workflow_id: wfId });
      await invoke('workflow_cancel', { workflow_id: wfId });

      // Assert literally 100% of ALL_FLUXER_TOOLS were exercised!
      const missing = ALL_FLUXER_TOOLS.map((t) => t.name).filter((n) => !called.has(n));
      expect(missing, `Untested tools found: ${missing.join(', ')}`).toEqual([]);
      expect(called.size).toBe(ALL_FLUXER_TOOLS.length);
      expect(called.size).toBe(184);
    } finally {
      await client.close();
      await built.server.close();
    }
  });
});
