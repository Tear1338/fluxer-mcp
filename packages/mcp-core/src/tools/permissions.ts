import { z } from 'zod';
import {
  FLUXER_CHANNEL_TYPE_NAMES,
  FLUXER_PERMISSIONS,
  FluxerRoutes,
} from '../fluxer/constants.js';
import {
  type ChannelLike,
  compareRolesDesc,
  evaluateChannelPermissions,
  hasPermissionBit,
  isThreadChannelType,
  type RoleLike,
} from '../fluxer/permissions.js';
import {
  ChannelId,
  defineTool,
  dualResult,
  type FluxerTool,
  GuildId,
  UserId,
} from './_lib/types.js';

export const permissionTools: readonly FluxerTool[] = [
  defineTool({
    name: 'permissions_audit_channel',
    category: 'permissions',
    guildScoped: true,
    description:
      "Audit which roles in a Fluxer guild can view, send messages in, or manage a given channel or thread (evaluating each role independently with @everyone and channel/parent overwrites using Fluxer's exact permission bits).",
    inputSchema: {
      guild_id: GuildId,
      channel_id: ChannelId,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const [roles, channel] = await Promise.all([
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<ChannelLike>(FluxerRoutes.channel(args.channel_id)),
      ]);
      const isThread = isThreadChannelType(channel.type);
      const sourceChannel =
        isThread && channel.parent_id
          ? await ctx.rest.get<ChannelLike>(FluxerRoutes.channel(channel.parent_id))
          : channel;
      const overwrites = sourceChannel.permission_overwrites ?? [];

      const matrix = [...roles].sort(compareRolesDesc).map((role) => {
        const evalRes = evaluateChannelPermissions({
          guildId: args.guild_id,
          memberId: `role-probe-${role.id}`,
          memberRoleIds: role.id === args.guild_id ? [] : [role.id],
          roles,
          overwrites,
        });
        const canView = hasPermissionBit(evalRes.effectiveBits, 'VIEW_CHANNEL');
        const canSend =
          canView &&
          hasPermissionBit(
            evalRes.effectiveBits,
            isThread ? 'SEND_MESSAGES_IN_THREADS' : 'SEND_MESSAGES',
          );
        const canManage =
          canView &&
          hasPermissionBit(evalRes.effectiveBits, isThread ? 'MANAGE_THREADS' : 'MANAGE_CHANNELS');
        return {
          role_id: role.id,
          role_name: role.name,
          position: role.position,
          administrator: evalRes.isAdministrator,
          view_channel: canView,
          send_messages: canSend,
          manage_channel: canManage,
        };
      });

      const memberOverwrites = overwrites.filter((o) => o.type === 1).length;
      return dualResult({
        text: `Audited ${matrix.length} role(s) on channel \`${args.channel_id}\` (${matrix.filter((r) => r.view_channel).length} can view, ${matrix.filter((r) => r.send_messages).length} can send, ${memberOverwrites} member-specific overwrite(s)).`,
        data: {
          guild_id: args.guild_id,
          channel_id: args.channel_id,
          permission_source_channel_id: sourceChannel.id,
          is_thread: isThread,
          member_overwrite_count: memberOverwrites,
          roles: matrix,
        },
      });
    },
  }),

  defineTool({
    name: 'permissions_explain',
    category: 'permissions',
    guildScoped: true,
    description:
      "Compute and explain a specific member's effective Fluxer permissions in a channel or thread, with a complete step-by-step trace (owner, @everyone, roles, ADMINISTRATOR bypass, channel overwrites, and active timeout restrictions).",
    inputSchema: {
      guild_id: GuildId,
      channel_id: ChannelId,
      user_id: UserId,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const [guild, roles, member, channel] = await Promise.all([
        ctx.rest.get<{ owner_id?: string }>(FluxerRoutes.guild(args.guild_id)),
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<{ roles?: string[]; communication_disabled_until?: string | null }>(
          FluxerRoutes.guildMember(args.guild_id, args.user_id),
        ),
        ctx.rest.get<ChannelLike>(FluxerRoutes.channel(args.channel_id)),
      ]);
      const sourceChannel =
        isThreadChannelType(channel.type) && channel.parent_id
          ? await ctx.rest.get<ChannelLike>(FluxerRoutes.channel(channel.parent_id))
          : channel;

      const evalRes = evaluateChannelPermissions({
        guildId: args.guild_id,
        ...(guild.owner_id ? { ownerId: guild.owner_id } : {}),
        memberId: args.user_id,
        memberRoleIds: member.roles ?? [],
        roles,
        ...(sourceChannel.permission_overwrites
          ? { overwrites: sourceChannel.permission_overwrites }
          : {}),
        ...(member.communication_disabled_until !== undefined
          ? { communicationDisabledUntil: member.communication_disabled_until }
          : {}),
      });

      return dualResult({
        text: `User \`${args.user_id}\` holds ${evalRes.permissions.length} effective permission(s) in \`${args.channel_id}\` (owner=${evalRes.isOwner}, admin=${evalRes.isAdministrator}, timed_out=${evalRes.timedOut}).`,
        data: {
          guild_id: args.guild_id,
          channel_id: args.channel_id,
          user_id: args.user_id,
          effective_bitfield: evalRes.effectiveBits.toString(),
          is_owner: evalRes.isOwner,
          is_administrator: evalRes.isAdministrator,
          timed_out: evalRes.timedOut,
          permissions: evalRes.permissions,
          trace: evalRes.trace,
        },
      });
    },
  }),

  defineTool({
    name: 'permissions_member_access_report',
    category: 'permissions',
    guildScoped: true,
    description:
      'Generate a guild-wide access matrix showing every channel a member can view, send in, connect/speak in, or moderate across an entire Fluxer community.',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId,
      only_visible: z
        .boolean()
        .optional()
        .describe('Return only channels the member can view (default false)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const [guild, roles, member, channels] = await Promise.all([
        ctx.rest.get<{ owner_id?: string }>(FluxerRoutes.guild(args.guild_id)),
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<{ roles?: string[]; communication_disabled_until?: string | null }>(
          FluxerRoutes.guildMember(args.guild_id, args.user_id),
        ),
        ctx.rest.get<ChannelLike[]>(FluxerRoutes.guildChannels(args.guild_id)),
      ]);

      const entries = channels.map((ch) => {
        const res = evaluateChannelPermissions({
          guildId: args.guild_id,
          ...(guild.owner_id ? { ownerId: guild.owner_id } : {}),
          memberId: args.user_id,
          memberRoleIds: member.roles ?? [],
          roles,
          ...(ch.permission_overwrites ? { overwrites: ch.permission_overwrites } : {}),
          ...(member.communication_disabled_until !== undefined
            ? { communicationDisabledUntil: member.communication_disabled_until }
            : {}),
        });
        const view = (res.effectiveBits & FLUXER_PERMISSIONS.VIEW_CHANNEL) !== 0n;
        const send = view && (res.effectiveBits & FLUXER_PERMISSIONS.SEND_MESSAGES) !== 0n;
        const connect = view && (res.effectiveBits & FLUXER_PERMISSIONS.CONNECT) !== 0n;
        const manage = view && (res.effectiveBits & FLUXER_PERMISSIONS.MANAGE_CHANNELS) !== 0n;
        return {
          channel_id: ch.id,
          channel_name: ch.name ?? '',
          type: ch.type,
          type_name: FLUXER_CHANNEL_TYPE_NAMES[ch.type] ?? `TYPE_${ch.type}`,
          view,
          send,
          connect,
          manage,
        };
      });

      const filtered = args.only_visible ? entries.filter((e) => e.view) : entries;
      return dualResult({
        text: `Member \`${args.user_id}\` can view ${entries.filter((e) => e.view).length}/${entries.length} channel(s) in guild \`${args.guild_id}\`.`,
        data: {
          guild_id: args.guild_id,
          user_id: args.user_id,
          total_channels: entries.length,
          visible_channels: entries.filter((e) => e.view).length,
          channels: filtered,
        },
      });
    },
  }),
];
