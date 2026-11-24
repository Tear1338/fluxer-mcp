import pino, { type Logger } from 'pino';
import type { Config } from './config.js';

export const REDACT_PATHS = [
  'token',
  'authorization',
  'Authorization',
  'FLUXER_TOKEN',
  'FLUXER_MCP_ACCESS_TOKEN',
  'MCP_PLAN_SIGNING_SECRET',
  'password',
  'secret',
  'webhook_token',
  '*.token',
  '*.authorization',
  '*.password',
  '*.secret',
  '*.webhook_token',
  'headers.authorization',
  'headers.Authorization',
];

/**
 * Create a structured Pino logger targeting stderr (file descriptor 2).
 * stdout is strictly reserved for JSON-RPC frames over stdio transport.
 */
export function createLogger(config: Pick<Config, 'LOG_LEVEL'>): Logger {
  return pino(
    {
      name: 'fluxer-mcp',
      level: config.LOG_LEVEL,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
    },
    pino.destination(2),
  );
}
