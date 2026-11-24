import { execFile } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { fluxerHandlers } from '@fluxer-mcp/server-mocks';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startHttp } from './transports/http.js';

const execFileAsync = promisify(execFile);
const CLI_DIST_PATH = resolve(import.meta.dirname, '..', 'dist', 'cli.js');
const mswServer = setupServer(...fluxerHandlers);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('Fluxer MCP End-to-End (Stdio subprocess, CLI commands, and Streamable HTTP MCP)', () => {
  it('connects a real MCP Client over stdio to spawned `fluxer-mcp catalog` subprocess', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_DIST_PATH, 'catalog'],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'e2e-stdio-client', version: '1.0.0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBe(184);
      expect(tools.some((t) => t.name === 'guild_remediate_plan')).toBe(true);
      expect(tools.some((t) => t.name === 'guild_configure_welcome')).toBe(true);
      expect(tools.some((t) => t.name === 'messages_preload_channels')).toBe(true);

      const { prompts } = await client.listPrompts();
      expect(prompts.map((p) => p.name)).toContain('build-fluxer-community');

      const blocked = await client.callTool({
        name: 'instance_get_discovery',
        arguments: {},
      });
      expect(blocked.isError).toBe(true);
      expect((blocked.structuredContent as Record<string, unknown>).code).toBe('CATALOG_ONLY');
    } finally {
      await client.close();
    }
  });

  it('executes real CLI subcommands (`catalog --check --json`, `init`, `doctor --json`) cleanly', async () => {
    const cliEnv = {
      ...process.env,
      VITEST: '',
      FLUXER_TOKEN: 'fluxer_cli_e2e_token_0123456789abcdef',
    };

    const catRes = await execFileAsync(
      process.execPath,
      [CLI_DIST_PATH, 'catalog', '--check', '--json'],
      { env: cliEnv },
    );
    const catJson = JSON.parse(catRes.stdout) as { ok: boolean; total_tools: number };
    expect(catJson.ok).toBe(true);
    expect(catJson.total_tools).toBe(184);

    const claudeInit = await execFileAsync(
      process.execPath,
      [
        CLI_DIST_PATH,
        'init',
        '--client',
        'claude-code',
        '--api-url',
        'https://selfhosted.fluxer.example/api',
      ],
      { env: cliEnv },
    );
    expect(claudeInit.stdout).toContain('@fluxer-mcp/cli');
    expect(claudeInit.stdout).toContain('https://selfhosted.fluxer.example/api');

    const codexInit = await execFileAsync(
      process.execPath,
      [CLI_DIST_PATH, 'init', '--client', 'codex'],
      { env: cliEnv },
    );
    expect(codexInit.stdout).toContain('[mcp_servers.fluxer]');

    const doctor = await execFileAsync(process.execPath, [CLI_DIST_PATH, 'doctor', '--json'], {
      env: cliEnv,
    });
    const doctorJson = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: Array<{ id: string; ok: boolean }>;
    };
    expect(doctorJson.ok).toBe(true);
    expect(doctorJson.checks.some((c) => c.id === 'node_version' && c.ok)).toBe(true);
    expect(doctorJson.checks.some((c) => c.id === 'token_present' && c.ok)).toBe(true);
  });

  it('completes full MCP JSON-RPC session over Streamable HTTP transport with Bearer auth', async () => {
    const secret = 'fluxer_e2e_streamable_http_secret_0123456789abcdef';
    const prevToken = process.env.FLUXER_TOKEN;
    const prevAccess = process.env.FLUXER_MCP_ACCESS_TOKEN;
    const prevAudit = process.env.MCP_AUDIT_SINK;
    process.env.FLUXER_TOKEN = 'fluxer_e2e_http_bot_token_1234567890abcdef';
    process.env.FLUXER_MCP_ACCESS_TOKEN = secret;
    process.env.MCP_AUDIT_SINK = 'none';

    const httpServer = await startHttp({
      host: '127.0.0.1',
      port: 0,
      registerSignalHandlers: false,
    });
    try {
      const { port } = httpServer.address() as AddressInfo;
      const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);

      // Unauthenticated POST /mcp must be rejected with 401
      const unauth = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      expect(unauth.status).toBe(401);

      // Authenticated MCP Client over StreamableHTTPClientTransport
      const transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: {
          headers: { Authorization: `Bearer ${secret}` },
        },
      });
      const client = new Client({ name: 'e2e-http-client', version: '1.0.0' });
      await client.connect(transport);
      try {
        const { tools } = await client.listTools();
        expect(tools.length).toBe(184);

        const { resources } = await client.listResources();
        expect(resources.map((r) => r.uri)).toContain('fluxer://catalog/summary');
        expect(resources.map((r) => r.uri)).toContain('fluxer://instance/gateway');

        const summary = await client.readResource({ uri: 'fluxer://catalog/summary' });
        const firstContent = summary.contents[0];
        expect(firstContent && 'text' in firstContent ? firstContent.text : '').toContain(
          '"total_tools": 184',
        );

        const plan = await client.callTool({
          name: 'fluxer_intent_plan',
          arguments: { goal: 'audit security and configure welcome system' },
        });
        expect(plan.isError).not.toBe(true);
      } finally {
        await client.close();
      }
    } finally {
      await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
      if (prevToken === undefined) delete process.env.FLUXER_TOKEN;
      else process.env.FLUXER_TOKEN = prevToken;
      if (prevAccess === undefined) delete process.env.FLUXER_MCP_ACCESS_TOKEN;
      else process.env.FLUXER_MCP_ACCESS_TOKEN = prevAccess;
      if (prevAudit === undefined) delete process.env.MCP_AUDIT_SINK;
      else process.env.MCP_AUDIT_SINK = prevAudit;
    }
  });
});
