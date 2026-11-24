import type { CallToolResult } from '@modelcontextprotocol/server';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { FluxerPermissionName } from '../../fluxer/constants.js';
import type { FluxerRestClient } from '../../fluxer/rest.js';

export const Snowflake = z
  .string()
  .trim()
  .regex(/^\d{17,20}$/, 'Must be a 17-20 digit Fluxer snowflake ID');

export const GuildId = Snowflake.describe('Fluxer community (guild) snowflake ID');
export const ChannelId = Snowflake.describe('Fluxer channel or thread snowflake ID');
export const MessageId = Snowflake.describe('Fluxer message snowflake ID');
export const RoleId = Snowflake.describe('Fluxer role snowflake ID');
export const UserId = Snowflake.describe('Fluxer user snowflake ID');
export const EmojiId = Snowflake.describe('Fluxer custom emoji snowflake ID');
export const StickerId = Snowflake.describe('Fluxer custom sticker snowflake ID');
export const WebhookId = Snowflake.describe('Fluxer webhook snowflake ID');
export const ApplicationId = Snowflake.describe('Fluxer application snowflake ID');
export const TagId = Snowflake.describe('Fluxer forum tag snowflake ID');

export const PermissionString = z
  .string()
  .regex(/^\d+$/, 'Fluxer permission bitfield encoded as a base-10 string')
  .describe('Fluxer permission bitfield as a base-10 string (e.g. "8" = ADMINISTRATOR)');

export const PermissionOverwriteSchema = z.object({
  id: Snowflake.describe('Role or member snowflake ID'),
  type: z.union([z.literal(0), z.literal(1)]).describe('0 = role overwrite, 1 = member overwrite'),
  allow: PermissionString.optional().describe('Allowed permission bitfield string'),
  deny: PermissionString.optional().describe('Denied permission bitfield string'),
});

export const AuditReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .optional()
  .describe('Optional reason recorded in the Fluxer guild audit log (X-Audit-Log-Reason)');

export const RichEmbedSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  url: z.string().url().optional(),
  timestamp: z.string().optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  footer: z
    .object({
      text: z.string().max(2048),
      icon_url: z.string().url().optional(),
    })
    .optional(),
  image: z.object({ url: z.string().url() }).optional(),
  thumbnail: z.object({ url: z.string().url() }).optional(),
  author: z
    .object({
      name: z.string().max(256),
      url: z.string().url().optional(),
      icon_url: z.string().url().optional(),
    })
    .optional(),
  fields: z
    .array(
      z.object({
        name: z.string().max(256),
        value: z.string().max(1024),
        inline: z.boolean().optional(),
      }),
    )
    .max(25)
    .optional(),
});

export interface ToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export interface ToolRuntimeContext {
  readonly rest: FluxerRestClient;
  readonly config: Config;
  readonly logger: Logger;
  readonly signal: AbortSignal;
  /** Invoke another registered tool in-process (used by pipeline, workflows, and orchestrators). */
  readonly invokeTool: (toolName: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  /** All currently registered tools (used by meta/intent planners). */
  readonly getTools: () => readonly FluxerTool[];
}

export interface FluxerTool {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly inputSchema: z.ZodRawShape;
  readonly annotations: ToolAnnotations;
  readonly confirmRequired?: boolean;
  readonly requiredPermissions?: readonly FluxerPermissionName[];
  readonly guildScoped?: boolean;
  readonly handler: (
    args: Record<string, unknown>,
    ctx: ToolRuntimeContext,
  ) => Promise<CallToolResult>;
}

export interface DefineToolOptions<TShape extends z.ZodRawShape> {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly inputSchema: TShape;
  readonly annotations: ToolAnnotations;
  readonly confirmRequired?: boolean;
  readonly requiredPermissions?: readonly FluxerPermissionName[];
  readonly guildScoped?: boolean;
  readonly handler: (
    args: z.output<z.ZodObject<TShape>>,
    ctx: ToolRuntimeContext,
  ) => Promise<CallToolResult>;
}

export function defineTool<TShape extends z.ZodRawShape>(
  opts: DefineToolOptions<TShape>,
): FluxerTool {
  const tool: FluxerTool = {
    name: opts.name,
    category: opts.category,
    description: opts.description,
    inputSchema: opts.inputSchema,
    annotations: opts.annotations,
    handler: (rawArgs, ctx) => opts.handler(rawArgs as z.output<z.ZodObject<TShape>>, ctx),
  };
  if (opts.confirmRequired !== undefined) {
    (tool as { confirmRequired?: boolean }).confirmRequired = opts.confirmRequired;
  }
  if (opts.requiredPermissions !== undefined) {
    (tool as { requiredPermissions?: readonly FluxerPermissionName[] }).requiredPermissions =
      opts.requiredPermissions;
  }
  if (opts.guildScoped !== undefined) {
    (tool as { guildScoped?: boolean }).guildScoped = opts.guildScoped;
  }
  return tool;
}

export function dualResult<T extends Record<string, unknown>>(opts: {
  readonly text: string;
  readonly data: T;
}): CallToolResult {
  return {
    content: [{ type: 'text', text: opts.text }],
    structuredContent: opts.data,
  };
}

/**
 * Fence untrusted user-authored Fluxer text so downstream AI agents clearly
 * distinguish external message/guild content from trusted tool instructions.
 */
export function wrapUntrusted(
  content: string,
  kind: 'message' | 'guild_metadata' | 'channel_topic' | 'profile' | 'audit_reason' = 'message',
): string {
  const sanitized = content.replaceAll('```', '`\u200b``');
  return `<untrusted_${kind}>\n${sanitized}\n</untrusted_${kind}>`;
}

export function buildMessageJumpUrl(
  rest: FluxerRestClient,
  opts: { guildId?: string | null; channelId: string; messageId: string },
): string {
  const base = rest.getCachedWebappUrl();
  const guildSegment = opts.guildId ? opts.guildId : '@me';
  return `${base}/channels/${guildSegment}/${opts.channelId}/${opts.messageId}`;
}

export function pickDefined<T extends Record<string, unknown>>(
  source: T,
  keys: readonly (keyof T)[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const val = source[key];
    if (val !== undefined) {
      out[String(key)] = val;
    }
  }
  return out;
}

export function extractStructuredData(result: CallToolResult): Record<string, unknown> {
  if (
    result.structuredContent !== undefined &&
    result.structuredContent !== null &&
    typeof result.structuredContent === 'object' &&
    !Array.isArray(result.structuredContent)
  ) {
    return result.structuredContent as Record<string, unknown>;
  }
  return {};
}
