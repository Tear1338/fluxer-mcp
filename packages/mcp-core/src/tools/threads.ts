import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  ChannelId,
  defineTool,
  dualResult,
  type FluxerTool,
  Snowflake,
  UserId,
} from './_lib/types.js';

export const threadTools: readonly FluxerTool[] = [
  defineTool({
    name: 'threads_join',
    category: 'threads',
    description:
      'Join a Fluxer thread as the current bot (`PUT /channels/{channel_id}/thread-members/@me`).',
    inputSchema: { channel_id: ChannelId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.put(FluxerRoutes.channelThreadMemberMe(args.channel_id));
      return dualResult({
        text: `Joined thread \`${args.channel_id}\`.`,
        data: { joined: true, channel_id: args.channel_id },
      });
    },
  }),

  defineTool({
    name: 'threads_leave',
    category: 'threads',
    description:
      'Leave a Fluxer thread as the current bot (`DELETE /channels/{channel_id}/thread-members/@me`).',
    inputSchema: { channel_id: ChannelId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.channelThreadMemberMe(args.channel_id));
      return dualResult({
        text: `Left thread \`${args.channel_id}\`.`,
        data: { left: true, channel_id: args.channel_id },
      });
    },
  }),

  defineTool({
    name: 'threads_add_member',
    category: 'threads',
    requiredPermissions: ['SEND_MESSAGES'],
    description:
      'Add a user to a Fluxer thread (`PUT /channels/{channel_id}/thread-members/{user_id}`).',
    inputSchema: { channel_id: ChannelId, user_id: UserId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.put(FluxerRoutes.channelThreadMember(args.channel_id, args.user_id));
      return dualResult({
        text: `Added user \`${args.user_id}\` to thread \`${args.channel_id}\`.`,
        data: { added: true, channel_id: args.channel_id, user_id: args.user_id },
      });
    },
  }),

  defineTool({
    name: 'threads_remove_member',
    category: 'threads',
    requiredPermissions: ['MANAGE_THREADS'],
    description:
      'Remove a user from a Fluxer thread (`DELETE /channels/{channel_id}/thread-members/{user_id}`).',
    inputSchema: { channel_id: ChannelId, user_id: UserId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.channelThreadMember(args.channel_id, args.user_id));
      return dualResult({
        text: `Removed user \`${args.user_id}\` from thread \`${args.channel_id}\`.`,
        data: { removed: true, channel_id: args.channel_id, user_id: args.user_id },
      });
    },
  }),

  defineTool({
    name: 'threads_get_member',
    category: 'threads',
    description:
      'Get a specific thread member record (`GET /channels/{channel_id}/thread-members/{user_id}`).',
    inputSchema: {
      channel_id: ChannelId,
      user_id: UserId,
      with_member: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const member = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.channelThreadMember(args.channel_id, args.user_id),
        { query: { with_member: args.with_member } },
      );
      return dualResult({
        text: `Fetched thread member \`${args.user_id}\` in thread \`${args.channel_id}\`.`,
        data: member,
      });
    },
  }),

  defineTool({
    name: 'threads_list_members',
    category: 'threads',
    description: 'List members of a Fluxer thread (`GET /channels/{channel_id}/thread-members`).',
    inputSchema: {
      channel_id: ChannelId,
      with_member: z.boolean().optional(),
      after: Snowflake.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const members = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.channelThreadMembers(args.channel_id),
        {
          query: {
            with_member: args.with_member,
            after: args.after,
            limit: args.limit ?? 100,
          },
        },
      );
      return dualResult({
        text: `Listed ${members.length} member(s) in thread \`${args.channel_id}\`.`,
        data: { channel_id: args.channel_id, count: members.length, members },
      });
    },
  }),
];
