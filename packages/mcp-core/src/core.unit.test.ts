import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FluxerAPIError, RateLimitError } from '@fluxerjs/rest';
import { afterEach, describe, expect, it } from 'vitest';
import { redactArgs, redactRoute } from './audit.js';
import { loadConfig, stripAuthPrefix } from './config.js';
import { searchTools } from './discovery.js';
import {
  BulkheadFullError,
  CircuitOpenError,
  DryRunPreview,
  formatErrorForUser,
  ValidationError,
  WritePreview,
} from './errors.js';
import { FLUXER_PERMISSIONS } from './fluxer/constants.js';
import {
  compareRolesDesc,
  decodePermissionNames,
  encodePermissionNames,
  evaluateChannelPermissions,
  findDangerousPermissions,
} from './fluxer/permissions.js';
import { loadSignedState, saveSignedState } from './state.js';
import { ALL_FLUXER_TOOLS } from './tools/index.js';

const VALID_TOKEN = 'fluxer_test_bot_token_1234567890abcdef';

describe('config', () => {
  it('loads defaults for Fluxer Cloud and strips Bot/Bearer prefixes', () => {
    const cfg = loadConfig({ FLUXER_TOKEN: `Bot ${VALID_TOKEN}` });
    expect(cfg.FLUXER_API_URL).toBe('https://api.fluxer.app');
    expect(cfg.FLUXER_API_VERSION).toBe('1');
    expect(cfg.MCP_DRY_RUN).toBe(true);
    expect(cfg.MCP_WRITE_MODE).toBe('allow');
    expect(stripAuthPrefix(cfg.FLUXER_TOKEN)).toBe(VALID_TOKEN);
    expect(stripAuthPrefix(`Bearer ${VALID_TOKEN}`)).toBe(VALID_TOKEN);
  });

  it('supports custom self-hosted FLUXER_API_URL and strips trailing slashes', () => {
    const cfg = loadConfig({
      FLUXER_TOKEN: VALID_TOKEN,
      FLUXER_API_URL: 'https://chat.mycompany.example/api///',
      FLUXER_WEBAPP_URL: 'https://chat.mycompany.example/',
    });
    expect(cfg.FLUXER_API_URL).toBe('https://chat.mycompany.example/api');
    expect(cfg.FLUXER_WEBAPP_URL).toBe('https://chat.mycompany.example');
  });

  it('rejects non-http(s) FLUXER_API_URL and default guild outside ALLOWED_GUILDS', () => {
    expect(() =>
      loadConfig({ FLUXER_TOKEN: VALID_TOKEN, FLUXER_API_URL: 'ftp://bad.example' }),
    ).toThrow(/Invalid Fluxer MCP configuration/);

    expect(() =>
      loadConfig({
        FLUXER_TOKEN: VALID_TOKEN,
        ALLOWED_GUILDS: '111111111111111111',
        FLUXER_DEFAULT_GUILD_ID: '222222222222222222',
      }),
    ).toThrow(/FLUXER_DEFAULT_GUILD_ID: must be included in ALLOWED_GUILDS/);
  });
});

describe('fluxer permissions evaluator', () => {
  const guildId = '100000000000000000';
  const roles = [
    {
      id: guildId,
      name: '@everyone',
      position: 0,
      permissions: String(FLUXER_PERMISSIONS.VIEW_CHANNEL | FLUXER_PERMISSIONS.SEND_MESSAGES),
    },
    {
      id: '200000000000000001',
      name: 'Mod',
      position: 5,
      permissions: String(FLUXER_PERMISSIONS.KICK_MEMBERS | FLUXER_PERMISSIONS.PIN_MESSAGES),
    },
    {
      id: '200000000000000002',
      name: 'Admin',
      position: 10,
      permissions: String(FLUXER_PERMISSIONS.ADMINISTRATOR),
    },
  ];

  it('applies role base, overwrites, member overwrite precedence, and Fluxer-native bits', () => {
    const res = evaluateChannelPermissions({
      guildId,
      memberId: '300000000000000001',
      memberRoleIds: ['200000000000000001'],
      roles,
      overwrites: [
        { id: guildId, type: 0, allow: '0', deny: String(FLUXER_PERMISSIONS.SEND_MESSAGES) },
        {
          id: '300000000000000001',
          type: 1,
          allow: String(FLUXER_PERMISSIONS.BYPASS_SLOWMODE),
          deny: '0',
        },
      ],
    });
    expect(res.permissions).toContain('VIEW_CHANNEL');
    expect(res.permissions).toContain('PIN_MESSAGES');
    expect(res.permissions).toContain('BYPASS_SLOWMODE');
    expect(res.permissions).not.toContain('SEND_MESSAGES');
  });

  it('bypasses channel denials and timeouts for ADMINISTRATOR and restricts timed-out members', () => {
    const future = new Date(Date.now() + 600_000).toISOString();
    const timedOutMod = evaluateChannelPermissions({
      guildId,
      memberId: '300000000000000001',
      memberRoleIds: ['200000000000000001'],
      roles,
      communicationDisabledUntil: future,
    });
    expect(timedOutMod.timedOut).toBe(true);
    expect(timedOutMod.permissions).toEqual(['VIEW_CHANNEL']);

    const admin = evaluateChannelPermissions({
      guildId,
      memberId: '300000000000000002',
      memberRoleIds: ['200000000000000002'],
      roles,
      communicationDisabledUntil: future,
    });
    expect(admin.isAdministrator).toBe(true);
    expect(admin.permissions).toContain('MANAGE_GUILD');
  });

  it('detects dangerous @everyone permissions and sorts roles descending', () => {
    const bits = encodePermissionNames(['VIEW_CHANNEL', 'ADMINISTRATOR', 'MANAGE_WEBHOOKS']);
    expect(decodePermissionNames(bits)).toEqual(
      expect.arrayContaining(['VIEW_CHANNEL', 'ADMINISTRATOR', 'MANAGE_WEBHOOKS']),
    );
    expect(findDangerousPermissions(bits, true)).toEqual(
      expect.arrayContaining(['ADMINISTRATOR', 'MANAGE_WEBHOOKS']),
    );
    expect([...roles].sort(compareRolesDesc)[0]?.name).toBe('Admin');
  });
});

