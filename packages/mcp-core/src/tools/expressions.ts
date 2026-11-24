import { z } from 'zod';
import { ExternalServiceError } from '../errors.js';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  AuditReasonSchema,
  EmojiId,
  type FluxerTool,
  GuildId,
  StickerId,
  defineTool,
  dualResult,
  pickDefined,
} from './_lib/types.js';

export const expressionTools: readonly FluxerTool[] = [
  // --- Emojis (8 tools) ---
  defineTool({
    name: 'emojis_list_guild',
    category: 'emojis',
    guildScoped: true,
    description: 'List all custom emojis in a Fluxer guild (`GET /guilds/{guild_id}/emojis`).',
    inputSchema: { guild_id: GuildId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const emojis = await ctx.rest.get<Array<Record<string, unknown>>>(FluxerRoutes.guildEmojis(args.guild_id));
      return dualResult({
        text: `Listed ${emojis.length} custom emoji(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: emojis.length, emojis },
      });
    },
  }),

  defineTool({
    name: 'emojis_create',
    category: 'emojis',
    requiredPermissions: ['CREATE_EXPRESSIONS'],
    guildScoped: true,
    description: 'Create a custom guild emoji (`POST /guilds/{guild_id}/emojis`) using a base64 data URI image.',
    inputSchema: {
      guild_id: GuildId,
      name: z.string().min(2).max(32).regex(/^[A-Za-z0-9_]+$/),
      image: z.string().startsWith('data:image/').describe('Base64 image data URI (PNG/JPEG/GIF/WebP)'),
      audit_reason: AuditReasonSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const emoji = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.guildEmojis(args.guild_id), {
        body: { name: args.name, image: args.image },
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Created emoji **:${String(emoji.name ?? args.name)}:** (\`emoji:${String(emoji.id ?? '')}\`).`,
        data: emoji,
      });
    },
  }),

  defineTool({
    name: 'emojis_bulk_create',
    category: 'emojis',
    requiredPermissions: ['CREATE_EXPRESSIONS'],
    guildScoped: true,
    description: 'Fluxer-native: bulk-create multiple custom emojis in one API call (`POST /guilds/{guild_id}/emojis/bulk`).',
    inputSchema: {
      guild_id: GuildId,
      emojis: z
        .array(
          z.object({
            name: z.string().min(2).max(32).regex(/^[A-Za-z0-9_]+$/),
            image: z.string().startsWith('data:image/'),
          }),
        )
        .min(1)
        .max(50),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const res = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.guildEmojisBulk(args.guild_id), {
        body: { emojis: args.emojis },
      });
      return dualResult({
        text: `Bulk-created ${args.emojis.length} emoji(s) in guild \`${args.guild_id}\`.`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'emojis_clone',
    category: 'emojis',
    requiredPermissions: ['CREATE_EXPRESSIONS'],
    guildScoped: true,
    description: 'Fluxer-native: clone an existing Fluxer emoji by ID into the target guild (`POST /guilds/{guild_id}/emojis/clone`).',
    inputSchema: {
      guild_id: GuildId,
      source_emoji_id: EmojiId,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const emoji = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.guildEmojisClone(args.guild_id), {
        body: { source_emoji_id: args.source_emoji_id },
      });
      return dualResult({
        text: `Cloned emoji \`${args.source_emoji_id}\` into guild \`${args.guild_id}\`.`,
        data: emoji,
      });
    },
  }),

  defineTool({
    name: 'emojis_modify',
    category: 'emojis',
    requiredPermissions: ['MANAGE_EXPRESSIONS'],
    guildScoped: true,
    description: 'Rename a custom guild emoji (`PATCH /guilds/{guild_id}/emojis/{emoji_id}`).',
    inputSchema: {
      guild_id: GuildId,
      emoji_id: EmojiId,
      name: z.string().min(2).max(32).regex(/^[A-Za-z0-9_]+$/),
      audit_reason: AuditReasonSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const emoji = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildEmoji(args.guild_id, args.emoji_id),
        { body: { name: args.name }, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Renamed emoji \`${args.emoji_id}\` to **:${args.name}:**.`,
        data: emoji,
      });
    },
  }),

  defineTool({
    name: 'emojis_delete',
    category: 'emojis',
    requiredPermissions: ['MANAGE_EXPRESSIONS'],
    guildScoped: true,
    confirmRequired: true,
    description: 'Delete a custom guild emoji (`DELETE /guilds/{guild_id}/emojis/{emoji_id}`). Supports Fluxer `purge` query flag. Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      emoji_id: EmojiId,
      purge: z.boolean().optional(),
      audit_reason: AuditReasonSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.guildEmoji(args.guild_id, args.emoji_id), {
        query: { purge: args.purge },
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Deleted emoji \`${args.emoji_id}\` from guild \`${args.guild_id}\`.`,
        data: { deleted: true, guild_id: args.guild_id, emoji_id: args.emoji_id },
      });
    },
  }),

  defineTool({
    name: 'emojis_get_metadata',
    category: 'emojis',
    description: 'Fluxer-native: get metadata for any custom emoji by ID (`GET /emojis/{emoji_id}/metadata`).',
    inputSchema: { emoji_id: EmojiId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const data = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.emojiMetadata(args.emoji_id));
      return dualResult({ text: `Fetched metadata for emoji \`${args.emoji_id}\`.`, data });
    },
  }),

  defineTool({
    name: 'emojis_get_source',
    category: 'emojis',
    description: 'Fluxer-native: look up the source guild of a custom emoji (`GET /emojis/{emoji_id}/source`).',
    inputSchema: { emoji_id: EmojiId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const data = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.emojiSource(args.emoji_id));
      return dualResult({ text: `Fetched source guild for emoji \`${args.emoji_id}\`.`, data });
    },
  }),

  // --- Stickers (8 tools) ---
  defineTool({
    name: 'stickers_list_guild',
    category: 'stickers',
    guildScoped: true,
    description: 'List all custom stickers in a Fluxer guild (`GET /guilds/{guild_id}/stickers`).',
    inputSchema: { guild_id: GuildId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const stickers = await ctx.rest.get<Array<Record<string, unknown>>>(FluxerRoutes.guildStickers(args.guild_id));
      return dualResult({
        text: `Listed ${stickers.length} custom sticker(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: stickers.length, stickers },
      });
    },
  }),

  defineTool({
    name: 'stickers_create_guild_sticker',
    category: 'stickers',
    requiredPermissions: ['CREATE_EXPRESSIONS'],
    guildScoped: true,
    description:
      'Create a custom sticker in a Fluxer guild (`POST /guilds/{guild_id}/stickers`). Note: Fluxer accepts JSON `{ name, description?, tags?, image }` with a base64 data URI.',
    inputSchema: {
      guild_id: GuildId,
      name: z.string().min(2).max(30),
      description: z.string().max(100).optional(),
      tags: z.array(z.string().max(32)).max(10).optional(),
      image: z.string().startsWith('data:image/').describe('Base64 image data URI'),
      audit_reason: AuditReasonSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['name', 'description', 'tags', 'image']);
      const sticker = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.guildStickers(args.guild_id), {
        body,
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Created sticker **${String(sticker.name ?? args.name)}** (\`sticker:${String(sticker.id ?? '')}\`).`,
        data: sticker,
      });
    },
  }),

  defineTool({
    name: 'stickers_bulk_create',
    category: 'stickers',
    requiredPermissions: ['CREATE_EXPRESSIONS'],
    guildScoped: true,
    description: 'Fluxer-native: bulk-create guild stickers (`POST /guilds/{guild_id}/stickers/bulk`).',
    inputSchema: {
      guild_id: GuildId,
      stickers: z
        .array(
          z.object({
            name: z.string().min(2).max(30),
            description: z.string().max(100).optional(),
            tags: z.array(z.string().max(32)).max(10).optional(),
            image: z.string().startsWith('data:image/'),
          }),
        )
        .min(1)
        .max(50),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const res = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.guildStickersBulk(args.guild_id), {
        body: { stickers: args.stickers },
      });
      return dualResult({
        text: `Bulk-created ${args.stickers.length} sticker(s) in guild \`${args.guild_id}\`.`,
        data: res,
      });
    },
  }),

  defineTool({
    name: 'stickers_clone',
    category: 'stickers',
    requiredPermissions: ['CREATE_EXPRESSIONS'],
    guildScoped: true,
    description: 'Fluxer-native: clone an existing sticker by ID into the target guild (`POST /guilds/{guild_id}/stickers/clone`).',
    inputSchema: { guild_id: GuildId, source_sticker_id: StickerId },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const sticker = await ctx.rest.post<Record<string, unknown>>(FluxerRoutes.guildStickersClone(args.guild_id), {
        body: { source_sticker_id: args.source_sticker_id },
      });
      return dualResult({
        text: `Cloned sticker \`${args.source_sticker_id}\` into guild \`${args.guild_id}\`.`,
        data: sticker,
      });
    },
  }),

  defineTool({
    name: 'stickers_modify_guild_sticker',
    category: 'stickers',
    requiredPermissions: ['MANAGE_EXPRESSIONS'],
    guildScoped: true,
    description: 'Modify a Fluxer guild sticker\'s name, description, or tags (`PATCH /guilds/{guild_id}/stickers/{sticker_id}`).',
    inputSchema: {
      guild_id: GuildId,
      sticker_id: StickerId,
      name: z.string().min(2).max(30).optional(),
      description: z.string().max(100).optional(),
      tags: z.array(z.string().max(32)).max(10).optional(),
      audit_reason: AuditReasonSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const body = pickDefined(args, ['name', 'description', 'tags']);
      const sticker = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildSticker(args.guild_id, args.sticker_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Updated sticker \`${args.sticker_id}\` in guild \`${args.guild_id}\`.`,
        data: sticker,
      });
    },
  }),

  defineTool({
    name: 'stickers_delete_guild_sticker',
    category: 'stickers',
    requiredPermissions: ['MANAGE_EXPRESSIONS'],
    guildScoped: true,
    confirmRequired: true,
    description: 'Delete a custom guild sticker (`DELETE /guilds/{guild_id}/stickers/{sticker_id}`). Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      sticker_id: StickerId,
      purge: z.boolean().optional(),
      audit_reason: AuditReasonSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.guildSticker(args.guild_id, args.sticker_id), {
        query: { purge: args.purge },
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Deleted sticker \`${args.sticker_id}\` from guild \`${args.guild_id}\`.`,
        data: { deleted: true, guild_id: args.guild_id, sticker_id: args.sticker_id },
      });
    },
  }),

  defineTool({
    name: 'stickers_get_metadata',
    category: 'stickers',
    description: 'Fluxer-native: fetch metadata for a sticker by ID (`GET /stickers/{sticker_id}/metadata`).',
    inputSchema: { sticker_id: StickerId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const data = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.stickerMetadata(args.sticker_id));
      return dualResult({ text: `Fetched metadata for sticker \`${args.sticker_id}\`.`, data });
    },
  }),

  defineTool({
    name: 'stickers_get_source',
    category: 'stickers',
    description: 'Fluxer-native: look up the source guild of a sticker (`GET /stickers/{sticker_id}/source`).',
    inputSchema: { sticker_id: StickerId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const data = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.stickerSource(args.sticker_id));
      return dualResult({ text: `Fetched source guild for sticker \`${args.sticker_id}\`.`, data });
    },
  }),

  // --- Inspiration (1 tool) ---
  defineTool({
    name: 'inspiration_emoji_gg_search',
    category: 'inspiration',
    description:
      'Search public community emojis on emoji.gg (read-only external lookup) to discover artwork candidates for `emojis_create` / `emojis_bulk_create`.',
    inputSchema: {
      query: z.string().trim().min(1).max(64),
      limit: z.number().int().min(1).max(25).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const res = await fetch('https://emoji.gg/api/', { signal: ctx.signal });
      if (!res.ok) {
        throw new ExternalServiceError('emoji.gg', `emoji.gg returned HTTP ${res.status}`, res.status);
      }
      const list = (await res.json()) as Array<{ id: number; title: string; image: string; category: number }>;
      const q = args.query.toLowerCase();
      const matches = list
        .filter((e) => e.title.toLowerCase().includes(q))
        .slice(0, args.limit ?? 10)
        .map((e) => ({ id: e.id, title: e.title, image_url: e.image }));
      return dualResult({
        text: `Found ${matches.length} emoji.gg match(es) for "${args.query}".`,
        data: { query: args.query, count: matches.length, matches },
      });
    },
  }),
];
