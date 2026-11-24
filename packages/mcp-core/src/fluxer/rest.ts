import { readFileSync } from 'node:fs';
import { FluxerAPIError, HTTPError, REST, RateLimitError, type RequestOptions } from '@fluxerjs/rest';
import {
  BrokenCircuitError,
  BulkheadRejectedError,
  ConsecutiveBreaker,
  ExponentialBackoff,
  type IPolicy,
  TimeoutStrategy,
  bulkhead,
  circuitBreaker,
  handleType,
  noop,
  retry,
  timeout,
  wrap,
} from 'cockatiel';
import type { Logger } from 'pino';
import { Agent, setGlobalDispatcher } from 'undici';
import type { Config } from '../config.js';
import { stripAuthPrefix } from '../config.js';
import { BulkheadFullError, CircuitOpenError } from '../errors.js';
import {
  FLUXER_DEFAULT_API_URL,
  FLUXER_DEFAULT_API_VERSION,
  FLUXER_DEFAULT_WEBAPP_URL,
  FluxerRoutes,
} from './constants.js';

export interface FluxerRequestOptions {
  body?: unknown;
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  reason?: string;
  auth?: boolean;
  unversioned?: boolean;
  signal?: AbortSignal;
}

export interface FluxerInstanceDiscovery {
  readonly api_code_version?: number;
  readonly endpoints?: {
    readonly api?: string;
    readonly api_client?: string;
    readonly api_public?: string;
    readonly gateway?: string;
    readonly media?: string;
    readonly upload_relay?: string;
    readonly static_cdn?: string;
    readonly invite?: string;
    readonly webapp?: string;
  };
  readonly features?: Record<string, unknown>;
  readonly community?: Record<string, unknown>;
  readonly services?: Record<string, unknown>;
  readonly limits?: {
    readonly version?: number;
    readonly rules?: Array<{
      readonly id: string;
      readonly overrides?: Record<string, number>;
    }>;
  };
  readonly registration?: Record<string, unknown>;
  readonly sso?: Record<string, unknown>;
  readonly app_public?: Record<string, unknown>;
  readonly voice_origins?: readonly string[];
  readonly [key: string]: unknown;
}

export class FluxerRetryableError extends Error {
  override readonly cause: unknown;
  readonly retryAfterMs: number | null;
  readonly replaySafe: boolean;

  constructor(cause: unknown, retryAfterMs: number | null, replaySafe = true) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'FluxerRetryableError';
    this.cause = cause;
    this.retryAfterMs = retryAfterMs;
    this.replaySafe = replaySafe;
  }
}

const RETRYABLE_NET_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EPIPE',
]);

const AMBIGUOUS_NET_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH']);

export function classifyFluxerError(
  err: unknown,
  opts?: { method?: string },
): FluxerRetryableError | null {
  const isPost = opts?.method?.toLowerCase() === 'post';

  if (err instanceof RateLimitError) {
    return new FluxerRetryableError(err, Math.max(0, Math.round(err.retryAfter * 1000)), true);
  }
  if (err instanceof FluxerAPIError) {
    if (err.statusCode === 429) {
      const raw = (err.rawBody as { retry_after?: number } | undefined)?.retry_after;
      return new FluxerRetryableError(
        err,
        typeof raw === 'number' ? Math.max(0, Math.round(raw * 1000)) : null,
        true,
      );
    }
    if (err.statusCode >= 500 && err.statusCode < 600) {
      return new FluxerRetryableError(err, null, !isPost);
    }
    return null;
  }
  if (err instanceof HTTPError) {
    if (err.statusCode >= 500 && err.statusCode < 600) {
      return new FluxerRetryableError(err, null, !isPost);
    }
    return null;
  }
  if (err instanceof Error) {
    const code = (err as Error & { code?: unknown }).code;
    if (typeof code === 'string' && RETRYABLE_NET_CODES.has(code)) {
      return new FluxerRetryableError(err, null, !(isPost && AMBIGUOUS_NET_CODES.has(code)));
    }
    const inner = (err as Error & { cause?: unknown }).cause;
    if (inner instanceof Error) {
      const innerCode = (inner as Error & { code?: unknown }).code;
      if (typeof innerCode === 'string' && RETRYABLE_NET_CODES.has(innerCode)) {
        return new FluxerRetryableError(
          err,
          null,
          !(isPost && AMBIGUOUS_NET_CODES.has(innerCode)),
        );
      }
    }
  }
  return null;
}

