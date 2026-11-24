import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  AuditReasonSchema,
  ChannelId,
  type FluxerTool,
  GuildId,
  defineTool,
  dualResult,
  pickDefined,
} from './_lib/types.js';

const InviteCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invite code must be alphanumeric/dash/underscore only')
  .describe('Fluxer invite code (without the https://fluxer.gg/ prefix)');

export const inviteTools: readonly FluxerTool[] = [
  defineTool({
    name: 'invites_list_channel',
    category: 'invites',
    requiredPermissions: ['MANAGE_CHANNELS'],
    description: 'List active invites targeting a specific Fluxer channel (`GET /channels/{channel_id}/invites`).',
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
      const invites = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.channelInvites(args.channel_id),
      );
      return dualResult({
        text: `Found ${invites.length} invite(s) for channel \`${args.channel_id}\`.`,
        data: { channel_id: args.channel_id, count: invites.length, invites },
      });
    },
  }),

  defineTool({
    name: 'invites_list_guild',
    category: 'invites',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    description:
      'List all active invites across a Fluxer guild (`GET /guilds/{guild_id}/invites`), including uses, max_uses, max_age, temporary flag, and inviter.',
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
      const invites = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.guildInvites(args.guild_id),
      );
      return dualResult({
        text: `Found ${invites.length} active invite(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: invites.length, invites },
      });
    },
  }),

  defineTool({
    name: 'invites_create_channel',
    category: 'invites',
    requiredPermissions: ['CREATE_INSTANT_INVITE'],
    description:
      'Create a new invite for a Fluxer channel (`POST /channels/{channel_id}/invites`). Supports max_age (seconds, 0=never), max_uses (0=unlimited), temporary membership, and unique code generation.',
    inputSchema: {
      channel_id: ChannelId,
      max_age: z
        .number()
        .int()
        .min(0)
        .max(604800)
        .optional()
        .describe('Invite lifetime in seconds (0 = never expires, default 86400)'),
      max_uses: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('Max number of uses (0 = unlimited)'),
      temporary: z
        .boolean()
        .optional()
        .describe('Grant temporary membership (kicked on disconnect unless assigned a role)'),
      unique: z.boolean().optional().describe('Force creation of a unique invite code'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['max_age', 'max_uses', 'temporary', 'unique']);
      const invite = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.channelInvites(args.channel_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Created Fluxer invite \`${String(invite.code ?? '')}\` for channel \`${args.channel_id}\`.`,
        data: invite,
      });
    },
  }),

  defineTool({
    name: 'invites_get',
    category: 'invites',
    description: 'Inspect a Fluxer invite by code (`GET /invites/{invite_code}`), including guild, channel, inviter, and member/presence counts.',
    inputSchema: {
      invite_code: InviteCodeSchema,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const invite = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.invite(args.invite_code),
      );
      return dualResult({
        text: `Fetched invite \`${args.invite_code}\`.`,
        data: invite,
      });
    },
  }),

  defineTool({
    name: 'invites_delete',
    category: 'invites',
    requiredPermissions: ['MANAGE_CHANNELS'],
    confirmRequired: true,
    description: 'Revoke/delete a Fluxer invite (`DELETE /invites/{invite_code}`). Confirmation-gated.',
    inputSchema: {
      invite_code: InviteCodeSchema,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.invite(args.invite_code), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Deleted invite \`${args.invite_code}\`.`,
        data: { deleted: true, invite_code: args.invite_code },
      });
    },
  }),
];
