import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fluxerHandlers } from '@fluxer-mcp/server-mocks';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateClientSnippet, SUPPORTED_CLIENTS } from './lib/client-snippets.js';
import {
  activateProfile,
  listProfiles,
  loadProfile,
  removeProfile,
  saveProfile,
} from './lib/profiles.js';
import { hasValidBearerToken, startHttp } from './transports/http.js';

const mswServer = setupServer(...fluxerHandlers);
const tempDirs: string[] = [];

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => {
  mswServer.close();
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('profiles', () => {
  it('saves, lists, loads, activates without overwriting explicit env, and removes profiles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxer-profiles-'));
    tempDirs.push(dir);
    const now = new Date().toISOString();
    saveProfile(
      {
        name: 'selfhosted-prod',
        api_url: 'https://chat.internal.example/api',
        allowed_guilds: ['999000999000999000'],
        write_mode: 'preview',
        tool_surface: 'progressive',
        created_at: now,
        updated_at: now,
      },
      dir,
    );

    expect(listProfiles(dir).map((p) => p.name)).toEqual(['selfhosted-prod']);
    expect(loadProfile('selfhosted-prod', dir).api_url).toBe('https://chat.internal.example/api');

    const env: NodeJS.ProcessEnv = { MCP_WRITE_MODE: 'allow' };
    activateProfile('selfhosted-prod', { directory: dir, env });
    expect(env.FLUXER_API_URL).toBe('https://chat.internal.example/api');
    expect(env.ALLOWED_GUILDS).toBe('999000999000999000');
    // Explicit env var takes precedence over profile default
    expect(env.MCP_WRITE_MODE).toBe('allow');

    expect(removeProfile('selfhosted-prod', dir)).toBe(true);
    expect(listProfiles(dir)).toEqual([]);
  });
});

describe('AI client snippet generator', () => {
  it('generates valid snippets for all 12 supported AI clients including self-hosted URLs', () => {
    for (const client of SUPPORTED_CLIENTS) {
      const snippet = generateClientSnippet({
        client,
        apiUrl: 'https://chat.example.com/api',
        allowedGuilds: '999000999000999000',
        toolSurface: 'progressive',
      });
      expect(snippet.content).toContain('@fluxer-mcp/cli');
      expect(snippet.content).toContain('FLUXER_TOKEN');
      expect(snippet.content).toContain('https://chat.example.com/api');
      if (snippet.format === 'json') {
        expect(() => JSON.parse(snippet.content)).not.toThrow();
      }
    }
  });
});

describe('Streamable HTTP transport', () => {
  it('validates Bearer tokens in constant time and serves /healthz + /mcp', async () => {
    const secret = 'fluxer_http_bearer_secret_0123456789abcdef';
    expect(hasValidBearerToken(`Bearer ${secret}`, secret)).toBe(true);
    expect(hasValidBearerToken(`bearer ${secret}`, secret)).toBe(true);
    expect(hasValidBearerToken('Bearer wrong', secret)).toBe(false);
    expect(hasValidBearerToken(undefined, secret)).toBe(false);

    const prevToken = process.env.FLUXER_TOKEN;
    const prevAccess = process.env.FLUXER_MCP_ACCESS_TOKEN;
    const prevAudit = process.env.MCP_AUDIT_SINK;
    process.env.FLUXER_TOKEN = 'fluxer_http_test_bot_token_1234567890';
    process.env.FLUXER_MCP_ACCESS_TOKEN = secret;
    process.env.MCP_AUDIT_SINK = 'none';

    const server = await startHttp({ host: '127.0.0.1', port: 0, registerSignalHandlers: false });
    try {
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;

      const unauth = await fetch(`${base}/healthz`);
      expect(unauth.status).toBe(401);

      const health = await fetch(`${base}/healthz`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      expect(health.status).toBe(200);
      const body = (await health.json()) as { status: string; service: string };
      expect(body.status).toBe('ok');
      expect(body.service).toBe('fluxer-mcp');

      const notFound = await fetch(`${base}/unknown`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      expect(notFound.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (prevToken === undefined) delete process.env.FLUXER_TOKEN;
      else process.env.FLUXER_TOKEN = prevToken;
      if (prevAccess === undefined) delete process.env.FLUXER_MCP_ACCESS_TOKEN;
      else process.env.FLUXER_MCP_ACCESS_TOKEN = prevAccess;
      if (prevAudit === undefined) delete process.env.MCP_AUDIT_SINK;
      else process.env.MCP_AUDIT_SINK = prevAudit;
    }
  });
});
