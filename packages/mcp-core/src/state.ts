import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Config } from './config.js';
import { stripAuthPrefix } from './config.js';

export function resolveStateDirectory(config: Pick<Config, 'MCP_STATE_DIR'>): string {
  if (config.MCP_STATE_DIR) return config.MCP_STATE_DIR;
  const xdg = process.env.XDG_STATE_HOME;
  if (xdg) return join(xdg, 'fluxer-mcp');
  return join(homedir(), '.fluxer-mcp', 'state');
}

export function deriveSigningSecret(
  config: Pick<Config, 'MCP_PLAN_SIGNING_SECRET' | 'FLUXER_TOKEN'>,
): string {
  if (config.MCP_PLAN_SIGNING_SECRET) return config.MCP_PLAN_SIGNING_SECRET;
  // Derive a deterministic, process-consistent HMAC key from the token without exposing the token
  return createHash('sha256')
    .update(`fluxer-mcp:plan-signing:v1:${stripAuthPrefix(config.FLUXER_TOKEN)}`)
    .digest('hex');
}

export function sha256Digest(value: unknown): string {
  const canonical = JSON.stringify(canonicalize(value));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = canonicalize(v);
  }
  return out;
}

export interface SignedRecord<T> {
  readonly id: string;
  readonly created_at: string;
  readonly digest: string;
  readonly signature: string;
  readonly payload: T;
}

function signDigest(digest: string, secret: string): string {
  return createHmac('sha256', secret).update(digest).digest('hex');
}

export function saveSignedState<T>(opts: {
  readonly stateDir: string;
  readonly namespace: 'blueprints' | 'changes' | 'backups' | 'raid-shield' | 'workflows';
  readonly id: string;
  readonly payload: T;
  readonly secret: string;
}): SignedRecord<T> {
  const safeId = opts.id.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dir = join(opts.stateDir, opts.namespace);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const digest = sha256Digest(opts.payload);
  const signature = signDigest(digest, opts.secret);
  const record: SignedRecord<T> = {
    id: safeId,
    created_at: new Date().toISOString(),
    digest,
    signature,
    payload: opts.payload,
  };
  const filePath = join(dir, `${safeId}.json`);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmpPath, filePath);
  return record;
}

export function loadSignedState<T>(opts: {
  readonly stateDir: string;
  readonly namespace: 'blueprints' | 'changes' | 'backups' | 'raid-shield' | 'workflows';
  readonly id: string;
  readonly secret: string;
}): SignedRecord<T> | null {
  const safeId = opts.id.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = join(opts.stateDir, opts.namespace, `${safeId}.json`);
  if (!existsSync(filePath)) return null;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as SignedRecord<T>;
  const expectedDigest = sha256Digest(raw.payload);
  if (raw.digest !== expectedDigest) {
    throw new Error(`State record ${safeId} failed integrity digest verification.`);
  }
  const expectedSig = signDigest(expectedDigest, opts.secret);
  const a = Buffer.from(raw.signature, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error(`State record ${safeId} failed HMAC signature verification.`);
  }
  return raw;
}

export function listSignedStateIds(
  stateDir: string,
  namespace: 'blueprints' | 'changes' | 'backups' | 'raid-shield' | 'workflows',
): string[] {
  const dir = join(stateDir, namespace);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}
