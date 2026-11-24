import { writeFileSync } from 'node:fs';
import {
  ALL_FLUXER_TOOLS,
  buildCatalogServer,
  createLogger,
  FLUXER_DEFAULT_API_URL,
  FLUXER_TOOL_CATEGORIES,
  FluxerRestClient,
  FluxerRoutes,
  loadConfig,
  VERSION,
  verifyExpectedBotIdentity,
} from '@fluxer-mcp/core';
import {
  generateClientSnippet,
  SUPPORTED_CLIENTS,
  type SupportedClient,
} from '../lib/client-snippets.js';
import {
  activateProfile,
  listProfiles,
  loadProfile,
  removeProfile,
  saveProfile,
} from '../lib/profiles.js';
import { startCatalogStdio } from '../transports/stdio.js';

function emit(data: Record<string, unknown>, prettyLines: string[], asJson = false): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(`${prettyLines.join('\n')}\n`);
  }
}

export async function catalogAction(options: { check?: boolean; json?: boolean }): Promise<void> {
  if (!options.check) {
    await startCatalogStdio();
    return;
  }

  const catalog = buildCatalogServer();
  const byCategory: Record<string, number> = {};
  for (const t of ALL_FLUXER_TOOLS) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
  }
  const summary = {
    ok: true,
    name: 'fluxer-mcp',
    version: VERSION,
    total_tools: catalog.registeredTools.length,
    categories: FLUXER_TOOL_CATEGORIES,
    counts_by_category: byCategory,
  };
  emit(
    summary,
    [
      `Fluxer MCP Catalog Check: OK (v${VERSION})`,
      `Total tools: ${summary.total_tools} across ${summary.categories.length} categories`,
      ...Object.entries(byCategory)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, count]) => `  - ${cat}: ${count}`),
    ],
    options.json === true,
  );
}

