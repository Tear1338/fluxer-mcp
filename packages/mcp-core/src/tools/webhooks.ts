import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  AuditReasonSchema,
  ChannelId,
  type FluxerTool,
  GuildId,
  MessageId,
  RichEmbedSchema,
  WebhookId,
  defineTool,
  dualResult,
  pickDefined,
} from './_lib/types.js';

const WebhookTokenSchema = z.string().trim().min(10).max(256).describe('Opaque webhook token');

export const webhookTools: readonly FluxerTool[] = [
  defineTool({
    name: 'webhooks_list_channel',
    category: 'webhooks',
    requiredPermissions: ['MANAGE_WEBHOOKS'],
    description: 'List webhooks configured on a Fluxer channel (`GET /channels/{channel_id}/webhooks`).',
    inputSchema: { channel_id: ChannelId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const webhooks = await ctx.rest.get<Array<Record<string, unknown>>>(FluxerRoutes.channelWebhooks(args.channel_id));
      return dualResult({
        text: `Found ${webhooks.length} webhook(s) in channel \`${args.channel_id}\`.`,
        data: { channel_id: args.channel_id, count: webhooks.length, webhooks },
      });
    },
  }),

  defineTool({
    name: 'webhooks_list_guild',
    category: 'webhooks',
    requiredPermissions: ['MANAGE_WEBHOOKS'],
    guildScoped: true,
    description: 'List all webhooks across a Fluxer guild (`GET /guilds/{guild_id}/webhooks`).',
    inputSchema: { guild_id: GuildId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const webhooks = await ctx.rest.get<Array<Record<string, unknown>>>(FluxerRoutes.guildWebhooks(args.guild_id));
      return dualResult({
        text: `Found ${webhooks.length} webhook(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: webhooks.length, webhooks },
      });
    },
  }),

  defineTool({
    name: 'webhooks_create',
    category: 'webhooks',
    requiredPermissions: ['MANAGE_WEBHOOKS'],
    description: 'Create an incoming webhook on a Fluxer channel (`POST /channels/{channel_id}/webhooks`).',
    inputSchema: {
      channel_id: ChannelId,
      name: z.string().min(1).max(80),
      avatar: z.string().nullable().optional().describe('Base64 image data URI or null'),
      audit_reason: AuditReasonSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['name', 'avatar']);
      const wh = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.channelWebhooks(args.channel_id), {
        body,
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Created webhook **${String(wh.name ?? args.name)}** (\`webhook:${String(wh.id ?? '')}\`).`,
        data: wh,
      });
    },
  }),

  defineTool({
    name: 'webhooks_get',
    category: 'webhooks',
    requiredPermissions: ['MANAGE_WEBHOOKS'],
    description: 'Get a Fluxer webhook by ID (`GET /webhooks/{webhook_id}`).',
    inputSchema: { webhook_id: WebhookId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const wh = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.webhook(args.webhook_id));
      return dualResult({ text: `Fetched webhook \`${args.webhook_id}\`.`, data: wh });
    },
  }),

  defineTool({
    name: 'webhooks_get_with_token',
    category: 'webhooks',
    description: 'Get a Fluxer webhook using its opaque token (`GET /webhooks/{webhook_id}/{token}`, no bot auth required).',
    inputSchema: { webhook_id: WebhookId, webhook_token: WebhookTokenSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const wh = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.webhookWithToken(args.webhook_id, args.webhook_token),
        { auth: false },
      );
      return dualResult({ text: `Fetched webhook \`${args.webhook_id}\` via token.`, data: wh });
    },
  }),

  defineTool({
    name: 'webhooks_modify',
    category: 'webhooks',
    requiredPermissions: ['MANAGE_WEBHOOKS'],
    description: 'Modify a Fluxer webhook (`PATCH /webhooks/{webhook_id}`): rename, update avatar, or move to another channel.',
    inputSchema: {
      webhook_id: WebhookId,
      name: z.string().min(1).max(80).optional(),
      avatar: z.string().nullable().optional(),
      channel_id: ChannelId.optional(),
      audit_reason: AuditReasonSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['name', 'avatar', 'channel_id']);
      const wh = await ctx.rest.patch<Record<string, unknown>>(FluxerRoutes.webhook(args.webhook_id), {
        body,
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({ text: `Updated webhook \`${args.webhook_id}\`.`, data: wh });
    },
  }),

  defineTool({
    name: 'webhooks_modify_with_token',
    category: 'webhooks',
    description: 'Modify a Fluxer webhook using its opaque token (`PATCH /webhooks/{webhook_id}/{token}`).',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      name: z.string().min(1).max(80).optional(),
      avatar: z.string().nullable().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['name', 'avatar']);
      const wh = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.webhookWithToken(args.webhook_id, args.webhook_token),
        { body, auth: false },
      );
      return dualResult({ text: `Updated webhook \`${args.webhook_id}\` via token.`, data: wh });
    },
  }),

  defineTool({
    name: 'webhooks_delete',
    category: 'webhooks',
    requiredPermissions: ['MANAGE_WEBHOOKS'],
    confirmRequired: true,
    description: 'Delete a Fluxer webhook (`DELETE /webhooks/{webhook_id}`). Confirmation-gated.',
    inputSchema: { webhook_id: WebhookId, audit_reason: AuditReasonSchema },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.webhook(args.webhook_id), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Deleted webhook \`${args.webhook_id}\`.`,
        data: { deleted: true, webhook_id: args.webhook_id },
      });
    },
  }),

  defineTool({
    name: 'webhooks_delete_with_token',
    category: 'webhooks',
    confirmRequired: true,
    description: 'Delete a Fluxer webhook via its opaque token (`DELETE /webhooks/{webhook_id}/{token}`). Confirmation-gated.',
    inputSchema: { webhook_id: WebhookId, webhook_token: WebhookTokenSchema },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.webhookWithToken(args.webhook_id, args.webhook_token), {
        auth: false,
      });
      return dualResult({
        text: `Deleted webhook \`${args.webhook_id}\` via token.`,
        data: { deleted: true, webhook_id: args.webhook_id },
      });
    },
  }),

  defineTool({
    name: 'webhooks_execute',
    category: 'webhooks',
    description:
      'Execute a Fluxer webhook (`POST /webhooks/{webhook_id}/{token}`). Supports content, embeds, username/avatar_url overrides, wait=true (return message object), thread_id, and forum thread_name/applied_tags.',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      content: z.string().max(4000).optional(),
      embeds: z.array(RichEmbedSchema).max(10).optional(),
      username: z.string().max(80).optional(),
      avatar_url: z.string().url().optional(),
      tts: z.boolean().optional(),
      thread_id: ChannelId.optional(),
      thread_name: z.string().max(100).optional().describe('Create a new forum post thread when executing against a forum webhook'),
      wait: z.boolean().optional().describe('Wait for server confirmation and return message object'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['content', 'embeds', 'username', 'avatar_url', 'tts', 'thread_name']);
      const res = await ctx.rest.post<Record<string, unknown> | undefined>(
        FluxerRoutes.webhookWithToken(args.webhook_id, args.webhook_token),
        {
          auth: false,
          body,
          query: { wait: args.wait ?? true, thread_id: args.thread_id },
        },
      );
      return dualResult({
        text: `Executed webhook \`${args.webhook_id}\`.`,
        data: (res ?? { executed: true, webhook_id: args.webhook_id }) as Record<string, unknown>,
      });
    },
  }),

  defineTool({
    name: 'webhooks_get_message',
    category: 'webhooks',
    description: 'Fetch a message sent by a Fluxer webhook (`GET /webhooks/{webhook_id}/{token}/messages/{message_id}`).',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      message_id: MessageId,
      thread_id: ChannelId.optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const msg = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.webhookMessage(args.webhook_id, args.webhook_token, args.message_id),
        { auth: false, query: { thread_id: args.thread_id } },
      );
      return dualResult({ text: `Fetched webhook message \`${args.message_id}\`.`, data: msg });
    },
  }),

  defineTool({
    name: 'webhooks_edit_message',
    category: 'webhooks',
    description: 'Edit a message previously sent by a Fluxer webhook (`PATCH /webhooks/{webhook_id}/{token}/messages/{message_id}`).',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      message_id: MessageId,
      content: z.string().max(4000).nullable().optional(),
      embeds: z.array(RichEmbedSchema).max(10).optional(),
      thread_id: ChannelId.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['content', 'embeds']);
      const msg = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.webhookMessage(args.webhook_id, args.webhook_token, args.message_id),
        { auth: false, body, query: { thread_id: args.thread_id } },
      );
      return dualResult({ text: `Edited webhook message \`${args.message_id}\`.`, data: msg });
    },
  }),

  defineTool({
    name: 'webhooks_delete_message',
    category: 'webhooks',
    confirmRequired: true,
    description: 'Delete a message sent by a Fluxer webhook (`DELETE /webhooks/{webhook_id}/{token}/messages/{message_id}`). Confirmation-gated.',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      message_id: MessageId,
      thread_id: ChannelId.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      await ctx.rest.delete(
        FluxerRoutes.webhookMessage(args.webhook_id, args.webhook_token, args.message_id),
        { auth: false, query: { thread_id: args.thread_id } },
      );
      return dualResult({
        text: `Deleted webhook message \`${args.message_id}\`.`,
        data: { deleted: true, webhook_id: args.webhook_id, message_id: args.message_id },
      });
    },
  }),

  // --- Fluxer-Native Third-Party Webhook Formats (4 tools) ---
  defineTool({
    name: 'webhooks_execute_github',
    category: 'webhooks',
    description: 'Execute a GitHub-compatible Fluxer webhook (`POST /webhooks/{webhook_id}/{token}/github`).',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      event: z.string().min(1).max(64).describe('X-GitHub-Event header value (e.g. "push", "release", "pull_request")'),
      payload: z.record(z.string(), z.unknown()),
      thread_id: ChannelId.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      await ctx.rest.post(FluxerRoutes.webhookGithub(args.webhook_id, args.webhook_token), {
        auth: false,
        headers: { 'X-GitHub-Event': args.event },
        body: args.payload,
        query: { thread_id: args.thread_id },
      });
      return dualResult({
        text: `Executed GitHub webhook \`${args.webhook_id}\` (event: ${args.event}).`,
        data: { executed: true, format: 'github', webhook_id: args.webhook_id, event: args.event },
      });
    },
  }),

  defineTool({
    name: 'webhooks_execute_slack',
    category: 'webhooks',
    description: 'Execute a Slack-compatible Fluxer webhook (`POST /webhooks/{webhook_id}/{token}/slack`).',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      text: z.string().max(4000).optional(),
      username: z.string().max(80).optional(),
      icon_url: z.string().url().optional(),
      attachments: z.array(z.record(z.string(), z.unknown())).optional(),
      thread_id: ChannelId.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['text', 'username', 'icon_url', 'attachments']);
      await ctx.rest.post(FluxerRoutes.webhookSlack(args.webhook_id, args.webhook_token), {
        auth: false,
        body,
        query: { thread_id: args.thread_id },
      });
      return dualResult({
        text: `Executed Slack webhook \`${args.webhook_id}\`.`,
        data: { executed: true, format: 'slack', webhook_id: args.webhook_id },
      });
    },
  }),

  defineTool({
    name: 'webhooks_execute_instatus',
    category: 'webhooks',
    description: 'Fluxer-native: execute an Instatus incident/status webhook (`POST /webhooks/{webhook_id}/{token}/instatus`).',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      payload: z.record(z.string(), z.unknown()),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      await ctx.rest.post(FluxerRoutes.webhookInstatus(args.webhook_id, args.webhook_token), {
        auth: false,
        body: args.payload,
      });
      return dualResult({
        text: `Executed Instatus webhook \`${args.webhook_id}\`.`,
        data: { executed: true, format: 'instatus', webhook_id: args.webhook_id },
      });
    },
  }),

  defineTool({
    name: 'webhooks_execute_libredesk',
    category: 'webhooks',
    description: 'Fluxer-native: execute a Libredesk support-desk webhook (`POST /webhooks/{webhook_id}/{token}/libredesk`).',
    inputSchema: {
      webhook_id: WebhookId,
      webhook_token: WebhookTokenSchema,
      payload: z.record(z.string(), z.unknown()),
      thread_id: ChannelId.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      await ctx.rest.post(FluxerRoutes.webhookLibredesk(args.webhook_id, args.webhook_token), {
        auth: false,
        body: args.payload,
        query: { thread_id: args.thread_id },
      });
      return dualResult({
        text: `Executed Libredesk webhook \`${args.webhook_id}\`.`,
        data: { executed: true, format: 'libredesk', webhook_id: args.webhook_id },
      });
    },
  }),
];
