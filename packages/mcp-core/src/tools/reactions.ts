import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  ChannelId,
  defineTool,
  dualResult,
  type FluxerTool,
  MessageId,
  Snowflake,
  UserId,
} from './_lib/types.js';

const EmojiParam = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .describe('Unicode emoji (e.g. "🔥") or custom emoji as "name:id"');

export const reactionTools: readonly FluxerTool[] = [
  defineTool({
    name: 'reactions_create',
    category: 'reactions',
    requiredPermissions: ['ADD_REACTIONS'],
    description:
      'Add a reaction to a Fluxer message (`PUT /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me`).',
    inputSchema: { channel_id: ChannelId, message_id: MessageId, emoji: EmojiParam },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.put(
        FluxerRoutes.channelMessageReactionMe(args.channel_id, args.message_id, args.emoji),
      );
      return dualResult({
        text: `Added reaction ${args.emoji} to message \`${args.message_id}\`.`,
        data: {
          added: true,
          channel_id: args.channel_id,
          message_id: args.message_id,
          emoji: args.emoji,
        },
      });
    },
  }),

  defineTool({
    name: 'reactions_delete_own',
    category: 'reactions',
    description:
      "Remove the bot's own reaction from a message (`DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me`).",
    inputSchema: { channel_id: ChannelId, message_id: MessageId, emoji: EmojiParam },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(
        FluxerRoutes.channelMessageReactionMe(args.channel_id, args.message_id, args.emoji),
      );
      return dualResult({
        text: `Removed own reaction ${args.emoji} from message \`${args.message_id}\`.`,
        data: {
          removed: true,
          channel_id: args.channel_id,
          message_id: args.message_id,
          emoji: args.emoji,
        },
      });
    },
  }),

  defineTool({
    name: 'reactions_delete_user',
    category: 'reactions',
    requiredPermissions: ['MANAGE_MESSAGES'],
    description:
      "Remove a specific user's reaction from a message (`DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/{user_id}`).",
    inputSchema: {
      channel_id: ChannelId,
      message_id: MessageId,
      emoji: EmojiParam,
      user_id: UserId,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(
        FluxerRoutes.channelMessageReactionUser(
          args.channel_id,
          args.message_id,
          args.emoji,
          args.user_id,
        ),
      );
      return dualResult({
        text: `Removed reaction ${args.emoji} by user \`${args.user_id}\` from message \`${args.message_id}\`.`,
        data: {
          removed: true,
          channel_id: args.channel_id,
          message_id: args.message_id,
          emoji: args.emoji,
          user_id: args.user_id,
        },
      });
    },
  }),

  defineTool({
    name: 'reactions_delete_emoji',
    category: 'reactions',
    requiredPermissions: ['MANAGE_MESSAGES'],
    description:
      'Remove all reactions of a specific emoji from a message (`DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}`).',
    inputSchema: { channel_id: ChannelId, message_id: MessageId, emoji: EmojiParam },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(
        FluxerRoutes.channelMessageReaction(args.channel_id, args.message_id, args.emoji),
      );
      return dualResult({
        text: `Cleared all ${args.emoji} reactions from message \`${args.message_id}\`.`,
        data: {
          cleared: true,
          channel_id: args.channel_id,
          message_id: args.message_id,
          emoji: args.emoji,
        },
      });
    },
  }),

  defineTool({
    name: 'reactions_delete_all',
    category: 'reactions',
    requiredPermissions: ['MANAGE_MESSAGES'],
    confirmRequired: true,
    description:
      'Remove ALL reactions from a message (`DELETE /channels/{channel_id}/messages/{message_id}/reactions`). Confirmation-gated.',
    inputSchema: { channel_id: ChannelId, message_id: MessageId },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.channelMessageReactions(args.channel_id, args.message_id));
      return dualResult({
        text: `Cleared all reactions from message \`${args.message_id}\`.`,
        data: { cleared: true, channel_id: args.channel_id, message_id: args.message_id },
      });
    },
  }),

  defineTool({
    name: 'reactions_list',
    category: 'reactions',
    requiredPermissions: ['READ_MESSAGE_HISTORY'],
    description:
      'List users who reacted with an emoji (`GET /channels/{channel_id}/messages/{message_id}/reactions/{emoji}`).',
    inputSchema: {
      channel_id: ChannelId,
      message_id: MessageId,
      emoji: EmojiParam,
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
      const users = await ctx.rest.get<Array<Record<string, unknown>>>(
        FluxerRoutes.channelMessageReaction(args.channel_id, args.message_id, args.emoji),
        { query: { after: args.after, limit: args.limit ?? 25 } },
      );
      return dualResult({
        text: `Found ${users.length} user(s) who reacted with ${args.emoji}.`,
        data: {
          channel_id: args.channel_id,
          message_id: args.message_id,
          emoji: args.emoji,
          count: users.length,
          users,
        },
      });
    },
  }),
];
