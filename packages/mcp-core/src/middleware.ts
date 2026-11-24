import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { AuditSink } from './audit.js';
import { redactArgs } from './audit.js';
import { type Config, parseCategoryAllowlist, parseGuildAllowlist } from './config.js';
import {
  DmConsentRequired,
  DryRunPreview,
  FluxerAuthError,
  GuildNotAllowedError,
  GuildScopeUnresolvedError,
  ScopeRejectedError,
  ValidationError,
  WritePreview,
} from './errors.js';
import { FluxerRoutes } from './fluxer/constants.js';
import type { FluxerRestClient } from './fluxer/rest.js';
import type { FluxerTool, ToolRuntimeContext } from './tools/_lib/types.js';

export const ALWAYS_ALLOWED_CATEGORIES: ReadonlySet<string> = new Set(['meta', 'instance']);

export interface BotIdentity {
  readonly id: string;
  readonly username: string;
  readonly global_name?: string | null;
  readonly bot?: boolean;
}

export async function verifyExpectedBotIdentity(
  rest: FluxerRestClient,
  expectedBotId?: string,
  signal?: AbortSignal,
): Promise<BotIdentity> {
  const me = await rest.get<BotIdentity>(FluxerRoutes.currentUser(), {
    ...(signal ? { signal } : {}),
  });
  if (expectedBotId !== undefined && me.id !== expectedBotId) {
    throw new FluxerAuthError(
      `Active Fluxer token belongs to user ${me.id}, not expected bot ${expectedBotId}.`,
      'Verify FLUXER_TOKEN and FLUXER_EXPECTED_BOT_ID match the intended bot.',
    );
  }
  return me;
}

export interface ExecutionPipelineDeps {
  readonly config: Config;
  readonly rest: FluxerRestClient;
  readonly auditSink: AuditSink;
}

/**
 * Execute a FluxerTool through the full safety, validation, allowlist,
 * write-preview, dry-run confirmation, DM-consent, and audit pipeline.
 */
export async function executeToolWithMiddleware(
  tool: FluxerTool,
  rawInput: Record<string, unknown>,
  ctx: ToolRuntimeContext,
  deps: ExecutionPipelineDeps,
): Promise<CallToolResult> {
  const startedAt = Date.now();
  const categoryAllowlist = parseCategoryAllowlist(deps.config.MCP_CATEGORIES);
  const guildAllowlist = parseGuildAllowlist(deps.config.ALLOWED_GUILDS);

  // Extract control flags before strict Zod validation
  const confirmFlag = rawInput.__confirm === true;
  const cleanedInput: Record<string, unknown> = { ...rawInput };
  delete cleanedInput.__confirm;

  // Apply default guild when configured and tool accepts guild_id
  if (
    cleanedInput.guild_id === undefined &&
    Object.hasOwn(tool.inputSchema, 'guild_id') &&
    deps.config.FLUXER_DEFAULT_GUILD_ID !== undefined
  ) {
    cleanedInput.guild_id = deps.config.FLUXER_DEFAULT_GUILD_ID;
  }

  const guildIdHint = typeof cleanedInput.guild_id === 'string' ? cleanedInput.guild_id : undefined;
  const channelIdHint =
    typeof cleanedInput.channel_id === 'string' ? cleanedInput.channel_id : undefined;

  const emitAudit = (outcome: 'success' | 'error' | 'blocked' | 'preview', errorCode?: string) => {
    deps.auditSink.emit({
      timestamp: new Date().toISOString(),
      tool: tool.name,
      category: tool.category,
      ...(guildIdHint ? { guild_id: guildIdHint } : {}),
      ...(channelIdHint ? { channel_id: channelIdHint } : {}),
      outcome,
      duration_ms: Date.now() - startedAt,
      ...(errorCode ? { error_code: errorCode } : {}),
      args: redactArgs(cleanedInput) as Record<string, unknown>,
    });
  };

  try {
    // 1. Category allowlist gate
    if (
      categoryAllowlist !== null &&
      !categoryAllowlist.has(tool.category) &&
      !ALWAYS_ALLOWED_CATEGORIES.has(tool.category)
    ) {
      throw new ScopeRejectedError(tool.name, tool.category, [...categoryAllowlist]);
    }

    // 2. Strict Zod parameter validation
    const schema = z.object(tool.inputSchema).strict();
    const parsed = schema.safeParse(cleanedInput);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => ({
          path: i.path.join('.') || 'input',
          message: i.message,
          code: i.code,
        })),
      );
    }
    const validatedArgs = parsed.data as Record<string, unknown>;

    // 3. Guild allowlist enforcement
    if (guildAllowlist !== null) {
      const explicitGuildId =
        typeof validatedArgs.guild_id === 'string'
          ? validatedArgs.guild_id
          : typeof validatedArgs.target_guild_id === 'string'
            ? validatedArgs.target_guild_id
            : undefined;

      if (explicitGuildId !== undefined) {
        if (!guildAllowlist.has(explicitGuildId)) {
          throw new GuildNotAllowedError(explicitGuildId);
        }
      } else if (typeof validatedArgs.channel_id === 'string') {
        const resolvedGuild = await deps.rest.resolveChannelGuildId(validatedArgs.channel_id);
        if (resolvedGuild === null) {
          throw new GuildScopeUnresolvedError(`channel:${validatedArgs.channel_id}`);
        }
        if (!guildAllowlist.has(resolvedGuild)) {
          throw new GuildNotAllowedError(resolvedGuild);
        }
      }
    }

    // 4. Write-preview gate (blocks ALL mutating tools when MCP_WRITE_MODE=preview)
    if (!tool.annotations.readOnlyHint && deps.config.MCP_WRITE_MODE === 'preview') {
      emitAudit('preview', 'WRITE_PREVIEW');
      throw new WritePreview(tool.name, redactArgs(validatedArgs));
    }

    // 5. DM consent gate for user-targeted DM creation
    if (
      tool.name === 'users_create_dm' &&
      deps.config.MCP_DM_CONSENT_MODE === 'require' &&
      !confirmFlag
    ) {
      const recipientId = String(validatedArgs.recipient_id ?? 'unknown');
      emitAudit('blocked', 'DM_CONSENT_REQUIRED');
      throw new DmConsentRequired(recipientId);
    }

    // 6. Destructive tool confirmation + MCP_DRY_RUN gate
    if (tool.confirmRequired) {
      if (deps.config.MCP_DRY_RUN || !confirmFlag) {
        emitAudit('preview', 'DRY_RUN_PREVIEW');
        throw new DryRunPreview(
          tool.name,
          redactArgs(validatedArgs),
          deps.config.MCP_DRY_RUN
            ? 'Server is running with MCP_DRY_RUN=true. Set MCP_DRY_RUN=false AND pass __confirm: true to execute this destructive operation.'
            : 'Pass __confirm: true after reviewing the target to authorize this destructive operation.',
        );
      }
    }

    // 7. Execute tool handler
    const result = await tool.handler(validatedArgs, ctx);
    emitAudit(result.isError ? 'error' : 'success');
    return result;
  } catch (err) {
    if (!(err instanceof DryRunPreview) && !(err instanceof WritePreview)) {
      const code =
        err instanceof Error &&
        'code' in err &&
        typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'ERROR';
      emitAudit('error', code);
    }
    throw err;
  }
}
