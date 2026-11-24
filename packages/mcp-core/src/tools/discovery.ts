import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import { defineTool, dualResult, type FluxerTool, GuildId, pickDefined } from './_lib/types.js';

export const discoveryTools: readonly FluxerTool[] = [
  defineTool({
    name: 'discovery_list_categories',
    category: 'discovery',
    description:
      'List all Fluxer Guild Discovery categories (`GET /discovery/categories`) available on this Fluxer instance.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const res = await ctx.rest.get<unknown>(FluxerRoutes.discoveryCategories());
      const categories = Array.isArray(res)
        ? res
        : ((res as { categories?: unknown[] })?.categories ?? []);
      return dualResult({
        text: `Retrieved ${categories.length} Fluxer discovery category(ies).`,
        data: { count: categories.length, categories },
      });
    },
  }),

  defineTool({
    name: 'discovery_search_guilds',
    category: 'discovery',
    description:
      'Search public discoverable Fluxer communities (`GET /discovery/guilds`) by query, category, language, tag, and sort order.',
    inputSchema: {
      query: z.string().max(100).optional().describe('Search text'),
      category: z.number().int().optional().describe('Discovery category numeric ID'),
      language: z.string().max(16).optional().describe('Primary language code (e.g. "en", "fr")'),
      tag: z.string().max(50).optional().describe('Custom tag filter'),
      sort_by: z.string().optional().describe('Sort field supported by the Fluxer instance'),
      limit: z.number().int().min(1).max(50).optional().describe('Results per page (default 20)'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.discoveryGuilds(), {
        query: {
          query: args.query,
          category: args.category,
          language: args.language,
          tag: args.tag,
          sort_by: args.sort_by,
          limit: args.limit ?? 20,
          offset: args.offset,
        },
      });
      const guilds = Array.isArray(res) ? res : ((res.guilds as unknown[]) ?? []);
      return dualResult({
        text: `Found ${guilds.length} discoverable Fluxer guild(s).`,
        data: Array.isArray(res) ? { count: guilds.length, guilds } : res,
      });
    },
  }),

  defineTool({
    name: 'discovery_get_guild_status',
    category: 'discovery',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    description:
      "Check a guild's Fluxer Discovery eligibility, minimum member count, and current discovery application status (`GET /guilds/{guild_id}/discovery`).",
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
      const status = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.guildDiscovery(args.guild_id),
      );
      return dualResult({
        text: `Guild \`${args.guild_id}\` discovery eligible: **${String(status.eligible ?? false)}** (min members: ${String(status.min_member_count ?? 'unknown')}).`,
        data: { guild_id: args.guild_id, ...status },
      });
    },
  }),

  defineTool({
    name: 'discovery_apply',
    category: 'discovery',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    description:
      'Submit a Fluxer Guild Discovery application (`POST /guilds/{guild_id}/discovery`) with description, category_type, primary_language, and custom_tags.',
    inputSchema: {
      guild_id: GuildId,
      description: z
        .string()
        .min(10)
        .max(500)
        .describe('Public community description for Discovery'),
      category_type: z
        .number()
        .int()
        .describe('Discovery category numeric ID (from discovery_list_categories)'),
      primary_language: z
        .string()
        .max(16)
        .optional()
        .describe('BCP-47 language code (e.g. "en", "fr")'),
      custom_tags: z
        .array(z.string().min(1).max(32))
        .max(10)
        .optional()
        .describe('Up to 10 discovery tags'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'description',
        'category_type',
        'primary_language',
        'custom_tags',
      ]);
      const res = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.guildDiscovery(args.guild_id),
        { body },
      );
      return dualResult({
        text: `Submitted Fluxer Discovery application for guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, ...res },
      });
    },
  }),

  defineTool({
    name: 'discovery_update',
    category: 'discovery',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    description:
      'Update an existing Fluxer Guild Discovery listing or application (`PATCH /guilds/{guild_id}/discovery`).',
    inputSchema: {
      guild_id: GuildId,
      description: z.string().min(10).max(500).optional(),
      category_type: z.number().int().optional(),
      primary_language: z.string().max(16).optional(),
      custom_tags: z.array(z.string().min(1).max(32)).max(10).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'description',
        'category_type',
        'primary_language',
        'custom_tags',
      ]);
      const res = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildDiscovery(args.guild_id),
        { body },
      );
      return dualResult({
        text: `Updated Fluxer Discovery settings for guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, ...res },
      });
    },
  }),

  defineTool({
    name: 'discovery_withdraw',
    category: 'discovery',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    confirmRequired: true,
    description:
      "Withdraw a guild's Fluxer Discovery application or remove it from Discovery (`DELETE /guilds/{guild_id}/discovery`). Confirmation-gated.",
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
      await ctx.rest.delete(FluxerRoutes.guildDiscovery(args.guild_id));
      return dualResult({
        text: `Withdrew guild \`${args.guild_id}\` from Fluxer Discovery.`,
        data: { withdrawn: true, guild_id: args.guild_id },
      });
    },
  }),
];
