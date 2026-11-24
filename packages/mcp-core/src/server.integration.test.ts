import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFluxerHandlers,
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
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NoopAuditSink } from './audit.js';
import { loadConfig } from './config.js';
import { FluxerRestClient } from './fluxer/rest.js';
import { createLogger } from './logger.js';
import { buildCatalogServer, buildServer } from './server.js';
import { ALL_FLUXER_TOOLS } from './tools/index.js';

const mswServer = setupServer(...fluxerHandlers);
const TEST_TOKEN = 'fluxer_integration_token_1234567890abcdef';
const tempDirs: string[] = [];

function makeTempStateDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'fluxer-mcp-test-'));
  tempDirs.push(d);
  return d;
}

async function connectTestClient(envOverrides: Record<string, string | undefined> = {}) {
  const stateDir = makeTempStateDir();
  const config = loadConfig({
    FLUXER_TOKEN: TEST_TOKEN,
    MCP_STATE_DIR: stateDir,
    MCP_AUDIT_SINK: 'none',
    LOG_LEVEL: 'error',
    ...envOverrides,
  });
  const logger = createLogger(config);
  const rest = FluxerRestClient.fromConfig(config, logger);
  const built = buildServer({ rest, config, logger, auditSink: new NoopAuditSink() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await built.server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await built.server.close();
    },
  };
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => {
  mswServer.close();
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('Fluxer MCP server integration & safety contracts', () => {
  it('exposes all 184 tools, resources, and prompts over MCP protocol', async () => {
    const conn = await connectTestClient();
    try {
      const { tools } = await conn.client.listTools();
      expect(tools.length).toBe(ALL_FLUXER_TOOLS.length);
      expect(tools.length).toBe(184);

      const { resources } = await conn.client.listResources();
      expect(resources.map((r) => r.uri)).toContain('fluxer://instance/discovery');
      expect(resources.map((r) => r.uri)).toContain('fluxer://instance/gateway');

      const disc = await conn.client.readResource({ uri: 'fluxer://instance/discovery' });
      expect(disc.contents[0]?.text).toContain('api_code_version');

      const gwRes = await conn.client.readResource({ uri: 'fluxer://instance/gateway' });
      expect(gwRes.contents[0]?.text).toContain('gateway_enabled');

      const { prompts } = await conn.client.listPrompts();
      expect(prompts.map((p) => p.name)).toContain('build-fluxer-community');
      const prompt = await conn.client.getPrompt({
        name: 'audit-fluxer-security',
        arguments: { guild_id: MOCK_GUILD_ID },
      });
      expect(prompt.messages.length).toBe(1);
    } finally {
      await conn.close();
    }
  });

  it('enforces MCP_WRITE_MODE=preview, MCP_DRY_RUN=true, ALLOWED_GUILDS, and MCP_CATEGORIES', async () => {
    const conn = await connectTestClient({
      MCP_WRITE_MODE: 'preview',
      ALLOWED_GUILDS: MOCK_GUILD_ID,
      MCP_CATEGORIES: 'messages,members,guild',
    });
    try {
      // Blocked by write preview
      const writeRes = await conn.client.callTool({
        name: 'messages_send',
        arguments: { channel_id: MOCK_CHANNEL_ID, content: 'hello' },
      });
      expect(writeRes.isError).toBe(true);
      expect((writeRes.structuredContent as Record<string, unknown>).code).toBe('WRITE_PREVIEW');

      // Blocked by ALLOWED_GUILDS
      const guildRes = await conn.client.callTool({
        name: 'guild_get',
        arguments: { guild_id: '888888888888888888' },
      });
      expect(guildRes.isError).toBe(true);
      expect((guildRes.structuredContent as Record<string, unknown>).code).toBe(
        'GUILD_NOT_ALLOWED',
      );

      // Disallowed category
      const catRes = await conn.client.callTool({
        name: 'roles_list',
        arguments: { guild_id: MOCK_GUILD_ID },
      });
      expect(catRes.isError).toBe(true);
    } finally {
      await conn.close();
    }

    // Dry-run confirmation gate
    const dryConn = await connectTestClient({ MCP_DRY_RUN: 'true' });
    try {
      const banPreview = await dryConn.client.callTool({
        name: 'members_ban',
        arguments: { guild_id: MOCK_GUILD_ID, user_id: MOCK_USER_ID, __confirm: true },
      });
      expect(banPreview.isError).toBe(true);
      expect((banPreview.structuredContent as Record<string, unknown>).code).toBe(
        'DRY_RUN_PREVIEW',
      );
    } finally {
      await dryConn.close();
    }
  });

  it('supports progressive tool surface with search and risk-checked dispatchers', async () => {
    const conn = await connectTestClient({ MCP_TOOL_SURFACE: 'progressive' });
    try {
      const { tools } = await conn.client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('build_fluxer_community');
      expect(names).toContain('fluxer_search_tools');
      expect(names).toContain('fluxer_read');
      expect(names).toContain('fluxer_write');
      expect(names).toContain('fluxer_destructive');

      const search = await conn.client.callTool({
        name: 'fluxer_search_tools',
        arguments: { query: 'forum tags' },
      });
      expect(search.isError).not.toBe(true);
      expect(JSON.stringify(search.structuredContent)).toContain('channels_create_forum_tag');

      // Risk mismatch rejected
      const mismatch = await conn.client.callTool({
        name: 'fluxer_read',
        arguments: {
          tool: 'messages_send',
          arguments: { channel_id: MOCK_CHANNEL_ID, content: 'x' },
        },
      });
      expect(mismatch.isError).toBe(true);
      expect((mismatch.structuredContent as Record<string, unknown>).code).toBe(
        'DISPATCHER_RISK_MISMATCH',
      );

      // Valid read dispatch
      const ok = await conn.client.callTool({
        name: 'fluxer_read',
        arguments: { tool: 'guild_get', arguments: { guild_id: MOCK_GUILD_ID } },
      });
      expect(ok.isError).not.toBe(true);
    } finally {
      await conn.close();
    }
  });

  it('executes Fluxer-native tools across Cloud and self-hosted instances', async () => {
    // Test self-hosted URL
    const selfOrigin = 'https://fluxer.selfhosted.example';
    mswServer.use(...createFluxerHandlers(selfOrigin));
    const selfConn = await connectTestClient({ FLUXER_API_URL: selfOrigin });
    try {
      const disc = await selfConn.client.callTool({
        name: 'instance_get_discovery',
        arguments: { force_refresh: true },
      });
      expect(disc.isError).not.toBe(true);
      expect((disc.structuredContent as Record<string, unknown>).self_hosted).toBe(true);
    } finally {
      await selfConn.close();
    }

    // Test full Cloud tool suite with writes enabled
    const conn = await connectTestClient({ MCP_DRY_RUN: 'false' });
    try {
      const calls: Array<[string, Record<string, unknown>]> = [
        ['instance_get_discovery', {}],
        ['instance_list_badges', {}],
        ['instance_get_gateway', {}],
        ['application_get_current', {}],
        ['application_get_public', { application_id: MOCK_BOT_ID }],
        ['guild_get', { guild_id: MOCK_GUILD_ID }],
        ['guild_modify', { guild_id: MOCK_GUILD_ID, verification_level: 2 }],
        ['guild_get_vanity_url', { guild_id: MOCK_GUILD_ID }],
        ['guild_update_vanity_url', { guild_id: MOCK_GUILD_ID, code: 'my-fluxer' }],
        [
          'guild_update_channel_positions',
          { guild_id: MOCK_GUILD_ID, positions: [{ id: MOCK_CHANNEL_ID, position: 0 }] },
        ],
        ['guild_security_audit', { guild_id: MOCK_GUILD_ID }],
        ['channels_list', { guild_id: MOCK_GUILD_ID }],
        [
          'channels_create_guild_channel',
          {
            guild_id: MOCK_GUILD_ID,
            name: 'docs-link',
            type: 998,
            url: 'https://docs.fluxer.com/',
          },
        ],
        ['channels_get_slowmode', { channel_id: MOCK_CHANNEL_ID }],
        ['channels_get_follower_stats', { channel_id: MOCK_CHANNEL_ID }],
        ['channels_create_forum_tag', { channel_id: MOCK_FORUM_CHANNEL_ID, name: 'Solved' }],
        ['channels_search_threads', { channel_id: MOCK_FORUM_CHANNEL_ID, name: 'help' }],
        ['roles_list', { guild_id: MOCK_GUILD_ID }],
        [
          'roles_modify_hoist_positions',
          {
            guild_id: MOCK_GUILD_ID,
            hoist_positions: [{ id: MOCK_MOD_ROLE_ID, hoist_position: 1 }],
          },
        ],
        ['roles_reset_hoist_positions', { guild_id: MOCK_GUILD_ID }],
        ['roles_analyze_hierarchy', { guild_id: MOCK_GUILD_ID }],
        ['permissions_audit_channel', { guild_id: MOCK_GUILD_ID, channel_id: MOCK_CHANNEL_ID }],
        [
          'permissions_explain',
          { guild_id: MOCK_GUILD_ID, channel_id: MOCK_CHANNEL_ID, user_id: MOCK_USER_ID },
        ],
        ['permissions_member_access_report', { guild_id: MOCK_GUILD_ID, user_id: MOCK_USER_ID }],
        ['members_search', { guild_id: MOCK_GUILD_ID, query: 'alice', is_bot: false }],
        [
          'members_timeout',
          {
            guild_id: MOCK_GUILD_ID,
            user_id: MOCK_USER_ID,
            duration_seconds: 300,
            timeout_reason: 'Cooldown',
          },
        ],
        ['members_voice_moderate', { guild_id: MOCK_GUILD_ID, user_id: MOCK_USER_ID, mute: true }],
        [
          'members_ban',
          {
            guild_id: MOCK_GUILD_ID,
            user_id: MOCK_USER_ID,
            ban_duration_seconds: 3600,
            reason: 'Temp ban',
            __confirm: true,
          },
        ],
        ['messages_send', { channel_id: MOCK_CHANNEL_ID, content: 'Hello native Fluxer!' }],
        ['messages_list_pins', { channel_id: MOCK_CHANNEL_ID }],
        ['messages_search', { guild_id: MOCK_GUILD_ID, content: 'Fluxer' }],
        ['messages_context', { channel_id: MOCK_CHANNEL_ID }],
        [
          'reactions_create',
          { channel_id: MOCK_CHANNEL_ID, message_id: '700000000000000001', emoji: '🔥' },
        ],
        ['emojis_clone', { guild_id: MOCK_GUILD_ID, source_emoji_id: '100000000000000001' }],
        [
          'stickers_create_guild_sticker',
          { guild_id: MOCK_GUILD_ID, name: 'wave', image: 'data:image/png;base64,iVBORw0KGgo=' },
        ],
        ['discovery_list_categories', {}],
        ['discovery_get_guild_status', { guild_id: MOCK_GUILD_ID }],
        [
          'webhooks_execute_instatus',
          {
            webhook_id: MOCK_WEBHOOK_ID,
            webhook_token: MOCK_WEBHOOK_TOKEN,
            payload: { incident: 'resolved' },
          },
        ],
        [
          'webhooks_execute_libredesk',
          {
            webhook_id: MOCK_WEBHOOK_ID,
            webhook_token: MOCK_WEBHOOK_TOKEN,
            payload: { ticket: 42 },
          },
        ],
        ['audit_log_summary', { guild_id: MOCK_GUILD_ID }],
        [
          'intelligence_moderate_content',
          { text: 'FREE PLUTONIUM AIRDROP CLAIM NOW @everyone https://bit.ly/scam' },
        ],
        ['users_get_profile', { user_id: MOCK_USER_ID, guild_id: MOCK_GUILD_ID }],
        ['fluxer_intent_plan', { goal: 'audit security and lock down a raid' }],
      ];

      for (const [name, args] of calls) {
        const res = await conn.client.callTool({ name, arguments: args });
        expect(res.isError, `Tool ${name} failed: ${JSON.stringify(res)}`).not.toBe(true);
      }
    } finally {
      await conn.close();
    }
  });

  it('runs end-to-end Blueprint, Change Plan + Restore, Backup + Diff + Clone, Raid Shield, and Pipeline/Workflow', async () => {
    const conn = await connectTestClient({ MCP_DRY_RUN: 'false' });
    try {
      // 1. Blueprint plan -> apply -> evidence
      const bpPlan = await conn.client.callTool({
        name: 'guild_blueprint_plan',
        arguments: {
          guild_id: MOCK_GUILD_ID,
          request: 'Build a French gaming and esports community',
        },
      });
      expect(bpPlan.isError).not.toBe(true);
      const bpRef = (bpPlan.structuredContent as { plan_ref: string }).plan_ref;
      expect(bpRef).toMatch(/^bp_/);

      const bpApply = await conn.client.callTool({
        name: 'guild_blueprint_apply',
        arguments: { guild_id: MOCK_GUILD_ID, plan_ref: bpRef, __confirm: true },
      });
      expect(bpApply.isError).not.toBe(true);
      expect((bpApply.structuredContent as { status: string }).status).toBe('complete');

      const bpEvidence = await conn.client.callTool({
        name: 'guild_blueprint_evidence',
        arguments: { guild_id: MOCK_GUILD_ID, plan_ref: bpRef },
      });
      expect(bpEvidence.isError).not.toBe(true);

      // 2. Change Plan -> Apply -> Restore
      const chgPlan = await conn.client.callTool({
        name: 'guild_change_plan',
        arguments: {
          guild_id: MOCK_GUILD_ID,
          request: 'Enable slowmode on general',
          channels: [{ id: MOCK_CHANNEL_ID, patch: { rate_limit_per_user: 10 } }],
        },
      });
      const chgRef = (chgPlan.structuredContent as { plan_ref: string }).plan_ref;
      const chgApply = await conn.client.callTool({
        name: 'guild_change_apply',
        arguments: { guild_id: MOCK_GUILD_ID, plan_ref: chgRef, __confirm: true },
      });
      expect((chgApply.structuredContent as { status: string }).status).toBe('applied');

      const chgRestore = await conn.client.callTool({
        name: 'guild_change_restore',
        arguments: { guild_id: MOCK_GUILD_ID, plan_ref: chgRef, __confirm: true },
      });
      expect((chgRestore.structuredContent as { status: string }).status).toBe('restored');

      // 3. Backup -> Diff -> Clone Plan
      const backup = await conn.client.callTool({
        name: 'guild_backup_export',
        arguments: { guild_id: MOCK_GUILD_ID, backup_name: 'snap_v1' },
      });
      expect((backup.structuredContent as { backup_id: string }).backup_id).toBe('snap_v1');

      const diff = await conn.client.callTool({
        name: 'guild_config_diff',
        arguments: { source_backup_id: 'snap_v1', target_guild_id: MOCK_GUILD_ID },
      });
      expect((diff.structuredContent as { total_differences: number }).total_differences).toBe(0);

      const clone = await conn.client.callTool({
        name: 'guild_clone_plan',
        arguments: { guild_id: MOCK_GUILD_ID, source_backup_id: 'snap_v1' },
      });
      expect((clone.structuredContent as { status: string }).status).toBe('already_current');

      // 4. Raid Shield lockdown -> restore
      const lock = await conn.client.callTool({
        name: 'guild_raid_shield',
        arguments: { guild_id: MOCK_GUILD_ID, mode: 'lockdown', apply: true },
      });
      const raidSnap = (lock.structuredContent as { snapshot_id: string }).snapshot_id;
      const unlock = await conn.client.callTool({
        name: 'guild_raid_shield',
        arguments: { guild_id: MOCK_GUILD_ID, mode: 'restore', snapshot_id: raidSnap, apply: true },
      });
      expect((unlock.structuredContent as { status: string }).status).toBe('restored');

      // 5. Pipeline with interpolation + Durable Workflow
      const pipe = await conn.client.callTool({
        name: 'mcp_pipeline',
        arguments: {
          steps: [
            { id: 'guild', tool: 'guild_get', arguments: { guild_id: MOCK_GUILD_ID } },
            {
              id: 'msg',
              tool: 'messages_send',
              // biome-ignore lint/suspicious/noTemplateCurlyInString: pipeline interpolation syntax
              arguments: { channel_id: MOCK_CHANNEL_ID, content: 'Audited ${guild.name}' },
            },
          ],
        },
      });
      expect((pipe.structuredContent as { status: string }).status).toBe('completed');

      const wf = await conn.client.callTool({
        name: 'workflow_start',
        arguments: {
          name: 'Daily health check',
          steps: [
            { id: 'audit', tool: 'guild_security_audit', arguments: { guild_id: MOCK_GUILD_ID } },
          ],
        },
      });
      expect((wf.structuredContent as { status: string }).status).toBe('completed');

      // 6. Welcome System + Automated Inconsistency Remediation Plan -> Apply -> Restore
      const welcome = await conn.client.callTool({
        name: 'guild_configure_welcome',
        arguments: {
          guild_id: MOCK_GUILD_ID,
          system_channel_id: MOCK_CHANNEL_ID,
          rules_channel_id: MOCK_CHANNEL_ID,
          suppress_join_notifications: false,
          welcome_post: {
            channel_id: MOCK_CHANNEL_ID,
            content: 'Bienvenue dans notre communauté Fluxer !',
            pin: true,
          },
        },
      });
      expect(welcome.isError).not.toBe(true);
      expect((welcome.structuredContent as { status: string }).status).toBe('configured');

      const remPlan = await conn.client.callTool({
        name: 'guild_remediate_plan',
        arguments: {
          guild_id: MOCK_GUILD_ID,
          enforce_min_verification_level: 2,
          enforce_explicit_content_filter: 2,
        },
      });
      expect(remPlan.isError).not.toBe(true);
      const remRef = (remPlan.structuredContent as { plan_ref: string }).plan_ref;
      expect(remRef).toMatch(/^rem_/);

      const remApply = await conn.client.callTool({
        name: 'guild_change_apply',
        arguments: { guild_id: MOCK_GUILD_ID, plan_ref: remRef, __confirm: true },
      });
      expect((remApply.structuredContent as { status: string }).status).toBe('applied');

      const remRestore = await conn.client.callTool({
        name: 'guild_change_restore',
        arguments: { guild_id: MOCK_GUILD_ID, plan_ref: remRef, __confirm: true },
      });
      expect((remRestore.structuredContent as { status: string }).status).toBe('restored');
    } finally {
      await conn.close();
    }
  });

  it('catalog server refuses tool execution without credentials', async () => {
    const catalog = buildCatalogServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await catalog.server.connect(st);
    const client = new Client({ name: 'catalog-client', version: '1.0.0' });
    await client.connect(ct);
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBe(184);
      const res = await client.callTool({
        name: 'guild_get',
        arguments: { guild_id: MOCK_GUILD_ID },
      });
      expect(res.isError).toBe(true);
      expect((res.structuredContent as Record<string, unknown>).code).toBe('CATALOG_ONLY');
    } finally {
      await client.close();
      await catalog.server.close();
    }
  });
});
