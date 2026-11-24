import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  buildServer,
  createAuditSink,
  createLogger,
  FluxerRestClient,
  loadConfig,
  verifyExpectedBotIdentity,
} from '@fluxer-mcp/core';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;

class BodyTooLargeError extends Error {}

export interface StartHttpOptions {
  readonly host?: string;
  readonly port?: number;
  readonly registerSignalHandlers?: boolean;
}

export function hasValidBearerToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  if (!authorization) return false;
  const idx = authorization.indexOf(' ');
  if (idx < 1 || authorization.slice(0, idx).toLowerCase() !== 'bearer') return false;
  const supplied = authorization.slice(idx + 1).trim();
  if (!supplied) return false;
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expectedToken, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBoundedBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer | undefined> {
  const method = req.method?.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;
  const declared = req.headers['content-length'];
  if (typeof declared === 'string' && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new BodyTooLargeError();
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.byteLength;
    if (total > maxBytes) throw new BodyTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks, total);
}

function replayRequest(req: IncomingMessage, body: Buffer): IncomingMessage {
  const stream = Readable.from(body.byteLength === 0 ? [] : [body]);
  return Object.assign(stream, {
    method: req.method,
    url: req.url,
    headers: req.headers,
  }) as IncomingMessage;
}

export async function startHttp(options: StartHttpOptions = {}): Promise<Server> {
  const config = loadConfig();
  const accessToken = config.FLUXER_MCP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('FLUXER_MCP_ACCESS_TOKEN (>=32 chars) is required for HTTP transport.');
  }
  const logger = createLogger(config);
  const auditSink = createAuditSink(config);
  const rest = FluxerRestClient.fromConfig(config, logger);

  if (config.FLUXER_EXPECTED_BOT_ID !== undefined) {
    await verifyExpectedBotIdentity(rest, config.FLUXER_EXPECTED_BOT_ID);
  }

  const reportError = (error: Error) => {
    logger.error({ err: error }, 'Fluxer MCP HTTP error');
  };

  const mcpHandler = createMcpHandler(
    async () => buildServer({ rest, config, logger, transport: 'http', auditSink }).server,
    { legacy: 'stateless', onerror: reportError },
  );
  const handleNodeMcp = toNodeHandler(mcpHandler, { onerror: reportError });

  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  const validateHost = isLoopback ? localhostHostValidation() : undefined;
  const validateOrigin = isLoopback ? localhostOriginValidation() : undefined;
  let inFlight = 0;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : undefined;
    if (pathname !== '/mcp' && pathname !== '/healthz') {
      res.writeHead(404).end();
      return;
    }

    if (!hasValidBearerToken(req.headers.authorization, accessToken)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
      return;
    }

    if (validateHost && !validateHost(req, res)) return;
    if (validateOrigin && !validateOrigin(req, res)) return;

    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'fluxer-mcp',
          api_url: config.FLUXER_API_URL,
        }),
      );
      return;
    }

    if (inFlight >= config.MCP_HTTP_MAX_IN_FLIGHT) {
      res.writeHead(503, { 'Retry-After': '1', Connection: 'close' }).end();
      return;
    }

    inFlight += 1;
    try {
      let body: Buffer | undefined;
      try {
        body = await readBoundedBody(req, config.MCP_HTTP_MAX_BODY_BYTES);
      } catch (err) {
        if (err instanceof BodyTooLargeError) {
          res.writeHead(413, { Connection: 'close' }).end();
        } else {
          res.destroy(err instanceof Error ? err : undefined);
        }
        return;
      }

      await handleNodeMcp(
        body === undefined ? (req as never) : (replayRequest(req, body) as never),
        res,
      );
    } finally {
      inFlight -= 1;
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  logger.info({ host, port, apiUrl: config.FLUXER_API_URL }, 'fluxer-mcp ready (http)');

  if (options.registerSignalHandlers !== false) {
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down fluxer-mcp (http)');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mcpHandler.close().catch(() => {});
      await auditSink.shutdown?.();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  }

  return server;
}
