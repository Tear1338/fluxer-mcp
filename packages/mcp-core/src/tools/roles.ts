import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import {
  type RoleLike,
  compareRolesDesc,
  decodePermissionNames,
  findDangerousPermissions,
  getHighestRolePosition,
  parsePermissionBits,
} from '../fluxer/permissions.js';
import {
  AuditReasonSchema,
  type FluxerTool,
  GuildId,
  PermissionString,
  RoleId,
  defineTool,
  dualResult,
  pickDefined,
} from './_lib/types.js';

export const roleTools: readonly FluxerTool[] = [
  defineTool({
    name: 'roles_list',
    category: 'roles',
    guildScoped: true,
    description:
      'List all roles in a Fluxer guild (`GET /guilds/{guild_id}/roles`), sorted by hierarchy position and including Fluxer-native `hoist_position` and decoded permission names.',
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
      const raw = await ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id));
      const roles = [...raw].sort(compareRolesDesc).map((r) => ({
        ...r,
        decoded_permissions: decodePermissionNames(parsePermissionBits(r.permissions)),
      }));
      return dualResult({
        text: `Listed ${roles.length} role(s) in guild \`${args.guild_id}\`.`,
        data: { guild_id: args.guild_id, count: roles.length, roles },
      });
    },
  }),

  defineTool({
    name: 'roles_create',
    category: 'roles',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description:
      'Create a new role in a Fluxer guild (`POST /guilds/{guild_id}/roles`). Supports name, color, permissions (base-10 bitfield string), hoist, mentionable, icon, unicode_emoji, and Fluxer-native `icon_source_role_id`.',
    inputSchema: {
      guild_id: GuildId,
      name: z.string().min(1).max(100),
      color: z.number().int().min(0).max(0xffffff).optional(),
      permissions: PermissionString.optional(),
      hoist: z.boolean().optional(),
      mentionable: z.boolean().optional(),
      icon: z.string().nullable().optional().describe('Data URI image or null'),
      unicode_emoji: z.string().max(64).nullable().optional(),
      icon_source_role_id: RoleId.optional().describe('Fluxer-native: copy icon from an existing role ID'),
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const body = pickDefined(args, [
        'name',
        'color',
        'permissions',
        'hoist',
        'mentionable',
        'icon',
        'unicode_emoji',
        'icon_source_role_id',
      ]);
      const role = await ctx.rest.post<Record<string, unknown>>(
        FluxerRoutes.guildRoles(args.guild_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Created Fluxer role **${String(role.name ?? args.name)}** (\`role:${String(role.id ?? '')}\`).`,
        data: role,
      });
    },
  }),

  defineTool({
    name: 'roles_modify',
    category: 'roles',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description:
      'Modify an existing Fluxer guild role (`PATCH /guilds/{guild_id}/roles/{role_id}`), including Fluxer-native `hoist_position`.',
    inputSchema: {
      guild_id: GuildId,
      role_id: RoleId,
      name: z.string().min(1).max(100).optional(),
      color: z.number().int().min(0).max(0xffffff).optional(),
      permissions: PermissionString.optional(),
      hoist: z.boolean().optional(),
      hoist_position: z.number().int().min(0).nullable().optional().describe('Fluxer-native sidebar hoist ordering position'),
      mentionable: z.boolean().optional(),
      icon: z.string().nullable().optional(),
      unicode_emoji: z.string().max(64).nullable().optional(),
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
        'color',
        'permissions',
        'hoist',
        'hoist_position',
        'mentionable',
        'icon',
        'unicode_emoji',
      ]);
      const role = await ctx.rest.patch<Record<string, unknown>>(
        FluxerRoutes.guildRole(args.guild_id, args.role_id),
        { body, ...(args.audit_reason ? { reason: args.audit_reason } : {}) },
      );
      return dualResult({
        text: `Updated role **${String(role.name ?? args.role_id)}** (\`role:${args.role_id}\`).`,
        data: role,
      });
    },
  }),

  defineTool({
    name: 'roles_delete',
    category: 'roles',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    confirmRequired: true,
    description:
      'Delete a role from a Fluxer guild (`DELETE /guilds/{guild_id}/roles/{role_id}`). Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      role_id: RoleId,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.guildRole(args.guild_id, args.role_id), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Deleted role \`role:${args.role_id}\` from guild \`${args.guild_id}\`.`,
        data: { deleted: true, guild_id: args.guild_id, role_id: args.role_id },
      });
    },
  }),

  defineTool({
    name: 'roles_modify_positions',
    category: 'roles',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description:
      'Reorder role hierarchy positions in a Fluxer guild (`PATCH /guilds/{guild_id}/roles`). Note: Fluxer returns 204 No Content on success.',
    inputSchema: {
      guild_id: GuildId,
      positions: z
        .array(z.object({ id: RoleId, position: z.number().int().min(0) }))
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
      await ctx.rest.patch(FluxerRoutes.guildRoles(args.guild_id), {
        body: args.positions,
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Updated hierarchy positions for ${args.positions.length} role(s) in guild \`${args.guild_id}\`.`,
        data: { updated: true, guild_id: args.guild_id, count: args.positions.length, positions: args.positions },
      });
    },
  }),

  defineTool({
    name: 'roles_modify_hoist_positions',
    category: 'roles',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description:
      'Fluxer-native: update custom sidebar hoist positions independently of permission hierarchy (`PATCH /guilds/{guild_id}/roles/hoist-positions`).',
    inputSchema: {
      guild_id: GuildId,
      hoist_positions: z
        .array(z.object({ id: RoleId, hoist_position: z.number().int().min(0) }))
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
      await ctx.rest.patch(FluxerRoutes.guildRoleHoistPositions(args.guild_id), {
        body: args.hoist_positions,
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Updated Fluxer hoist positions for ${args.hoist_positions.length} role(s) in guild \`${args.guild_id}\`.`,
        data: { updated: true, guild_id: args.guild_id, hoist_positions: args.hoist_positions },
      });
    },
  }),

  defineTool({
    name: 'roles_reset_hoist_positions',
    category: 'roles',
    requiredPermissions: ['MANAGE_ROLES'],
    guildScoped: true,
    description:
      'Fluxer-native: reset all custom role hoist positions back to follow standard role hierarchy (`DELETE /guilds/{guild_id}/roles/hoist-positions`).',
    inputSchema: {
      guild_id: GuildId,
      audit_reason: AuditReasonSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      await ctx.rest.delete(FluxerRoutes.guildRoleHoistPositions(args.guild_id), {
        ...(args.audit_reason ? { reason: args.audit_reason } : {}),
      });
      return dualResult({
        text: `Reset custom role hoist positions in guild \`${args.guild_id}\`.`,
        data: { reset: true, guild_id: args.guild_id },
      });
    },
  }),

  defineTool({
    name: 'roles_analyze_hierarchy',
    category: 'roles',
    guildScoped: true,
    description:
      'Analyze a Fluxer guild\'s complete role hierarchy: flags dangerous @everyone permissions, roles with ADMINISTRATOR or privilege-escalation paths (MANAGE_ROLES above moderator roles), hoist vs hierarchy mismatches, duplicate role names, and which roles the bot can/cannot manage.',
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
      const [rolesRaw, botMember] = await Promise.all([
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<{ roles?: string[] }>(FluxerRoutes.guildMemberMe(args.guild_id)).catch(() => null),
      ]);
      const sorted = [...rolesRaw].sort(compareRolesDesc);
      const botTopPos = botMember?.roles ? getHighestRolePosition(botMember.roles, sorted) : null;

      const findings: Array<{ severity: 'critical' | 'high' | 'medium' | 'low'; role_id: string; role_name: string; message: string }> = [];
      const seenNames = new Map<string, string[]>();

      const hierarchy = sorted.map((role) => {
        const isEveryone = role.id === args.guild_id;
        const bits = parsePermissionBits(role.permissions);
        const dangerous = findDangerousPermissions(bits, isEveryone);
        const key = role.name.trim().toLowerCase();
        const existing = seenNames.get(key) ?? [];
        existing.push(role.id);
        seenNames.set(key, existing);

        if (isEveryone && dangerous.length > 0) {
          findings.push({
            severity: 'critical',
            role_id: role.id,
            role_name: role.name,
            message: `@everyone holds dangerous permissions: ${dangerous.join(', ')}`,
          });
        } else if (dangerous.includes('ADMINISTRATOR')) {
          findings.push({
            severity: 'high',
            role_id: role.id,
            role_name: role.name,
            message: `Role "${role.name}" holds ADMINISTRATOR (bypasses all channel overwrites).`,
          });
        } else if (dangerous.includes('MANAGE_ROLES')) {
          findings.push({
            severity: 'medium',
            role_id: role.id,
            role_name: role.name,
            message: `Role "${role.name}" (pos ${role.position}) holds MANAGE_ROLES and can grant any of its permissions to lower roles.`,
          });
        }

        if (
          typeof role.hoist_position === 'number' &&
          role.hoist === false
        ) {
          findings.push({
            severity: 'low',
            role_id: role.id,
            role_name: role.name,
            message: `Role "${role.name}" has hoist_position=${role.hoist_position} set while hoist=false.`,
          });
        }

        return {
          id: role.id,
          name: role.name,
          position: role.position,
          hoist: Boolean(role.hoist),
          hoist_position: role.hoist_position ?? null,
          mentionable: Boolean(role.mentionable),
          is_everyone: isEveryone,
          bot_can_manage: botTopPos === null ? null : !isEveryone && role.position < botTopPos,
          dangerous_permissions: dangerous,
          permission_count: decodePermissionNames(bits).length,
        };
      });

      for (const [name, ids] of seenNames.entries()) {
        if (ids.length > 1) {
          findings.push({
            severity: 'low',
            role_id: ids[0]!,
            role_name: name,
            message: `Duplicate role name "${name}" shared by ${ids.length} roles (${ids.join(', ')}).`,
          });
        }
      }

      return dualResult({
        text: `Analyzed ${hierarchy.length} role(s) in guild \`${args.guild_id}\`: ${findings.length} finding(s) (${findings.filter((f) => f.severity === 'critical').length} critical).`,
        data: {
          guild_id: args.guild_id,
          role_count: hierarchy.length,
          bot_top_role_position: botTopPos,
          findings,
          hierarchy,
        },
      });
    },
  }),
];
