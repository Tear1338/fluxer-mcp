import { z } from 'zod';
import {
  CONTENT_WARNING_LEVEL,
  FLUXER_CHANNEL_TYPE_NAMES,
  FLUXER_PERMISSIONS,
  FluxerRoutes,
  GUILD_EXPLICIT_CONTENT_FILTER,
  GUILD_MFA_LEVEL,
  GUILD_NSFW_LEVEL,
  GUILD_SPLASH_CARD_ALIGNMENT,
  GUILD_VERIFICATION_LEVEL,
  SYSTEM_CHANNEL_FLAGS,
} from '../fluxer/constants.js';
import {
  type ChannelLike,
  compareRolesDesc,
  decodePermissionNames,
  findDangerousPermissions,
  parsePermissionBits,
  type RoleLike,
} from '../fluxer/permissions.js';
import {
  deriveSigningSecret,
  loadSignedState,
  resolveStateDirectory,
  saveSignedState,
  sha256Digest,
} from '../state.js';
import {
  AuditReasonSchema,
  ChannelId,
  defineTool,
  dualResult,
  type FluxerTool,
  GuildId,
  pickDefined,
  RichEmbedSchema,
  wrapUntrusted,
} from './_lib/types.js';

export interface GuildBackupSnapshot {
  readonly schema_version: 'fluxer_guild_backup.v1';
  readonly exported_at: string;
  readonly source_api_url: string;
  readonly guild: Record<string, unknown>;
  readonly roles: RoleLike[];
  readonly channels: ChannelLike[];
  readonly emojis: Array<Record<string, unknown>>;
  readonly stickers: Array<Record<string, unknown>>;
  readonly vanity_url: Record<string, unknown> | null;
  readonly discovery: Record<string, unknown> | null;
  readonly invites: Array<Record<string, unknown>>;
}

async function fetchGuildBackupSnapshot(
  guildId: string,
  rest: Parameters<FluxerTool['handler']>[1]['rest'],
): Promise<GuildBackupSnapshot> {
  const [guild, roles, channels, emojis, stickers, vanity, discovery, invites] = await Promise.all([
    rest.get<Record<string, unknown>>(FluxerRoutes.guild(guildId)),
    rest.get<RoleLike[]>(FluxerRoutes.guildRoles(guildId)),
    rest.get<ChannelLike[]>(FluxerRoutes.guildChannels(guildId)),
    rest.get<Array<Record<string, unknown>>>(FluxerRoutes.guildEmojis(guildId)).catch(() => []),
    rest.get<Array<Record<string, unknown>>>(FluxerRoutes.guildStickers(guildId)).catch(() => []),
    rest.get<Record<string, unknown>>(FluxerRoutes.guildVanityUrl(guildId)).catch(() => null),
    rest.get<Record<string, unknown>>(FluxerRoutes.guildDiscovery(guildId)).catch(() => null),
    rest.get<Array<Record<string, unknown>>>(FluxerRoutes.guildInvites(guildId)).catch(() => []),
  ]);

  return {
    schema_version: 'fluxer_guild_backup.v1',
    exported_at: new Date().toISOString(),
    source_api_url: rest.apiUrl,
    guild,
    roles: [...roles].sort(compareRolesDesc),
    channels,
    emojis,
    stickers,
    vanity_url: vanity,
    discovery,
    invites,
  };
}

