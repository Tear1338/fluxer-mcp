import { FluxerAPIError, HTTPError, RateLimitError } from '@fluxerjs/rest';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { BrokenCircuitError, BulkheadRejectedError, TaskCancelledError } from 'cockatiel';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code?: string;
}

export class FluxerMcpError extends Error {
  readonly code: string;
  readonly retriable: boolean;
  readonly category: 'client' | 'server';
  readonly recoveryHint?: string;

  constructor(
    code: string,
    message: string,
    opts: { retriable?: boolean; category?: 'client' | 'server'; recoveryHint?: string } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.retriable = opts.retriable ?? false;
    this.category = opts.category ?? 'client';
    if (opts.recoveryHint !== undefined) this.recoveryHint = opts.recoveryHint;
  }
}

export class ValidationError extends FluxerMcpError {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super('VALIDATION_FAILED', issues.map((i) => `${i.path}: ${i.message}`).join('; '), {
      retriable: false,
      category: 'client',
      recoveryHint: 'Correct the invalid input fields and retry.',
    });
    this.issues = issues;
  }
}

export class FluxerAuthError extends FluxerMcpError {
  constructor(message: string, recoveryHint = 'Verify FLUXER_TOKEN and bot permissions.') {
    super('FLUXER_AUTH_INVALID', message, {
      retriable: false,
      category: 'client',
      recoveryHint,
    });
  }
}

export class FluxerNotFoundError extends FluxerMcpError {
  readonly resourceType: string;
  readonly id: string;
  readonly suggestedTool?: string;

  constructor(resourceType: string, id: string, suggestedTool?: string) {
    super('FLUXER_NOT_FOUND', `${resourceType} ${id} was not found or is not accessible.`, {
      retriable: false,
      category: 'client',
      recoveryHint: suggestedTool
        ? `Verify the ${resourceType} ID or list available entries with ${suggestedTool}.`
        : `Verify the ${resourceType} ID and bot visibility.`,
    });
    this.resourceType = resourceType;
    this.id = id;
    if (suggestedTool !== undefined) this.suggestedTool = suggestedTool;
  }
}

export class FluxerPermissionError extends FluxerMcpError {
  readonly missing: readonly string[];
  readonly have: readonly string[];
  readonly resource: string;

  constructor(resource: string, missing: readonly string[], have: readonly string[] = []) {
    super(
      'FLUXER_PERMISSION_DENIED',
      `Missing permissions [${missing.join(', ')}] on ${resource}.`,
      {
        retriable: false,
        category: 'client',
        recoveryHint: `Grant [${missing.join(', ')}] to the bot role in Fluxer, then retry.`,
      },
    );
    this.resource = resource;
    this.missing = missing;
    this.have = have;
  }
}

export class GuildNotAllowedError extends FluxerMcpError {
  readonly guildId: string;

  constructor(guildId: string) {
    super('GUILD_NOT_ALLOWED', `Guild ${guildId} is not in ALLOWED_GUILDS.`, {
      retriable: false,
      category: 'client',
      recoveryHint: 'Use an allowlisted guild_id or add this guild to ALLOWED_GUILDS.',
    });
    this.guildId = guildId;
  }
}

export class GuildScopeUnresolvedError extends FluxerMcpError {
  readonly resource: string;

  constructor(resource: string) {
    super(
      'GUILD_SCOPE_UNRESOLVED',
      `Could not verify that ${resource} belongs to an allowlisted guild.`,
      {
        retriable: false,
        category: 'client',
        recoveryHint: 'Provide a guild_id or use a channel inside an allowlisted guild.',
      },
    );
    this.resource = resource;
  }
}

export class ScopeRejectedError extends FluxerMcpError {
  readonly tool: string;
  readonly required: string;
  readonly granted: readonly string[];

  constructor(tool: string, required: string, granted: readonly string[]) {
    super('CATEGORY_DISABLED', `Tool ${tool} requires category "${required}".`, {
      retriable: false,
      category: 'client',
      recoveryHint: `Include "${required}" in MCP_CATEGORIES or unset MCP_CATEGORIES.`,
    });
    this.tool = tool;
    this.required = required;
    this.granted = granted;
  }
}

export class DryRunPreview extends FluxerMcpError {
  readonly tool: string;
  readonly preview: unknown;

