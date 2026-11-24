import {
  buildCatalogServer,
  buildServer,
  createAuditSink,
  createFluxerGatewayClient,
  createLogger,
  FluxerRestClient,
  type GatewayClient,
  loadConfig,
  stripAuthPrefix,
  verifyExpectedBotIdentity,
} from '@fluxer-mcp/core';
import type { Transport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

export async function startStdio(
  opts: { transport?: Transport; registerSignalHandlers?: boolean } = {},
): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const auditSink = createAuditSink(config);
  const rest = FluxerRestClient.fromConfig(config, logger);

  if (config.FLUXER_EXPECTED_BOT_ID !== undefined) {
    await verifyExpectedBotIdentity(rest, config.FLUXER_EXPECTED_BOT_ID);
  }

  // Best-effort discovery warm-up so jump URLs & self-hosted endpoints are ready
  await rest.discoverInstance().catch((err) => {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      'Instance discovery warmup skipped',
    );
  });

  const built = buildServer({ rest, config, logger, transport: 'stdio', auditSink });

  let gateway: GatewayClient | null = null;
  if (config.GATEWAY) {
    gateway = createFluxerGatewayClient({
      rest,
      token: stripAuthPrefix(config.FLUXER_TOKEN),
      logger,
      apiVersion: config.FLUXER_API_VERSION,
    });
  }

  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'Shutting down fluxer-mcp (stdio)');
    await Promise.allSettled([gateway?.stop(), built.server.close(), auditSink.shutdown?.()]);
    if (opts.transport === undefined && opts.registerSignalHandlers !== false) {
      process.exit(0);
    }
  };

  if (opts.transport !== undefined) {
    await built.server.connect(opts.transport);
  } else {
    if (opts.registerSignalHandlers !== false) {
      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));
    }
    serveStdio(
      async () => buildServer({ rest, config, logger, transport: 'stdio', auditSink }).server,
      {
        legacy: 'serve',
        onerror: (error) => logger.error({ err: error }, 'Fluxer MCP stdio transport error'),
      },
    );
  }

  if (gateway !== null) {
    try {
      await gateway.start();
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Fluxer Gateway failed to start; continuing in REST-only mode',
      );
    }
  }

  logger.info(
    {
      tools: built.registeredTools.length,
      apiUrl: config.FLUXER_API_URL,
      gateway: gateway?.connected ?? false,
    },
    'fluxer-mcp ready (stdio)',
  );
}

export async function startCatalogStdio(opts: { transport?: Transport } = {}): Promise<void> {
  const built = buildCatalogServer();
  if (opts.transport !== undefined) {
    await built.server.connect(opts.transport);
    return;
  }
  serveStdio(async () => buildCatalogServer().server, { legacy: 'serve' });
}
