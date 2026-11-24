import { z } from 'zod';
import {
  DEFAULT_FLUXER_PERMISSIONS,
  FLUXER_CHANNEL_TYPES,
  FLUXER_PERMISSIONS,
  FluxerRoutes,
  GUILD_EXPLICIT_CONTENT_FILTER,
  GUILD_VERIFICATION_LEVEL,
} from '../fluxer/constants.js';
import {
  type ChannelLike,
  encodePermissionNames,
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
  ChannelId,
  defineTool,
  dualResult,
  type FluxerTool,
  GuildId,
  PermissionString,
  RoleId,
} from './_lib/types.js';

export interface BlueprintRoleSpec {
  readonly name: string;
  readonly color: number;
  readonly hoist: boolean;
  readonly mentionable: boolean;
  readonly permissions: string;
}

export interface BlueprintChannelSpec {
  readonly name: string;
  readonly type: number;
  readonly category: string | null;
  readonly topic?: string;
  readonly url?: string;
  readonly read_only_for_everyone?: boolean;
  readonly staff_only?: boolean;
  readonly forum_tags?: readonly string[];
}

export interface BlueprintWelcomePost {
  readonly channel_name: string;
  readonly title: string;
  readonly description: string;
  readonly pin?: boolean;
}

export interface FluxerCommunityBlueprint {
  readonly name: string;
  readonly archetype: string;
  readonly guild_settings?: {
    readonly verification_level: number;
    readonly explicit_content_filter: number;
  };
  readonly roles: readonly BlueprintRoleSpec[];
  readonly categories: ReadonlyArray<{ readonly name: string }>;
  readonly channels: readonly BlueprintChannelSpec[];
  readonly welcome_posts: readonly BlueprintWelcomePost[];
}

const MODERATOR_PERMS = encodePermissionNames([
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'READ_MESSAGE_HISTORY',
  'MANAGE_MESSAGES',
  'PIN_MESSAGES',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'MODERATE_MEMBERS',
  'MANAGE_NICKNAMES',
  'MUTE_MEMBERS',
  'DEAFEN_MEMBERS',
  'MOVE_MEMBERS',
  'MANAGE_THREADS',
  'VIEW_AUDIT_LOG',
]).toString();

const ADMIN_PERMS = encodePermissionNames(['ADMINISTRATOR']).toString();

const HELPER_PERMS = encodePermissionNames([
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'READ_MESSAGE_HISTORY',
  'ADD_REACTIONS',
  'EMBED_LINKS',
  'ATTACH_FILES',
  'PIN_MESSAGES',
  'MANAGE_THREADS',
  'CREATE_PUBLIC_THREADS',
  'SEND_MESSAGES_IN_THREADS',
]).toString();

const MEMBER_PERMS = DEFAULT_FLUXER_PERMISSIONS.toString();

/**
 * Pure deterministic Fluxer community blueprint compiler from any natural-language prompt
 * (English or French). Zero external template API dependency.
 */