  constructor(tool: string, preview: unknown, recoveryHint?: string) {
    super('DRY_RUN_PREVIEW', `Dry-run preview for destructive tool ${tool}.`, {
      retriable: false,
      category: 'client',
      recoveryHint:
        recoveryHint ??
        'Review the preview, then pass __confirm: true with MCP_DRY_RUN=false to execute.',
    });
    this.tool = tool;
    this.preview = preview;
  }
}

export class WritePreview extends FluxerMcpError {
  readonly tool: string;
  readonly preview: unknown;

  constructor(tool: string, preview: unknown) {
    super('WRITE_PREVIEW', `Write preview blocked mutation for ${tool}.`, {
      retriable: false,
      category: 'client',
      recoveryHint: 'Set MCP_WRITE_MODE=allow after reviewing the planned mutation.',
    });
    this.tool = tool;
    this.preview = preview;
  }
}

export class DmConsentRequired extends FluxerMcpError {
  readonly recipientId: string;

  constructor(recipientId: string) {
    super(
      'DM_CONSENT_REQUIRED',
      `Opening a DM with user ${recipientId} requires explicit confirmation under MCP_DM_CONSENT_MODE=require.`,
      {
        retriable: false,
        category: 'client',
        recoveryHint: 'Have the operator verify recipient_id and re-invoke with __confirm: true.',
      },
    );
    this.recipientId = recipientId;
  }
}

export class CircuitOpenError extends FluxerMcpError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('CIRCUIT_OPEN', 'Upstream Fluxer REST circuit breaker is open.', {
      retriable: true,
      category: 'server',
      recoveryHint: `Wait ${retryAfterMs}ms before retrying.`,
    });
    this.retryAfterMs = retryAfterMs;
  }
}

export class BulkheadFullError extends FluxerMcpError {
  constructor() {
    super('BULKHEAD_FULL', 'Too many concurrent Fluxer REST requests in flight.', {
      retriable: true,
      category: 'server',
      recoveryHint: 'Retry shortly or increase MCP_BULKHEAD_LIMIT.',
    });
  }
}

export class ExternalServiceError extends FluxerMcpError {
  readonly provider: string;
  readonly status?: number;

  constructor(provider: string, message: string, status?: number) {
    super('EXTERNAL_SERVICE_ERROR', message, {
      retriable: true,
      category: 'server',
      recoveryHint: `External provider ${provider} failed; retry later.`,
    });
    this.provider = provider;
    if (status !== undefined) this.status = status;
  }
}

export interface FormatErrorContext {
  readonly toolName: string;
  readonly transport: 'stdio' | 'http';
}

function makeError(opts: {
  code: string;
  retriable: boolean;
  category: 'client' | 'server';
  recoveryHint: string;
  retry_after_ms?: number;
  text: string;
  structured?: Record<string, unknown>;
}): CallToolResult {
  const structured: Record<string, unknown> = {
    code: opts.code,
    retriable: opts.retriable,
    category: opts.category,
    recovery_hint: opts.recoveryHint,
    ...(opts.structured ?? {}),
  };
  if (opts.retry_after_ms !== undefined) {
    structured.retry_after_ms = opts.retry_after_ms;
  }
  return {
    isError: true,
    content: [{ type: 'text', text: opts.text }],
    structuredContent: structured,
  };
}