export const guildTools: readonly FluxerTool[] = [
  defineTool({
    name: 'guild_get',
    category: 'guild',
    guildScoped: true,
    description:
      'Fetch complete Fluxer community (guild) metadata (`GET /guilds/{guild_id}`): verification_level (0..3), mfa_level, explicit_content_filter, nsfw_level, content_warning settings, disabled_operations, features, badge_ids, rules/system/afk channels, vanity_url_code, and member counts.',
    inputSchema: { guild_id: GuildId },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const g = await ctx.rest.get<Record<string, unknown>>(FluxerRoutes.guild(args.guild_id));
      const untrusted = wrapUntrusted(String(g.name ?? ''), 'guild_metadata');
      return dualResult({
        text: `Fetched Fluxer guild \`${args.guild_id}\` (${untrusted}).`,
        data: { ...g, untrusted_name: untrusted },
      });
    },
  }),

  defineTool({
    name: 'guild_modify',
    category: 'guild',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    description:
      'Update Fluxer guild settings (`PATCH /guilds/{guild_id}`). Supports name, verification_level (0=NONE..3=HIGH), mfa_level (0..1), explicit_content_filter (0..2), default_message_notifications (0..1), system/afk channels, system_channel_flags, nsfw/nsfw_level, content_warning_level/text, splash_card_alignment, icon/banner/splash, features, and message_history_cutoff.',
    inputSchema: {
      guild_id: GuildId,
      name: z.string().min(2).max(100).optional(),
      verification_level: z
        .union([
          z.literal(GUILD_VERIFICATION_LEVEL.NONE),
          z.literal(GUILD_VERIFICATION_LEVEL.LOW),
          z.literal(GUILD_VERIFICATION_LEVEL.MEDIUM),
          z.literal(GUILD_VERIFICATION_LEVEL.HIGH),
        ])
        .optional()
        .describe('0=NONE, 1=LOW, 2=MEDIUM, 3=HIGH (Fluxer has 4 levels 0..3)'),
      mfa_level: z
        .union([z.literal(GUILD_MFA_LEVEL.NONE), z.literal(GUILD_MFA_LEVEL.ELEVATED)])
        .optional(),
      explicit_content_filter: z
        .union([
          z.literal(GUILD_EXPLICIT_CONTENT_FILTER.DISABLED),
          z.literal(GUILD_EXPLICIT_CONTENT_FILTER.MEMBERS_WITHOUT_ROLES),
          z.literal(GUILD_EXPLICIT_CONTENT_FILTER.ALL_MEMBERS),
        ])
        .optional(),
      default_message_notifications: z.union([z.literal(0), z.literal(1)]).optional(),
      afk_channel_id: ChannelId.nullable().optional(),
      afk_timeout: z.number().int().min(60).max(3600).optional(),
      system_channel_id: ChannelId.nullable().optional(),
      system_channel_flags: z.number().int().min(0).optional(),
      nsfw: z.boolean().optional(),
      nsfw_level: z
        .union([z.literal(GUILD_NSFW_LEVEL.SAFE), z.literal(GUILD_NSFW_LEVEL.AGE_RESTRICTED)])
        .optional(),
      content_warning_level: z
        .union([
          z.literal(CONTENT_WARNING_LEVEL.INHERIT),
          z.literal(CONTENT_WARNING_LEVEL.CONTENT_WARNING),
        ])
        .optional(),
      content_warning_text: z.string().max(200).nullable().optional(),
      splash_card_alignment: z
        .union([
          z.literal(GUILD_SPLASH_CARD_ALIGNMENT.CENTER),
          z.literal(GUILD_SPLASH_CARD_ALIGNMENT.LEFT),
          z.literal(GUILD_SPLASH_CARD_ALIGNMENT.RIGHT),
        ])
        .optional(),
      icon: z.string().nullable().optional(),
      banner: z.string().nullable().optional(),
      splash: z.string().nullable().optional(),
      embed_splash: z.string().nullable().optional(),
      features: z.array(z.string()).optional(),
      message_history_cutoff: z.string().nullable().optional(),
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
        'name',
        'verification_level',
        'mfa_level',
        'explicit_content_filter',
        'default_message_notifications',
        'afk_channel_id',
        'afk_timeout',
        'system_channel_id',
        'system_channel_flags',
        'nsfw',
        'nsfw_level',
        'content_warning_level',
        'content_warning_text',
        'splash_card_alignment',
        'icon',
        'banner',
        'splash',
        'embed_splash',
        'features',
        'message_history_cutoff',
      ]);
      const g = await ctx.rest.patch<Record<string, unknown>>(FluxerRoutes.guild(args.guild_id), {
        body,
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Updated Fluxer guild \`${args.guild_id}\`.`,
        data: g,
      });
    },
  }),

  defineTool({
    name: 'guild_delete',
    category: 'guild',
    guildScoped: true,
    confirmRequired: true,
    description:
      'Permanently delete a Fluxer guild (`POST /guilds/{guild_id}/delete`). IRREVERSIBLE and strictly confirmation-gated (requires guild ownership, MCP_DRY_RUN=false, and __confirm: true). Note: Fluxer uses POST /delete rather than HTTP DELETE.',
    inputSchema: {
      guild_id: GuildId,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.post(FluxerRoutes.guildDelete(args.guild_id), { body: {} });
      return dualResult({
        text: `Deleted Fluxer guild \`${args.guild_id}\`.`,
        data: { deleted: true, guild_id: args.guild_id },
      });
    },
  }),

  defineTool({
    name: 'guild_get_vanity_url',
    category: 'guild',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    description:
      "Get a Fluxer guild's custom vanity URL code and use count (`GET /guilds/{guild_id}/vanity-url`).",
    inputSchema: { guild_id: GuildId },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const vanity = await ctx.rest.get<Record<string, unknown>>(
        FluxerRoutes.guildVanityUrl(args.guild_id),
      );
      return dualResult({
        text: `Guild \`${args.guild_id}\` vanity URL: \`${String(vanity.code ?? 'none')}\` (uses: ${String(vanity.uses ?? 0)}).`,
        data: { guild_id: args.guild_id, ...vanity },
      });
    },
  }),

  defineTool({
    name: 'guild_update_vanity_url',
    category: 'guild',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    description:
      "Fluxer-native: set or clear a guild's custom vanity URL (`PATCH /guilds/{guild_id}/vanity-url`). Requires VANITY_URL guild feature.",
    inputSchema: {
      guild_id: GuildId,
      code: z
        .string()
        .trim()
        .min(2)
        .max(32)
        .regex(/^[a-z0-9-]+$/i)
        .nullable()
        .describe('New vanity slug or null to clear'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const vanity = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildVanityUrl(args.guild_id),
        {
          body: { code: args.code },
          ...(args.audit_reason ? { reason: args.audit_reason } : {}),
        },
      );
      return dualResult({
        text: `Updated vanity URL for guild \`${args.guild_id}\` to \`${String(vanity.code ?? args.code ?? 'cleared')}\`.`,
        data: { guild_id: args.guild_id, ...vanity },
      });
    },
  }),

  defineTool({
    name: 'guild_update_channel_positions',
    category: 'guild',
    requiredPermissions: ['MANAGE_CHANNELS'],
    guildScoped: true,
    description:
      'Bulk-reorder channels and move channels between categories (`PATCH /guilds/{guild_id}/channels`). Supports Fluxer `preceding_sibling_id` and `lock_permissions`.',
    inputSchema: {
      guild_id: GuildId,
      positions: z
        .array(
          z.object({
            id: ChannelId,
            position: z.number().int().min(0).nullable().optional(),
            parent_id: ChannelId.nullable().optional(),
            preceding_sibling_id: ChannelId.nullable().optional(),
            lock_permissions: z.boolean().nullable().optional(),
          }),
        )
        .min(1)
        .max(250),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.patch(FluxerRoutes.guildChannels(args.guild_id), {
        body: args.positions,
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Reordered ${args.positions.length} channel(s) in guild \`${args.guild_id}\`.`,
        data: { updated: true, guild_id: args.guild_id, count: args.positions.length },
      });
    },
  }),

  defineTool({
    name: 'guild_list_invites',
    category: 'guild',
    requiredPermissions: ['MANAGE_GUILD'],
    guildScoped: true,
    description:
      'List all active invites across a Fluxer guild (`GET /guilds/{guild_id}/invites`).',
    inputSchema: { guild_id: GuildId },
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
        text: `Guild \`${args.guild_id}\` has ${invites.length} active invite(s).`,
        data: { guild_id: args.guild_id, count: invites.length, invites },
      });
    },
  }),

  // --- Advanced Security Audit, Anti-Raid, Backup, Diff & Clone (5 tools) ---
  defineTool({
    name: 'guild_security_audit',
    category: 'guild',
    guildScoped: true,
    description:
      'Perform a comprehensive Fluxer community security & misconfiguration audit. Inspects verification_level, MFA moderation enforcement, explicit_content_filter, @everyone dangerous permissions, overly privileged roles (ADMINISTRATOR / MANAGE_ROLES), channel overwrite exposure leaks, unexpiring/unlimited invites, active webhooks, and raid flags. Returns a 0-100 security score, prioritized findings, and concrete remediation actions.',
    inputSchema: {
      guild_id: GuildId,
      include_webhooks: z
        .boolean()
        .optional()
        .describe('Audit guild webhooks (requires MANAGE_WEBHOOKS, default true)'),
      include_invites: z
        .boolean()
        .optional()
        .describe('Audit guild invites (requires MANAGE_GUILD, default true)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const [guild, roles, channels, invites, webhooks] = await Promise.all([
        ctx.rest.get<Record<string, unknown>>(FluxerRoutes.guild(args.guild_id)),
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<ChannelLike[]>(FluxerRoutes.guildChannels(args.guild_id)),
        args.include_invites !== false
          ? ctx.rest
              .get<Array<Record<string, unknown>>>(FluxerRoutes.guildInvites(args.guild_id))
              .catch(() => null)
          : Promise.resolve(null),
        args.include_webhooks !== false
          ? ctx.rest
              .get<Array<Record<string, unknown>>>(FluxerRoutes.guildWebhooks(args.guild_id))
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      const findings: Array<{
        id: string;
        severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
        category: string;
        resource: string;
        title: string;
        remediation: string;
      }> = [];

      let penalty = 0;
      const addFinding = (f: (typeof findings)[number]) => {
        findings.push(f);
        if (f.severity === 'critical') penalty += 25;
        else if (f.severity === 'high') penalty += 15;
        else if (f.severity === 'medium') penalty += 8;
        else if (f.severity === 'low') penalty += 3;
      };

      // 1. Guild baseline controls
      const verification = Number(guild.verification_level ?? 0);
      if (verification === 0) {
        addFinding({
          id: 'GUILD_VERIFICATION_NONE',
          severity: 'high',
          category: 'guild_settings',
          resource: `guild:${args.guild_id}`,
          title: 'Verification level is NONE (0) — unverified accounts can post immediately.',
          remediation: 'Call guild_modify with verification_level: 1 (LOW) or 2 (MEDIUM).',
        });
      }
      if (Number(guild.mfa_level ?? 0) === 0) {
        addFinding({
          id: 'GUILD_MFA_DISABLED',
          severity: 'medium',
          category: 'guild_settings',
          resource: `guild:${args.guild_id}`,
          title: 'Elevated 2FA requirement for moderators (mfa_level) is disabled.',
          remediation: 'Enable mfa_level: 1 via guild_modify to protect staff actions.',
        });
      }
      if (Number(guild.explicit_content_filter ?? 0) === 0) {
        addFinding({
          id: 'GUILD_EXPLICIT_FILTER_OFF',
          severity: 'low',
          category: 'guild_settings',
          resource: `guild:${args.guild_id}`,
          title: 'Explicit content filter is disabled.',
          remediation: 'Set explicit_content_filter: 1 or 2 via guild_modify.',
        });
      }
      const features = Array.isArray(guild.features) ? (guild.features as string[]) : [];
      if (features.includes('RAID_DETECTED')) {
        addFinding({
          id: 'GUILD_RAID_DETECTED',
          severity: 'critical',
          category: 'anti_raid',
          resource: `guild:${args.guild_id}`,
          title: 'Fluxer flagged this community with RAID_DETECTED.',
          remediation: 'Run guild_raid_shield (mode: "lockdown") and inspect audit_log_summary.',
        });
      }

      // 2. Role & @everyone audit
      const adminRoles: RoleLike[] = [];
      for (const role of roles) {
        const isEveryone = role.id === args.guild_id;
        const bits = parsePermissionBits(role.permissions);
        const dangerous = findDangerousPermissions(bits, isEveryone);
        if (isEveryone && dangerous.length > 0) {
          addFinding({
            id: 'EVERYONE_DANGEROUS_PERMISSIONS',
            severity: 'critical',
            category: 'permissions',
            resource: `role:${role.id}`,
            title: `@everyone holds dangerous permission(s): ${dangerous.join(', ')}`,
            remediation: `Strip dangerous bits from @everyone via roles_modify (role_id: "${role.id}").`,
          });
        }
        if (!isEveryone && (bits & FLUXER_PERMISSIONS.ADMINISTRATOR) !== 0n) {
          adminRoles.push(role);
        }
        if (!isEveryone && role.mentionable && dangerous.length > 0) {
          addFinding({
            id: 'PRIVILEGED_ROLE_MENTIONABLE',
            severity: 'low',
            category: 'roles',
            resource: `role:${role.id}`,
            title: `Privileged role "${role.name}" is globally mentionable.`,
            remediation: `Consider setting mentionable: false on role "${role.name}" to prevent mass pings.`,
          });
        }
      }
      if (adminRoles.length > 3) {
        addFinding({
          id: 'EXCESSIVE_ADMIN_ROLES',
          severity: 'high',
          category: 'roles',
          resource: `guild:${args.guild_id}`,
          title: `${adminRoles.length} roles grant ADMINISTRATOR (${adminRoles.map((r) => r.name).join(', ')}).`,
          remediation:
            'Apply least privilege: keep ADMINISTRATOR on at most 1-2 founder/owner roles and grant scoped moderator permissions to other staff roles.',
        });
      }

      // 3. Channel overwrites audit
      for (const ch of channels) {
        for (const ow of ch.permission_overwrites ?? []) {
          if (ow.type === 0 && ow.id === args.guild_id) {
            const allow = parsePermissionBits(ow.allow);
            const risky = findDangerousPermissions(allow, true);
            if (risky.length > 0) {
              addFinding({
                id: 'CHANNEL_EVERYONE_OVERWRITE_EXPOSURE',
                severity: 'high',
                category: 'channels',
                resource: `channel:${ch.id}`,
                title: `Channel #${ch.name ?? ch.id} explicitly allows @everyone: ${risky.join(', ')}`,
                remediation: `Update overwrite for @everyone on channel ${ch.id} via channels_modify_permissions.`,
              });
            }
          }
        }
      }

      // 4. Invites & Webhooks audit
      if (invites !== null) {
        const permanentUnlimited = invites.filter(
          (i) => Number(i.max_age ?? 0) === 0 && Number(i.max_uses ?? 0) === 0,
        );
        if (permanentUnlimited.length > 3) {
          addFinding({
            id: 'MANY_PERMANENT_INVITES',
            severity: 'medium',
            category: 'invites',
            resource: `guild:${args.guild_id}`,
            title: `${permanentUnlimited.length} permanent unlimited invite links are active.`,
            remediation:
              'Revoke unused permanent invites via invites_delete to reduce raid surface.',
          });
        }
      }
      if (webhooks !== null && webhooks.length > 10) {
        addFinding({
          id: 'HIGH_WEBHOOK_COUNT',
          severity: 'medium',
          category: 'webhooks',
          resource: `guild:${args.guild_id}`,
          title: `${webhooks.length} webhooks exist in this guild; leaked webhook tokens bypass bot auth.`,
          remediation: 'Audit webhooks via webhooks_list_guild and delete unused ones.',
        });
      }

      const score = Math.max(0, 100 - penalty);
      const grade =
        score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

      return dualResult({
        text: `Security Audit for guild \`${args.guild_id}\`: **Score ${score}/100 (Grade ${grade})** — ${findings.length} finding(s) (${findings.filter((f) => f.severity === 'critical').length} critical, ${findings.filter((f) => f.severity === 'high').length} high).`,
        data: {
          guild_id: args.guild_id,
          score,
          grade,
          checked_surfaces: {
            guild_settings: true,
            roles: roles.length,
            channels: channels.length,
            invites: invites?.length ?? 'skipped_or_unauthorized',
            webhooks: webhooks?.length ?? 'skipped_or_unauthorized',
          },
          findings,
        },
      });
    },
  }),

  defineTool({
    name: 'guild_raid_shield',
    category: 'guild',
    requiredPermissions: ['MANAGE_GUILD', 'MANAGE_ROLES'],
    guildScoped: true,
    description:
      'Anti-raid & emergency lockdown coordinator for Fluxer communities. Modes: `assess` (read-only posture check), `lockdown` (saves pre-lockdown snapshot and raises verification_level to HIGH + removes CREATE_INSTANT_INVITE / SEND_MESSAGES / ADD_REACTIONS from @everyone, previewable unless `apply: true`), and `restore` (reverts guild & @everyone permissions from the saved pre-lockdown snapshot).',
    inputSchema: {
      guild_id: GuildId,
      mode: z.enum(['assess', 'lockdown', 'restore']),
      apply: z
        .boolean()
        .optional()
        .describe(
          'Set true to actually mutate Fluxer in lockdown/restore mode; omit or false for dry-run preview',
        ),
      snapshot_id: z
        .string()
        .optional()
        .describe('Snapshot ID returned by lockdown (required for restore)'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const [guild, roles] = await Promise.all([
        ctx.rest.get<Record<string, unknown>>(FluxerRoutes.guild(args.guild_id)),
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
      ]);
      const everyone = roles.find((r) => r.id === args.guild_id);
      const currentBits = parsePermissionBits(everyone?.permissions);
      const stateDir = resolveStateDirectory(ctx.config);
      const secret = deriveSigningSecret(ctx.config);

      if (args.mode === 'assess') {
        const features = Array.isArray(guild.features) ? (guild.features as string[]) : [];
        return dualResult({
          text: `Raid Shield assessment for guild \`${args.guild_id}\`: verification_level=${String(guild.verification_level ?? 0)}, raid_detected=${features.includes('RAID_DETECTED')}.`,
          data: {
            guild_id: args.guild_id,
            verification_level: guild.verification_level ?? 0,
            raid_detected: features.includes('RAID_DETECTED'),
            invites_disabled: features.includes('INVITES_DISABLED'),
            everyone_can_send: (currentBits & FLUXER_PERMISSIONS.SEND_MESSAGES) !== 0n,
            everyone_can_invite: (currentBits & FLUXER_PERMISSIONS.CREATE_INSTANT_INVITE) !== 0n,
            everyone_permissions: decodePermissionNames(currentBits),
          },
        });
      }

      if (args.mode === 'lockdown') {
        const stripMask =
          FLUXER_PERMISSIONS.CREATE_INSTANT_INVITE |
          FLUXER_PERMISSIONS.SEND_MESSAGES |
          FLUXER_PERMISSIONS.ADD_REACTIONS |
          FLUXER_PERMISSIONS.MENTION_EVERYONE;
        const lockedBits = currentBits & ~stripMask;

        if (!args.apply) {
          return dualResult({
            text: `Raid Shield lockdown PREVIEW for guild \`${args.guild_id}\` (no changes applied). Re-run with \`apply: true\` to engage lockdown.`,
            data: {
              status: 'preview',
              guild_id: args.guild_id,
              planned_changes: {
                verification_level: {
                  from: guild.verification_level ?? 0,
                  to: GUILD_VERIFICATION_LEVEL.HIGH,
                },
                everyone_permissions: { from: currentBits.toString(), to: lockedBits.toString() },
              },
            },
          });
        }

        const snapshotId = `raid_${args.guild_id}_${Date.now()}`;
        saveSignedState({
          stateDir,
          namespace: 'raid-shield',
          id: snapshotId,
          secret,
          payload: {
            guild_id: args.guild_id,
            verification_level: Number(guild.verification_level ?? 0),
            everyone_permissions: currentBits.toString(),
          },
        });

        await ctx.rest.patch(FluxerRoutes.guild(args.guild_id), {
          body: { verification_level: GUILD_VERIFICATION_LEVEL.HIGH },
          reason: args.audit_reason ?? 'Fluxer MCP Raid Shield lockdown',
        });
        if (everyone) {
          await ctx.rest.patch(FluxerRoutes.guildRole(args.guild_id, everyone.id), {
            body: { permissions: lockedBits.toString() },
            reason: args.audit_reason ?? 'Fluxer MCP Raid Shield lockdown',
          });
        }

        return dualResult({
          text: `Raid Shield LOCKDOWN ACTIVE for guild \`${args.guild_id}\`. Snapshot saved as \`${snapshotId}\` for one-step restore.`,
          data: {
            status: 'locked_down',
            guild_id: args.guild_id,
            snapshot_id: snapshotId,
            verification_level: GUILD_VERIFICATION_LEVEL.HIGH,
            everyone_permissions: lockedBits.toString(),
          },
        });
      }

      // restore mode
      if (!args.snapshot_id) {
        throw new Error('snapshot_id is required when mode is "restore".');
      }
      const saved = loadSignedState<{
        guild_id: string;
        verification_level: number;
        everyone_permissions: string;
      }>({ stateDir, namespace: 'raid-shield', id: args.snapshot_id, secret });
      if (!saved || saved.payload.guild_id !== args.guild_id) {
        throw new Error(
          `No verified raid-shield snapshot "${args.snapshot_id}" found for guild ${args.guild_id}.`,
        );
      }

      if (!args.apply) {
        return dualResult({
          text: `Raid Shield restore PREVIEW from \`${args.snapshot_id}\`. Re-run with \`apply: true\` to restore.`,
          data: { status: 'preview', snapshot_id: args.snapshot_id, will_restore: saved.payload },
        });
      }

      await ctx.rest.patch(FluxerRoutes.guild(args.guild_id), {
        body: { verification_level: saved.payload.verification_level },
        reason: args.audit_reason ?? 'Fluxer MCP Raid Shield restore',
      });
      await ctx.rest.patch(FluxerRoutes.guildRole(args.guild_id, args.guild_id), {
        body: { permissions: saved.payload.everyone_permissions },
        reason: args.audit_reason ?? 'Fluxer MCP Raid Shield restore',
      });

      return dualResult({
        text: `Restored guild \`${args.guild_id}\` from Raid Shield snapshot \`${args.snapshot_id}\`.`,
        data: { status: 'restored', snapshot_id: args.snapshot_id, restored: saved.payload },
      });
    },
  }),

  defineTool({
    name: 'guild_backup_export',
    category: 'guild',
    guildScoped: true,
    description:
      'Export a complete, checksummed, HMAC-signed configuration backup of a Fluxer community (guild settings, roles + hoist positions, channels + categories + forum tags + link URLs + overwrites, emojis, stickers, vanity URL, discovery status, and invites). Stored locally and returned for diffing, restoration, or community cloning.',
    inputSchema: {
      guild_id: GuildId,
      backup_name: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9._-]+$/)
        .optional()
        .describe('Optional custom backup identifier'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const snapshot = await fetchGuildBackupSnapshot(args.guild_id, ctx.rest);
      const backupId = args.backup_name ?? `backup_${args.guild_id}_${Date.now()}`;
      const record = saveSignedState({
        stateDir: resolveStateDirectory(ctx.config),
        namespace: 'backups',
        id: backupId,
        secret: deriveSigningSecret(ctx.config),
        payload: snapshot,
      });
      return dualResult({
        text: `Exported signed Fluxer community backup \`${record.id}\` (${snapshot.roles.length} roles, ${snapshot.channels.length} channels, ${snapshot.emojis.length} emojis, ${snapshot.stickers.length} stickers). Digest: \`${record.digest}\`.`,
        data: {
          backup_id: record.id,
          digest: record.digest,
          created_at: record.created_at,
          counts: {
            roles: snapshot.roles.length,
            channels: snapshot.channels.length,
            emojis: snapshot.emojis.length,
            stickers: snapshot.stickers.length,
            invites: snapshot.invites.length,
          },
          snapshot,
        },
      });
    },
  }),

  defineTool({
    name: 'guild_config_diff',
    category: 'guild',
    description:
      'Compare two Fluxer community configurations — either two saved backup IDs, a saved backup against a live guild, or two live guilds — and report added/removed/changed roles, permissions, channels, overwrites, and security settings.',
    inputSchema: {
      source_backup_id: z
        .string()
        .optional()
        .describe('Baseline backup ID (from guild_backup_export)'),
      source_guild_id: GuildId.optional().describe(
        'Baseline live guild ID (if source_backup_id omitted)',
      ),
      target_backup_id: z.string().optional().describe('Target backup ID'),
      target_guild_id: GuildId.optional().describe(
        'Target live guild ID (if target_backup_id omitted)',
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const stateDir = resolveStateDirectory(ctx.config);
      const secret = deriveSigningSecret(ctx.config);

      const loadOne = async (backupId?: string, guildId?: string): Promise<GuildBackupSnapshot> => {
        if (backupId) {
          const rec = loadSignedState<GuildBackupSnapshot>({
            stateDir,
            namespace: 'backups',
            id: backupId,
            secret,
          });
          if (!rec) throw new Error(`Backup "${backupId}" was not found.`);
          return rec.payload;
        }
        if (guildId) return fetchGuildBackupSnapshot(guildId, ctx.rest);
        throw new Error('Provide either a backup_id or a guild_id for both source and target.');
      };

      const [src, dst] = await Promise.all([
        loadOne(args.source_backup_id, args.source_guild_id),
        loadOne(args.target_backup_id, args.target_guild_id),
      ]);

      const srcRoles = new Map(src.roles.map((r) => [r.name.toLowerCase(), r]));
      const dstRoles = new Map(dst.roles.map((r) => [r.name.toLowerCase(), r]));
      const addedRoles = dst.roles
        .filter((r) => !srcRoles.has(r.name.toLowerCase()))
        .map((r) => r.name);
      const removedRoles = src.roles
        .filter((r) => !dstRoles.has(r.name.toLowerCase()))
        .map((r) => r.name);
      const changedRoles: Array<{
        name: string;
        changes: Record<string, { before: unknown; after: unknown }>;
      }> = [];
      for (const [key, sRole] of srcRoles.entries()) {
        const dRole = dstRoles.get(key);
        if (!dRole) continue;
        const changes: Record<string, { before: unknown; after: unknown }> = {};
        if (sRole.permissions !== dRole.permissions) {
          changes.permissions = { before: sRole.permissions, after: dRole.permissions };
        }
        if (Boolean(sRole.hoist) !== Boolean(dRole.hoist)) {
          changes.hoist = { before: Boolean(sRole.hoist), after: Boolean(dRole.hoist) };
        }
        if ((sRole.color ?? 0) !== (dRole.color ?? 0)) {
          changes.color = { before: sRole.color ?? 0, after: dRole.color ?? 0 };
        }
        if (Object.keys(changes).length > 0) changedRoles.push({ name: dRole.name, changes });
      }

      const srcChs = new Map(
        src.channels.map((c) => [`${c.type}:${(c.name ?? '').toLowerCase()}`, c]),
      );
      const dstChs = new Map(
        dst.channels.map((c) => [`${c.type}:${(c.name ?? '').toLowerCase()}`, c]),
      );
      const addedChannels = dst.channels
        .filter((c) => !srcChs.has(`${c.type}:${(c.name ?? '').toLowerCase()}`))
        .map((c) => ({
          name: c.name ?? '',
          type: FLUXER_CHANNEL_TYPE_NAMES[c.type] ?? String(c.type),
        }));
      const removedChannels = src.channels
        .filter((c) => !dstChs.has(`${c.type}:${(c.name ?? '').toLowerCase()}`))
        .map((c) => ({
          name: c.name ?? '',
          type: FLUXER_CHANNEL_TYPE_NAMES[c.type] ?? String(c.type),
        }));

      const settingKeys = [
        'name',
        'verification_level',
        'mfa_level',
        'explicit_content_filter',
        'default_message_notifications',
        'nsfw_level',
      ] as const;
      const settingChanges: Record<string, { before: unknown; after: unknown }> = {};
      for (const k of settingKeys) {
        if (src.guild[k] !== dst.guild[k]) {
          settingChanges[k] = { before: src.guild[k] ?? null, after: dst.guild[k] ?? null };
        }
      }

      const totalChanges =
        addedRoles.length +
        removedRoles.length +
        changedRoles.length +
        addedChannels.length +
        removedChannels.length +
        Object.keys(settingChanges).length;

      return dualResult({
        text: `Config diff complete: ${totalChanges} difference(s) (${addedRoles.length} added roles, ${removedRoles.length} removed roles, ${changedRoles.length} changed roles, ${addedChannels.length} added channels, ${removedChannels.length} removed channels, ${Object.keys(settingChanges).length} setting changes).`,
        data: {
          source_digest: sha256Digest(src),
          target_digest: sha256Digest(dst),
          total_differences: totalChanges,
          settings: settingChanges,
          roles: { added: addedRoles, removed: removedRoles, changed: changedRoles },
          channels: { added: addedChannels, removed: removedChannels },
        },
      });
    },
  }),

  defineTool({
    name: 'guild_clone_plan',
    category: 'guild',
    guildScoped: true,
    description:
      'Generate a non-destructive, previewable duplication/restore plan to replicate roles, categories, channels, and guild settings from a source Fluxer guild or exported backup into a target Fluxer guild. Produces a signed plan reference usable with `guild_blueprint_apply`.',
    inputSchema: {
      guild_id: GuildId.describe('Target Fluxer guild to clone/restore into'),
      source_backup_id: z.string().optional().describe('Saved backup ID from guild_backup_export'),
      source_guild_id: GuildId.optional().describe('Or live source Fluxer guild ID to clone from'),
      include_guild_settings: z
        .boolean()
        .optional()
        .describe('Include verification_level & content filter (default true)'),
      strip_dangerous_everyone_permissions: z
        .boolean()
        .optional()
        .describe('Safety default (true): never copy dangerous @everyone permissions'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const stateDir = resolveStateDirectory(ctx.config);
      const secret = deriveSigningSecret(ctx.config);
      let source: GuildBackupSnapshot;
      if (args.source_backup_id) {
        const rec = loadSignedState<GuildBackupSnapshot>({
          stateDir,
          namespace: 'backups',
          id: args.source_backup_id,
          secret,
        });
        if (!rec) throw new Error(`Backup "${args.source_backup_id}" not found.`);
        source = rec.payload;
      } else if (args.source_guild_id) {
        source = await fetchGuildBackupSnapshot(args.source_guild_id, ctx.rest);
      } else {
        throw new Error('Provide either source_backup_id or source_guild_id.');
      }

      const target = await fetchGuildBackupSnapshot(args.guild_id, ctx.rest);
      const existingRoleNames = new Set(target.roles.map((r) => r.name.toLowerCase()));
      const existingChannelKeys = new Set(
        target.channels.map((c) => `${c.type}:${(c.name ?? '').toLowerCase()}`),
      );

      const categoryNamesById = new Map(
        source.channels.filter((c) => c.type === 4).map((c) => [c.id, c.name ?? 'Category']),
      );

      const rolesToCreate = source.roles
        .filter((r) => r.name !== '@everyone' && !existingRoleNames.has(r.name.toLowerCase()))
        .map((r) => ({
          name: r.name,
          color: r.color ?? 0,
          hoist: Boolean(r.hoist),
          mentionable: Boolean(r.mentionable),
          permissions: r.permissions,
        }));

      const categoriesToCreate = source.channels
        .filter(
          (c) => c.type === 4 && !existingChannelKeys.has(`4:${(c.name ?? '').toLowerCase()}`),
        )
        .map((c) => ({ name: c.name ?? 'Category' }));

      const channelsToCreate = source.channels
        .filter(
          (c) =>
            c.type !== 4 && !existingChannelKeys.has(`${c.type}:${(c.name ?? '').toLowerCase()}`),
        )
        .map((c) => {
          const raw = c as unknown as Record<string, unknown>;
          return {
            name: c.name ?? 'channel',
            type: c.type,
            category: c.parent_id ? (categoryNamesById.get(c.parent_id) ?? null) : null,
            ...(typeof raw.topic === 'string' ? { topic: raw.topic } : {}),
            ...(typeof raw.url === 'string' ? { url: raw.url } : {}),
          };
        });

      const planId = `clone_${args.guild_id}_${Date.now()}`;
      const planPayload = {
        schema_version: 'fluxer_blueprint_plan.v1' as const,
        kind: 'clone' as const,
        guild_id: args.guild_id,
        blueprint: {
          name: String(source.guild.name ?? 'Cloned Community'),
          guild_settings:
            args.include_guild_settings === false
              ? undefined
              : {
                  verification_level: Number(source.guild.verification_level ?? 1),
                  explicit_content_filter: Number(source.guild.explicit_content_filter ?? 1),
                },
          roles: rolesToCreate,
          categories: categoriesToCreate,
          channels: channelsToCreate,
          welcome_posts: [],
        },
      };

      const saved = saveSignedState({
        stateDir,
        namespace: 'blueprints',
        id: planId,
        secret,
        payload: planPayload,
      });

      return dualResult({
        text: `Clone/restore plan \`${saved.id}\` ready for target guild \`${args.guild_id}\`: ${rolesToCreate.length} role(s), ${categoriesToCreate.length} category(ies), ${channelsToCreate.length} channel(s) to create. No mutations performed. Apply with \`guild_blueprint_apply\`.`,
        data: {
          status:
            rolesToCreate.length + categoriesToCreate.length + channelsToCreate.length === 0
              ? 'already_current'
              : 'ready',
          plan_ref: saved.id,
          plan_digest: saved.digest,
          target_guild_id: args.guild_id,
          operations_summary: {
            roles_to_create: rolesToCreate.length,
            categories_to_create: categoriesToCreate.length,
            channels_to_create: channelsToCreate.length,
          },
          plan: planPayload.blueprint,
        },
      });
    },
  }),

  defineTool({
    name: 'guild_configure_welcome',
    category: 'guild',
    guildScoped: true,
    requiredPermissions: ['MANAGE_GUILD'],
    description:
      'Configure Fluxer community welcome & rules systems in one coordinated operation: sets `system_channel_id`, `system_channel_flags` (join notifications), and `rules_channel_id` via `PATCH /guilds/{guild_id}`, and optionally posts & pins a rich welcome/rules embed. Set `preview: true` to inspect changes without mutating Fluxer.',
    inputSchema: {
      guild_id: GuildId,
      system_channel_id: ChannelId.nullable()
        .optional()
        .describe('Welcome/system channel ID (null to clear)'),
      rules_channel_id: ChannelId.nullable()
        .optional()
        .describe('Community rules channel ID (null to clear)'),
      suppress_join_notifications: z
        .boolean()
        .optional()
        .describe('Suppress Fluxer system join notifications (SYSTEM_CHANNEL_FLAGS bit 0)'),
      welcome_post: z
        .object({
          channel_id: ChannelId.describe('Channel where the welcome/rules message will be posted'),
          content: z.string().max(4000).optional(),
          embeds: z.array(RichEmbedSchema).max(10).optional(),
          pin: z.boolean().optional().describe('Pin the posted welcome message (default true)'),
        })
        .optional()
        .describe('Optional welcome or rules message to publish and pin'),
      preview: z
        .boolean()
        .optional()
        .describe('Preview exact guild patch and welcome post without mutating Fluxer'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const guildPatch: Record<string, unknown> = {};
      if (args.system_channel_id !== undefined) {
        guildPatch.system_channel_id = args.system_channel_id;
      }
      if (args.rules_channel_id !== undefined) {
        guildPatch.rules_channel_id = args.rules_channel_id;
      }
      if (args.suppress_join_notifications !== undefined) {
        guildPatch.system_channel_flags = args.suppress_join_notifications
          ? SYSTEM_CHANNEL_FLAGS.SUPPRESS_JOIN_NOTIFICATIONS
          : 0;
      }

      if (args.preview === true) {
        return dualResult({
          text: `Welcome configuration PREVIEW for guild \`${args.guild_id}\` (${Object.keys(guildPatch).length} guild setting(s)${args.welcome_post ? ' + 1 welcome post' : ''}). Re-run without \`preview: true\` to apply.`,
          data: {
            status: 'preview',
            guild_id: args.guild_id,
            guild_patch: guildPatch,
            welcome_post: args.welcome_post ?? null,
          },
        });
      }

      let updatedGuild: Record<string, unknown> | null = null;
      if (Object.keys(guildPatch).length > 0) {
        updatedGuild = await ctx.rest.patch<Record<string, unknown>>(
          FluxerRoutes.guild(args.guild_id),
          {
            body: guildPatch,
            reason: args.audit_reason ?? 'Fluxer MCP configure welcome system',
          },
        );
      }

      let postedMessageId: string | null = null;
      let pinned = false;
      if (args.welcome_post) {
        const msg = await ctx.rest.post<{ id: string }>(
          FluxerRoutes.channelMessages(args.welcome_post.channel_id),
          {
            body: {
              ...(args.welcome_post.content ? { content: args.welcome_post.content } : {}),
              ...(args.welcome_post.embeds ? { embeds: args.welcome_post.embeds } : {}),
            },
          },
        );
        postedMessageId = msg.id;
        if (args.welcome_post.pin !== false) {
          await ctx.rest.put(FluxerRoutes.channelPinMessage(args.welcome_post.channel_id, msg.id), {
            reason: args.audit_reason ?? 'Pin welcome message',
          });
          pinned = true;
        }
      }

      return dualResult({
        text: `Configured Fluxer welcome system for guild \`${args.guild_id}\`${postedMessageId ? ` and posted message \`${postedMessageId}\`${pinned ? ' (pinned)' : ''}` : ''}.`,
        data: {
          status: 'configured',
          guild_id: args.guild_id,
          guild_patch: guildPatch,
          guild: updatedGuild,
          welcome_message_id: postedMessageId,
          pinned,
        },
      });
    },
  }),
];
