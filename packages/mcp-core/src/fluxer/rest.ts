import { readFileSync } from 'node:fs';
import { FluxerAPIError, HTTPError, RateLimitError } from '@fluxerjs/rest';
import type { APIErrorBody, RateLimitErrorBody } from '@fluxerjs/types';
import {
  BrokenCircuitError,
  BulkheadRejectedError,
  bulkhead,
  ConsecutiveBreaker,
  circuitBreaker,
  ExponentialBackoff,
  handleType,
  type IPolicy,
  noop,
  retry,
  TimeoutStrategy,
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
        return new FluxerRetryableError(err, null, !(isPost && AMBIGUOUS_NET_CODES.has(innerCode)));
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

function resolveFluxerUrl(
  apiUrl: string,
  apiVersion: string,
  route: string,
  unversioned?: boolean,
): string {
  if (route.startsWith('http://') || route.startsWith('https://')) return route;
  const origin = apiUrl.replace(/\/+$/, '');
  const normalized = route.startsWith('/') ? route : `/${route}`;
  if (unversioned || normalized.startsWith('/.well-known/')) {
    return `${origin}${normalized}`;
  }
  return `${origin}/v${apiVersion}${normalized}`;
}

function isApiErrorBody(val: unknown): val is APIErrorBody {
  if (typeof val !== 'object' || val === null) return false;
  const rec = val as Record<string, unknown>;
  return (
    typeof rec.message === 'string' &&
    (typeof rec.code === 'string' || typeof rec.code === 'number')
  );
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
 * Native Fluxer API v1 REST client with:
 * - Cloud & self-hosted base URL support (`FLUXER_API_URL`)
 * - `/.well-known/fluxer` instance discovery & capability caching
 * - Strict TLS (optional custom CA via `FLUXER_CA_CERT_PATH`, never disabling verification)
 * - Query parameter & `X-Audit-Log-Reason` header support
 * - `@fluxerjs/rest` error types (`FluxerAPIError`, `RateLimitError`, `HTTPError`)
 * - Cockatiel retry, circuit breaker, bulkhead, and timeout resilience
 */
export class FluxerRestClient {
  readonly apiUrl: string;
  readonly apiVersion: string;
  private readonly authPrefix: 'Bot' | 'Bearer';
  private readonly token: string | null;
  private readonly policy: IPolicy;
  private readonly circuitHalfOpenAfterMs: number;
  private readonly configuredWebappUrl?: string;
  private discoveryCache: { value: FluxerInstanceDiscovery; fetchedAt: number } | null = null;
  private readonly channelGuildCache = new Map<string, string>();

  constructor(options: FluxerRestClientOptions = {}) {
    this.apiUrl = (options.apiUrl ?? FLUXER_DEFAULT_API_URL).replace(/\/+$/, '');
    this.apiVersion = options.apiVersion ?? FLUXER_DEFAULT_API_VERSION;
    this.authPrefix = options.authPrefix ?? 'Bot';
    this.token = options.token ? stripAuthPrefix(options.token) : null;
    if (options.webappUrl !== undefined) this.configuredWebappUrl = options.webappUrl;
    this.circuitHalfOpenAfterMs = options.circuitHalfOpenAfterMs ?? 60_000;

    configureCustomCaIfNeeded(options.caCertPath, options.logger);
    this.policy = options.policy ?? noop;
  }

  static fromConfig(config: Config, logger?: Logger): FluxerRestClient {
    return new FluxerRestClient({
      apiUrl: config.FLUXER_API_URL,
      apiVersion: config.FLUXER_API_VERSION,
      authPrefix: config.FLUXER_AUTH_PREFIX,
      token: config.FLUXER_TOKEN,
      timeoutMs: config.MCP_TIMEOUT_DEFAULT_MS,
      circuitHalfOpenAfterMs: config.MCP_CIRCUIT_HALF_OPEN_AFTER_MS,
      policy: buildResiliencePolicy(config, logger),
      ...(config.FLUXER_WEBAPP_URL !== undefined ? { webappUrl: config.FLUXER_WEBAPP_URL } : {}),
      ...(config.FLUXER_CA_CERT_PATH !== undefined
        ? { caCertPath: config.FLUXER_CA_CERT_PATH }
        : {}),
      ...(logger !== undefined ? { logger } : {}),
    });
  }

  get baseUrl(): string {
    return `${this.apiUrl}/v${this.apiVersion}`;
  }

  private async performFetch<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    route: string,
    opts: FluxerRequestOptions | undefined,
    policySignal: AbortSignal,
  ): Promise<T> {
    const url = resolveFluxerUrl(this.apiUrl, this.apiVersion, route, opts?.unversioned);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'fluxer-mcp/1.0.0 (+https://github.com/fluxer-mcp/fluxer-mcp)',
      ...(opts?.headers ?? {}),
    };
    if (opts?.auth !== false && this.token) {
      headers.Authorization = `${this.authPrefix} ${this.token}`;
    }
    if (opts?.reason !== undefined && opts.reason.trim().length > 0) {
      headers['X-Audit-Log-Reason'] = encodeURIComponent(opts.reason.trim());
    }

    let serializedBody: string | undefined;
    if (opts?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(opts.body);
    }

    const callerSignal = opts?.signal;
    const signal =
      callerSignal === undefined ? policySignal : AbortSignal.any([policySignal, callerSignal]);

    const response = await fetch(url, {
      method,
      headers,
      ...(serializedBody !== undefined ? { body: serializedBody } : {}),
      signal,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let parsed: unknown;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }

    if (!response.ok) {
      const ctx = { method, path: route };
      if (response.status === 429) {
        const retryHeader = Number(response.headers.get('retry-after') ?? 0);
        const bodyRetry =
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as { retry_after?: unknown }).retry_after === 'number'
            ? (parsed as { retry_after: number }).retry_after
            : undefined;
        const rlBody: RateLimitErrorBody = {
          code: 'RATE_LIMITED',
          message: (isApiErrorBody(parsed) ? parsed.message : null) ?? 'Rate limited by Fluxer API',
          retry_after: bodyRetry ?? (Number.isFinite(retryHeader) ? retryHeader : 1),
          global:
            typeof parsed === 'object' &&
            parsed !== null &&
            (parsed as { global?: unknown }).global === true,
        };
        throw new RateLimitError(rlBody, 429, ctx);
      }
      if (isApiErrorBody(parsed)) {
        throw new FluxerAPIError(parsed, response.status, ctx);
      }
      throw new HTTPError(response.status, text || null, ctx);
    }

    return (parsed !== undefined ? parsed : text) as T;
  }

  private async execute<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    route: string,
    opts?: FluxerRequestOptions,
  ): Promise<T> {
    const fullRoute = appendQuery(route, opts?.query);
    try {
      return (await this.policy.execute(async ({ signal }) => {
        try {
          return await this.performFetch<T>(method, fullRoute, opts, signal);
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
    return this.execute<T>('GET', route, opts);
  }

  post<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('POST', route, opts);
  }

  patch<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('PATCH', route, opts);
  }

  put<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('PUT', route, opts);
  }

  delete<T = unknown>(route: string, opts?: FluxerRequestOptions): Promise<T> {
    return this.execute<T>('DELETE', route, opts);
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
