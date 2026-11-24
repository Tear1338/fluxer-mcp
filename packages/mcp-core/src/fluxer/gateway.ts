import type { Logger } from 'pino';
import {
  FLUXER_DEFAULT_API_VERSION,
  FluxerRoutes,
  GATEWAY_IDENTIFY_FLAGS,
  GATEWAY_OPCODES,
} from './constants.js';
import type { FluxerRestClient } from './rest.js';

export interface GatewayBotInfo {
  readonly url: string;
  readonly shards?: number;
  readonly session_start_limit?: {
    readonly total: number;
    readonly remaining: number;
    readonly reset_after: number;
    readonly max_concurrency: number;
  };
}

export interface GatewayEventPayload {
  readonly op: number;
  readonly t?: string | null;
  readonly s?: number | null;
  readonly d?: unknown;
}

export interface GatewayClientOptions {
  readonly rest: FluxerRestClient;
  readonly token: string;
  readonly logger: Logger;
  readonly onDispatch?: (eventName: string, data: unknown) => void;
  readonly apiVersion?: string;
}

export interface GatewayClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly connected: boolean;
  readonly sessionId: string | null;
}

/**
 * Native Fluxer WebSocket Gateway client.
 *
 * Key Fluxer difference vs Discord:
 * - Fluxer Gateway does NOT require Discord privileged intents.
 * - Uses `GET /gateway/bot` to discover the instance WebSocket endpoint
 *   (works on both Fluxer Cloud and self-hosted deployments).
 * - Sends `IDENTIFY` (Op 2) with `GatewayIdentifyFlags` and maintains
 *   heartbeat + automatic reconnect/resume.
 */
export function createFluxerGatewayClient(options: GatewayClientOptions): GatewayClient {
  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let sequence: number | null = null;
  let sessionId: string | null = null;
  let gatewayUrl: string | null = null;
  let isConnected = false;
  let stopping = false;

  const clearTimers = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const sendPayload = (payload: Record<string, unknown>) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const connect = async (): Promise<void> => {
    if (stopping) return;
    if (!gatewayUrl) {
      const info = await options.rest.get<GatewayBotInfo>(FluxerRoutes.gatewayBot());
      gatewayUrl = info.url;
    }
    const ver = options.apiVersion ?? FLUXER_DEFAULT_API_VERSION;
    const separator = gatewayUrl.includes('?') ? '&' : '?';
    const fullUrl = `${gatewayUrl}${separator}v=${ver}&encoding=json`;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(fullUrl);
      ws = socket;
      let settled = false;

      socket.addEventListener('open', () => {
        isConnected = true;
        options.logger.info('Fluxer Gateway WebSocket opened');
      });

      socket.addEventListener('message', (event) => {
        try {
          const text = typeof event.data === 'string' ? event.data : String(event.data);
          const payload = JSON.parse(text) as GatewayEventPayload;
          if (typeof payload.s === 'number') sequence = payload.s;

          if (payload.op === GATEWAY_OPCODES.HELLO) {
            const intervalMs =
              (payload.d as { heartbeat_interval?: number } | undefined)?.heartbeat_interval ??
              41_250;
            clearTimers();
            heartbeatTimer = setInterval(() => {
              sendPayload({ op: GATEWAY_OPCODES.HEARTBEAT, d: sequence });
            }, intervalMs);
            heartbeatTimer.unref?.();

            if (sessionId !== null && sequence !== null) {
              sendPayload({
                op: GATEWAY_OPCODES.RESUME,
                d: { token: options.token, session_id: sessionId, seq: sequence },
              });
            } else {
              sendPayload({
                op: GATEWAY_OPCODES.IDENTIFY,
                d: {
                  token: options.token,
                  properties: {
                    os: process.platform,
                    browser: 'fluxer-mcp',
                    device: 'fluxer-mcp',
                  },
                  flags:
                    GATEWAY_IDENTIFY_FLAGS.CHANNEL_THREADS |
                    GATEWAY_IDENTIFY_FLAGS.DEBOUNCE_MESSAGE_REACTIONS,
                },
              });
            }
            if (!settled) {
              settled = true;
              resolve();
            }
          } else if (payload.op === GATEWAY_OPCODES.HEARTBEAT) {
            sendPayload({ op: GATEWAY_OPCODES.HEARTBEAT, d: sequence });
          } else if (payload.op === GATEWAY_OPCODES.RECONNECT) {
            socket.close(4000, 'Reconnect requested');
          } else if (payload.op === GATEWAY_OPCODES.INVALID_SESSION) {
            if (payload.d === false) {
              sessionId = null;
              sequence = null;
            }
            socket.close(4000, 'Invalid session');
          } else if (payload.op === GATEWAY_OPCODES.DISPATCH && typeof payload.t === 'string') {
            if (payload.t === 'READY') {
              const sid = (payload.d as { session_id?: string } | undefined)?.session_id;
              if (typeof sid === 'string') sessionId = sid;
              options.logger.info({ sessionId }, 'Fluxer Gateway READY');
            }
            options.onDispatch?.(payload.t, payload.d);
          }
        } catch (err) {
          options.logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'Failed to process Fluxer Gateway frame',
          );
        }
      });

      socket.addEventListener('error', (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Fluxer Gateway connection error: ${String(err)}`));
        }
      });

      socket.addEventListener('close', (ev) => {
        isConnected = false;
        clearTimers();
        if (!settled) {
          settled = true;
          reject(new Error(`Fluxer Gateway closed before HELLO (code ${ev.code})`));
          return;
        }
        if (!stopping && ev.code !== 4004 && ev.code !== 4010 && ev.code !== 4012) {
          options.logger.warn({ code: ev.code }, 'Fluxer Gateway disconnected; scheduling reconnect');
          reconnectTimer = setTimeout(() => {
            void connect().catch((e) =>
              options.logger.warn(
                { err: e instanceof Error ? e.message : String(e) },
                'Fluxer Gateway reconnect failed',
              ),
            );
          }, 3_000);
          reconnectTimer.unref?.();
        }
      });
    });
  };

  return {
    async start() {
      stopping = false;
      await connect();
    },
    async stop() {
      stopping = true;
      clearTimers();
      isConnected = false;
      if (ws) {
        try {
          ws.close(1000, 'Client shutdown');
        } catch {
          // ignore close errors during shutdown
        }
        ws = null;
      }
    },
    get connected() {
      return isConnected;
    },
    get sessionId() {
      return sessionId;
    },
  };
}