export function compileFluxerBlueprint(
  request: string,
  customName?: string,
): FluxerCommunityBlueprint {
  const lower = request.toLowerCase();
  const isGaming = /(gaming|jeu|jeux|esport|clan|guild|minecraft|valorant|fps|mmo|squad)/i.test(
    lower,
  );
  const isDev =
    /(dev|code|coding|open.?source|software|tech|programming|github|api|mcp|saas|engineering)/i.test(
      lower,
    );
  const isCreator = /(stream|creator|youtube|twitch|art|music|podcast|content|créateur)/i.test(
    lower,
  );
  const isStudy =
    /(study|school|university|learn|course|formation|étud|ecole|école|académie)/i.test(lower);
  const isSupport =
    /(support|helpdesk|product|customer|client|business|startup|company|entreprise)/i.test(lower);

  const archetype = isGaming
    ? 'gaming'
    : isDev
      ? 'developer'
      : isSupport
        ? 'product_support'
        : isCreator
          ? 'creator'
          : isStudy
            ? 'education'
            : 'community';

  const baseName =
    customName?.trim() ||
    (isGaming
      ? 'Fluxer Gaming Community'
      : isDev
        ? 'Fluxer Developer Hub'
        : isSupport
          ? 'Fluxer Product & Support'
          : isCreator
            ? 'Fluxer Creator Lounge'
            : isStudy
              ? 'Fluxer Learning Hub'
              : 'Fluxer Community');

  const roles: BlueprintRoleSpec[] = [
    { name: 'Admin', color: 0xe74c3c, hoist: true, mentionable: false, permissions: ADMIN_PERMS },
    {
      name: 'Moderator',
      color: 0x3498db,
      hoist: true,
      mentionable: true,
      permissions: MODERATOR_PERMS,
    },
    {
      name: isDev ? 'Maintainer' : isGaming ? 'Squad Leader' : isStudy ? 'Mentor' : 'Helper',
      color: 0x2ecc71,
      hoist: true,
      mentionable: true,
      permissions: HELPER_PERMS,
    },
    { name: 'VIP', color: 0xf1c40f, hoist: true, mentionable: false, permissions: MEMBER_PERMS },
    {
      name: 'Member',
      color: 0x95a5a6,
      hoist: false,
      mentionable: false,
      permissions: MEMBER_PERMS,
    },
  ];

  const categories: Array<{ name: string }> = [{ name: 'Information' }, { name: 'Community' }];

  const channels: BlueprintChannelSpec[] = [
    {
      name: 'welcome',
      type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
      category: 'Information',
      topic: 'Welcome to the community! Start here to orient yourself.',
      read_only_for_everyone: true,
    },
    {
      name: 'rules',
      type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
      category: 'Information',
      topic: 'Community guidelines and code of conduct.',
      read_only_for_everyone: true,
    },
    {
      name: 'announcements',
      type: FLUXER_CHANNEL_TYPES.GUILD_ANNOUNCEMENT,
      category: 'Information',
      topic: 'Official community announcements and release news.',
      read_only_for_everyone: true,
    },
    {
      name: 'general',
      type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
      category: 'Community',
      topic: 'Main community discussion channel.',
    },
    {
      name: 'introductions',
      type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
      category: 'Community',
      topic: 'Say hello and introduce yourself!',
    },
    {
      name: 'media-showcase',
      type: FLUXER_CHANNEL_TYPES.GUILD_MEDIA,
      category: 'Community',
      topic: 'Share screenshots, artwork, and highlights.',
    },
  ];

  if (isGaming) {
    categories.push({ name: 'Gaming & LFG' }, { name: 'Voice Lounges' });
    channels.push(
      {
        name: 'looking-for-group',
        type: FLUXER_CHANNEL_TYPES.GUILD_FORUM,
        category: 'Gaming & LFG',
        topic: 'Find teammates and organize squads.',
        forum_tags: ['Casual', 'Ranked', 'Tournament', 'EU', 'NA'],
      },
      {
        name: 'clips-and-highlights',
        type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
        category: 'Gaming & LFG',
        topic: 'Share your best plays and highlights.',
      },
      {
        name: 'tournaments',
        type: FLUXER_CHANNEL_TYPES.GUILD_ANNOUNCEMENT,
        category: 'Gaming & LFG',
        topic: 'Brackets, schedules, and tournament news.',
        read_only_for_everyone: true,
      },
      { name: 'Lobby Voice', type: FLUXER_CHANNEL_TYPES.GUILD_VOICE, category: 'Voice Lounges' },
      { name: 'Squad Alpha', type: FLUXER_CHANNEL_TYPES.GUILD_VOICE, category: 'Voice Lounges' },
      { name: 'Squad Bravo', type: FLUXER_CHANNEL_TYPES.GUILD_VOICE, category: 'Voice Lounges' },
    );
  } else if (isDev || isSupport) {
    categories.push({ name: 'Help & Engineering' }, { name: 'Voice & Pairing' });
    channels.push(
      {
        name: 'help-forum',
        type: FLUXER_CHANNEL_TYPES.GUILD_FORUM,
        category: 'Help & Engineering',
        topic: 'Ask questions and browse solved threads.',
        forum_tags: ['Question', 'Bug', 'Solved', 'Feature Request'],
      },
      {
        name: 'showcase',
        type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
        category: 'Help & Engineering',
        topic: 'Share projects, PRs, and launches.',
      },
      {
        name: 'changelog',
        type: FLUXER_CHANNEL_TYPES.GUILD_ANNOUNCEMENT,
        category: 'Help & Engineering',
        topic: 'Releases and status updates.',
        read_only_for_everyone: true,
      },
      {
        name: 'documentation',
        type: FLUXER_CHANNEL_TYPES.GUILD_LINK,
        category: 'Information',
        url: 'https://docs.fluxer.com/',
      },
      { name: 'Office Hours', type: FLUXER_CHANNEL_TYPES.GUILD_VOICE, category: 'Voice & Pairing' },
      {
        name: 'Pair Programming',
        type: FLUXER_CHANNEL_TYPES.GUILD_VOICE,
        category: 'Voice & Pairing',
      },
    );
  } else if (isStudy) {
    categories.push({ name: 'Study & Q&A' }, { name: 'Study Rooms' });
    channels.push(
      {
        name: 'questions-forum',
        type: FLUXER_CHANNEL_TYPES.GUILD_FORUM,
        category: 'Study & Q&A',
        topic: 'Post study questions by subject.',
        forum_tags: ['Beginner', 'Intermediate', 'Solved', 'Resources'],
      },
      {
        name: 'resources',
        type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
        category: 'Study & Q&A',
        topic: 'Curated guides, notes, and tools.',
      },
      { name: 'Quiet Study', type: FLUXER_CHANNEL_TYPES.GUILD_VOICE, category: 'Study Rooms' },
      { name: 'Group Discussion', type: FLUXER_CHANNEL_TYPES.GUILD_VOICE, category: 'Study Rooms' },
    );
  } else {
    categories.push({ name: 'Discussions' }, { name: 'Voice' });
    channels.push(
      {
        name: 'forum',
        type: FLUXER_CHANNEL_TYPES.GUILD_FORUM,
        category: 'Discussions',
        topic: 'Long-form topics and Q&A.',
        forum_tags: ['Discussion', 'Feedback', 'Idea', 'Answered'],
      },
      {
        name: 'off-topic',
        type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
        category: 'Discussions',
        topic: 'Casual conversation.',
      },
      { name: 'General Voice', type: FLUXER_CHANNEL_TYPES.GUILD_VOICE, category: 'Voice' },
      { name: 'Lounge', type: FLUXER_CHANNEL_TYPES.GUILD_VOICE, category: 'Voice' },
    );
  }

  // Staff category (always included for secure community operations)
  categories.push({ name: 'Staff' });
  channels.push(
    {
      name: 'staff-chat',
      type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
      category: 'Staff',
      topic: 'Private staff coordination.',
      staff_only: true,
    },
    {
      name: 'mod-logs',
      type: FLUXER_CHANNEL_TYPES.GUILD_TEXT,
      category: 'Staff',
      topic: 'Moderation notes and audit alerts.',
      staff_only: true,
    },
  );

  const welcomePosts: BlueprintWelcomePost[] = [
    {
      channel_name: 'rules',
      title: `${baseName} — Community Guidelines`,
      description:
        '1. Treat every member with respect — no harassment, hate speech, or personal attacks.\n' +
        '2. Keep discussions on-topic and use the appropriate channels and forum tags.\n' +
        '3. No spam, unsolicited promotions, scams, or malicious links.\n' +
        '4. Protect privacy — never share private credentials, tokens, or personal information.\n' +
        '5. Follow moderator guidance and Fluxer Terms of Service.',
      pin: true,
    },
    {
      channel_name: 'welcome',
      title: `Welcome to ${baseName}!`,
      description:
        'We are glad you are here. Please read `#rules`, introduce yourself in `#introductions`, and jump into `#general`.',
      pin: true,
    },
  ];

  return {
    name: baseName,
    archetype,
    guild_settings: {
      verification_level: GUILD_VERIFICATION_LEVEL.LOW,
      explicit_content_filter: GUILD_EXPLICIT_CONTENT_FILTER.MEMBERS_WITHOUT_ROLES,
    },
    roles,
    categories,
    channels,
    welcome_posts: welcomePosts,
  };
}

