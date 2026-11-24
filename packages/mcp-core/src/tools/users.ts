import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  ChannelId,
  defineTool,
  dualResult,
  type FluxerTool,
  GuildId,
  pickDefined,
  Snowflake,
  UserId,
  wrapUntrusted,
} from './_lib/types.js';

export const userTools: readonly FluxerTool[] = [
  defineTool({
    name: 'users_get_current',
    category: 'users',
    description: 'Fetch the currently authenticated Fluxer bot user (`GET /users/@me`).',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const user = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.currentUser());
      return dualResult({
        text: `Current Fluxer bot user: **${String(user.username ?? '')}** (\`user:${String(user.id ?? '')}\`).`,
        data: user,
      });
    },
  }),

  defineTool({
    name: 'users_get',
    category: 'users',
    description:
      'Fetch public information for a Fluxer user by snowflake ID (`GET /users/{user_id}`).',
    inputSchema: {
      user_id: UserId,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const user = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.user(args.user_id));
      return dualResult({
        text: `User \`${args.user_id}\`: ${wrapUntrusted(String(user.username ?? ''), 'profile')}`,
        data: user,
      });
    },
  }),

  defineTool({
    name: 'users_get_profile',
    category: 'users',
    description:
      'Fetch extended Fluxer user profile (`GET /users/{target_id}/profile`), optionally scoped to a guild to include per-guild profile overrides, bio, pronouns, and badges.',
    inputSchema: {
      user_id: UserId,
      guild_id: GuildId.optional().describe('Optional guild context for per-guild profile details'),
      with_mutual_guilds: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const profile = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.userProfile(args.user_id),
        {
          query: {
            guild_id: args.guild_id,
            with_mutual_guilds: args.with_mutual_guilds,
          },
        },
      );
      return dualResult({
        text: `Fetched Fluxer profile for user \`${args.user_id}\`.`,
        data: profile,
      });
    },
  }),

  defineTool({
    name: 'users_modify_current',
    category: 'users',
    description:
      'Update the current Fluxer bot profile (`PATCH /users/@me`): username, global_name, bio, pronouns, accent_color, avatar (data URI or null), or banner.',
    inputSchema: {
      username: z.string().min(1).max(32).optional(),
      global_name: z.string().max(32).nullable().optional(),
      bio: z.string().max(190).nullable().optional(),
      pronouns: z.string().max(40).nullable().optional(),
      accent_color: z.number().int().min(0).max(0xffffff).nullable().optional(),
      avatar: z.string().nullable().optional().describe('Data URI image string or null to clear'),
      banner: z.string().nullable().optional().describe('Data URI image string or null to clear'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'username',
        'global_name',
        'bio',
        'pronouns',
        'accent_color',
        'avatar',
        'banner',
      ]);
      const updated = await ctx.rest.patch<Record<string, unknown>>(FluxerRoutes.currentUser(), {
        body,
      });
      return dualResult({
        text: `Updated current Fluxer bot profile (\`user:${String(updated.id ?? '')}\`).`,
        data: updated,
      });
    },
  }),

  defineTool({
    name: 'users_list_current_user_guilds',
    category: 'users',
    description:
      'List guilds the authenticated Fluxer bot belongs to (`GET /users/@me/guilds`), with optional approximate member/presence counts and pagination.',
    inputSchema: {
      before: Snowflake.optional(),
      after: Snowflake.optional(),
      limit: z.number().int().min(1).max(200).optional(),
      with_counts: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const guilds = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.currentUserGuilds(),
        {
          query: {
            before: args.before,
            after: args.after,
            limit: args.limit ?? 200,
            with_counts: args.with_counts,
          },
        },
      );
      return dualResult({
        text: `Bot belongs to ${guilds.length} Fluxer guild(s).`,
        data: { count: guilds.length, guilds },
      });
    },
  }),

  defineTool({
    name: 'users_leave_guild',
    category: 'users',
    guildScoped: true,
    confirmRequired: true,
    description:
      'Remove the bot from a Fluxer guild (`DELETE /users/@me/guilds/{guild_id}`). Destructive & confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.currentUserGuild(args.guild_id));
      return dualResult({
        text: `Left Fluxer guild \`${args.guild_id}\`.`,
        data: { left: true, guild_id: args.guild_id },
      });
    },
  }),

  defineTool({
    name: 'users_create_dm',
    category: 'users',
    description:
      'Open or retrieve a direct message channel with a Fluxer user (`POST /users/@me/channels`). Subject to MCP_DM_CONSENT_MODE.',
    inputSchema: {
      recipient_id: UserId.describe('Target Fluxer user snowflake ID'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const ch = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.currentUserChannels(), {
        body: { recipient_id: args.recipient_id },
      });
      return dualResult({
        text: `Opened DM channel \`channel:${String(ch.id ?? '')}\` with user \`${args.recipient_id}\`.`,
        data: ch,
      });
    },
  }),

  defineTool({
    name: 'users_list_dm_channels',
    category: 'users',
    description:
      'List private/DM channels accessible to the current Fluxer bot (`GET /users/@me/channels`).',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const channels = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.currentUserChannels(),
      );
      return dualResult({
        text: `Found ${channels.length} private channel(s).`,
        data: { count: channels.length, channels },
      });
    },
  }),

  defineTool({
    name: 'users_pin_dm_channel',
    category: 'users',
    description:
      'Fluxer-native: pin a direct message channel in the current user DM list (`PUT /users/@me/channels/{channel_id}/pin`).',
    inputSchema: {
      channel_id: ChannelId.describe('DM channel snowflake ID to pin'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.put(FluxerRoutes.currentUserChannelPin(args.channel_id));
      return dualResult({
        text: `Pinned DM channel \`${args.channel_id}\`.`,
        data: { pinned: true, channel_id: args.channel_id },
      });
    },
  }),

  defineTool({
    name: 'users_unpin_dm_channel',
    category: 'users',
    description:
      'Fluxer-native: unpin a direct message channel in the current user DM list (`DELETE /users/@me/channels/{channel_id}/pin`).',
    inputSchema: {
      channel_id: ChannelId.describe('DM channel snowflake ID to unpin'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.currentUserChannelPin(args.channel_id));
      return dualResult({
        text: `Unpinned DM channel \`${args.channel_id}\`.`,
        data: { pinned: false, channel_id: args.channel_id },
      });
    },
  }),

  defineTool({
    name: 'users_check_tag',
    category: 'users',
    description:
      'Fluxer-native: check whether a Fluxer username + 4-digit discriminator tag is available (`GET /users/check-tag`).',
    inputSchema: {
      username: z.string().min(1).max(32).describe('Username to check'),
      discriminator: z
        .string()
        .regex(/^\d{4}$/, 'Discriminator must be a 4-digit string (e.g. "0001")')
        .describe('4-digit discriminator'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.userCheckTag(), {
        query: { username: args.username, discriminator: args.discriminator },
      });
      return dualResult({
        text: `Checked Fluxer tag \`${args.username}#${args.discriminator}\`: ${res.taken === true ? 'taken' : 'available'}.`,
        data: { username: args.username, discriminator: args.discriminator, ...res },
      });
    },
  }),
];
