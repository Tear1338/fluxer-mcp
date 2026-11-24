import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  buildMessageJumpUrl,
  ChannelId,
  defineTool,
  dualResult,
  type FluxerTool,
  GuildId,
  MessageId,
  pickDefined,
  RichEmbedSchema,
  Snowflake,
  StickerId,
  UserId,
  wrapUntrusted,
} from './_lib/types.js';

interface RawMessage {
  readonly id: string;
  readonly channel_id: string;
  readonly guild_id?: string;
  readonly content?: string;
  readonly timestamp?: string;
  readonly edited_timestamp?: string | null;
  readonly author?: { readonly id: string; readonly username?: string; readonly bot?: boolean };
  readonly embeds?: readonly unknown[];
  readonly attachments?: readonly unknown[];
  readonly message_reference?: { readonly message_id?: string; readonly channel_id?: string };
}

export const messageTools: readonly FluxerTool[] = [
  defineTool({
    name: 'messages_send',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
    description:
      'Send a message to a Fluxer channel (`POST /channels/{channel_id}/messages`). Supports text (up to 4000 chars), rich embeds, reply references, allowed_mentions, flags (e.g. SUPPRESS_EMBEDS=4, SUPPRESS_NOTIFICATIONS=4096), sticker_ids, and tts.',
    inputSchema: {
      channel_id: ChannelId,
      content: z
        .string()
        .max(4000)
        .optional()
        .describe('Message text (up to 4000 chars on Fluxer)'),
      embeds: z.array(RichEmbedSchema).max(10).optional(),
      tts: z.boolean().optional(),
      flags: z.number().int().min(0).optional(),
      reply_to_message_id: MessageId.optional().describe(
        'Reply to this message ID in the same channel',
      ),
      sticker_ids: z.array(StickerId).max(3).optional(),
      allowed_mentions: z
        .object({
          parse: z.array(z.enum(['roles', 'users', 'everyone'])).optional(),
          users: z.array(UserId).optional(),
          roles: z.array(Snowflake).optional(),
          replied_user: z.boolean().optional(),
        })
        .optional(),
      nonce: z.string().max(64).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      if (
        !args.content &&
        (!args.embeds || args.embeds.length === 0) &&
        (!args.sticker_ids || args.sticker_ids.length === 0)
      ) {
        throw new Error('Provide at least one of content, embeds, or sticker_ids.');
      }
      const body: Record<string, unknown> = pickDefined(args, [
        'content',
        'embeds',
        'tts',
        'flags',
        'sticker_ids',
        'allowed_mentions',
        'nonce',
      ]);
      if (args.reply_to_message_id) {
        body.message_reference = {
          message_id: args.reply_to_message_id,
          channel_id: args.channel_id,
        };
      }
      const msg = await ctx.rest.post<RawMessage>(FluxerRoutes.channelMessages(args.channel_id), {
        body,
      });
      const guildId = msg.guild_id ?? (await ctx.rest.resolveChannelGuildId(args.channel_id));
      const jumpUrl = buildMessageJumpUrl(ctx.rest, {
        guildId,
        channelId: msg.channel_id,
        messageId: msg.id,
      });
      return dualResult({
        text: `Sent message \`${msg.id}\` to <#${msg.channel_id}> (${jumpUrl}).`,
        data: {
          message_id: msg.id,
          channel_id: msg.channel_id,
          guild_id: guildId,
          jump_url: jumpUrl,
          timestamp: msg.timestamp ?? null,
        },
      });
    },
  }),

  defineTool({
    name: 'messages_read',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      'Read recent messages from a Fluxer channel (`GET /channels/{channel_id}/messages`) with cursor pagination (before/after/around) and untrusted content fencing.',
    inputSchema: {
      channel_id: ChannelId,
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Messages to fetch (1-100, default 25)'),
      before: MessageId.optional(),
      after: MessageId.optional(),
      around: MessageId.optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const msgs = await ctx.rest.get<RawMessage[]>(FluxerRoutes.channelMessages(args.channel_id), {
        query: {
          limit: args.limit ?? 25,
          before: args.before,
          after: args.after,
          around: args.around,
        },
      });
      const projected = msgs.map((m) => ({
        id: m.id,
        channel_id: m.channel_id,
        author_id: m.author?.id ?? null,
        author_username: m.author?.username ?? null,
        author_bot: Boolean(m.author?.bot),
        content: m.content ?? '',
        timestamp: m.timestamp ?? null,
        edited_timestamp: m.edited_timestamp ?? null,
        embeds_count: m.embeds?.length ?? 0,
        attachments_count: m.attachments?.length ?? 0,
        reply_to: m.message_reference?.message_id ?? null,
      }));
      const preview = projected
        .slice(0, 25)
        .map((m) => `[${m.id}] @${m.author_username ?? m.author_id ?? 'unknown'}: ${m.content}`)
        .join('\n');
      return dualResult({
        text: `Read ${projected.length} message(s) from \`${args.channel_id}\`:\n${wrapUntrusted(preview, 'message')}`,
        data: { channel_id: args.channel_id, count: projected.length, messages: projected },
      });
    },
  }),

  defineTool({
    name: 'messages_get',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      'Fetch a single Fluxer message by ID (`GET /channels/{channel_id}/messages/{message_id}`).',
    inputSchema: { channel_id: ChannelId, message_id: MessageId },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const msg = await ctx.rest.get<RawMessage>(
        FluxerRoutes.channelMessage(args.channel_id, args.message_id),
      );
      return dualResult({
        text: `Message \`${msg.id}\` by \`${msg.author?.id ?? 'unknown'}\`:\n${wrapUntrusted(msg.content ?? '', 'message')}`,
        data: msg as unknown as Record<string, unknown>,
      });
    },
  }),

  defineTool({
    name: 'messages_edit',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL'],
    description:
      'Edit a bot-authored Fluxer message (`PATCH /channels/{channel_id}/messages/{message_id}`).',
    inputSchema: {
      channel_id: ChannelId,
      message_id: MessageId,
      content: z.string().max(4000).nullable().optional(),
      embeds: z.array(RichEmbedSchema).max(10).optional(),
      flags: z.number().int().min(0).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['content', 'embeds', 'flags']);
      const msg = await ctx.rest.patch<RawMessage>(
        FluxerRoutes.channelMessage(args.channel_id, args.message_id),
        { body },
      );
      return dualResult({
        text: `Edited message \`${args.message_id}\` in channel \`${args.channel_id}\`.`,
        data: {
          message_id: msg.id,
          channel_id: msg.channel_id,
          edited_timestamp: msg.edited_timestamp ?? null,
        },
      });
    },
  }),

  defineTool({
    name: 'messages_delete',
    category: 'messages',
    requiredPermissions: ['MANAGE_MESSAGES'],
    confirmRequired: true,
    description:
      'Delete a single message (`DELETE /channels/{channel_id}/messages/{message_id}`). Confirmation-gated.',
    inputSchema: { channel_id: ChannelId, message_id: MessageId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.channelMessage(args.channel_id, args.message_id));
      return dualResult({
        text: `Deleted message \`${args.message_id}\` in channel \`${args.channel_id}\`.`,
        data: { deleted: true, channel_id: args.channel_id, message_id: args.message_id },
      });
    },
  }),

  defineTool({
    name: 'messages_bulk_delete',
    category: 'messages',
    requiredPermissions: ['MANAGE_MESSAGES'],
    confirmRequired: true,
    description:
      'Bulk-delete 2 to 100 messages in a Fluxer channel (`POST /channels/{channel_id}/messages/bulk-delete`). Confirmation-gated.',
    inputSchema: {
      channel_id: ChannelId,
      messages: z.array(MessageId).min(2).max(100),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.post(FluxerRoutes.channelBulkDelete(args.channel_id), {
        body: { messages: args.messages },
      });
      return dualResult({
        text: `Bulk-deleted ${args.messages.length} message(s) in channel \`${args.channel_id}\`.`,
        data: { deleted: true, channel_id: args.channel_id, count: args.messages.length },
      });
    },
  }),

  defineTool({
    name: 'messages_pin',
    category: 'messages',
    requiredPermissions: ['PIN_MESSAGES'],
    description:
      'Pin a message in a Fluxer channel (`PUT /channels/{channel_id}/pins/{message_id}`). Note: Fluxer has a dedicated PIN_MESSAGES permission (bit 51).',
    inputSchema: { channel_id: ChannelId, message_id: MessageId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.put(FluxerRoutes.channelPinMessage(args.channel_id, args.message_id));
      return dualResult({
        text: `Pinned message \`${args.message_id}\` in channel \`${args.channel_id}\`.`,
        data: { pinned: true, channel_id: args.channel_id, message_id: args.message_id },
      });
    },
  }),

  defineTool({
    name: 'messages_unpin',
    category: 'messages',
    requiredPermissions: ['PIN_MESSAGES'],
    description:
      'Unpin a message in a Fluxer channel (`DELETE /channels/{channel_id}/pins/{message_id}`).',
    inputSchema: { channel_id: ChannelId, message_id: MessageId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.channelPinMessage(args.channel_id, args.message_id));
      return dualResult({
        text: `Unpinned message \`${args.message_id}\` in channel \`${args.channel_id}\`.`,
        data: { unpinned: true, channel_id: args.channel_id, message_id: args.message_id },
      });
    },
  }),

  defineTool({
    name: 'messages_list_pins',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      "List pinned messages in a Fluxer channel (`GET /channels/{channel_id}/messages/pins`). Returns Fluxer's native paginated `{ items, has_more }` structure.",
    inputSchema: {
      channel_id: ChannelId,
      limit: z.number().int().min(1).max(50).optional(),
      before: z.string().optional().describe('ISO timestamp cursor for older pinned items'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<{ items?: unknown[]; has_more?: boolean } | unknown[]>(
        FluxerRoutes.channelPins(args.channel_id),
        { query: { limit: args.limit ?? 50, before: args.before } },
      );
      const items = Array.isArray(res) ? res : (res.items ?? []);
      const hasMore = Array.isArray(res) ? false : Boolean(res.has_more);
      return dualResult({
        text: `Found ${items.length} pinned message(s) in channel \`${args.channel_id}\` (has_more=${hasMore}).`,
        data: { channel_id: args.channel_id, count: items.length, has_more: hasMore, items },
      });
    },
  }),

  defineTool({
    name: 'messages_crosspost',
    category: 'messages',
    requiredPermissions: ['SEND_MESSAGES'],
    description:
      'Publish/crosspost an announcement message to following channels (`POST /channels/{channel_id}/messages/{message_id}/crosspost`).',
    inputSchema: { channel_id: ChannelId, message_id: MessageId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.channelMessageCrosspost(args.channel_id, args.message_id),
      );
      return dualResult({
        text: `Crossposted message \`${args.message_id}\` from channel \`${args.channel_id}\`.`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'messages_get_crosspost_source',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL'],
    description:
      'Fluxer-native: inspect the originating source community/channel of a crossposted announcement message (`GET /channels/{channel_id}/messages/{message_id}/crosspost-source`).',
    inputSchema: { channel_id: ChannelId, message_id: MessageId },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channelMessageCrosspostSource(args.channel_id, args.message_id),
      );
      return dualResult({
        text: `Fetched crosspost source for message \`${args.message_id}\`.`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'messages_create_thread',
    category: 'messages',
    requiredPermissions: ['CREATE_PUBLIC_THREADS'],
    description:
      'Start a thread from an existing Fluxer message (`POST /channels/{channel_id}/messages/{message_id}/threads`).',
    inputSchema: {
      channel_id: ChannelId,
      message_id: MessageId,
      name: z.string().min(1).max(100),
      auto_archive_duration: z
        .union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)])
        .optional(),
      rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['name', 'auto_archive_duration', 'rate_limit_per_user']);
      const thread = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.channelMessageThreads(args.channel_id, args.message_id),
        { body },
      );
      return dualResult({
        text: `Started thread **${String(thread.name ?? args.name)}** (\`channel:${String(thread.id ?? '')}\`) from message \`${args.message_id}\`.`,
        data: thread,
      });
    },
  }),

  defineTool({
    name: 'messages_delete_attachment',
    category: 'messages',
    requiredPermissions: ['MANAGE_MESSAGES'],
    confirmRequired: true,
    description:
      'Fluxer-native: remove a single attachment from a message without deleting the entire message (`DELETE /channels/{channel_id}/messages/{message_id}/attachments/{attachment_id}`). Confirmation-gated.',
    inputSchema: {
      channel_id: ChannelId,
      message_id: MessageId,
      attachment_id: Snowflake,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(
        FluxerRoutes.channelMessageAttachment(args.channel_id, args.message_id, args.attachment_id),
      );
      return dualResult({
        text: `Deleted attachment \`${args.attachment_id}\` from message \`${args.message_id}\`.`,
        data: {
          deleted: true,
          channel_id: args.channel_id,
          message_id: args.message_id,
          attachment_id: args.attachment_id,
        },
      });
    },
  }),

  defineTool({
    name: 'messages_refresh_attachment_urls',
    category: 'messages',
    description:
      'Fluxer-native: refresh expiring signed Fluxer media attachment URLs (`POST /attachments/refresh-urls`).',
    inputSchema: {
      attachment_urls: z.array(z.string().url()).min(1).max(50),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.attachmentsRefreshUrls(),
        { body: { attachment_urls: args.attachment_urls } },
      );
      return dualResult({
        text: `Refreshed ${args.attachment_urls.length} Fluxer attachment URL(s).`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'messages_search',
    category: 'messages',
    guildScoped: true,
    description:
      'Fluxer-native bot-accessible full-text message search (`POST /search/messages`). Search across a guild or channels by keywords, exact_phrases, author_id, mentions, pinned, has (link/embed/file/image/video), attachment filters, date/ID bounds, and sort order.',
    inputSchema: {
      guild_id: GuildId.optional().describe('Context guild ID to search within'),
      channel_ids: z.array(ChannelId).max(50).optional(),
      content: z.string().max(500).optional().describe('Full-text search query'),
      exact_phrases: z.array(z.string().max(200)).max(10).optional(),
      author_id: z.array(UserId).max(20).optional(),
      mentions: z.array(UserId).max(20).optional(),
      mention_everyone: z.boolean().optional(),
      pinned: z.boolean().optional(),
      has: z.array(z.string()).max(10).optional(),
      min_id: MessageId.optional(),
      max_id: MessageId.optional(),
      include_nsfw: z.boolean().optional(),
      sort_by: z.enum(['timestamp', 'relevance']).optional(),
      sort_order: z.enum(['asc', 'desc']).optional(),
      hits_per_page: z.number().int().min(1).max(50).optional(),
      page: z.number().int().min(1).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = pickDefined(args, [
        'channel_ids',
        'content',
        'exact_phrases',
        'author_id',
        'mentions',
        'mention_everyone',
        'pinned',
        'has',
        'min_id',
        'max_id',
        'include_nsfw',
        'sort_by',
        'sort_order',
        'hits_per_page',
        'page',
      ]);
      if (args.guild_id) {
        body.scope = 'guild';
        body.context_guild_id = args.guild_id;
      }
      const res = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.searchMessages(), {
        body,
      });
      const total =
        typeof res.total === 'number'
          ? res.total
          : Array.isArray(res.messages)
            ? res.messages.length
            : 0;
      return dualResult({
        text: `Fluxer message search returned ${total} match(es).`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'messages_search_recent',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      'Bounded client-side filter over the most recent messages in a channel (substring, author_id, or regex-free keyword match) without relying on search indexing.',
    inputSchema: {
      channel_id: ChannelId,
      query: z.string().min(1).max(200),
      author_id: UserId.optional(),
      scan_limit: z.number().int().min(10).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const msgs = await ctx.rest.get<RawMessage[]>(FluxerRoutes.channelMessages(args.channel_id), {
        query: { limit: args.scan_limit ?? 100 },
      });
      const q = args.query.toLowerCase();
      const hits = msgs.filter((m) => {
        if (args.author_id && m.author?.id !== args.author_id) return false;
        return (m.content ?? '').toLowerCase().includes(q);
      });
      return dualResult({
        text: `Matched ${hits.length}/${msgs.length} recent message(s) in \`${args.channel_id}\` for "${args.query}".`,
        data: {
          channel_id: args.channel_id,
          scanned: msgs.length,
          match_count: hits.length,
          matches: hits.map((m) => ({
            id: m.id,
            author_id: m.author?.id ?? null,
            content: m.content ?? '',
            timestamp: m.timestamp ?? null,
          })),
        },
      });
    },
  }),

  defineTool({
    name: 'messages_context',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      'Gather bounded conversation context from a Fluxer channel with explicit Fluxer jump-URL citations, participant list, and untrusted content boundaries.',
    inputSchema: {
      channel_id: ChannelId,
      limit: z
        .number()
        .int()
        .min(5)
        .max(100)
        .optional()
        .describe('Messages to include (default 30)'),
      around: MessageId.optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const [msgs, guildId] = await Promise.all([
        ctx.rest.get<RawMessage[]>(FluxerRoutes.channelMessages(args.channel_id), {
          query: { limit: args.limit ?? 30, around: args.around },
        }),
        ctx.rest.resolveChannelGuildId(args.channel_id),
      ]);
      const chronological = [...msgs].reverse();
      const citations = chronological.map((m) => ({
        message_id: m.id,
        author_id: m.author?.id ?? null,
        author_username: m.author?.username ?? null,
        timestamp: m.timestamp ?? null,
        jump_url: buildMessageJumpUrl(ctx.rest, {
          guildId,
          channelId: args.channel_id,
          messageId: m.id,
        }),
        content: m.content ?? '',
        reply_to: m.message_reference?.message_id ?? null,
      }));
      const participants = [...new Set(citations.map((c) => c.author_id).filter(Boolean))];
      const transcript = citations
        .map(
          (c) =>
            `[${c.timestamp ?? ''}] @${c.author_username ?? c.author_id} (${c.jump_url}): ${c.content}`,
        )
        .join('\n');
      return dualResult({
        text: `Captured ${citations.length} cited message(s) from ${participants.length} participant(s):\n${wrapUntrusted(transcript, 'message')}`,
        data: {
          channel_id: args.channel_id,
          guild_id: guildId,
          message_count: citations.length,
          participants,
          coverage: 'Bounded recent window; chronological order.',
          messages: citations,
        },
      });
    },
  }),

  defineTool({
    name: 'messages_compose',
    category: 'messages',
    description:
      'Local read-only rich message & embed composer/validator for Fluxer. Validates content length (<=4000), embed limits (<=10 embeds, <=25 fields/embed), and returns a ready-to-publish payload without calling Fluxer.',
    inputSchema: {
      content: z.string().max(4000).optional(),
      title: z.string().max(256).optional(),
      description: z.string().max(4096).optional(),
      color: z.number().int().min(0).max(0xffffff).optional(),
      url: z.string().url().optional(),
      footer: z.string().max(2048).optional(),
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
      embeds: z.array(RichEmbedSchema).max(10).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args) => {
      const embeds = [...(args.embeds ?? [])];
      if (args.title || args.description || args.fields?.length) {
        embeds.unshift({
          ...(args.title ? { title: args.title } : {}),
          ...(args.description ? { description: args.description } : {}),
          ...(args.color !== undefined ? { color: args.color } : {}),
          ...(args.url ? { url: args.url } : {}),
          ...(args.footer ? { footer: { text: args.footer } } : {}),
          ...(args.fields ? { fields: args.fields } : {}),
        });
      }
      const payload = {
        ...(args.content ? { content: args.content } : {}),
        ...(embeds.length > 0 ? { embeds } : {}),
      };
      return dualResult({
        text: `Composed valid Fluxer rich message (${args.content?.length ?? 0} chars, ${embeds.length} embed(s)). Pass to \`messages_publish\` to send.`,
        data: { valid: true, payload },
      });
    },
  }),

  defineTool({
    name: 'messages_publish',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS'],
    description:
      'Publish a rich composed message (content + embeds + optional allowed_mentions) to a Fluxer channel (`POST /channels/{channel_id}/messages`).',
    inputSchema: {
      channel_id: ChannelId,
      content: z.string().max(4000).optional(),
      embeds: z.array(RichEmbedSchema).min(1).max(10),
      suppress_notifications: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        ...(args.content ? { content: args.content } : {}),
        embeds: args.embeds,
        ...(args.suppress_notifications ? { flags: 1 << 12 } : {}),
      };
      const msg = await ctx.rest.post<RawMessage>(FluxerRoutes.channelMessages(args.channel_id), {
        body,
      });
      const guildId = msg.guild_id ?? (await ctx.rest.resolveChannelGuildId(args.channel_id));
      const jumpUrl = buildMessageJumpUrl(ctx.rest, {
        guildId,
        channelId: msg.channel_id,
        messageId: msg.id,
      });
      return dualResult({
        text: `Published rich message \`${msg.id}\` with ${args.embeds.length} embed(s) to <#${msg.channel_id}> (${jumpUrl}).`,
        data: { message_id: msg.id, channel_id: msg.channel_id, jump_url: jumpUrl },
      });
    },
  }),

  defineTool({
    name: 'messages_update',
    category: 'messages',
    requiredPermissions: ['VIEW_CHANNEL'],
    description:
      'Update an existing rich composed message (content and/or embeds) in a Fluxer channel (`PATCH /channels/{channel_id}/messages/{message_id}`).',
    inputSchema: {
      channel_id: ChannelId,
      message_id: MessageId,
      content: z.string().max(4000).nullable().optional(),
      embeds: z.array(RichEmbedSchema).max(10).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['content', 'embeds']);
      const msg = await ctx.rest.patch<RawMessage>(
        FluxerRoutes.channelMessage(args.channel_id, args.message_id),
        { body },
      );
      return dualResult({
        text: `Updated rich message \`${args.message_id}\` in channel \`${args.channel_id}\`.`,
        data: {
          message_id: msg.id,
          channel_id: msg.channel_id,
          edited_timestamp: msg.edited_timestamp ?? null,
        },
      });
    },
  }),
];
