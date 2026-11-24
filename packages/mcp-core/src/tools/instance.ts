import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import { ApplicationId, type FluxerTool, defineTool, dualResult } from './_lib/types.js';

export const instanceAndApplicationTools: readonly FluxerTool[] = [
  defineTool({
    name: 'instance_get_discovery',
    category: 'instance',
    description:
      'Fetch the Fluxer instance discovery document (`GET /.well-known/fluxer`). Reports API version, public/gateway/media/webapp endpoints, enabled features (voice, discovery, self_hosted, SSO, registration mode), community settings, and message/emoji/sticker limits. Essential for adapting to Cloud vs self-hosted Fluxer instances.',
    inputSchema: {
      force_refresh: z
        .boolean()
        .optional()
        .describe('Bypass the 5-minute discovery cache and re-fetch live'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const doc = await ctx.rest.discoverInstance(args.force_refresh === true);
      const selfHosted = doc.features?.self_hosted === true || ctx.rest.isSelfHosted();
      return dualResult({
        text: `Fluxer instance \`${ctx.rest.apiUrl}\` (API v${doc.api_code_version ?? ctx.rest.apiVersion}, ${selfHosted ? 'self-hosted' : 'Fluxer Cloud'}).`,
        data: {
          api_url: ctx.rest.apiUrl,
          self_hosted: selfHosted,
          api_code_version: doc.api_code_version ?? null,
          endpoints: doc.endpoints ?? {},
          features: doc.features ?? {},
          community: doc.community ?? {},
          services: doc.services ?? {},
          limits: doc.limits ?? {},
          registration: doc.registration ?? {},
          sso: doc.sso ?? {},
          voice_origins: doc.voice_origins ?? [],
        },
      });
    },
  }),

  defineTool({
    name: 'instance_list_badges',
    category: 'instance',
    description:
      'List community badges defined on this Fluxer instance (`GET /instance/badges`). Useful for inspecting guild badge IDs on Cloud or custom self-hosted instances.',
    inputSchema: {
      ids: z.string().optional().describe('Optional comma-separated badge IDs to filter'),
      after: z.string().optional().describe('Pagination cursor'),
      limit: z.number().int().min(1).max(100).optional().describe('Max badges to return'),
      version: z.string().optional().describe('Optional custom badges version tag'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<unknown>(FluxerRoutes.instanceBadges(), {
        auth: false,
        query: {
          ids: args.ids,
          after: args.after,
          limit: args.limit,
          version: args.version,
        },
      });
      const badges = Array.isArray(res) ? res : ((res as { badges?: unknown[] })?.badges ?? []);
      return dualResult({
        text: `Retrieved ${badges.length} community badge(s) from Fluxer instance.`,
        data: { count: badges.length, badges },
      });
    },
  }),

  defineTool({
    name: 'instance_get_gateway',
    category: 'instance',
    description:
      'Fetch Fluxer WebSocket Gateway connection info (`GET /gateway/bot`), including WebSocket URL, recommended shard count, and session_start_limit.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const info = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.gatewayBot());
      return dualResult({
        text: `Fluxer Gateway URL: \`${String(info.url ?? 'unknown')}\` (shards: ${String(info.shards ?? 1)}).`,
        data: info,
      });
    },
  }),

  defineTool({
    name: 'application_get_current',
    category: 'application',
    description:
      'Fetch the current Fluxer bot application metadata (`GET /applications/@me`): id, name, description, bot_public, bot_require_code_grant, verify_key, owner, and bot user info.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const app = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.currentApplication());
      return dualResult({
        text: `Current Fluxer application: **${String(app.name ?? 'unknown')}** (\`app:${String(app.id ?? '')}\`).`,
        data: app,
      });
    },
  }),

  defineTool({
    name: 'application_get_public',
    category: 'application',
    description:
      'Fetch public metadata for any Fluxer application/bot by ID (`GET /oauth2/applications/{id}/public`). Useful for auditing bots installed in a community.',
    inputSchema: {
      application_id: ApplicationId.describe('Target Fluxer application ID'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const app = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.publicApplication(args.application_id),
        { auth: false },
      );
      return dualResult({
        text: `Public Fluxer application **${String(app.name ?? args.application_id)}** (\`app:${args.application_id}\`).`,
        data: app,
      });
    },
  }),
];