export function buildResiliencePolicy(config: Config, logger?: Logger): IPolicy {
  const retryable = handleType(FluxerRetryableError, (err) => err.replaySafe);
  const allUpstream = handleType(FluxerRetryableError);

  const retryPolicy = config.MCP_RETRY_ENABLED
    ? retry(retryable, {
        maxAttempts: Math.max(0, config.MCP_RETRY_MAX_ATTEMPTS - 1),
        backoff: new ExponentialBackoff({
          initialDelay: config.MCP_RETRY_BASE_DELAY_MS,
          maxDelay: config.MCP_RETRY_MAX_DELAY_MS,
        }),
      })
    : noop;

  const breakerPolicy = config.MCP_CIRCUIT_ENABLED
    ? circuitBreaker(allUpstream, {
        halfOpenAfter: config.MCP_CIRCUIT_HALF_OPEN_AFTER_MS,
        breaker: new ConsecutiveBreaker(config.MCP_CIRCUIT_FAILURE_THRESHOLD),
      })
    : noop;

  if (config.MCP_CIRCUIT_ENABLED && 'onBreak' in breakerPolicy && logger) {
    breakerPolicy.onBreak(() => logger.warn('Fluxer REST circuit breaker opened'));
    breakerPolicy.onReset(() => logger.info('Fluxer REST circuit breaker closed'));
  }

  const bulkheadPolicy = bulkhead(config.MCP_BULKHEAD_LIMIT, 0);
  const timeoutPolicy = timeout(config.MCP_TIMEOUT_DEFAULT_MS, TimeoutStrategy.Cooperative);

  return wrap(retryPolicy, breakerPolicy, bulkheadPolicy, timeoutPolicy);
}

let customCaInstalled: string | undefined;

/**
 * Configure a custom PEM CA bundle for self-hosted Fluxer instances.
 * TLS certificate verification (`rejectUnauthorized: true`) is NEVER disabled.
 */
export function configureCustomCaIfNeeded(caCertPath?: string, logger?: Logger): void {
  if (!caCertPath || customCaInstalled === caCertPath) return;
  const ca = readFileSync(caCertPath, 'utf8');
  const dispatcher = new Agent({
    connect: {
      ca,
      rejectUnauthorized: true,
    },
  });
  setGlobalDispatcher(dispatcher);
  customCaInstalled = caCertPath;
  logger?.info({ caCertPath }, 'Configured custom CA certificate for Fluxer TLS connections');
}

function appendQuery(
  route: string,
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>,
): string {
  if (!query) return route;
  const params =
    query instanceof URLSearchParams
      ? query
      : (() => {
          const sp = new URLSearchParams();
          for (const [key, val] of Object.entries(query)) {
            if (val !== undefined) sp.set(key, String(val));
          }
          return sp;
        })();
  const qs = params.toString();
  if (!qs) return route;
  return route.includes('?') ? `${route}&${qs}` : `${route}?${qs}`;
}

function buildRestOptions(
  opts?: FluxerRequestOptions,
  policySignal?: AbortSignal,
): RequestOptions {
  const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
  if (opts?.reason !== undefined && opts.reason.trim().length > 0) {
    headers['X-Audit-Log-Reason'] = encodeURIComponent(opts.reason.trim());
  }
  const callerSignal = opts?.signal;
  const signal =
    policySignal === undefined
      ? callerSignal
      : callerSignal === undefined
        ? policySignal
        : AbortSignal.any([policySignal, callerSignal]);

  const out: RequestOptions = {};
  if (opts?.body !== undefined) out.body = opts.body;
  if (Object.keys(headers).length > 0) out.headers = headers;
  if (opts?.auth !== undefined) out.auth = opts.auth;
  if (opts?.unversioned !== undefined) out.unversioned = opts.unversioned;
  if (signal !== undefined) out.signal = signal;
  return out;
}

