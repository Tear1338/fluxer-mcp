import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config } from './config.js';

export const DEFAULT_AUDIT_FILE = './fluxer-mcp-audit.jsonl';

const SENSITIVE_KEY_RE =
  /(token|secret|password|authorization|cookie|api[_-]?key|bearer|credential|mfa_code|email_code)/i;

export interface AuditEvent {
  readonly timestamp: string;
  readonly tool: string;
  readonly category: string;
  readonly guild_id?: string;
  readonly channel_id?: string;
  readonly outcome: 'success' | 'error' | 'blocked' | 'preview';
  readonly duration_ms: number;
  readonly error_code?: string;
  readonly args: Record<string, unknown>;
}

export interface AuditSink {
  emit(event: AuditEvent): void;
  shutdown?(): Promise<void>;
}

export function redactRoute(route: string): string {
  return route
    .replace(/(\/webhooks\/\d{17,20}\/)[^/?#]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|key|secret)=)[^&]+/gi, '$1[REDACTED]');
}

export function redactArgs(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/') && value.length > 80) {
      return `${value.slice(0, 48)}...[REDACTED_BASE64:${value.length}B]`;
    }
    if (value.length > 512) return `${value.slice(0, 512)}…[+${value.length - 512} chars]`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactArgs(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactArgs(val, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export class NoopAuditSink implements AuditSink {
  emit(_event: AuditEvent): void {}
}

export class StderrAuditSink implements AuditSink {
  emit(event: AuditEvent): void {
    process.stderr.write(`${JSON.stringify({ audit: true, ...event })}\n`);
  }
}

export class FileAuditSink implements AuditSink {
  private readonly filePath: string;
  private ensuredDir = false;

  constructor(filePath: string = DEFAULT_AUDIT_FILE) {
    this.filePath = filePath;
  }

  emit(event: AuditEvent): void {
    if (!this.ensuredDir) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      this.ensuredDir = true;
    }
    appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

export function createAuditSink(
  config: Pick<Config, 'MCP_AUDIT_ENABLED' | 'MCP_AUDIT_SINK' | 'MCP_AUDIT_FILE'>,
): AuditSink {
  if (!config.MCP_AUDIT_ENABLED || config.MCP_AUDIT_SINK === 'none') {
    return new NoopAuditSink();
  }
  if (config.MCP_AUDIT_SINK === 'file') {
    return new FileAuditSink(config.MCP_AUDIT_FILE ?? DEFAULT_AUDIT_FILE);
  }
  return new StderrAuditSink();
}
