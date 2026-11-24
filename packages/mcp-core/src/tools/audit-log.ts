import { z } from 'zod';
import {
  AUDIT_LOG_ACTION_NAMES,
  FluxerRoutes,
} from '../fluxer/constants.js';
import {
  type FluxerTool,
  GuildId,
  Snowflake,
  UserId,
  defineTool,
  dualResult,
  wrapUntrusted,
} from './_lib/types.js';

interface RawAuditLogEntry {
  readonly id: string;
  readonly action_type: number;
  readonly user_id?: string | null;
  readonly target_id?: string | null;
  readonly reason?: string | null;
  readonly changes?: ReadonlyArray<Record<string, unknown>>;
  readonly options?: Record<string, unknown>;
}

interface RawAuditLogResponse {
  readonly audit_log_entries: readonly RawAuditLogEntry[];
  readonly users?: readonly Record<string, unknown>[];
  readonly webhooks?: readonly Record<string, unknown>[];
  readonly threads?: readonly Record<string, unknown>[];
}

export const auditLogTools: readonly FluxerTool[] = [
  defineTool({
    name: 'audit_log_get',
    category: 'audit_log',
    requiredPermissions: ['VIEW_AUDIT_LOG'],
    guildScoped: true,
    description:
      'Fetch Fluxer guild audit log entries (`GET /guilds/{guild_id}/audit-logs`) with human-readable Fluxer action names (all 38 Fluxer AuditLogActionTypes). Supports filtering by actor user_id, action_type, and cursor pagination (before/after).',
    inputSchema: {
      guild_id: GuildId,
      user_id: UserId.optional().describe('Filter entries performed by this actor user ID'),
      action_type: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Numeric Fluxer AuditLogActionType filter (e.g. 22=MEMBER_BAN_ADD, 30=ROLE_CREATE)'),
      before: Snowflake.optional().describe('Return entries before this audit log entry ID'),
      after: Snowflake.optional().describe('Return entries after this audit log entry ID'),
      limit: z.number().int().min(1).max(100).optional().describe('Max entries to return (1-100, default 50)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<RawAuditLogResponse>(
        FluxerRoutes.guildAuditLogs(args.guild_id),
        {
          query: {
            user_id: args.user_id,
            action_type: args.action_type,
            before: args.before,
            after: args.after,
            limit: args.limit ?? 50,
          },
        },
      );
      const entries = (res.audit_log_entries ?? []).map((e) => ({
        id: e.id,
        action_type: e.action_type,
        action_name: AUDIT_LOG_ACTION_NAMES[e.action_type] ?? `UNKNOWN_${e.action_type}`,
        user_id: e.user_id ?? null,
        target_id: e.target_id ?? null,
        reason: e.reason ?? null,
        reason_fenced: e.reason ? wrapUntrusted(e.reason, 'audit_reason') : null,
        changes: e.changes ?? [],
        options: e.options ?? null,
      }));
      return dualResult({
        text: `Fetched ${entries.length} audit log entry(ies) for guild \`${args.guild_id}\`.`,
        data: {
          guild_id: args.guild_id,
          count: entries.length,
          entries,
          users_count: res.users?.length ?? 0,
          webhooks_count: res.webhooks?.length ?? 0,
          threads_count: res.threads?.length ?? 0,
        },
      });
    },
  }),

  defineTool({
    name: 'audit_log_summary',
    category: 'audit_log',
    requiredPermissions: ['VIEW_AUDIT_LOG'],
    guildScoped: true,
    description:
      'Aggregate recent guild audit logs into an operational security & moderation summary: counts by action type, top moderators/actors, recent bans/kicks/role-permission changes, and anomaly flags (mass bans, mass channel/role deletions, webhook creations).',
    inputSchema: {
      guild_id: GuildId,
      limit: z.number().int().min(10).max(100).optional().describe('Number of recent entries to analyze (default 100)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const res = await ctx.rest.get<RawAuditLogResponse>(
        FluxerRoutes.guildAuditLogs(args.guild_id),
        { query: { limit: args.limit ?? 100 } },
      );
      const entries = res.audit_log_entries ?? [];
      const byAction: Record<string, number> = {};
      const byActor: Record<string, number> = {};
      const anomalies: string[] = [];

      let banCount = 0;
      let kickCount = 0;
      let channelDeleteCount = 0;
      let roleDeleteCount = 0;
      let webhookCreateCount = 0;

      for (const entry of entries) {
        const name = AUDIT_LOG_ACTION_NAMES[entry.action_type] ?? `ACTION_${entry.action_type}`;
        byAction[name] = (byAction[name] ?? 0) + 1;
        const actor = entry.user_id ?? 'system';
        byActor[actor] = (byActor[actor] ?? 0) + 1;

        if (entry.action_type === 22) banCount++;
        if (entry.action_type === 20) kickCount++;
        if (entry.action_type === 12) channelDeleteCount++;
        if (entry.action_type === 32) roleDeleteCount++;
        if (entry.action_type === 50) webhookCreateCount++;
      }

      if (banCount >= 10) anomalies.push(`High ban volume in window: ${banCount} bans.`);
      if (kickCount >= 10) anomalies.push(`High kick volume in window: ${kickCount} kicks.`);
      if (channelDeleteCount >= 5) {
        anomalies.push(`Unusual channel deletion spike: ${channelDeleteCount} channels deleted.`);
      }
      if (roleDeleteCount >= 5) {
        anomalies.push(`Unusual role deletion spike: ${roleDeleteCount} roles deleted.`);
      }
      if (webhookCreateCount >= 5) {
        anomalies.push(`Multiple webhooks created recently (${webhookCreateCount}); audit webhook permissions.`);
      }

      const topActors = Object.entries(byActor)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([user_id, count]) => ({ user_id, count }));

      return dualResult({
        text: `Audit summary for guild \`${args.guild_id}\`: ${entries.length} entries analyzed, ${anomalies.length} anomaly flag(s).`,
        data: {
          guild_id: args.guild_id,
          analyzed_entries: entries.length,
          by_action: byAction,
          top_actors: topActors,
          moderation_totals: {
            bans: banCount,
            kicks: kickCount,
            channel_deletes: channelDeleteCount,
            role_deletes: roleDeleteCount,
            webhook_creates: webhookCreateCount,
          },
          anomalies,
        },
      });
    },
  }),
];
