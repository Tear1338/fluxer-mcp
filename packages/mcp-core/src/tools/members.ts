import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  AuditReasonSchema,
  ChannelId,
  type FluxerTool,
  GuildId,
  RoleId,
  Snowflake,
  UserId,
  defineTool,
  dualResult,
  pickDefined,
} from './_lib/types.js';

export const memberTools: readonly FluxerTool[] = [
  defineTool({
    name: 'members_list',
    category: 'members',
    guildScoped: true,
    description: 'List members in a Fluxer guild (`GET /guilds/{guild_id}/members`) with cursor pagination.',
    inputSchema: {
      guild_id: GuildId,
      limit: z.number().int().min(1).max(1000).optional().describe('Max members per page (1-1000, default 100)'),
      after: Snowflake.optional().describe('Return members with user ID greater than this cursor'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const members = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.guildMembers(args.guild_id),
        { query: { limit: args.limit ?? 100, after: args.after } },
      );
      return dualResult({
        text: `Listed ${members.length} member(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: members.length, members },
      });
    },
  }),

  defineTool({
    name: 'members_get',
    category: 'members',
    guildScoped: true,
    description: 'Fetch a single member record in a Fluxer guild (`GET /guilds/{guild_id}/members/{user_id}`).',
    inputSchema: { guild_id: GuildId, user_id: UserId },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const member = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.guildMember(args.guild_id, args.user_id),
      );
      return dualResult({
        text: `Fetched member \`${args.user_id}\` in guild \`${args.guild_id}\`.`,
        data: member,
      });
    },
  }),

  defineTool({
    name: 'members_search',
    category: 'members',
    guildScoped: true,
    description:
      'Search members in a Fluxer guild using Fluxer\'s native `POST /guilds/{guild_id}/members-search` endpoint. Supports text query, role_ids, is_bot, join_source_type, source_invite_code, join/account date ranges, and sorting.',
    inputSchema: {
      guild_id: GuildId,
      query: z.string().max(100).optional().describe('Username or nickname query'),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      role_ids: z.array(RoleId).max(50).optional(),
      is_bot: z.boolean().optional(),
      join_source_type: z.number().int().min(0).max(6).optional(),
      source_invite_code: z.string().max(64).optional(),
      joined_at_gte: z.string().optional(),
      joined_at_lte: z.string().optional(),
      user_created_at_gte: z.string().optional(),
      user_created_at_lte: z.string().optional(),
      sort_by: z.string().optional(),
      sort_order: z.enum(['asc', 'desc']).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'query',
        'limit',
        'offset',
        'role_ids',
        'is_bot',
        'join_source_type',
        'source_invite_code',
        'joined_at_gte',
        'joined_at_lte',
        'user_created_at_gte',
        'user_created_at_lte',
        'sort_by',
        'sort_order',
      ]);
      const res = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.guildMembersSearch(args.guild_id),
        { body },
      );
      const count = Array.isArray(res.members) ? res.members.length : 0;
      return dualResult({
        text: `Member search in guild \`${args.guild_id}\` returned ${count} result(s) (total: ${String(res.total_result_count ?? count)}).`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'members_get_current_user',
    category: 'members',
    guildScoped: true,
    description: 'Fetch the current bot\'s own member record in a Fluxer guild (`GET /guilds/{guild_id}/members/@me`).',
    inputSchema: { guild_id: GuildId },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const me = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.guildMemberMe(args.guild_id),
      );
      return dualResult({
        text: `Fetched current bot member record in guild \`${args.guild_id}\`.`,
        data: me,
      });
    },
  }),

  defineTool({
    name: 'members_modify',
    category: 'members',
    requiredPermissions: ['MANAGE_NICKNAMES'],
    guildScoped: true,
    description:
      'Modify a Fluxer guild member (`PATCH /guilds/{guild_id}/members/{user_id}`): nickname, roles, voice mute/deaf/channel_id, timeout (`communication_disabled_until` + Fluxer-native `timeout_reason`), or per-guild profile fields.',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      nick: z.string().max(32).nullable().optional(),
      roles: z.array(RoleId).optional(),
      mute: z.boolean().optional(),
      deaf: z.boolean().optional(),
      channel_id: ChannelId.nullable().optional().describe('Move member to voice channel ID or null to disconnect'),
      communication_disabled_until: z.string().nullable().optional().describe('ISO-8601 timeout expiry timestamp or null to clear'),
      timeout_reason: z.string().max(512).nullable().optional().describe('Fluxer-native timeout reason'),
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
        'nick',
        'roles',
        'mute',
        'deaf',
        'channel_id',
        'communication_disabled_until',
        'timeout_reason',
      ]);
      const updated = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildMember(args.guild_id, args.user_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Updated member \`${args.user_id}\` in guild \`${args.guild_id}\`.`,
        data: updated,
      });
    },
  }),

  defineTool({
    name: 'members_modify_current',
    category: 'members',
    requiredPermissions: ['CHANGE_NICKNAME'],
    guildScoped: true,
    description:
      'Update the bot\'s own per-guild profile in a Fluxer guild (`PATCH /guilds/{guild_id}/members/@me`): nick, bio, pronouns, accent_color, avatar, banner.',
    inputSchema: {
      guild_id: GuildId,
      nick: z.string().max(32).nullable().optional(),
      bio: z.string().max(190).nullable().optional(),
      pronouns: z.string().max(40).nullable().optional(),
      accent_color: z.number().int().min(0).max(0xffffff).nullable().optional(),
      avatar: z.string().nullable().optional(),
      banner: z.string().nullable().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['nick', 'bio', 'pronouns', 'accent_color', 'avatar', 'banner']);
      const updated = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildMemberMe(args.guild_id),
        { body },
      );
      return dualResult({
        text: `Updated bot guild profile in guild \`${args.guild_id}\`.`,
        data: updated,
      });
    },
  }),

  defineTool({
    name: 'members_add_role',
    category: 'members',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description: 'Assign a role to a Fluxer guild member (`PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id}`).',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      role_id: RoleId,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.put(FluxerRoutes.guildMemberRole(args.guild_id, args.user_id, args.role_id), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Added role \`${args.role_id}\` to user \`${args.user_id}\` in guild \`${args.guild_id}\`.`,
        data: { assigned: true, guild_id: args.guild_id, user_id: args.user_id, role_id: args.role_id },
      });
    },
  }),

  defineTool({
    name: 'members_remove_role',
    category: 'members',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description: 'Remove a role from a Fluxer guild member (`DELETE /guilds/{guild_id}/members/{user_id}/roles/{role_id}`).',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      role_id: RoleId,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(
        FluxerRoutes.guildMemberRole(args.guild_id, args.user_id, args.role_id),
        { ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Removed role \`${args.role_id}\` from user \`${args.user_id}\` in guild \`${args.guild_id}\`.`,
        data: { removed: true, guild_id: args.guild_id, user_id: args.user_id, role_id: args.role_id },
      });
    },
  }),

  defineTool({
    name: 'members_bulk_add_role',
    category: 'members',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description:
      'Assign a role to up to 50 Fluxer guild members in one coordinated batch with per-user status reporting.',
    inputSchema: {
      guild_id: GuildId,
      role_id: RoleId,
      user_ids: z.array(UserId).min(1).max(50),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const succeeded: string[] = [];
      const failed: Array<{ user_id: string; error: string }> = [];
      for (const userId of args.user_ids) {
        try {
          await ctx.rest.put(FluxerRoutes.guildMemberRole(args.guild_id, userId, args.role_id), {
            ...(args.audit_reason ? { reason: args.audit_reason } : {}),
          });
          succeeded.push(userId);
        } catch (err) {
          failed.push({ user_id: userId, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return dualResult({
        text: `Bulk-assigned role \`${args.role_id}\`: ${succeeded.length} succeeded, ${failed.length} failed.`,
        data: { guild_id: args.guild_id, role_id: args.role_id, succeeded, failed },
      });
    },
  }),

  defineTool({
    name: 'members_bulk_remove_role',
    category: 'members',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description:
      'Remove a role from up to 50 Fluxer guild members in one coordinated batch with per-user status reporting.',
    inputSchema: {
      guild_id: GuildId,
      role_id: RoleId,
      user_ids: z.array(UserId).min(1).max(50),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const succeeded: string[] = [];
      const failed: Array<{ user_id: string; error: string }> = [];
      for (const userId of args.user_ids) {
        try {
          await ctx.rest.delete(FluxerRoutes.guildMemberRole(args.guild_id, userId, args.role_id), {
            ...(args.audit_reason ? { reason: args.audit_reason } : {}),
          });
          succeeded.push(userId);
        } catch (err) {
          failed.push({ user_id: userId, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return dualResult({
        text: `Bulk-removed role \`${args.role_id}\`: ${succeeded.length} succeeded, ${failed.length} failed.`,
        data: { guild_id: args.guild_id, role_id: args.role_id, succeeded, failed },
      });
    },
  }),

  defineTool({
    name: 'members_timeout',
    category: 'members',
    requiredPermissions: ['MODERATE_MEMBERS'],
    guildScoped: true,
    description:
      'Timeout (mute communication) or clear timeout for a Fluxer member using `PATCH /guilds/{guild_id}/members/{user_id}` with Fluxer-native `timeout_reason`. Pass `duration_seconds: 0` to lift an active timeout.',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      duration_seconds: z
        .number()
        .int()
        .min(0)
        .max(2_419_200)
        .describe('Timeout duration in seconds (0 = clear timeout, max 28 days = 2419200)'),
      timeout_reason: z.string().max(512).optional().describe('Fluxer-native timeout reason shown to moderators'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const until =
        args.duration_seconds === 0
          ? null
          : new Date(Date.now() + args.duration_seconds * 1000).toISOString();
      const body: Record<string, unknown> = {
        communication_disabled_until: until,
        ...(args.timeout_reason !== undefined ? { timeout_reason: args.timeout_reason } : {}),
      };
      const updated = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildMember(args.guild_id, args.user_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text:
          until === null
            ? `Cleared timeout for user \`${args.user_id}\` in guild \`${args.guild_id}\`.`
            : `Timed out user \`${args.user_id}\` until ${until} (${args.duration_seconds}s).`,
        data: { guild_id: args.guild_id, user_id: args.user_id, communication_disabled_until: until, member: updated },
      });
    },
  }),

  defineTool({
    name: 'members_voice_moderate',
    category: 'members',
    requiredPermissions: ['MUTE_MEMBERS'],
    guildScoped: true,
    description:
      'Moderate a member in Fluxer voice channels: server-mute, server-deafen, move to another voice channel, or disconnect (`disconnect: true` sends `channel_id: null`).',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      mute: z.boolean().optional(),
      deaf: z.boolean().optional(),
      channel_id: ChannelId.optional().describe('Move member to this voice channel ID'),
      disconnect: z.boolean().optional().describe('Set true to disconnect member from voice'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = pickDefined(args, ['mute', 'deaf']);
      if (args.disconnect) body.channel_id = null;
      else if (args.channel_id !== undefined) body.channel_id = args.channel_id;
      const updated = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildMember(args.guild_id, args.user_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Applied voice moderation to user \`${args.user_id}\` in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, user_id: args.user_id, applied: body, member: updated },
      });
    },
  }),

  defineTool({
    name: 'members_kick',
    category: 'members',
    requiredPermissions: ['KICK_MEMBERS'],
    guildScoped: true,
    confirmRequired: true,
    description: 'Kick a member from a Fluxer guild (`DELETE /guilds/{guild_id}/members/{user_id}`). Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.guildMember(args.guild_id, args.user_id), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Kicked user \`${args.user_id}\` from guild \`${args.guild_id}\`.`,
        data: { kicked: true, guild_id: args.guild_id, user_id: args.user_id },
      });
    },
  }),

  defineTool({
    name: 'members_ban',
    category: 'members',
    requiredPermissions: ['BAN_MEMBERS'],
    guildScoped: true,
    confirmRequired: true,
    description:
      'Ban a user from a Fluxer guild (`PUT /guilds/{guild_id}/bans/{user_id}`). Supports Fluxer-native temporary bans via `ban_duration_seconds`, message purge via `delete_message_seconds` (0..604800), and `reason`. Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      delete_message_seconds: z.number().int().min(0).max(604800).optional(),
      ban_duration_seconds: z
        .number()
        .int()
        .min(60)
        .optional()
        .describe('Fluxer-native temporary ban duration in seconds (omit for permanent ban)'),
      reason: z.string().max(512).optional().describe('Ban reason stored in Fluxer ban record'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'delete_message_seconds',
        'ban_duration_seconds',
        'reason',
      ]);
      if (body.reason === undefined && args.audit_reason) {
        body.reason = args.audit_reason;
      }
      const reason = args.audit_reason ?? args.reason;
      await ctx.rest.put(FluxerRoutes.guildBan(args.guild_id, args.user_id), {
        body,
        ...(reason !== undefined ? { reason } : {}),
      });
      return dualResult({
        text: `Banned user \`${args.user_id}\` from guild \`${args.guild_id}\`${args.ban_duration_seconds ? ` for ${args.ban_duration_seconds}s` : ' permanently'}.`,
        data: {
          banned: true,
          guild_id: args.guild_id,
          user_id: args.user_id,
          ban_duration_seconds: args.ban_duration_seconds ?? null,
        },
      });
    },
  }),

  defineTool({
    name: 'members_bulk_ban',
    category: 'members',
    requiredPermissions: ['BAN_MEMBERS'],
    guildScoped: true,
    confirmRequired: true,
    description:
      'Ban up to 50 users from a Fluxer guild in one coordinated batch (`PUT /guilds/{guild_id}/bans/{user_id}` per user). Supports Fluxer-native `ban_duration_seconds` and `delete_message_seconds`. Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      user_ids: z.array(UserId).min(1).max(50),
      delete_message_seconds: z.number().int().min(0).max(604800).optional(),
      ban_duration_seconds: z.number().int().min(60).optional(),
      reason: z.string().max(512).optional(),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const banned: string[] = [];
      const failed: Array<{ user_id: string; error: string }> = [];
      const body = pickDefined(args, ['delete_message_seconds', 'ban_duration_seconds', 'reason']);
      if (body.reason === undefined && args.audit_reason) body.reason = args.audit_reason;
      const reason = args.audit_reason ?? args.reason;
      for (const userId of args.user_ids) {
        try {
          await ctx.rest.put(FluxerRoutes.guildBan(args.guild_id, userId), {
            body,
            ...(reason !== undefined ? { reason } : {}),
          });
          banned.push(userId);
        } catch (err) {
          failed.push({ user_id: userId, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return dualResult({
        text: `Bulk-banned ${banned.length}/${args.user_ids.length} user(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, banned_users: banned, failed_users: failed },
      });
    },
  }),

  defineTool({
    name: 'members_unban',
    category: 'members',
    requiredPermissions: ['BAN_MEMBERS'],
    guildScoped: true,
    description: 'Unban a user from a Fluxer guild (`DELETE /guilds/{guild_id}/bans/{user_id}`).',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.guildBan(args.guild_id, args.user_id), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Unbanned user \`${args.user_id}\` from guild \`${args.guild_id}\`.`,
        data: { unbanned: true, guild_id: args.guild_id, user_id: args.user_id },
      });
    },
  }),

  defineTool({
    name: 'members_list_bans',
    category: 'members',
    requiredPermissions: ['BAN_MEMBERS'],
    guildScoped: true,
    description:
      'List all banned users in a Fluxer guild (`GET /guilds/{guild_id}/bans`), including Fluxer-native `moderator_id`, `banned_at`, and `expires_at` for temporary bans.',
    inputSchema: { guild_id: GuildId },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const bans = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.guildBans(args.guild_id),
      );
      return dualResult({
        text: `Found ${bans.length} ban(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: bans.length, bans },
      });
    },
  }),

  defineTool({
    name: 'members_get_ban',
    category: 'members',
    requiredPermissions: ['BAN_MEMBERS'],
    guildScoped: true,
    description: 'Inspect a specific ban record in a Fluxer guild (`GET /guilds/{guild_id}/bans/{user_id}`).',
    inputSchema: { guild_id: GuildId, user_id: UserId },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const ban = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.guildBan(args.guild_id, args.user_id),
      );
      return dualResult({
        text: `Fetched ban record for user \`${args.user_id}\` in guild \`${args.guild_id}\`.`,
        data: ban,
      });
    },
  }),
];
