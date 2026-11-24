export const SUPPORTED_CLIENTS = [
  'claude-code',
  'claude-desktop',
  'codex',
  'cursor',
  'vscode',
  'windsurf',
  'cline',
  'roo-code',
  'continue',
  'zed',
  'opencode',
  'generic',
] as const;

export type SupportedClient = (typeof SUPPORTED_CLIENTS)[number];

export interface SnippetOptions {
  readonly client: SupportedClient;
  readonly profile?: string;
  readonly apiUrl?: string;
  readonly allowedGuilds?: string;
  readonly categories?: string;
  readonly toolSurface?: 'full' | 'progressive';
  readonly writeMode?: 'allow' | 'preview';
  readonly gateway?: boolean;
  readonly command?: string;
}

export interface GeneratedSnippet {
  readonly client: SupportedClient;
  readonly format: 'json' | 'toml' | 'shell';
  readonly configPathHint: string;
  readonly content: string;
  readonly notes: readonly string[];
}

export function generateClientSnippet(opts: SnippetOptions): GeneratedSnippet {
  const command = opts.command ?? 'npx';
  const baseArgs = command === 'npx' ? ['-y', '@fluxer-mcp/cli', 'serve'] : ['serve'];
  if (opts.profile) baseArgs.push('--profile', opts.profile);
  if (opts.gateway) baseArgs.push('--gateway');

  const env: Record<string, string> = {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: client env placeholder
    FLUXER_TOKEN: '${FLUXER_TOKEN}',
  };
  if (opts.apiUrl) env.FLUXER_API_URL = opts.apiUrl;
  if (opts.allowedGuilds) env.ALLOWED_GUILDS = opts.allowedGuilds;
  if (opts.categories) env.MCP_CATEGORIES = opts.categories;
  if (opts.toolSurface) env.MCP_TOOL_SURFACE = opts.toolSurface;
  if (opts.writeMode) env.MCP_WRITE_MODE = opts.writeMode;

  if (opts.client === 'codex') {
    const argsToml = baseArgs.map((a) => JSON.stringify(a)).join(', ');
    const envLines = Object.entries(env)
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
      .join('\n');
    return {
      client: 'codex',
      format: 'toml',
      configPathHint: '~/.codex/config.toml',
      content: [
        '[mcp_servers.fluxer]',
        `command = ${JSON.stringify(command)}`,
        `args = [${argsToml}]`,
        '',
        '[mcp_servers.fluxer.env]',
        envLines,
      ].join('\n'),
      notes: [
        'Export FLUXER_TOKEN in your shell before launching Codex so secrets stay out of config.toml.',
      ],
    };
  }

  if (opts.client === 'claude-code') {
    const envFlags = Object.entries(env)
      .filter(([k]) => k !== 'FLUXER_TOKEN')
      .map(([k, v]) => `-e ${k}=${JSON.stringify(v)}`)
      .join(' ');
    const cmdLine = [
      'claude mcp add fluxer',
      '-e FLUXER_TOKEN="$FLUXER_TOKEN"',
      envFlags,
      '--',
      command,
      ...baseArgs,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      client: 'claude-code',
      format: 'shell',
      configPathHint: 'Run in terminal (or add to .mcp.json)',
      content: cmdLine,
      notes: [
        'Ensure FLUXER_TOKEN is exported in your environment.',
        'For project-scoped sharing, use `.mcp.json` with `"mcpServers": { "fluxer": ... }`.',
      ],
    };
  }

  if (opts.client === 'vscode') {
    const json = {
      servers: {
        fluxer: {
          type: 'stdio',
          command,
          args: baseArgs,
          env: {
            ...env,
            // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code env placeholder
            FLUXER_TOKEN: '${env:FLUXER_TOKEN}',
          },
        },
      },
    };
    return {
      client: 'vscode',
      format: 'json',
      configPathHint: '.vscode/mcp.json',
      content: JSON.stringify(json, null, 2),
      notes: [
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal doc reference
        'VS Code reads `${env:FLUXER_TOKEN}` from your environment without storing secrets in workspace files.',
      ],
    };
  }

  if (opts.client === 'zed') {
    const json = {
      context_servers: {
        fluxer: {
          command: {
            path: command,
            args: baseArgs,
            env,
          },
        },
      },
    };
    return {
      client: 'zed',
      format: 'json',
      configPathHint: '~/.config/zed/settings.json',
      content: JSON.stringify(json, null, 2),
      notes: ['Export FLUXER_TOKEN before launching Zed.'],
    };
  }

  if (opts.client === 'opencode') {
    const json = {
      mcp: {
        fluxer: {
          type: 'local',
          command: [command, ...baseArgs],
          environment: env,
          enabled: true,
        },
      },
    };
    return {
      client: 'opencode',
      format: 'json',
      configPathHint: 'opencode.json',
      content: JSON.stringify(json, null, 2),
      notes: ['Export FLUXER_TOKEN before running OpenCode.'],
    };
  }

  const pathHints: Record<string, string> = {
    'claude-desktop': 'claude_desktop_config.json',
    cursor: '.cursor/mcp.json',
    windsurf: '~/.codeium/windsurf/mcp_config.json',
    cline: 'cline_mcp_settings.json',
    'roo-code': '.roo/mcp.json',
    continue: '~/.continue/config.json',
    generic: 'mcp.json',
  };

  const json = {
    mcpServers: {
      fluxer: {
        command,
        args: baseArgs,
        env,
      },
    },
  };
  return {
    client: opts.client,
    format: 'json',
    configPathHint: pathHints[opts.client] ?? 'mcp.json',
    content: JSON.stringify(json, null, 2),
    notes: [
      'Never commit FLUXER_TOKEN into source control.',
      'For self-hosted Fluxer instances, set FLUXER_API_URL (and optionally FLUXER_CA_CERT_PATH).',
    ],
  };
}
