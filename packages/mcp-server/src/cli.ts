#!/usr/bin/env node
import { VERSION } from '@fluxer-mcp/core';
import { Command } from 'commander';
import { SUPPORTED_CLIENTS } from './lib/client-snippets.js';
import { activateProfile } from './lib/profiles.js';

export function buildProgram(): Command {
  const program = new Command('fluxer-mcp')
    .description(
      'Fluxer MCP server — native Model Context Protocol server for Fluxer Cloud & self-hosted communities',
    )
    .version(VERSION);

  program
    .command('serve', { isDefault: true })
    .description('Start the Fluxer MCP server over stdio (default) or Streamable HTTP')
    .option('--gateway', 'Enable native Fluxer WebSocket Gateway connection')
    .option('--http', 'Serve Streamable HTTP MCP at /mcp (requires FLUXER_MCP_ACCESS_TOKEN)')
    .option('--host <host>', 'HTTP listen host (default: 127.0.0.1)')
    .option('--port <port>', 'HTTP listen port (default: 3000)', Number)
    .option('--api-url <url>', 'Override Fluxer API base URL (for self-hosted instances)')
    .option('--profile <name>', 'Load a non-secret Fluxer bot profile before startup')
    .action(
      async (options: {
        gateway?: boolean;
        http?: boolean;
        host?: string;
        port?: number;
        apiUrl?: string;
        profile?: string;
      }) => {
        try {
          if (options.profile) activateProfile(options.profile);
          if (options.apiUrl) process.env.FLUXER_API_URL = options.apiUrl;
          if (options.gateway) process.env.GATEWAY = '1';

          if (options.http) {
            const { startHttp } = await import('./transports/http.js');
            await startHttp({
              ...(options.host ? { host: options.host } : {}),
              ...(options.port !== undefined ? { port: options.port } : {}),
            });
          } else {
            const { startStdio } = await import('./transports/stdio.js');
            await startStdio();
          }
        } catch (err) {
          process.stderr.write(
            `fluxer-mcp failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exit(1);
        }
      },
    );

  program
    .command('catalog')
    .description('Inspect the Fluxer MCP tool schema without a bot token (execution disabled)')
    .option('--check', 'Validate the credential-free catalog contract and exit')
    .option('--json', 'Emit machine-readable JSON')
    .action(async (options: { check?: boolean; json?: boolean }) => {
      const { catalogAction } = await import('./commands/diagnostics.js');
      await catalogAction(options);
    });

  program
    .command('doctor')
    .description('Diagnose Node.js, configuration, TLS, Fluxer discovery, and bot connectivity')
    .option('--online', 'Check live Fluxer /.well-known/fluxer discovery and bot authentication')
    .option('--api-url <url>', 'Target Fluxer API base URL (Cloud or self-hosted)')
    .option('--profile <name>', 'Load a saved Fluxer profile')
    .option('--json', 'Emit machine-readable JSON')
    .action(
      async (options: { online?: boolean; apiUrl?: string; profile?: string; json?: boolean }) => {
        const { doctorAction } = await import('./commands/diagnostics.js');
        await doctorAction(options);
      },
    );

  program
    .command('smoke')
    .description('Run a read-only end-to-end verification against your Fluxer bot & guild')
    .option('--guild-id <id>', 'Guild ID to inspect')
    .option('--profile <name>', 'Load a saved Fluxer profile')
    .option('--json', 'Emit machine-readable JSON')
    .action(async (options: { guildId?: string; profile?: string; json?: boolean }) => {
      const { smokeAction } = await import('./commands/diagnostics.js');
      await smokeAction(options);
    });

  program
    .command('setup')
    .description('Save a non-secret Fluxer bot profile and generate an AI client config snippet')
    .requiredOption('--profile <name>', 'Local profile name')
    .option('--client <id>', `AI client (${SUPPORTED_CLIENTS.join('|')})`, 'generic')
    .option('--api-url <url>', 'Custom self-hosted Fluxer API URL')
    .option('--ca-cert-path <path>', 'Custom PEM CA certificate path for private TLS CAs')
    .option('--allowed-guilds <ids>', 'Comma-separated guild ID allowlist')
    .option('--default-guild-id <id>', 'Default guild ID')
    .option('--expected-bot-id <id>', 'Expected bot user ID identity lock')
    .option('--categories <names>', 'Comma-separated tool category allowlist')
    .option('--tool-surface <mode>', 'full | progressive (default: progressive)')
    .option('--write-mode <mode>', 'allow | preview (default: preview)')
    .option('--gateway', 'Enable Fluxer Gateway for this profile')
    .option('--json', 'Emit machine-readable JSON')
    .action(async (options) => {
      const { setupAction } = await import('./commands/diagnostics.js');
      setupAction(options);
    });

  program
    .command('init')
    .description(
      'Generate an MCP configuration snippet for Claude Code, Claude Desktop, Codex, Cursor, VS Code, and more',
    )
    .option('--client <id>', `AI client (${SUPPORTED_CLIENTS.join('|')})`, 'generic')
    .option('--profile <name>', 'Reference an existing saved Fluxer profile')
    .option('--api-url <url>', 'Self-hosted Fluxer API URL')
    .option('--allowed-guilds <ids>', 'Comma-separated guild allowlist')
    .option('--categories <names>', 'Comma-separated tool categories')
    .option('--tool-surface <mode>', 'full | progressive')
    .option('--write-mode <mode>', 'allow | preview')
    .option('--gateway', 'Enable Fluxer Gateway')
    .option('--output <path>', 'Write generated snippet to a file')
    .option('--json', 'Emit machine-readable JSON')
    .action(async (options) => {
      const { initAction } = await import('./commands/diagnostics.js');
      initAction(options);
    });

  const profile = program.command('profile').description('Manage non-secret Fluxer MCP profiles');
  profile
    .command('list')
    .option('--json', 'Emit JSON')
    .action(async (options: { json?: boolean }) => {
      const { profileListAction } = await import('./commands/diagnostics.js');
      profileListAction(options);
    });
  profile
    .command('show <name>')
    .option('--json', 'Emit JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      const { profileShowAction } = await import('./commands/diagnostics.js');
      profileShowAction(name, options);
    });
  profile
    .command('remove <name>')
    .option('--json', 'Emit JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      const { profileRemoveAction } = await import('./commands/diagnostics.js');
      profileRemoveAction(name, options);
    });

  return program;
}

export const program = buildProgram();

if (process.env.VITEST !== 'true') {
  await program.parseAsync(process.argv);
}
