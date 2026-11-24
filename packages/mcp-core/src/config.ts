import { z } from 'zod';
import {
  FLUXER_DEFAULT_API_URL,
  FLUXER_DEFAULT_API_VERSION,
  FLUXER_DEFAULT_WEBAPP_URL,
} from './fluxer/constants.js';

const boolish = (def = false) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return def;
      const lower = v.trim().toLowerCase();
      return lower === '1' || lower === 'true' || lower === 'yes';
    })
    .default(def);

const defaultOnBool = () =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return true;
      const lower = v.trim().toLowerCase();
      return lower !== '0' && lower !== 'false' && lower !== 'no';
    })
    .default(true);

const HttpUrlSchema = z
  .string()
  .trim()
  .url('must be a valid http(s) URL')
  .refine((u) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must use https:// or http:// protocol')
  .transform((u) => u.replace(/\/+$/, ''));

const SnowflakeEnvSchema = z
  .string()
  .trim()
  .regex(/^\d{17,20}$/, 'must be a 17-20 digit Fluxer snowflake');

export const ConfigSchema = z.object({
  // --- Fluxer Authentication & Instance (Cloud + Self-Hosted) ---
  FLUXER_TOKEN: z
    .string()
    .trim()
    .min(16, 'FLUXER_TOKEN appears too short to be a valid Fluxer bot token'),
  FLUXER_API_URL: HttpUrlSchema.default(FLUXER_DEFAULT_API_URL),
  FLUXER_API_VERSION: z
    .string()
    .trim()
    .regex(/^\d+$/, 'FLUXER_API_VERSION must be a numeric version (e.g. "1")')
    .default(FLUXER_DEFAULT_API_VERSION),
  FLUXER_WEBAPP_URL: HttpUrlSchema.optional(),
  FLUXER_AUTH_PREFIX: z.enum(['Bot', 'Bearer']).default('Bot'),
  /** Optional PEM CA certificate file for self-hosted Fluxer instances with private CAs. TLS verification is NEVER disabled. */
  FLUXER_CA_CERT_PATH: z.string().trim().min(1).optional(),

  // --- Identity & Scope Boundaries ---
  FLUXER_EXPECTED_BOT_ID: SnowflakeEnvSchema.optional(),
  FLUXER_DEFAULT_GUILD_ID: SnowflakeEnvSchema.optional(),
  ALLOWED_GUILDS: z
    .string()
    .trim()
    .regex(
      /^\d{17,20}(?:\s*,\s*\d{17,20})*$/,
      'ALLOWED_GUILDS must be a comma-separated list of 17-20 digit Fluxer snowflakes',
    )
    .optional(),

  // --- Remote Streamable HTTP Transport ---
  FLUXER_MCP_ACCESS_TOKEN: z
    .string()
    .min(32, 'FLUXER_MCP_ACCESS_TOKEN must be at least 32 characters')
    .optional(),
  MCP_HTTP_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(64 * 1024 * 1024)
    .default(4 * 1024 * 1024),
  MCP_HTTP_MAX_IN_FLIGHT: z.coerce.number().int().min(1).max(1024).default(16),

  // --- Runtime & Surface ---
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  GATEWAY: boolish(false),
  MCP_CATEGORIES: z.string().optional(),
  MCP_TOOL_SURFACE: z.enum(['full', 'progressive']).default('full'),

  // --- Safety Controls ---
  MCP_WRITE_MODE: z.enum(['allow', 'preview']).default('allow'),
  MCP_DRY_RUN: defaultOnBool(),
  MCP_ACCESS_MODE: z.enum(['advisory', 'warn', 'enforce']).default('advisory'),
  MCP_DM_CONSENT_MODE: z.enum(['advisory', 'require']).default('advisory'),
  MCP_ALLOW_USER_SCOPED: boolish(false),

  // --- Local Durable State (Blueprints, Backups, Change Plans, Workflows) ---
  MCP_STATE_DIR: z.string().trim().min(1).optional(),
  MCP_PLAN_SIGNING_SECRET: z.string().min(32).optional(),

  // --- Resilience ---
  MCP_RETRY_ENABLED: defaultOnBool(),
  MCP_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  MCP_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(50).max(5000).default(200),
  MCP_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(500).max(60000).default(10000),
  MCP_TIMEOUT_DEFAULT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  MCP_CIRCUIT_ENABLED: defaultOnBool(),
  MCP_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(3).max(100).default(10),
  MCP_CIRCUIT_HALF_OPEN_AFTER_MS: z.coerce.number().int().min(5000).max(600000).default(60000),
  MCP_BULKHEAD_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),

  // --- Audit Logging ---
  MCP_AUDIT_ENABLED: defaultOnBool(),
  MCP_AUDIT_SINK: z.enum(['stderr', 'file', 'none']).default('stderr'),
  MCP_AUDIT_FILE: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function stripAuthPrefix(token: string): string {
  const trimmed = token.trim();
  if (trimmed.startsWith('Bot ')) return trimmed.slice(4).trim();
  if (trimmed.startsWith('Bearer ')) return trimmed.slice(7).trim();
  return trimmed;
}

export function parseGuildAllowlist(allowedGuilds?: string): ReadonlySet<string> | null {
  if (!allowedGuilds?.trim()) return null;
  const ids = allowedGuilds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

export function parseCategoryAllowlist(categories?: string): ReadonlySet<string> | null {
  if (!categories?.trim()) return null;
  const names = categories
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}

export function resolveWebappUrl(config: Pick<Config, 'FLUXER_WEBAPP_URL'>): string {
  return config.FLUXER_WEBAPP_URL ?? FLUXER_DEFAULT_WEBAPP_URL;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid Fluxer MCP configuration:\n${issues}`);
  }

  const data = parsed.data;
  const allowlist = parseGuildAllowlist(data.ALLOWED_GUILDS);
  if (
    allowlist !== null &&
    data.FLUXER_DEFAULT_GUILD_ID !== undefined &&
    !allowlist.has(data.FLUXER_DEFAULT_GUILD_ID)
  ) {
    throw new Error(
      'Invalid Fluxer MCP configuration:\n  - FLUXER_DEFAULT_GUILD_ID: must be included in ALLOWED_GUILDS',
    );
  }

  if (data.MCP_ALLOW_USER_SCOPED && data.FLUXER_EXPECTED_BOT_ID === undefined) {
    throw new Error(
      'Invalid Fluxer MCP configuration:\n  - MCP_ALLOW_USER_SCOPED: requires FLUXER_EXPECTED_BOT_ID',
    );
  }

  return data;
}