export interface CheckResult {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

export async function doctorAction(options: {
  online?: boolean;
  json?: boolean;
  profile?: string;
  apiUrl?: string;
}): Promise<void> {
  if (options.profile) activateProfile(options.profile);
  if (options.apiUrl) process.env.FLUXER_API_URL = options.apiUrl;

  const checks: CheckResult[] = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = (major ?? 0) > 22 || ((major ?? 0) === 22 && (minor ?? 0) >= 13);
  checks.push({
    id: 'node_version',
    ok: nodeOk,
    detail: `Node.js v${process.versions.node} (required >=22.13)`,
  });

  const apiUrl = (process.env.FLUXER_API_URL ?? FLUXER_DEFAULT_API_URL).replace(/\/+$/, '');
  const isHttpNonLocal =
    apiUrl.startsWith('http://') && !apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1');
  checks.push({
    id: 'api_url_tls',
    ok: !isHttpNonLocal,
    detail: isHttpNonLocal
      ? `Warning: plaintext HTTP configured for remote Fluxer host (${apiUrl}). Use https://.`
      : `Fluxer API URL: ${apiUrl}`,
  });

  const hasToken = Boolean(
    process.env.FLUXER_TOKEN && process.env.FLUXER_TOKEN.trim().length >= 16,
  );
  checks.push({
    id: 'token_present',
    ok: hasToken,
    detail: hasToken ? 'FLUXER_TOKEN is set' : 'FLUXER_TOKEN is not set (or too short)',
  });

  if (options.online) {
    const rest = new FluxerRestClient({
      apiUrl,
      ...(process.env.FLUXER_TOKEN ? { token: process.env.FLUXER_TOKEN } : {}),
      ...(process.env.FLUXER_CA_CERT_PATH ? { caCertPath: process.env.FLUXER_CA_CERT_PATH } : {}),
    });

    try {
      const discovery = await rest.discoverInstance(true);
      checks.push({
        id: 'fluxer_discovery',
        ok: true,
        detail: `Discovered Fluxer instance (api_code_version=${String(discovery.api_code_version ?? 1)}, self_hosted=${String(discovery.features?.self_hosted ?? false)})`,
      });
    } catch (err) {
      checks.push({
        id: 'fluxer_discovery',
        ok: false,
        detail: `Failed to fetch /.well-known/fluxer: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    if (hasToken) {
      try {
        const me = await verifyExpectedBotIdentity(rest, process.env.FLUXER_EXPECTED_BOT_ID);
        checks.push({
          id: 'bot_identity',
          ok: true,
          detail: `Authenticated as ${me.username} (${me.id})`,
        });
      } catch (err) {
        checks.push({
          id: 'bot_identity',
          ok: false,
          detail: `Authentication failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  const allOk = checks.every((c) => c.ok);
  if (!allOk) process.exitCode = 1;
  emit(
    { ok: allOk, checks },
    [
      `Fluxer MCP Doctor: ${allOk ? 'PASS' : 'ISSUES FOUND'}`,
      ...checks.map((c) => `  [${c.ok ? 'OK' : 'FAIL'}] ${c.id}: ${c.detail}`),
    ],
    options.json === true,
  );
}

export async function smokeAction(options: {
  profile?: string;
  guildId?: string;
  json?: boolean;
}): Promise<void> {
  if (options.profile) activateProfile(options.profile);
  const config = loadConfig();
  const logger = createLogger({ LOG_LEVEL: 'error' });
  const rest = FluxerRestClient.fromConfig(config, logger);

  const me = await verifyExpectedBotIdentity(rest, config.FLUXER_EXPECTED_BOT_ID);
  const guilds = await rest.get<Array<{ id: string; name: string }>>(
    FluxerRoutes.currentUserGuilds(),
  );
  const targetGuildId = options.guildId ?? config.FLUXER_DEFAULT_GUILD_ID ?? guilds[0]?.id;
  let channelCount: number | null = null;
  if (targetGuildId) {
    const channels = await rest.get<unknown[]>(FluxerRoutes.guildChannels(targetGuildId));
    channelCount = channels.length;
  }

  emit(
    {
      ok: true,
      mode: 'read_only',
      api_url: config.FLUXER_API_URL,
      bot: { id: me.id, username: me.username },
      guilds_visible: guilds.length,
      inspected_guild_id: targetGuildId ?? null,
      channel_count: channelCount,
    },
    [
      `Fluxer MCP Smoke Check: PASS`,
      `  Instance: ${config.FLUXER_API_URL}`,
      `  Bot: ${me.username} (${me.id})`,
      `  Visible guilds: ${guilds.length}`,
      ...(targetGuildId ? [`  Guild ${targetGuildId}: ${channelCount ?? 0} channel(s)`] : []),
    ],
    options.json === true,
  );
}

export function initAction(options: {
  client?: string;
  profile?: string;
  apiUrl?: string;
  allowedGuilds?: string;
  categories?: string;
  toolSurface?: string;
  writeMode?: string;
  gateway?: boolean;
  output?: string;
  json?: boolean;
}): void {
  const clientId = (options.client ?? 'generic') as SupportedClient;
  if (!SUPPORTED_CLIENTS.includes(clientId)) {
    throw new Error(`Unsupported client "${clientId}". Supported: ${SUPPORTED_CLIENTS.join(', ')}`);
  }
  const snippet = generateClientSnippet({
    client: clientId,
    ...(options.profile ? { profile: options.profile } : {}),
    ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
    ...(options.allowedGuilds ? { allowedGuilds: options.allowedGuilds } : {}),
    ...(options.categories ? { categories: options.categories } : {}),
    ...(options.toolSurface === 'full' || options.toolSurface === 'progressive'
      ? { toolSurface: options.toolSurface }
      : {}),
    ...(options.writeMode === 'allow' || options.writeMode === 'preview'
      ? { writeMode: options.writeMode }
      : {}),
    ...(options.gateway ? { gateway: true } : {}),
  });

  if (options.output) {
    writeFileSync(options.output, `${snippet.content}\n`, 'utf8');
  }

  emit(
    snippet as unknown as Record<string, unknown>,
    [
      `# Fluxer MCP config for ${snippet.client} (${snippet.configPathHint})`,
      '',
      snippet.content,
      '',
      ...snippet.notes.map((n) => `Note: ${n}`),
    ],
    options.json === true,
  );
}

export function setupAction(options: {
  profile: string;
  client?: string;
  apiUrl?: string;
  caCertPath?: string;
  allowedGuilds?: string;
  defaultGuildId?: string;
  expectedBotId?: string;
  categories?: string;
  toolSurface?: string;
  writeMode?: string;
  gateway?: boolean;
  json?: boolean;
}): void {
  const now = new Date().toISOString();
  const allowed = options.allowedGuilds
    ? options.allowedGuilds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const cats = options.categories
    ? options.categories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const profilePath = saveProfile({
    name: options.profile,
    ...(options.apiUrl ? { api_url: options.apiUrl } : {}),
    ...(options.caCertPath ? { ca_cert_path: options.caCertPath } : {}),
    ...(options.expectedBotId ? { expected_bot_id: options.expectedBotId } : {}),
    ...(options.defaultGuildId ? { default_guild_id: options.defaultGuildId } : {}),
    ...(allowed?.length ? { allowed_guilds: allowed } : {}),
    ...(cats?.length ? { categories: cats } : {}),
    tool_surface: options.toolSurface === 'full' ? 'full' : 'progressive',
    write_mode: options.writeMode === 'allow' ? 'allow' : 'preview',
    dry_run: true,
    ...(options.gateway ? { gateway: true } : {}),
    created_at: now,
    updated_at: now,
  });

  const clientId = (options.client ?? 'generic') as SupportedClient;
  const snippet = generateClientSnippet({
    client: SUPPORTED_CLIENTS.includes(clientId) ? clientId : 'generic',
    profile: options.profile,
    ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
    ...(options.gateway ? { gateway: true } : {}),
  });

  emit(
    { ok: true, profile: options.profile, profile_path: profilePath, snippet },
    [
      `Saved non-secret Fluxer MCP profile "${options.profile}" to ${profilePath}`,
      `Safety defaults: MCP_WRITE_MODE=${options.writeMode === 'allow' ? 'allow' : 'preview'}, MCP_DRY_RUN=true`,
      '',
      `# Client snippet (${snippet.client} -> ${snippet.configPathHint})`,
      snippet.content,
    ],
    options.json === true,
  );
}

export function profileListAction(options: { json?: boolean }): void {
  const profiles = listProfiles();
  emit(
    { count: profiles.length, profiles },
    profiles.length === 0
      ? ['No Fluxer MCP profiles configured. Create one with `fluxer-mcp setup --profile mybot`.']
      : profiles.map((p) => `- ${p.name} (${p.api_url ?? FLUXER_DEFAULT_API_URL})`),
    options.json === true,
  );
}

export function profileShowAction(name: string, options: { json?: boolean }): void {
  const profile = loadProfile(name);
  emit(
    profile as unknown as Record<string, unknown>,
    [JSON.stringify(profile, null, 2)],
    options.json === true,
  );
}

export function profileRemoveAction(name: string, options: { json?: boolean }): void {
  const removed = removeProfile(name);
  if (!removed) process.exitCode = 1;
  emit(
    { removed, name },
    [removed ? `Removed profile "${name}".` : `Profile "${name}" not found.`],
    options.json === true,
  );
}