describe('audit redaction & error formatting', () => {
  it('redacts secrets, webhook tokens, and base64 image blobs', () => {
    const redacted = redactArgs({
      webhook_token: 'secret_abc',
      password: 'hunter2',
      image: `data:image/png;base64,${'A'.repeat(200)}`,
      safe: 'hello',
    }) as Record<string, unknown>;
    expect(redacted.webhook_token).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(String(redacted.image)).toContain('[REDACTED_BASE64:');
    expect(redacted.safe).toBe('hello');
    expect(redactRoute('/webhooks/123456789012345678/super_secret_tok/github')).toBe(
      '/webhooks/123456789012345678/[REDACTED]/github',
    );
  });

  it('formats Fluxer string error codes, rate limits, and safety previews cleanly', () => {
    const botCreateErr = new FluxerAPIError(
      { code: 'BOTS_CANNOT_CREATE_GUILDS', message: 'Bots cannot create guilds' },
      403,
    );
    const formatted = formatErrorForUser(botCreateErr, {
      toolName: 'guild_create',
      transport: 'stdio',
    });
    expect(formatted.isError).toBe(true);
    expect((formatted.structuredContent as Record<string, unknown>).code).toBe(
      'BOTS_CANNOT_CREATE_GUILDS',
    );

    const rl = new RateLimitError(
      { code: 'RATE_LIMITED', message: 'Slow down', retry_after: 2.5 },
      429,
    );
    const rlRes = formatErrorForUser(rl, { toolName: 'messages_send', transport: 'stdio' });
    expect((rlRes.structuredContent as Record<string, unknown>).retry_after_ms).toBe(2500);

    expect(
      (
        formatErrorForUser(new DryRunPreview('members_ban', { a: 1 }), {
          toolName: 'members_ban',
          transport: 'stdio',
        }).structuredContent as Record<string, unknown>
      ).code,
    ).toBe('DRY_RUN_PREVIEW');
    expect(
      (
        formatErrorForUser(new WritePreview('channels_modify', { a: 1 }), {
          toolName: 'channels_modify',
          transport: 'stdio',
        }).structuredContent as Record<string, unknown>
      ).code,
    ).toBe('WRITE_PREVIEW');
    expect(
      (
        formatErrorForUser(new ValidationError([{ path: 'id', message: 'bad' }]), {
          toolName: 't',
          transport: 'stdio',
        }).structuredContent as Record<string, unknown>
      ).code,
    ).toBe('VALIDATION_FAILED');
    expect(
      (
        formatErrorForUser(new CircuitOpenError(60000), { toolName: 't', transport: 'stdio' })
          .structuredContent as Record<string, unknown>
      ).code,
    ).toBe('CIRCUIT_OPEN');
    expect(
      (
        formatErrorForUser(new BulkheadFullError(), { toolName: 't', transport: 'stdio' })
          .structuredContent as Record<string, unknown>
      ).code,
    ).toBe('BULKHEAD_FULL');
  });
});

describe('signed local state & multilingual tool discovery', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('signs, verifies, and detects tampering on saved state records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxer-state-'));
    dirs.push(dir);
    const secret = 's'.repeat(64);
    const saved = saveSignedState({
      stateDir: dir,
      namespace: 'backups',
      id: 'test_snap',
      secret,
      payload: { guild_id: '999000999000999000', roles: 3 },
    });
    const loaded = loadSignedState<{ guild_id: string; roles: number }>({
      stateDir: dir,
      namespace: 'backups',
      id: 'test_snap',
      secret,
    });
    expect(loaded?.digest).toBe(saved.digest);
    expect(loaded?.payload.roles).toBe(3);

    // Tamper with the file on disk
    const tampered = { ...saved, payload: { guild_id: '999000999000999000', roles: 99 } };
    writeFileSync(join(dir, 'backups', 'test_snap.json'), JSON.stringify(tampered), 'utf8');
    expect(() =>
      loadSignedState({ stateDir: dir, namespace: 'backups', id: 'test_snap', secret }),
    ).toThrow(/integrity digest/);
  });

  it('finds relevant Fluxer tools from both English and French queries', () => {
    const frSec = searchTools(ALL_FLUXER_TOOLS, 'sécurité audit');
    expect(frSec.some((t) => t.name === 'guild_security_audit')).toBe(true);

    const frBackup = searchTools(ALL_FLUXER_TOOLS, 'sauvegarde');
    expect(frBackup.some((t) => t.name === 'guild_backup_export')).toBe(true);

    const enSearch = searchTools(ALL_FLUXER_TOOLS, 'hoist roles');
    expect(enSearch.some((t) => t.name === 'roles_modify_hoist_positions')).toBe(true);
  });
});
