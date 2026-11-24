import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const ProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'Profile name may contain letters, digits, ., _, -'),
  api_url: z.string().url().optional(),
  api_version: z.string().regex(/^\d+$/).optional(),
  webapp_url: z.string().url().optional(),
  ca_cert_path: z.string().min(1).optional(),
  expected_bot_id: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
  default_guild_id: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
  allowed_guilds: z.array(z.string().regex(/^\d{17,20}$/)).optional(),
  categories: z.array(z.string().min(1)).optional(),
  tool_surface: z.enum(['full', 'progressive']).optional(),
  write_mode: z.enum(['allow', 'preview']).optional(),
  dry_run: z.boolean().optional(),
  gateway: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type FluxerProfile = z.infer<typeof ProfileSchema>;

export function resolveProfilesDirectory(override?: string): string {
  if (override) return override;
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, 'fluxer-mcp', 'profiles');
  return join(homedir(), '.fluxer-mcp', 'profiles');
}

export function saveProfile(profile: FluxerProfile, directory?: string): string {
  const validated = ProfileSchema.parse(profile);
  const dir = resolveProfilesDirectory(directory);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filePath = join(dir, `${validated.name}.json`);
  writeFileSync(filePath, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return filePath;
}

export function loadProfile(name: string, directory?: string): FluxerProfile {
  const safeName = name.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(safeName)) {
    throw new Error(`Invalid profile name: "${name}"`);
  }
  const filePath = join(resolveProfilesDirectory(directory), `${safeName}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Profile "${safeName}" was not found.`);
  }
  return ProfileSchema.parse(JSON.parse(readFileSync(filePath, 'utf8')));
}

export function listProfiles(directory?: string): FluxerProfile[] {
  const dir = resolveProfilesDirectory(directory);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ProfileSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
}

export function removeProfile(name: string, directory?: string): boolean {
  const safeName = name.trim();
  const filePath = join(resolveProfilesDirectory(directory), `${safeName}.json`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

/**
 * Apply non-secret profile values into process.env without overwriting
 * explicitly set environment variables.
 */
export function activateProfile(
  name: string,
  opts: { directory?: string; env?: NodeJS.ProcessEnv } = {},
): FluxerProfile {
  const profile = loadProfile(name, opts.directory);
  const env = opts.env ?? process.env;
  const setIfUnset = (key: string, val: string | undefined) => {
    if (val !== undefined && env[key] === undefined) env[key] = val;
  };
  setIfUnset('FLUXER_API_URL', profile.api_url);
  setIfUnset('FLUXER_API_VERSION', profile.api_version);
  setIfUnset('FLUXER_WEBAPP_URL', profile.webapp_url);
  setIfUnset('FLUXER_CA_CERT_PATH', profile.ca_cert_path);
  setIfUnset('FLUXER_EXPECTED_BOT_ID', profile.expected_bot_id);
  setIfUnset('FLUXER_DEFAULT_GUILD_ID', profile.default_guild_id);
  if (profile.allowed_guilds?.length) {
    setIfUnset('ALLOWED_GUILDS', profile.allowed_guilds.join(','));
  }
  if (profile.categories?.length) {
    setIfUnset('MCP_CATEGORIES', profile.categories.join(','));
  }
  setIfUnset('MCP_TOOL_SURFACE', profile.tool_surface);
  setIfUnset('MCP_WRITE_MODE', profile.write_mode);
  if (profile.dry_run !== undefined) {
    setIfUnset('MCP_DRY_RUN', String(profile.dry_run));
  }
  if (profile.gateway) {
    setIfUnset('GATEWAY', '1');
  }
  return profile;
}
