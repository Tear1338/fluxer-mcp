import { z } from 'zod';
import {
  CONTENT_WARNING_LEVEL,
  FLUXER_CHANNEL_TYPE_NAMES,
  FLUXER_CHANNEL_TYPE_VALUES,
  FLUXER_GUILD_CREATABLE_CHANNEL_TYPES,
  FluxerRoutes,
  THREAD_AUTO_ARCHIVE_DURATIONS,
} from '../fluxer/constants.js';
import {
  AuditReasonSchema,
  ChannelId,
  EmojiId,
  type FluxerTool,
  GuildId,
  PermissionOverwriteSchema,
  PermissionString,
  Snowflake,
  TagId,
  defineTool,
  dualResult,
  pickDefined,
} from './_lib/types.js';

const ForumTagInputSchema = z.object({
  name: z.string().min(1).max(50),
  moderated: z.boolean().optional(),
  emoji_id: EmojiId.nullable().optional(),
  emoji_name: z.string().max(64).nullable().optional(),
});

const ChannelTypeCreateSchema = z
  .number()
  .int()
  .refine(
    (v): v is (typeof FLUXER_GUILD_CREATABLE_CHANNEL_TYPES)[number] =>
      (FLUXER_GUILD_CREATABLE_CHANNEL_TYPES as readonly number[]).includes(v),
    `type must be one of Fluxer guild channel types: ${FLUXER_GUILD_CREATABLE_CHANNEL_TYPES.join(', ')} (0=TEXT, 2=VOICE, 4=CATEGORY, 5=ANNOUNCEMENT, 15=FORUM, 16=MEDIA, 998=GUILD_LINK)`,
  );