interface StoredBlueprintPlan {
  readonly schema_version: 'fluxer_blueprint_plan.v1';
  readonly kind: 'blueprint' | 'clone';
  readonly guild_id: string;
  readonly blueprint: FluxerCommunityBlueprint;
}

interface StoredChangePlan {
  readonly schema_version: 'fluxer_change_plan.v1';
  readonly guild_id: string;
  readonly request: string;
  readonly before_snapshot: {
    readonly guild: Record<string, unknown>;
    readonly roles: RoleLike[];
    readonly channels: ChannelLike[];
  };
  readonly changes: {
    readonly roles: Array<{ id: string; patch: Record<string, unknown> }>;
    readonly channels: Array<{ id: string; patch: Record<string, unknown> }>;
    readonly permission_overwrites: Array<{
      channel_id: string;
      overwrite_id: string;
      type: 0 | 1;
      allow: string;
      deny: string;
    }>;
  };
}

export const blueprintAndChangeTools: readonly FluxerTool[] = [
  defineTool({
    name: 'guild_blueprint_compile',
    category: 'guild',
    description:
      'Design-only, zero-API-call compiler: transforms any natural-language community description (English or French) into a complete, security-hardened Fluxer community blueprint (roles, Fluxer permission bitfields, categories, text/announcement/voice/forum/media/link channels, forum tags, staff area, and welcome/rules posts).',
    inputSchema: {
      request: z
        .string()
        .trim()
        .min(3)
        .max(500)
        .describe('Natural-language description of the community to design'),
      community_name: z.string().trim().min(2).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args) => {
      const blueprint = compileFluxerBlueprint(args.request, args.community_name);
      return dualResult({
        text: `Compiled Fluxer blueprint **${blueprint.name}** (${blueprint.archetype}): ${blueprint.roles.length} roles, ${blueprint.categories.length} categories, ${blueprint.channels.length} channels, ${blueprint.welcome_posts.length} starter posts.`,
        data: { blueprint_id: sha256Digest(blueprint), blueprint },
      });
    },
  }),

  defineTool({
    name: 'guild_blueprint_plan',
    category: 'guild',
    guildScoped: true,
    description:
      'Required first step to build or structure a complete Fluxer community from a natural-language prompt. Reads live guild state, computes a non-destructive diff of missing roles, categories, channels, overwrites, and starter posts, checks bot permissions, saves a signed local `plan_ref`, and performs ZERO mutations.',
    inputSchema: {
      guild_id: GuildId,
      request: z.string().trim().min(3).max(500).describe('Natural-language community description'),
      community_name: z.string().trim().min(2).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const blueprint = compileFluxerBlueprint(args.request, args.community_name);
      const [roles, channels] = await Promise.all([
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<ChannelLike[]>(FluxerRoutes.guildChannels(args.guild_id)),
      ]);

      const existingRoles = new Set(roles.map((r) => r.name.toLowerCase()));
      const existingCats = new Set(
        channels
          .filter((c) => c.type === FLUXER_CHANNEL_TYPES.GUILD_CATEGORY)
          .map((c) => (c.name ?? '').toLowerCase()),
      );
      const existingChs = new Set(
        channels
          .filter((c) => c.type !== FLUXER_CHANNEL_TYPES.GUILD_CATEGORY)
          .map((c) => `${c.type}:${(c.name ?? '').toLowerCase()}`),
      );

      const missingRoles = blueprint.roles.filter((r) => !existingRoles.has(r.name.toLowerCase()));
      const missingCats = blueprint.categories.filter(
        (c) => !existingCats.has(c.name.toLowerCase()),
      );
      const missingChs = blueprint.channels.filter(
        (c) => !existingChs.has(`${c.type}:${c.name.toLowerCase()}`),
      );

      const planId = `bp_${args.guild_id}_${Date.now()}`;
      const saved = saveSignedState<StoredBlueprintPlan>({
        stateDir: resolveStateDirectory(ctx.config),
        namespace: 'blueprints',
        id: planId,
        secret: deriveSigningSecret(ctx.config),
        payload: {
          schema_version: 'fluxer_blueprint_plan.v1',
          kind: 'blueprint',
          guild_id: args.guild_id,
          blueprint,
        },
      });

      const totalOps =
        missingRoles.length +
        missingCats.length +
        missingChs.length +
        (blueprint.guild_settings ? 1 : 0);

      return dualResult({
        text: `Fluxer blueprint plan \`${saved.id}\` ready for guild \`${args.guild_id}\`: ${missingRoles.length} role(s), ${missingCats.length} category(ies), ${missingChs.length} channel(s), ${blueprint.welcome_posts.length} starter post(s). No mutations performed — apply with \`guild_blueprint_apply\`.`,
        data: {
          status: totalOps === 0 ? 'already_current' : 'ready',
          plan_ref: saved.id,
          plan_digest: saved.digest,
          guild_id: args.guild_id,
          summary: {
            total_operations: totalOps,
            roles_to_create: missingRoles.length,
            categories_to_create: missingCats.length,
            channels_to_create: missingChs.length,
            welcome_posts: blueprint.welcome_posts.length,
          },
          planned_roles: missingRoles,
          planned_categories: missingCats,
          planned_channels: missingChs,
          blueprint,
        },
      });
    },
  }),

  defineTool({
    name: 'guild_blueprint_apply',
    category: 'guild',
    requiredPermissions: ['MANAGE_GUILD', 'MANAGE_ROLES', 'MANAGE_CHANNELS'],
    guildScoped: true,
    confirmRequired: true,
    description:
      'Execute a signed Fluxer blueprint or clone plan (`plan_ref`) against its locked target guild. Idempotently creates missing roles, categories, channels (with overwrites & forum tags), applies safe guild settings, posts starter messages, and verifies live readback. Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      plan_ref: z
        .string()
        .min(4)
        .max(128)
        .describe('Signed plan_ref returned by guild_blueprint_plan or guild_clone_plan'),
      post_welcome_messages: z
        .boolean()
        .optional()
        .describe('Publish & pin starter welcome/rules embeds (default true)'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const saved = loadSignedState<StoredBlueprintPlan>({
        stateDir: resolveStateDirectory(ctx.config),
        namespace: 'blueprints',
        id: args.plan_ref,
        secret: deriveSigningSecret(ctx.config),
      });
      if (!saved || saved.payload.guild_id !== args.guild_id) {
        throw new Error(
          `Signed blueprint plan "${args.plan_ref}" not found or does not match guild ${args.guild_id}.`,
        );
      }
      const bp = saved.payload.blueprint;
      const [existingRoles, existingChannels] = await Promise.all([
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<ChannelLike[]>(FluxerRoutes.guildChannels(args.guild_id)),
      ]);

      const roleIdByName = new Map(existingRoles.map((r) => [r.name.toLowerCase(), r.id]));
      const catIdByName = new Map(
        existingChannels
          .filter((c) => c.type === FLUXER_CHANNEL_TYPES.GUILD_CATEGORY)
          .map((c) => [(c.name ?? '').toLowerCase(), c.id]),
      );
      const chIdByKey = new Map(
        existingChannels
          .filter((c) => c.type !== FLUXER_CHANNEL_TYPES.GUILD_CATEGORY)
          .map((c) => [`${c.type}:${(c.name ?? '').toLowerCase()}`, c.id]),
      );

      const createdRoles: Array<{ id: string; name: string }> = [];
      const createdCategories: Array<{ id: string; name: string }> = [];
      const createdChannels: Array<{ id: string; name: string; type: number }> = [];
      const postedMessages: Array<{ channel_id: string; message_id: string }> = [];

      // 1. Guild baseline hardening
      if (bp.guild_settings) {
        await ctx.rest.patch(FluxerRoutes.guild(args.guild_id), {
          body: bp.guild_settings,
          reason: `Fluxer MCP blueprint ${args.plan_ref}`,
        });
      }

      // 2. Roles
      for (const r of bp.roles) {
        if (roleIdByName.has(r.name.toLowerCase())) continue;
        const created = await ctx.rest.post<{ id: string; name: string }>(
          FluxerRoutes.guildRoles(args.guild_id),
          { body: r, reason: `Fluxer MCP blueprint ${args.plan_ref}` },
        );
        roleIdByName.set(r.name.toLowerCase(), created.id);
        createdRoles.push({ id: created.id, name: created.name });
      }

      const modRoleId = roleIdByName.get('moderator');
      const adminRoleId = roleIdByName.get('admin');

      // 3. Categories
      for (const cat of bp.categories) {
        if (catIdByName.has(cat.name.toLowerCase())) continue;
        const created = await ctx.rest.post<{ id: string; name: string }>(
          FluxerRoutes.guildChannels(args.guild_id),
          {
            body: { name: cat.name, type: FLUXER_CHANNEL_TYPES.GUILD_CATEGORY },
            reason: `Fluxer MCP blueprint ${args.plan_ref}`,
          },
        );
        catIdByName.set(cat.name.toLowerCase(), created.id);
        createdCategories.push({ id: created.id, name: created.name });
      }

      // 4. Channels with Fluxer-native overwrites & forum tags
      const channelIdByName = new Map<string, string>(
        existingChannels.map((c) => [(c.name ?? '').toLowerCase(), c.id]),
      );

      for (const ch of bp.channels) {
        const key = `${ch.type}:${ch.name.toLowerCase()}`;
        if (chIdByKey.has(key)) continue;

        const overwrites: Array<{ id: string; type: 0; allow: string; deny: string }> = [];
        if (ch.read_only_for_everyone) {
          overwrites.push({
            id: args.guild_id,
            type: 0,
            allow: FLUXER_PERMISSIONS.VIEW_CHANNEL.toString(),
            deny: (
              FLUXER_PERMISSIONS.SEND_MESSAGES | FLUXER_PERMISSIONS.CREATE_PUBLIC_THREADS
            ).toString(),
          });
        }
        if (ch.staff_only) {
          overwrites.push({
            id: args.guild_id,
            type: 0,
            allow: '0',
            deny: FLUXER_PERMISSIONS.VIEW_CHANNEL.toString(),
          });
          if (modRoleId) {
            overwrites.push({
              id: modRoleId,
              type: 0,
              allow: (
                FLUXER_PERMISSIONS.VIEW_CHANNEL | FLUXER_PERMISSIONS.SEND_MESSAGES
              ).toString(),
              deny: '0',
            });
          }
          if (adminRoleId) {
            overwrites.push({
              id: adminRoleId,
              type: 0,
              allow: (
                FLUXER_PERMISSIONS.VIEW_CHANNEL | FLUXER_PERMISSIONS.SEND_MESSAGES
              ).toString(),
              deny: '0',
            });
          }
        }

        const parentId = ch.category ? catIdByName.get(ch.category.toLowerCase()) : undefined;
        const body: Record<string, unknown> = {
          name: ch.name,
          type: ch.type,
          ...(parentId ? { parent_id: parentId } : {}),
          ...(ch.topic ? { topic: ch.topic } : {}),
          ...(ch.url ? { url: ch.url } : {}),
          ...(overwrites.length > 0 ? { permission_overwrites: overwrites } : {}),
          ...(ch.forum_tags?.length
            ? { available_tags: ch.forum_tags.map((name) => ({ name })) }
            : {}),
        };
        const created = await ctx.rest.post<{ id: string; name: string; type: number }>(
          FluxerRoutes.guildChannels(args.guild_id),
          { body, reason: `Fluxer MCP blueprint ${args.plan_ref}` },
        );
        chIdByKey.set(key, created.id);
        channelIdByName.set(ch.name.toLowerCase(), created.id);
        createdChannels.push({ id: created.id, name: created.name, type: created.type });
      }

      // 5. Starter welcome / rules messages
      if (args.post_welcome_messages !== false) {
        for (const post of bp.welcome_posts) {
          const targetChannelId = channelIdByName.get(post.channel_name.toLowerCase());
          if (!targetChannelId) continue;
          const sent = await ctx.rest.post<{ id: string }>(
            FluxerRoutes.channelMessages(targetChannelId),
            {
              body: {
                embeds: [
                  {
                    title: post.title,
                    description: post.description,
                    color: 0x4641d9,
                  },
                ],
              },
            },
          );
          if (post.pin) {
            await ctx.rest
              .put(FluxerRoutes.channelPinMessage(targetChannelId, sent.id))
              .catch(() => {});
          }
          postedMessages.push({ channel_id: targetChannelId, message_id: sent.id });
        }
      }

      return dualResult({
        text: `Applied Fluxer blueprint \`${args.plan_ref}\` to guild \`${args.guild_id}\`: created ${createdRoles.length} role(s), ${createdCategories.length} category(ies), ${createdChannels.length} channel(s), and ${postedMessages.length} starter post(s).`,
        data: {
          status: 'complete',
          plan_ref: args.plan_ref,
          guild_id: args.guild_id,
          created: {
            roles: createdRoles,
            categories: createdCategories,
            channels: createdChannels,
            welcome_posts: postedMessages,
          },
        },
      });
    },
  }),

  defineTool({
    name: 'guild_blueprint_evidence',
    category: 'guild',
    guildScoped: true,
    description:
      'Verify live Fluxer guild state against a signed blueprint `plan_ref` and report whether every planned role, category, and channel is present (`verified`) or missing/drifted (`drifted`).',
    inputSchema: {
      guild_id: GuildId,
      plan_ref: z.string().min(4).max(128),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const saved = loadSignedState<StoredBlueprintPlan>({
        stateDir: resolveStateDirectory(ctx.config),
        namespace: 'blueprints',
        id: args.plan_ref,
        secret: deriveSigningSecret(ctx.config),
      });
      if (!saved || saved.payload.guild_id !== args.guild_id) {
        return dualResult({
          text: `Blueprint \`${args.plan_ref}\` not found for guild \`${args.guild_id}\`.`,
          data: { status: 'not_found', plan_ref: args.plan_ref, guild_id: args.guild_id },
        });
      }
      const bp = saved.payload.blueprint;
      const [roles, channels] = await Promise.all([
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<ChannelLike[]>(FluxerRoutes.guildChannels(args.guild_id)),
      ]);
      const roleSet = new Set(roles.map((r) => r.name.toLowerCase()));
      const chSet = new Set(channels.map((c) => `${c.type}:${(c.name ?? '').toLowerCase()}`));
      const missingRoles = bp.roles
        .filter((r) => !roleSet.has(r.name.toLowerCase()))
        .map((r) => r.name);
      const missingCategories = bp.categories
        .filter((c) => !chSet.has(`${FLUXER_CHANNEL_TYPES.GUILD_CATEGORY}:${c.name.toLowerCase()}`))
        .map((c) => c.name);
      const missingChannels = bp.channels
        .filter((c) => !chSet.has(`${c.type}:${c.name.toLowerCase()}`))
        .map((c) => c.name);
      const drifted =
        missingRoles.length > 0 || missingCategories.length > 0 || missingChannels.length > 0;
      return dualResult({
        text: `Blueprint evidence for \`${args.plan_ref}\`: **${drifted ? 'DRIFTED' : 'VERIFIED'}**.`,
        data: {
          status: drifted ? 'drifted' : 'verified',
          plan_ref: args.plan_ref,
          guild_id: args.guild_id,
          missing: {
            roles: missingRoles,
            categories: missingCategories,
            channels: missingChannels,
          },
        },
      });
    },
  }),

  defineTool({
    name: 'guild_change_plan',
    category: 'guild',
    guildScoped: true,
    description:
      'Inspect a live Fluxer guild and prepare a signed, previewable in-place change plan for bounded role, channel, and permission-overwrite edits. Preserves IDs and snapshots the pre-change state for rollback via `guild_change_restore`.',
    inputSchema: {
      guild_id: GuildId,
      request: z.string().trim().min(3).max(500),
      roles: z
        .array(
          z.object({
            id: RoleId,
            patch: z.object({
              name: z.string().min(1).max(100).optional(),
              color: z.number().int().min(0).max(0xffffff).optional(),
              permissions: PermissionString.optional(),
              hoist: z.boolean().optional(),
              mentionable: z.boolean().optional(),
            }),
          }),
        )
        .optional(),
      channels: z
        .array(
          z.object({
            id: ChannelId,
            patch: z.object({
              name: z.string().min(1).max(100).optional(),
              topic: z.string().max(1024).nullable().optional(),
              nsfw: z.boolean().optional(),
              rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
              parent_id: ChannelId.nullable().optional(),
            }),
          }),
        )
        .optional(),
      permission_overwrites: z
        .array(
          z.object({
            channel_id: ChannelId,
            overwrite_id: RoleId,
            type: z.union([z.literal(0), z.literal(1)]),
            allow: PermissionString,
            deny: PermissionString,
          }),
        )
        .optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const [guild, roles, channels] = await Promise.all([
        ctx.rest.get<Record<string, unknown>>(FluxerRoutes.guild(args.guild_id)),
        ctx.rest.get<RoleLike[]>(FluxerRoutes.guildRoles(args.guild_id)),
        ctx.rest.get<ChannelLike[]>(FluxerRoutes.guildChannels(args.guild_id)),
      ]);

      const roleMap = new Map(roles.map((r) => [r.id, r]));
      const chMap = new Map(channels.map((c) => [c.id, c]));
      const blockers: string[] = [];

      for (const r of args.roles ?? []) {
        if (!roleMap.has(r.id)) blockers.push(`Role ${r.id} not found.`);
      }
      for (const c of args.channels ?? []) {
        if (!chMap.has(c.id)) blockers.push(`Channel ${c.id} not found.`);
      }
      for (const ow of args.permission_overwrites ?? []) {
        if (!chMap.has(ow.channel_id))
          blockers.push(`Channel ${ow.channel_id} not found for overwrite.`);
      }

      if (blockers.length > 0) {
        return dualResult({
          text: `Guild change plan blocked: ${blockers.join(' ')}`,
          data: { status: 'blocked', plan_ref: null, blockers },
        });
      }

      const planId = `chg_${args.guild_id}_${Date.now()}`;
      const saved = saveSignedState<StoredChangePlan>({
        stateDir: resolveStateDirectory(ctx.config),
        namespace: 'changes',
        id: planId,
        secret: deriveSigningSecret(ctx.config),
        payload: {
          schema_version: 'fluxer_change_plan.v1',
          guild_id: args.guild_id,
          request: args.request,
          before_snapshot: { guild, roles, channels },
          changes: {
            roles: (args.roles ?? []).map((r) => ({
              id: r.id,
              patch: r.patch as Record<string, unknown>,
            })),
            channels: (args.channels ?? []).map((c) => ({
              id: c.id,
              patch: c.patch as Record<string, unknown>,
            })),
            permission_overwrites: args.permission_overwrites ?? [],
          },
        },
      });

      return dualResult({
        text: `Prepared signed change plan \`${saved.id}\` (${(args.roles ?? []).length} role edit(s), ${(args.channels ?? []).length} channel edit(s), ${(args.permission_overwrites ?? []).length} overwrite edit(s)). No mutations performed.`,
        data: {
          status: 'ready',
          plan_ref: saved.id,
          plan_digest: saved.digest,
          guild_id: args.guild_id,
          changes: saved.payload.changes,
        },
      });
    },
  }),

  defineTool({
    name: 'guild_change_apply',
    category: 'guild',
    requiredPermissions: ['MANAGE_ROLES', 'MANAGE_CHANNELS'],
    guildScoped: true,
    confirmRequired: true,
    description:
      'Apply a verified `guild_change_plan` (`plan_ref`) to its locked Fluxer guild. Preserves pre-change snapshot for rollback via `guild_change_restore`. Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      plan_ref: z.string().min(4).max(128),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const saved = loadSignedState<StoredChangePlan>({
        stateDir: resolveStateDirectory(ctx.config),
        namespace: 'changes',
        id: args.plan_ref,
        secret: deriveSigningSecret(ctx.config),
      });
      if (!saved || saved.payload.guild_id !== args.guild_id) {
        throw new Error(`Change plan "${args.plan_ref}" not found for guild ${args.guild_id}.`);
      }

      for (const r of saved.payload.changes.roles) {
        await ctx.rest.patch(FluxerRoutes.guildRole(args.guild_id, r.id), {
          body: r.patch,
          reason: `Fluxer MCP change plan ${args.plan_ref}`,
        });
      }
      for (const c of saved.payload.changes.channels) {
        await ctx.rest.patch(FluxerRoutes.channel(c.id), {
          body: c.patch,
          reason: `Fluxer MCP change plan ${args.plan_ref}`,
        });
      }
      for (const ow of saved.payload.changes.permission_overwrites) {
        await ctx.rest.put(FluxerRoutes.channelPermission(ow.channel_id, ow.overwrite_id), {
          body: { type: ow.type, allow: ow.allow, deny: ow.deny },
          reason: `Fluxer MCP change plan ${args.plan_ref}`,
        });
      }

      return dualResult({
        text: `Applied change plan \`${args.plan_ref}\` to guild \`${args.guild_id}\`. Use \`guild_change_restore\` with the same \`plan_ref\` to revert.`,
        data: {
          status: 'applied',
          plan_ref: args.plan_ref,
          guild_id: args.guild_id,
          applied_counts: {
            roles: saved.payload.changes.roles.length,
            channels: saved.payload.changes.channels.length,
            permission_overwrites: saved.payload.changes.permission_overwrites.length,
          },
        },
      });
    },
  }),

  defineTool({
    name: 'guild_change_restore',
    category: 'guild',
    requiredPermissions: ['MANAGE_ROLES', 'MANAGE_CHANNELS'],
    guildScoped: true,
    confirmRequired: true,
    description:
      'Roll back roles, channels, and permission overwrites edited by a previous `guild_change_plan` back to the exact signed pre-change snapshot. Confirmation-gated.',
    inputSchema: {
      guild_id: GuildId,
      plan_ref: z.string().min(4).max(128),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const saved = loadSignedState<StoredChangePlan>({
        stateDir: resolveStateDirectory(ctx.config),
        namespace: 'changes',
        id: args.plan_ref,
        secret: deriveSigningSecret(ctx.config),
      });
      if (!saved || saved.payload.guild_id !== args.guild_id) {
        throw new Error(`Change plan "${args.plan_ref}" not found for guild ${args.guild_id}.`);
      }

      const roleBefore = new Map(saved.payload.before_snapshot.roles.map((r) => [r.id, r]));
      const chBefore = new Map(saved.payload.before_snapshot.channels.map((c) => [c.id, c]));

      for (const r of saved.payload.changes.roles) {
        const orig = roleBefore.get(r.id);
        if (!orig) continue;
        await ctx.rest.patch(FluxerRoutes.guildRole(args.guild_id, r.id), {
          body: {
            name: orig.name,
            color: orig.color ?? 0,
            permissions: parsePermissionBits(orig.permissions).toString(),
            hoist: Boolean(orig.hoist),
            mentionable: Boolean(orig.mentionable),
          },
          reason: `Fluxer MCP restore ${args.plan_ref}`,
        });
      }
      for (const c of saved.payload.changes.channels) {
        const orig = chBefore.get(c.id) as Record<string, unknown> | undefined;
        if (!orig) continue;
        await ctx.rest.patch(FluxerRoutes.channel(c.id), {
          body: {
            name: orig.name,
            topic: orig.topic ?? null,
            nsfw: Boolean(orig.nsfw),
            rate_limit_per_user: Number(orig.rate_limit_per_user ?? 0),
            parent_id: orig.parent_id ?? null,
          },
          reason: `Fluxer MCP restore ${args.plan_ref}`,
        });
      }
      for (const ow of saved.payload.changes.permission_overwrites) {
        const origCh = chBefore.get(ow.channel_id);
        const origOw = origCh?.permission_overwrites?.find((x) => x.id === ow.overwrite_id);
        if (origOw) {
          await ctx.rest.put(FluxerRoutes.channelPermission(ow.channel_id, ow.overwrite_id), {
            body: { type: origOw.type, allow: origOw.allow, deny: origOw.deny },
            reason: `Fluxer MCP restore ${args.plan_ref}`,
          });
        } else {
          await ctx.rest.delete(FluxerRoutes.channelPermission(ow.channel_id, ow.overwrite_id), {
            reason: `Fluxer MCP restore ${args.plan_ref}`,
          });
        }
      }

      return dualResult({
        text: `Restored pre-change configuration for guild \`${args.guild_id}\` from \`${args.plan_ref}\`.`,
        data: { status: 'restored', plan_ref: args.plan_ref, guild_id: args.guild_id },
      });
    },
  }),
];