export interface FluxerRestClientOptions {
  readonly apiUrl?: string;
  readonly apiVersion?: string;
  readonly authPrefix?: 'Bot' | 'Bearer';
  readonly token?: string;
  readonly webappUrl?: string;
  readonly caCertPath?: string;
  readonly timeoutMs?: number;
  readonly circuitHalfOpenAfterMs?: number;
  readonly policy?: IPolicy;
  readonly logger?: Logger;
}

/**
 * Native Fluxer API v1 REST client wrapping `@fluxerjs/rest` with:
 * - Cloud & self-hosted base URL support
 * - `/.well-known/fluxer` instance discovery & capability caching
 * - Strict TLS (optional custom CA via `FLUXER_CA_CERT_PATH`, never disabling verification)
 * - Query parameter & `X-Audit-Log-Reason` header support
 * - Cockatiel retry, circuit breaker, bulkhead, and timeout resilience
 */
export class FluxerRestClient {
  readonly apiUrl: string;
  readonly apiVersion: string;
  private readonly rest: REST;
  private readonly policy: IPolicy;
  private readonly circuitHalfOpenAfterMs: number;
  private readonly configuredWebappUrl?: string;
  private discoveryCache: { value: FluxerInstanceDiscovery; fetchedAt: number } | null = null;
  private readonly channelGuildCache = new Map<string, string>();

  constructor(options: FluxerRestClientOptions = {}) {
    this.apiUrl = (options.apiUrl ?? FLUXER_DEFAULT_API_URL).replace(/\/+$/, '');
    this.apiVersion = options.apiVersion ?? FLUXER_DEFAULT_API_VERSION;
    if (options.webappUrl !== undefined) this.configuredWebappUrl = options.webappUrl;
    this.circuitHalfOpenAfterMs = options.circuitHalfOpenAfterMs ?? 60_000;

    configureCustomCaIfNeeded(options.caCertPath, options.logger);

    // Keep retries=0 inside @fluxerjs/rest so Cockatiel is the single resilience owner.
    this.rest = new REST({
      api: this.apiUrl,
      version: this.apiVersion,
      authPrefix: options.authPrefix ?? 'Bot',
      retries: 0,
      timeout: options.timeoutMs ?? 30_000,
    });
    if (options.token) {
      this.rest.setToken(stripAuthPrefix(options.token));
    }
    this.policy = options.policy ?? noop;
  }

  static fromConfig(config: Config, logger?: Logger): FluxerRestClient {
    const opts: FluxerRestClientOptions = {
      apiUrl: config.FLUXER_API_URL,
      apiVersion: config.FLUXER_API_VERSION,
      authPrefix: config.FLUXER_AUTH_PREFIX,
      token: config.FLUXER_TOKEN,
      timeoutMs: config.MCP_TIMEOUT_DEFAULT_MS,
      circuitHalfOpenAfterMs: config.MCP_CIRCUIT_HALF_OPEN_AFTER_MS,
      policy: buildResiliencePolicy(config, logger),
    };
    if (config.FLUXER_WEBAPP_URL !== undefined) {
      return new FluxerRestClient({
        ...opts,
        webappUrl: config.FLUXER_WEBAPP_URL,
        ...(config.FLUXER_CA_CERT_PATH !== undefined
          ? { caCertPath: config.FLUXER_CA_CERT_PATH }
          : {}),
        ...(logger !== undefined ? { logger } : {}),
      });
    }
    return new FluxerRestClient({
      ...opts,
      ...(config.FLUXER_CA_CERT_PATH !== undefined
        ? { caCertPath: config.FLUXER_CA_CERT_PATH }
        : {}),
      ...(logger !== undefined ? { logger } : {}),
    });
  }