export const channelTools: readonly FluxerTool[] = [
  defineTool({
    name: 'channels_list',
    category: 'channels',
    guildScoped: true,
    description:
      'List all channels in a Fluxer guild (`GET /guilds/{guild_id}/channels`), including categories, text, voice, announcement, forum, media, and Fluxer-native GUILD_LINK (998) channels.',
    inputSchema: {
      guild_id: GuildId,
      type: z
        .number()
        .int()
        .refine((v) => (FLUXER_CHANNEL_TYPE_VALUES as readonly number[]).includes(v))
        .optional()
        .describe('Optional filter by numeric Fluxer channel type'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const all = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.guildChannels(args.guild_id),
      );
      const filtered =
        args.type === undefined ? all : all.filter((c) => Number(c.type) === args.type);
      const channels = filtered.map((c) => ({
        ...c,
        type_name: FLUXER_CHANNEL_TYPE_NAMES[Number(c.type)] ?? `TYPE_${String(c.type)}`,
      }));
      return dualResult({
        text: `Listed ${channels.length} channel(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: channels.length, channels },
      });
    },
  }),

  defineTool({
    name: 'channels_get',
    category: 'channels',
    requiredPermissions: ['VIEW_CHANNEL'],
    description:
      'Fetch complete metadata for a Fluxer channel or thread (`GET /channels/{channel_id}`), including permission_overwrites, forum available_tags, content_warning settings, link URL, and thread_metadata.',
    inputSchema: {
      channel_id: ChannelId,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const ch = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channel(args.channel_id),
      );
      return dualResult({
        text: `Fetched channel **#${String(ch.name ?? args.channel_id)}** (\`channel:${args.channel_id}\`, ${FLUXER_CHANNEL_TYPE_NAMES[Number(ch.type)] ?? String(ch.type)}).`,
        data: {
          ...ch,
          type_name: FLUXER_CHANNEL_TYPE_NAMES[Number(ch.type)] ?? `TYPE_${String(ch.type)}`,
        },
      });
    },
  }),

  defineTool({
    name: 'channels_create_guild_channel',
    category: 'channels',
    requiredPermissions: ['MANAGE_CHANNELS'],
    guildScoped: true,
    description:
      'Create a new channel in a Fluxer guild (`POST /guilds/{guild_id}/channels`). Supports Fluxer types: 0=GUILD_TEXT, 2=GUILD_VOICE, 4=GUILD_CATEGORY, 5=GUILD_ANNOUNCEMENT, 15=GUILD_FORUM, 16=GUILD_MEDIA, and Fluxer-native 998=GUILD_LINK (with `url`). Also supports content warnings, forum tags, voice connection limits, and initial permission overwrites.',
    inputSchema: {
      guild_id: GuildId,
      name: z.string().min(1).max(100),
      type: ChannelTypeCreateSchema.optional().describe('Default: 0 (GUILD_TEXT)'),
      topic: z.string().max(1024).optional(),
      url: z.string().url().max(512).optional().describe('Target URL for Fluxer GUILD_LINK (type 998) channels'),
      parent_id: ChannelId.nullable().optional().describe('Category channel ID'),
      position: z.number().int().min(0).optional(),
      nsfw: z.boolean().optional(),
      content_warning_level: z
        .union([z.literal(CONTENT_WARNING_LEVEL.INHERIT), z.literal(CONTENT_WARNING_LEVEL.CONTENT_WARNING)])
        .optional()
        .describe('Fluxer content warning level (0=INHERIT, 1=CONTENT_WARNING)'),
      content_warning_text: z.string().max(200).nullable().optional(),
      rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
      bitrate: z.number().int().min(8000).max(384000).optional(),
      user_limit: z.number().int().min(0).max(99).optional(),
      voice_connection_limit: z.number().int().min(0).optional(),
      rtc_region: z.string().nullable().optional(),
      rtc_p2p: z.boolean().optional().describe('Fluxer P2P voice toggle'),
      permission_overwrites: z.array(PermissionOverwriteSchema).optional(),
      default_auto_archive_duration: z.union([
        z.literal(THREAD_AUTO_ARCHIVE_DURATIONS[0]),
        z.literal(THREAD_AUTO_ARCHIVE_DURATIONS[1]),
        z.literal(THREAD_AUTO_ARCHIVE_DURATIONS[2]),
        z.literal(THREAD_AUTO_ARCHIVE_DURATIONS[3]),
      ]).optional(),
      default_thread_rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
      available_tags: z.array(ForumTagInputSchema).max(20).optional(),
      default_reaction_emoji: z
        .object({
          emoji_id: EmojiId.nullable().optional(),
          emoji_name: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      default_sort_order: z.union([z.literal(0), z.literal(1)]).optional(),
      default_forum_layout: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'name',
        'type',
        'topic',
        'url',
        'parent_id',
        'position',
        'nsfw',
        'content_warning_level',
        'content_warning_text',
        'rate_limit_per_user',
        'bitrate',
        'user_limit',
        'voice_connection_limit',
        'rtc_region',
        'rtc_p2p',
        'permission_overwrites',
        'default_auto_archive_duration',
        'default_thread_rate_limit_per_user',
        'available_tags',
        'default_reaction_emoji',
        'default_sort_order',
        'default_forum_layout',
      ]);
      const ch = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.guildChannels(args.guild_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Created Fluxer channel **#${String(ch.name ?? args.name)}** (\`channel:${String(ch.id ?? '')}\`, type ${String(ch.type ?? args.type ?? 0)}).`,
        data: ch,
      });
    },
  }),

  defineTool({
    name: 'channels_modify',
    category: 'channels',
    requiredPermissions: ['MANAGE_CHANNELS'],
    description:
      'Update settings on a Fluxer channel or thread (`PATCH /channels/{channel_id}`). Pass only fields to change (name, topic, url, nsfw, slowmode, parent_id, position, content warnings, voice settings, forum settings, or thread archived/locked/auto_archive_duration/applied_tags).',
    inputSchema: {
      channel_id: ChannelId,
      name: z.string().min(1).max(100).optional(),
      type: z.union([z.literal(0), z.literal(5)]).optional().describe('Convert between GUILD_TEXT (0) and GUILD_ANNOUNCEMENT (5)'),
      topic: z.string().max(1024).nullable().optional(),
      url: z.string().url().max(512).optional(),
      position: z.number().int().min(0).optional(),
      parent_id: ChannelId.nullable().optional(),
      nsfw: z.boolean().optional(),
      content_warning_level: z.union([z.literal(0), z.literal(1)]).optional(),
      content_warning_text: z.string().max(200).nullable().optional(),
      rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
      bitrate: z.number().int().min(8000).max(384000).optional(),
      user_limit: z.number().int().min(0).max(99).optional(),
      rtc_region: z.string().nullable().optional(),
      rtc_p2p: z.boolean().optional(),
      permission_overwrites: z.array(PermissionOverwriteSchema).optional(),
      archived: z.boolean().optional().describe('Thread only: archive/unarchive'),
      locked: z.boolean().optional().describe('Thread only: lock/unlock'),
      invitable: z.boolean().optional().describe('Private thread only'),
      auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).optional(),
      default_auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).optional(),
      applied_tags: z.array(TagId).max(5).optional().describe('Forum post applied tag IDs'),
      default_sort_order: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
      default_forum_layout: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'name',
        'type',
        'topic',
        'url',
        'position',
        'parent_id',
        'nsfw',
        'content_warning_level',
        'content_warning_text',
        'rate_limit_per_user',
        'bitrate',
        'user_limit',
        'rtc_region',
        'rtc_p2p',
        'permission_overwrites',
        'archived',
        'locked',
        'invitable',
        'auto_archive_duration',
        'default_auto_archive_duration',
        'applied_tags',
        'default_sort_order',
        'default_forum_layout',
      ]);
      const ch = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.channel(args.channel_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Updated channel \`channel:${args.channel_id}\` (**#${String(ch.name ?? '')}**).`,
        data: ch,
      });
    },
  }),

  defineTool({
    name: 'channels_delete',
    category: 'channels',
    requiredPermissions: ['MANAGE_CHANNELS'],
    confirmRequired: true,
    description:
      'Permanently delete a Fluxer channel or thread (`DELETE /channels/{channel_id}`). DESTRUCTIVE and confirmation-gated.',
    inputSchema: {
      channel_id: ChannelId,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.channel(args.channel_id), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Deleted channel \`channel:${args.channel_id}\`.`,
        data: { deleted: true, channel_id: args.channel_id },
      });
    },
  }),

  defineTool({
    name: 'channels_modify_permissions',
    category: 'channels',
    requiredPermissions: ['MANAGE_ROLES'],
    description:
      'Set or update a permission overwrite for a role (type=0) or member (type=1) on a Fluxer channel (`PUT /channels/{channel_id}/permissions/{overwrite_id}`).',
    inputSchema: {
      channel_id: ChannelId,
      overwrite_id: Snowflake.describe('Role ID or Member user ID'),
      type: z.union([z.literal(0), z.literal(1)]).describe('0 = role, 1 = member'),
      allow: PermissionString.optional().describe('Allowed permission bitfield string (default "0")'),
      deny: PermissionString.optional().describe('Denied permission bitfield string (default "0")'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.put(FluxerRoutes.channelPermission(args.channel_id, args.overwrite_id), {
        body: {
          type: args.type,
          allow: args.allow ?? '0',
          deny: args.deny ?? '0',
        },
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Updated permission overwrite \`${args.overwrite_id}\` on channel \`${args.channel_id}\`.`,
        data: {
          updated: true,
          channel_id: args.channel_id,
          overwrite_id: args.overwrite_id,
          type: args.type,
          allow: args.allow ?? '0',
          deny: args.deny ?? '0',
        },
      });
    },
  }),

  defineTool({
    name: 'channels_delete_permissions',
    category: 'channels',
    requiredPermissions: ['MANAGE_ROLES'],
    confirmRequired: true,
    description:
      'Remove a permission overwrite from a Fluxer channel (`DELETE /channels/{channel_id}/permissions/{overwrite_id}`). Confirmation-gated.',
    inputSchema: {
      channel_id: ChannelId,
      overwrite_id: Snowflake,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.channelPermission(args.channel_id, args.overwrite_id), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Deleted permission overwrite \`${args.overwrite_id}\` from channel \`${args.channel_id}\`.`,
        data: { deleted: true, channel_id: args.channel_id, overwrite_id: args.overwrite_id },
      });
    },
  }),

  defineTool({
    name: 'channels_trigger_typing',
    category: 'channels',
    requiredPermissions: ['SEND_MESSAGES'],
    description: 'Trigger a typing indicator in a Fluxer channel (`POST /channels/{channel_id}/typing`).',
    inputSchema: {
      channel_id: ChannelId,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.post(FluxerRoutes.channelTyping(args.channel_id));
      return dualResult({
        text: `Triggered typing indicator in channel \`${args.channel_id}\`.`,
        data: { triggered: true, channel_id: args.channel_id },
      });
    },
  }),

  defineTool({
    name: 'channels_get_slowmode',
    category: 'channels',
    requiredPermissions: ['VIEW_CHANNEL'],
    description:
      'Fetch Fluxer-native channel slowmode state (`GET /channels/{channel_id}/slowmode`): rate_limit_per_user, retry_after_ms, next_send_allowed_at, and can_bypass.',
    inputSchema: {
      channel_id: ChannelId,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const state = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channelSlowmode(args.channel_id),
      );
      return dualResult({
        text: `Channel \`${args.channel_id}\` slowmode: ${String(state.rate_limit_per_user ?? 0)}s (can_bypass: ${String(state.can_bypass ?? false)}).`,
        data: { channel_id: args.channel_id, ...state },
      });
    },
  }),

  defineTool({
    name: 'channels_follow_announcement',
    category: 'channels',
    requiredPermissions: ['MANAGE_WEBHOOKS'],
    description:
      'Follow a Fluxer announcement channel so published messages crosspost into `webhook_channel_id` (`POST /channels/{channel_id}/followers`).',
    inputSchema: {
      channel_id: ChannelId.describe('Source announcement channel ID'),
      webhook_channel_id: ChannelId.describe('Target text channel ID to receive crossposted announcements'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.channelFollowers(args.channel_id),
        { body: { webhook_channel_id: args.webhook_channel_id } },
      );
      return dualResult({
        text: `Followed announcement channel \`${args.channel_id}\` into \`${args.webhook_channel_id}\`.`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'channels_get_follower_stats',
    category: 'channels',
    requiredPermissions: ['MANAGE_CHANNELS'],
    description:
      'Fetch Fluxer-native follower statistics for an announcement channel (`GET /channels/{channel_id}/follower-stats`).',
    inputSchema: {
      channel_id: ChannelId,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const stats = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channelFollowerStats(args.channel_id),
      );
      return dualResult({
        text: `Fetched follower stats for announcement channel \`${args.channel_id}\`.`,
        data: { channel_id: args.channel_id, ...stats },
      });
    },
  }),

  defineTool({
    name: 'channels_create_forum_tag',
    category: 'channels',
    requiredPermissions: ['MANAGE_CHANNELS'],
    description:
      'Create a new tag on a Fluxer forum or media channel (`POST /channels/{channel_id}/tags`).',
    inputSchema: {
      channel_id: ChannelId,
      name: z.string().min(1).max(50),
      moderated: z.boolean().optional().describe('Restrict tag application to moderators (MANAGE_THREADS)'),
      emoji_id: EmojiId.nullable().optional(),
      emoji_name: z.string().max(64).nullable().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['name', 'moderated', 'emoji_id', 'emoji_name']);
      const res = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.channelTags(args.channel_id),
        { body },
      );
      return dualResult({
        text: `Created forum tag **${args.name}** on channel \`${args.channel_id}\`.`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'channels_update_forum_tag',
    category: 'channels',
    requiredPermissions: ['MANAGE_CHANNELS'],
    description:
      'Update an existing tag on a Fluxer forum or media channel (`PUT /channels/{channel_id}/tags/{tag_id}`).',
    inputSchema: {
      channel_id: ChannelId,
      tag_id: TagId,
      name: z.string().min(1).max(50),
      moderated: z.boolean().optional(),
      emoji_id: EmojiId.nullable().optional(),
      emoji_name: z.string().max(64).nullable().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['name', 'moderated', 'emoji_id', 'emoji_name']);
      const res = await ctx.rest.put<Record<string, unknown>>(
        FluxerRoutes.channelTag(args.channel_id, args.tag_id),
        { body },
      );
      return dualResult({
        text: `Updated forum tag \`${args.tag_id}\` on channel \`${args.channel_id}\`.`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'channels_delete_forum_tag',
    category: 'channels',
    requiredPermissions: ['MANAGE_CHANNELS'],
    confirmRequired: true,
    description:
      'Delete a tag from a Fluxer forum or media channel (`DELETE /channels/{channel_id}/tags/{tag_id}`). Confirmation-gated.',
    inputSchema: {
      channel_id: ChannelId,
      tag_id: TagId,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.channelTag(args.channel_id, args.tag_id));
      return dualResult({
        text: `Deleted forum tag \`${args.tag_id}\` from channel \`${args.channel_id}\`.`,
        data: { deleted: true, channel_id: args.channel_id, tag_id: args.tag_id },
      });
    },
  }),

  defineTool({
    name: 'channels_get_forum_post_data',
    category: 'channels',
    requiredPermissions: ['VIEW_CHANNEL'],
    description:
      'Fetch Fluxer-native forum post metadata (starter messages & counts) for up to 50 thread IDs (`POST /channels/{channel_id}/post-data`).',
    inputSchema: {
      channel_id: ChannelId.describe('Forum or media channel ID'),
      thread_ids: z.array(ChannelId).min(1).max(50).describe('Forum post thread IDs to fetch'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.channelPostData(args.channel_id),
        { body: { thread_ids: args.thread_ids } },
      );
      return dualResult({
        text: `Fetched forum post data for ${args.thread_ids.length} thread(s) in \`${args.channel_id}\`.`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'channels_forum_create_thread',
    category: 'channels',
    requiredPermissions: ['SEND_MESSAGES'],
    description:
      'Start a standalone thread in a text/announcement channel or create a new post in a forum/media channel (`POST /channels/{channel_id}/threads`).',
    inputSchema: {
      channel_id: ChannelId,
      name: z.string().min(1).max(100),
      type: z.union([z.literal(10), z.literal(11), z.literal(12)]).optional().describe('Thread type (11=PUBLIC_THREAD, 12=PRIVATE_THREAD)'),
      auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).optional(),
      rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
      invitable: z.boolean().optional(),
      applied_tags: z.array(TagId).max(5).optional(),
      message: z
        .object({
          content: z.string().max(4000).optional(),
          embeds: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
        })
        .optional()
        .describe('Initial starter message (required for forum/media posts)'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'name',
        'type',
        'auto_archive_duration',
        'rate_limit_per_user',
        'invitable',
        'applied_tags',
        'message',
      ]);
      const thread = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.channelThreads(args.channel_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Created thread **${String(thread.name ?? args.name)}** (\`channel:${String(thread.id ?? '')}\`).`,
        data: thread,
      });
    },
  }),

  defineTool({
    name: 'channels_list_active_threads_guild',
    category: 'channels',
    guildScoped: true,
    description: 'List all active threads in a Fluxer guild (`GET /guilds/{guild_id}/threads/active`).',
    inputSchema: {
      guild_id: GuildId,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.guildActiveThreads(args.guild_id),
      );
      const threads = Array.isArray(res.threads) ? res.threads : [];
      return dualResult({
        text: `Found ${threads.length} active thread(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: threads.length, ...res },
      });
    },
  }),

  defineTool({
    name: 'channels_list_public_archived_threads',
    category: 'channels',
    requiredPermissions: ['READ_MESSAGE_HISTORY'],
    description:
      'List archived public threads in a Fluxer channel (`GET /channels/{channel_id}/threads/archived/public`).',
    inputSchema: {
      channel_id: ChannelId,
      before: z.string().optional().describe('ISO timestamp pagination cursor'),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channelArchivedPublicThreads(args.channel_id),
        { query: { before: args.before, limit: args.limit } },
      );
      const threads = Array.isArray(res.threads) ? res.threads : [];
      return dualResult({
        text: `Found ${threads.length} archived public thread(s) in \`${args.channel_id}\`.`,
        data: { channel_id: args.channel_id, count: threads.length, ...res },
      });
    },
  }),

  defineTool({
    name: 'channels_list_private_archived_threads',
    category: 'channels',
    requiredPermissions: ['READ_MESSAGE_HISTORY', 'MANAGE_THREADS'],
    description:
      'List archived private threads in a Fluxer channel (`GET /channels/{channel_id}/threads/archived/private`).',
    inputSchema: {
      channel_id: ChannelId,
      before: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channelArchivedPrivateThreads(args.channel_id),
        { query: { before: args.before, limit: args.limit } },
      );
      const threads = Array.isArray(res.threads) ? res.threads : [];
      return dualResult({
        text: `Found ${threads.length} archived private thread(s) in \`${args.channel_id}\`.`,
        data: { channel_id: args.channel_id, count: threads.length, ...res },
      });
    },
  }),

  defineTool({
    name: 'channels_list_joined_private_archived_threads',
    category: 'channels',
    requiredPermissions: ['READ_MESSAGE_HISTORY'],
    description:
      'List archived private threads the bot has joined (`GET /channels/{channel_id}/users/@me/threads/archived/private`).',
    inputSchema: {
      channel_id: ChannelId,
      before: Snowflake.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channelJoinedArchivedPrivateThreads(args.channel_id),
        { query: { before: args.before, limit: args.limit } },
      );
      const threads = Array.isArray(res.threads) ? res.threads : [];
      return dualResult({
        text: `Found ${threads.length} joined archived private thread(s) in \`${args.channel_id}\`.`,
        data: { channel_id: args.channel_id, count: threads.length, ...res },
      });
    },
  }),

  defineTool({
    name: 'channels_search_threads',
    category: 'channels',
    requiredPermissions: ['VIEW_CHANNEL'],
    description:
      'Search threads and forum posts in a Fluxer channel (`GET /channels/{channel_id}/threads/search`) by name, tags, archived state, and sort order.',
    inputSchema: {
      channel_id: ChannelId,
      name: z.string().max(100).optional().describe('Thread name query'),
      tag: z.array(TagId).max(10).optional().describe('Filter by forum tag IDs'),
      tag_setting: z.enum(['match_some', 'match_all']).optional(),
      archived: z.boolean().optional(),
      sort_by: z.enum(['last_message_time', 'archive_time', 'creation_time']).optional(),
      sort_order: z.enum(['asc', 'desc']).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const params = new URLSearchParams();
      if (args.name !== undefined) params.set('name', args.name);
      if (args.tag_setting !== undefined) params.set('tag_setting', args.tag_setting);
      if (args.archived !== undefined) params.set('archived', String(args.archived));
      if (args.sort_by !== undefined) params.set('sort_by', args.sort_by);
      if (args.sort_order !== undefined) params.set('sort_order', args.sort_order);
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      if (args.offset !== undefined) params.set('offset', String(args.offset));
      for (const t of args.tag ?? []) params.append('tag', t);

      const res = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channelThreadSearch(args.channel_id),
        { query: params },
      );
      const threads = Array.isArray(res.threads) ? res.threads : [];
      return dualResult({
        text: `Thread search in \`${args.channel_id}\` returned ${threads.length} result(s).`,
        data: { channel_id: args.channel_id, count: threads.length, ...res },
      });
    },
  }),
];