function formatFluxerRestError(e: unknown, ctx: FormatErrorContext): CallToolResult | undefined {
  if (e instanceof RateLimitError) {
    const retryAfterMs = Math.max(0, Math.round(e.retryAfter * 1000));
    return makeError({
      code: 'FLUXER_RATE_LIMITED',
      retriable: true,
      category: 'client',
      recoveryHint: `Wait ${retryAfterMs}ms, then retry.`,
      retry_after_ms: retryAfterMs,
      text: `**Rate Limited**\n\nFluxer rate-limited \`${ctx.toolName}\`.\n\n**Recovery**: Wait ${retryAfterMs}ms, then retry.`,
      structured: { status: 429, global: e.global },
    });
  }

  if (!(e instanceof FluxerAPIError) && !(e instanceof HTTPError)) return undefined;

  const status = e.statusCode;
  const fluxerCode = e instanceof FluxerAPIError ? String(e.code) : undefined;
  const structured: Record<string, unknown> = { status };
  if (fluxerCode !== undefined) structured.fluxer_code = fluxerCode;

  if (fluxerCode === 'BOTS_CANNOT_CREATE_GUILDS') {
    return makeError({
      code: 'BOTS_CANNOT_CREATE_GUILDS',
      retriable: false,
      category: 'client',
      recoveryHint:
        'Fluxer does not allow bot accounts to create new guilds. Create the guild manually as a user, invite the bot, then use guild_blueprint_plan to build it out.',
      text: '**Bot Guild Creation Restricted**\n\nFluxer prohibits bot accounts from creating guilds (`BOTS_CANNOT_CREATE_GUILDS`). Create the community with your user account, invite the bot, and run `guild_blueprint_plan`.',
      structured,
    });
  }

  if (status === 400) {
    return makeError({
      code: 'VALIDATION_FAILED',
      retriable: false,
      category: 'client',
      recoveryHint: `Review arguments for ${ctx.toolName} against Fluxer API v1 constraints.`,
      text: `**Fluxer Rejected the Input** (HTTP 400${fluxerCode ? ` / \`${fluxerCode}\`` : ''})\n\n${e.message}\n\n**Recovery**: Review arguments for \`${ctx.toolName}\`.`,
      structured,
    });
  }

  if (status === 401) {
    return makeError({
      code: 'FLUXER_AUTH_INVALID',
      retriable: false,
      category: 'client',
      recoveryHint: 'Check FLUXER_TOKEN, FLUXER_AUTH_PREFIX, and FLUXER_API_URL.',
      text: `**Authentication Failed** (HTTP 401)\n\nFluxer rejected the credential used by \`${ctx.toolName}\`.\n\n**Recovery**: Verify \`FLUXER_TOKEN\` and \`FLUXER_API_URL\`.`,
      structured,
    });
  }

  if (status === 403) {
    return makeError({
      code: 'FLUXER_PERMISSION_DENIED',
      retriable: false,
      category: 'client',
      recoveryHint:
        'Verify bot permissions, role hierarchy position, and channel overwrites in Fluxer.',
      text: `**Permission Denied** (HTTP 403${fluxerCode ? ` / \`${fluxerCode}\`` : ''})\n\nFluxer refused \`${ctx.toolName}\`: ${e.message}\n\n**Recovery**: Verify bot permissions and role hierarchy.`,
      structured,
    });
  }

  if (status === 404) {
    return makeError({
      code: 'FLUXER_NOT_FOUND',
      retriable: false,
      category: 'client',
      recoveryHint: 'Verify the resource ID, visibility, and target Fluxer instance.',
      text: `**Not Found** (HTTP 404${fluxerCode ? ` / \`${fluxerCode}\`` : ''})\n\nFluxer could not find the resource for \`${ctx.toolName}\`: ${e.message}`,
      structured,
    });
  }

  if (status === 429) {
    const rawRetry =
      e instanceof FluxerAPIError
        ? (e.rawBody as { retry_after?: number } | undefined)?.retry_after
        : undefined;
    const retryAfterMs =
      typeof rawRetry === 'number' ? Math.max(0, Math.round(rawRetry * 1000)) : 1000;
    return makeError({
      code: 'FLUXER_RATE_LIMITED',
      retriable: true,
      category: 'client',
      recoveryHint: `Wait ${retryAfterMs}ms, then retry.`,
      retry_after_ms: retryAfterMs,
      text: `**Rate Limited** (HTTP 429)\n\nFluxer temporarily rate-limited \`${ctx.toolName}\`.\n\n**Recovery**: Wait ${retryAfterMs}ms, then retry.`,
      structured,
    });
  }

  if (status >= 500 && status < 600) {
    return makeError({
      code: 'FLUXER_SERVER_ERROR',
      retriable: true,
      category: 'server',
      recoveryHint: 'Retry with backoff; verify target Fluxer instance health.',
      text: `**Fluxer Upstream Error** (HTTP ${status})\n\nFluxer returned HTTP ${status} for \`${ctx.toolName}\`.\n\n**Recovery**: Retry with backoff or check your Fluxer instance status.`,
      structured,
    });
  }

  return makeError({
    code: 'FLUXER_API_ERROR',
    retriable: false,
    category: 'client',
    recoveryHint: 'Verify tool parameters and Fluxer API requirements.',
    text: `**Fluxer API Error** (HTTP ${status}${fluxerCode ? ` / \`${fluxerCode}\`` : ''})\n\n${e.message}`,
    structured,
  });
}

export function formatErrorForUser(e: unknown, ctx: FormatErrorContext): CallToolResult {
  if (e instanceof CircuitOpenError) {
    return makeError({
      code: e.code,
      retriable: true,
      category: 'server',
      recoveryHint: e.recoveryHint ?? 'Wait before retrying.',
      retry_after_ms: e.retryAfterMs,
      text: `**Circuit Breaker Open**\n\nFluxer MCP paused upstream requests after repeated Fluxer failures.\n\n**Recovery**: Wait ${e.retryAfterMs}ms before retrying.`,
    });
  }
  if (e instanceof BulkheadFullError || e instanceof BulkheadRejectedError) {
    return makeError({
      code: 'BULKHEAD_FULL',
      retriable: true,
      category: 'server',
      recoveryHint: 'Too many concurrent Fluxer requests in flight; retry shortly.',
      text: '**Concurrency Limit Exceeded**\n\nToo many concurrent Fluxer API calls in flight.\n\n**Recovery**: Retry shortly.',
    });
  }
  if (e instanceof BrokenCircuitError) {
    return makeError({
      code: 'CIRCUIT_OPEN',
      retriable: true,
      category: 'server',
      recoveryHint: 'Wait and retry.',
      text: '**Circuit Breaker Open**\n\nUpstream Fluxer REST requests are temporarily paused.',
    });
  }
  if (e instanceof TaskCancelledError) {
    return makeError({
      code: 'UPSTREAM_TIMEOUT',
      retriable: true,
      category: 'server',
      recoveryHint: 'Retry with backoff or increase MCP_TIMEOUT_DEFAULT_MS.',
      text: `**Upstream Timeout**\n\nThe Fluxer request for \`${ctx.toolName}\` timed out.`,
    });
  }

  const restErr = formatFluxerRestError(e, ctx);
  if (restErr !== undefined) return restErr;

  if (e instanceof ValidationError) {
    return makeError({
      code: e.code,
      retriable: false,
      category: 'client',
      recoveryHint: e.recoveryHint ?? 'Correct the invalid arguments.',
      text: `**Input Validation Error**\n\n${e.issues.map((i) => `- \`${i.path}\`: ${i.message}`).join('\n')}`,
      structured: { issues: e.issues.map((i) => ({ ...i })) },
    });
  }

  if (e instanceof DryRunPreview || e instanceof WritePreview) {
    const label = e instanceof WritePreview ? '**Write Preview**' : '**Dry-Run Preview**';
    return makeError({
      code: e.code,
      retriable: false,
      category: 'client',
      recoveryHint: e.recoveryHint ?? 'Review the preview before executing.',
      text: `${label} (no Fluxer mutation performed) for \`${e.tool}\`:\n\n\`\`\`json\n${JSON.stringify(e.preview, null, 2)}\n\`\`\`\n\n**Recovery**: ${e.recoveryHint}`,
      structured: { tool: e.tool, preview: e.preview },
    });
  }

  if (e instanceof FluxerPermissionError) {
    return makeError({
      code: e.code,
      retriable: false,
      category: 'client',
      recoveryHint: e.recoveryHint ?? 'Grant missing permissions and retry.',
      text: `**Permission Denied** on \`${e.resource}\`\n\n**Missing**: ${e.missing.join(', ')}\n**Recovery**: ${e.recoveryHint}`,
      structured: { resource: e.resource, missing: [...e.missing], have: [...e.have] },
    });
  }

  if (e instanceof FluxerMcpError) {
    return makeError({
      code: e.code,
      retriable: e.retriable,
      category: e.category,
      recoveryHint: e.recoveryHint ?? 'Review the error and retry.',
      text: `**${e.code}**\n\n${e.message}${e.recoveryHint ? `\n\n**Recovery**: ${e.recoveryHint}` : ''}`,
    });
  }

  const message = e instanceof Error ? e.message : String(e);
  return makeError({
    code: 'INTERNAL_ERROR',
    retriable: true,
    category: 'server',
    recoveryHint: 'Retry shortly; inspect stderr logs if the issue persists.',
    text: `**Internal Error** in \`${ctx.toolName}\`\n\n${message}`,
  });
}