  get baseUrl(): string {
    return this.rest.baseUrl;
  }

  private async execute<T>(
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    route: string,
    opts?: FluxerRequestOptions,
  ): Promise<T> {
    const fullRoute = appendQuery(route, opts?.query);
    try {
      return (await this.policy.execute(async ({ signal }) => {
        try {
          const reqOpts = buildRestOptions(opts, signal);
          if (method === 'get') {
            return await this.rest.get<T>(fullRoute, reqOpts);
          }
          if (method === 'post') return await this.rest.post<T>(fullRoute, reqOpts);
          if (method === 'patch') return await this.rest.patch<T>(fullRoute, reqOpts);
          if (method === 'put') return await this.rest.put<T>(fullRoute, reqOpts);
          return await this.rest.delete<T>(fullRoute, reqOpts);
        } catch (err) {
          const retryable = classifyFluxerError(err, { method });
          if (retryable !== null) throw retryable;
          throw err;
        }
      }, opts?.signal)) as T;
    } catch (err) {
      if (err instanceof BrokenCircuitError) {
        throw new CircuitOpenError(this.circuitHalfOpenAfterMs);
      }
      if (err instanceof BulkheadRejectedError) {
        throw new BulkheadFullError();
      }
      if (err instanceof FluxerRetryableError) {
        throw err.cause ?? err;
      }
      throw err;
    }
  }

  get<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('get', route, opts);
  }

  post<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('post', route, opts);
  }

  patch<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('patch', route, opts);
  }

  put<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('put', route, opts);
  }

  delete<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('delete', route, opts);
  }

  /**
   * Fetch and cache the Fluxer instance discovery document (`GET /.well-known/fluxer`).
   * Works identically on Fluxer Cloud and self-hosted Fluxer instances.
   */
  async discoverInstance(forceRefresh = false): Promise<FluxerInstanceDiscovery> {
    const ttlMs = 5 * 60_000;
    if (
      !forceRefresh &&
      this.discoveryCache !== null &&
      Date.now() - this.discoveryCache.fetchedAt < ttlMs
    ) {
      return this.discoveryCache.value;
    }
    const doc = await this.get<FluxerInstanceDiscovery>(FluxerRoutes.instanceDiscovery(), {
      auth: false,
      unversioned: true,
    });
    this.discoveryCache = { value: doc, fetchedAt: Date.now() };
    return doc;
  }

  getCachedWebappUrl(): string {
    if (this.configuredWebappUrl) return this.configuredWebappUrl;
    const discovered = this.discoveryCache?.value.endpoints?.webapp;
    if (typeof discovered === 'string' && discovered.startsWith('http')) {
      return discovered.replace(/\/+$/, '');
    }
    return FLUXER_DEFAULT_WEBAPP_URL;
  }

  isSelfHosted(): boolean {
    if (this.discoveryCache?.value.features?.self_hosted === true) return true;
    return !this.apiUrl.includes('fluxer.app') && !this.apiUrl.includes('fluxer.com');
  }

  /** Resolve and cache which guild owns a channel for allowlist enforcement & jump URLs. */
  async resolveChannelGuildId(channelId: string): Promise<string | null> {
    const cached = this.channelGuildCache.get(channelId);
    if (cached !== undefined) return cached;
    try {
      const ch = await this.get<{ guild_id?: string | null }>(FluxerRoutes.channel(channelId));
      if (typeof ch.guild_id === 'string' && ch.guild_id.length > 0) {
        if (this.channelGuildCache.size > 2000) this.channelGuildCache.clear();
        this.channelGuildCache.set(channelId, ch.guild_id);
        return ch.guild_id;
      }
      return null;
    } catch {
      return null;
    }
  }
}
